"""Contabilidade: tabelas base, lançamentos, razão, contas correntes e analítica.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.core.pgc import CATEGORIAS_DIARIO, PERIODOS
from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    Diario,
    DiarioFecho,
    DocumentoContabilistico,
    Fluxo,
    Lancamento,
)
from src.services import contabilidade as svc
from src.services.seed import importar_plano

router = APIRouter(prefix="/api/contabilidade", tags=["contabilidade"])

VER = Depends(exigir_cap("contab.ver"))
LANCAR = Depends(exigir_cap("contab.lancar"))
PLANO = Depends(exigir_cap("contab.plano"))
FECHAR = Depends(exigir_cap("contab.fechar"))


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------
class LinhaEntrada(BaseModel):
    conta_codigo: str = Field(min_length=1, max_length=20)
    debito: Decimal = Decimal("0")
    credito: Decimal = Decimal("0")
    descricao: str | None = None
    entidade: str | None = None
    tipo_entidade: str | None = None
    iva_perc: Decimal = Decimal("0")
    perc_nao_ded: Decimal = Decimal("0")
    iva_autoliq: Decimal = Decimal("0")
    moeda: str = "AKZ"
    cambio: Decimal = Decimal("1")
    centro_codigo: str | None = None
    fluxo_codigo: str | None = None


class LancamentoCriar(BaseModel):
    data: Date
    diario_codigo: str = Field(min_length=1, max_length=10)
    documento_codigo: str = Field(min_length=1, max_length=10)
    linhas: list[LinhaEntrada] = Field(min_length=2)
    mes: str | None = Field(default=None, max_length=2)
    descricao: str | None = None
    documento_ref: str | None = None
    exercicio_id: UUID | None = None
    diferido: bool = False


class ContaCriar(BaseModel):
    codigo: str = Field(min_length=1, max_length=20)
    nome: str = Field(min_length=1, max_length=200)
    tipo: str | None = Field(default=None, max_length=1)
    natureza: str | None = Field(default=None, max_length=1)
    classe_iva: str | None = None


class ImportarPlanoPedido(BaseModel):
    linhas: list[dict]
    substituir: bool = False


class FechoPedido(BaseModel):
    diario_codigo: str
    mes: str = Field(min_length=1, max_length=2)
    exercicio_id: UUID | None = None


# ---------------------------------------------------------------------------
# Tabelas base
# ---------------------------------------------------------------------------
@router.get("/periodos", dependencies=[VER])
def periodos() -> list[dict]:
    """Períodos contabilísticos 00–15."""
    return [{"codigo": c, "nome": n} for c, n in PERIODOS]


@router.get("/exercicios", dependencies=[VER])
def listar_exercicios(empresa: EmpresaAtual, db: DB) -> list[dict]:
    """Exercícios económicos da empresa, mais recente primeiro.

    Vários podem estar activos em simultâneo (transição de ano) — `ativo` é um
    interruptor independente, não uma escolha exclusiva, como no Piloto.
    """
    from src.db.models.tenancy import Exercicio

    exs = db.scalars(
        select(Exercicio)
        .where(Exercicio.empresa_id == empresa.id)
        .order_by(Exercicio.inicio.desc())
    ).all()
    return [
        {"id": e.id, "nome": e.nome, "inicio": e.inicio, "fim": e.fim,
         "estado": e.estado, "ativo": e.ativo, "apuramento": e.apuramento}
        for e in exs
    ]


@router.get("/contas", dependencies=[VER])
def listar_contas(
    empresa: EmpresaAtual,
    db: DB,
    procura: str | None = None,
    so_movimento: bool = False,
    limite: int = Query(default=500, le=5000),
) -> list[dict]:
    q = select(Conta).where(Conta.empresa_id == empresa.id).order_by(Conta.codigo)
    if procura:
        termo = f"%{procura}%"
        q = q.where(Conta.codigo.ilike(termo) | Conta.nome.ilike(termo))
    contas = db.scalars(q).all()
    if so_movimento:
        todas = list(contas) if not procura else db.scalars(
            select(Conta).where(Conta.empresa_id == empresa.id)
        ).all()
        contas = [c for c in contas if c.ativa and svc.eh_movimento(c, todas)]
    return [
        {
            "id": c.id, "codigo": c.codigo, "nome": c.nome, "tipo": c.tipo,
            "natureza": c.natureza, "classe_iva": c.classe_iva, "ativa": c.ativa,
        }
        for c in contas[:limite]
    ]


@router.post("/contas", status_code=status.HTTP_201_CREATED, dependencies=[PLANO])
def criar_conta(
    request: Request, dados: ContaCriar, empresa: EmpresaAtual, db: DB
) -> dict:
    from src.core.pgc import natureza_conta

    ja = db.scalar(
        select(Conta.id).where(Conta.empresa_id == empresa.id, Conta.codigo == dados.codigo)
    )
    if ja is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Já existe a conta {dados.codigo}.")
    c = Conta(
        empresa_id=empresa.id, codigo=dados.codigo, nome=dados.nome, tipo=dados.tipo,
        natureza=dados.natureza or natureza_conta(dados.codigo),
        classe_iva=dados.classe_iva, ativa=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "codigo": c.codigo, "nome": c.nome}


@router.get("/contas/{codigo}/proxima-subconta", dependencies=[VER])
def proxima_subconta(codigo: str, empresa: EmpresaAtual, db: DB) -> dict:
    return {"codigo": svc.proxima_subconta(db, empresa.id, codigo)}


@router.post("/plano/importar", dependencies=[PLANO])
def importar(
    request: Request, dados: ImportarPlanoPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Importa um plano de contas (ex.: exportação do Primavera)."""
    r = importar_plano(db, empresa.id, dados.linhas, substituir=dados.substituir)
    db.commit()
    return r


@router.get("/diarios", dependencies=[VER])
def listar_diarios(empresa: EmpresaAtual, db: DB) -> list[dict]:
    diarios = db.scalars(
        select(Diario).where(Diario.empresa_id == empresa.id).order_by(Diario.codigo)
    ).all()
    return [
        {"id": d.id, "codigo": d.codigo, "nome": d.nome, "categoria": d.categoria,
         "ativo": d.ativo}
        for d in diarios
    ]


@router.get("/diarios/categorias", dependencies=[VER])
def categorias_diario() -> list[dict]:
    return [{"codigo": c, "nome": n} for c, n in CATEGORIAS_DIARIO]


@router.get("/documentos", dependencies=[VER])
def listar_documentos(
    empresa: EmpresaAtual, db: DB, diario: str | None = None
) -> list[dict]:
    q = (
        select(DocumentoContabilistico)
        .where(DocumentoContabilistico.empresa_id == empresa.id)
        .order_by(DocumentoContabilistico.codigo)
    )
    if diario:
        q = q.where(
            DocumentoContabilistico.diario_codigo == diario,
            DocumentoContabilistico.ativo.is_(True),
        )
    return [
        {"id": d.id, "codigo": d.codigo, "descricao": d.descricao,
         "diario_codigo": d.diario_codigo, "conta_debito": d.conta_debito,
         "conta_credito": d.conta_credito, "retencao": d.retencao, "ativo": d.ativo}
        for d in db.scalars(q).all()
    ]


@router.get("/centros", dependencies=[VER])
def listar_centros(empresa: EmpresaAtual, db: DB) -> list[dict]:
    centros = db.scalars(
        select(CentroCusto)
        .where(CentroCusto.empresa_id == empresa.id)
        .order_by(CentroCusto.codigo)
    ).all()
    return [
        {"id": c.id, "codigo": c.codigo, "nome": c.nome, "tipo": c.tipo,
         "responsavel": c.responsavel, "estado": c.estado}
        for c in centros
    ]


@router.get("/fluxos", dependencies=[VER])
def listar_fluxos(empresa: EmpresaAtual, db: DB, so_movimento: bool = False) -> list[dict]:
    q = select(Fluxo).where(Fluxo.empresa_id == empresa.id).order_by(Fluxo.codigo)
    if so_movimento:
        q = q.where(Fluxo.tipo == "M")
    return [
        {"id": f.id, "codigo": f.codigo, "descricao": f.descricao, "tipo": f.tipo}
        for f in db.scalars(q).all()
    ]


# ---------------------------------------------------------------------------
# Lançamentos
# ---------------------------------------------------------------------------
@router.get("/lancamentos", dependencies=[VER])
def listar_lancamentos(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    diario: str | None = None,
    incluir_diferidos: bool = False,
    limite: int = Query(default=200, le=2000),
) -> list[dict]:
    q = (
        select(Lancamento)
        .where(Lancamento.empresa_id == empresa.id)
        .order_by(Lancamento.data.desc(), Lancamento.numero.desc())
        .limit(limite)
    )
    if not incluir_diferidos:
        q = q.where(Lancamento.diferido.is_(False))
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)
    if diario:
        q = q.where(Lancamento.diario_codigo == diario)

    return [
        {
            "id": l.id, "numero": l.numero, "numero_op": l.numero_op, "data": l.data,
            "mes": l.mes, "diario_codigo": l.diario_codigo,
            "documento_codigo": l.documento_codigo, "descricao": l.descricao,
            "documento_ref": l.documento_ref, "origem": l.origem,
            "diferido": l.diferido,
            "total": sum((x.debito for x in l.linhas), Decimal("0")),
        }
        for l in db.scalars(q).all()
    ]


@router.get("/lancamentos/{lancamento_id}", dependencies=[VER])
def obter_lancamento(lancamento_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    l = db.scalar(
        select(Lancamento).where(
            Lancamento.id == lancamento_id, Lancamento.empresa_id == empresa.id
        )
    )
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movimento não encontrado.")
    return {
        "id": l.id, "numero": l.numero, "numero_op": l.numero_op, "data": l.data,
        "mes": l.mes, "diario_codigo": l.diario_codigo,
        "documento_codigo": l.documento_codigo, "descricao": l.descricao,
        "documento_ref": l.documento_ref, "origem": l.origem, "diferido": l.diferido,
        "exercicio_id": l.exercicio_id, "criado_por": l.criado_por,
        "linhas": [
            {
                "ordem": x.ordem, "conta_codigo": x.conta_codigo,
                "conta_nome": x.conta_nome, "descricao": x.descricao,
                "debito": x.debito, "credito": x.credito, "entidade": x.entidade,
                "iva_perc": x.iva_perc, "centro_codigo": x.centro_codigo,
                "fluxo_codigo": x.fluxo_codigo, "moeda": x.moeda, "cambio": x.cambio,
            }
            for x in l.linhas
        ],
    }


@router.post("/lancamentos", status_code=status.HTTP_201_CREATED, dependencies=[LANCAR])
def criar_lancamento(
    request: Request,
    dados: LancamentoCriar,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    """Grava um lançamento. As violações de regra contabilística devolvem 422
    com a mensagem — ver o handler de ErroContabilistico em api/main.py."""
    lanc = svc.postar(
        db,
        empresa_id=empresa.id,
        data=dados.data,
        diario_codigo=dados.diario_codigo,
        documento_codigo=dados.documento_codigo,
        linhas=[l.model_dump() for l in dados.linhas],
        mes=dados.mes,
        descricao=dados.descricao,
        documento_ref=dados.documento_ref,
        origem="manual",
        exercicio_id=dados.exercicio_id,
        diferido=dados.diferido,
        criado_por=user.nome,
    )
    db.commit()
    return {"id": lanc.id, "numero": lanc.numero, "numero_op": lanc.numero_op}


@router.post("/lancamentos/{lancamento_id}/integrar", dependencies=[LANCAR])
def integrar_lancamento(
    request: Request,
    lancamento_id: UUID,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    l = db.scalar(
        select(Lancamento).where(
            Lancamento.id == lancamento_id, Lancamento.empresa_id == empresa.id
        )
    )
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movimento não encontrado.")
    svc.integrar(db, l, por=user.nome)
    db.commit()
    return {"id": l.id, "diferido": l.diferido}


@router.delete(
    "/lancamentos/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[LANCAR],
)
def remover_lancamento(
    request: Request, lancamento_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    l = db.scalar(
        select(Lancamento).where(
            Lancamento.id == lancamento_id, Lancamento.empresa_id == empresa.id
        )
    )
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movimento não encontrado.")
    db.delete(l)
    db.commit()


# ---------------------------------------------------------------------------
# Fechos de diário
# ---------------------------------------------------------------------------
@router.post("/fechos", status_code=status.HTTP_201_CREATED, dependencies=[FECHAR])
def fechar_diario(
    request: Request,
    dados: FechoPedido,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    # Resolver o exercício com a MESMA regra do lançamento: se o fecho ficasse
    # com exercicio_id nulo e o lançamento resolvesse para o activo, o período
    # dava-se por fechado e continuava a aceitar movimentos.
    exercicio_id = svc.exercicio_efetivo(db, empresa.id, dados.exercicio_id)

    ja = db.scalar(
        select(DiarioFecho.id).where(
            DiarioFecho.empresa_id == empresa.id,
            DiarioFecho.diario_codigo == dados.diario_codigo,
            DiarioFecho.exercicio_id == exercicio_id,
            DiarioFecho.mes == dados.mes,
        )
    )
    if ja is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este período já está fechado.")
    f = DiarioFecho(
        empresa_id=empresa.id, diario_codigo=dados.diario_codigo,
        exercicio_id=exercicio_id, mes=dados.mes, por=user.nome,
    )
    db.add(f)
    db.commit()
    return {"id": f.id, "diario_codigo": f.diario_codigo, "mes": f.mes}


@router.get("/fechos", dependencies=[VER])
def listar_fechos(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID | None = None
) -> list[dict]:
    q = select(DiarioFecho).where(DiarioFecho.empresa_id == empresa.id)
    if exercicio_id is not None:
        q = q.where(DiarioFecho.exercicio_id == exercicio_id)
    return [
        {"id": f.id, "diario_codigo": f.diario_codigo, "mes": f.mes,
         "exercicio_id": f.exercicio_id, "por": f.por, "criado_em": f.criado_em}
        for f in db.scalars(q).all()
    ]


@router.delete("/fechos/{fecho_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[FECHAR])
def reabrir_diario(
    request: Request, fecho_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    f = db.scalar(
        select(DiarioFecho).where(
            DiarioFecho.id == fecho_id, DiarioFecho.empresa_id == empresa.id
        )
    )
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fecho não encontrado.")
    db.delete(f)
    db.commit()


# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------
@router.get("/razao/{conta_codigo}", dependencies=[VER])
def obter_razao(
    conta_codigo: str,
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    incluir_subcontas: bool = False,
    entidade: str | None = None,
) -> dict:
    return svc.razao(
        db, empresa_id=empresa.id, conta_codigo=conta_codigo,
        exercicio_id=exercicio_id, de=de, ate=ate,
        incluir_subcontas=incluir_subcontas, entidade=entidade,
    )


@router.get("/contas-correntes", dependencies=[VER])
def obter_contas_correntes(
    empresa: EmpresaAtual,
    db: DB,
    prefixo: str = Query(description="31 = clientes, 32 = fornecedores"),
    natureza: str = Query(default="D", pattern="^[DC]$"),
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    return svc.contas_correntes(
        db, empresa_id=empresa.id, prefixo=prefixo, natureza=natureza,
        exercicio_id=exercicio_id, de=de, ate=ate,
    )


@router.get("/analitica", dependencies=[VER])
def obter_analitica(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    return svc.analitica_mapa(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate
    )
