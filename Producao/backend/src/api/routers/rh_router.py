"""Recursos Humanos: pessoal, processamento, pagamentos e honorários.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.core.rh import IRPS_INFO, SUBS_NAO_SUJEITOS, SUBS_SUJEITOS
from src.db.models.rh import (
    AlteracaoMensal,
    Colaborador,
    Honorario,
    Independente,
    MapaIrtLinha,
    PagamentoSalarial,
    ProcessamentoSalarial,
)
from src.services import rh as svc

router = APIRouter(
    prefix="/api/rh",
    tags=["recursos humanos"],
    dependencies=[Depends(exigir_cap("rh.ver"))],
)

GERIR = Depends(exigir_cap("rh.gerir"))


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------
class ColaboradorEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    numero: str | None = Field(default=None, max_length=20)
    categoria: str | None = None
    salario_base: Decimal = Decimal("0")
    subsidios: Decimal = Decimal("0")
    subsidio_ferias: Decimal = Decimal("0")
    subsidio_natal: Decimal = Decimal("0")
    subs_nao_sujeitos: Decimal = Decimal("0")
    data_admissao: Date | None = None
    iban: str | None = None
    nif: str | None = None
    num_ss: str | None = None
    provincia: str | None = None
    municipio: str | None = None
    estado: str = "activo"


class AlteracaoEntrada(BaseModel):
    mes: str = Field(min_length=7, max_length=7, description="AAAA-MM")
    faltas: Decimal = Decimal("0")
    abonos: list[dict] = Field(default_factory=list)
    descontos: list[dict] = Field(default_factory=list)


class ProcessarPedido(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    data: Date | None = None
    exercicio_id: UUID | None = None


class PagarPedido(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    conta: str | None = None
    data: Date | None = None
    exercicio_id: UUID | None = None


class IndependenteEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    nif: str | None = None
    atividade: str | None = None
    taxa_ret: Decimal = Decimal("6.5")
    estado: str = "activo"


class HonorarioPedido(BaseModel):
    independente_id: UUID
    valor: Decimal
    data: Date | None = None
    mes: str | None = None
    descricao: str | None = None
    ref: str | None = None
    exercicio_id: UUID | None = None


class MapaIrtEntrada(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    valores: dict[str, Decimal] = Field(default_factory=dict)
    calc_manual_excesso: bool = False
    excesso_subsidios_nao_sujeitos: Decimal = Decimal("0")
    registo_manual_ss: bool = False
    base_tributavel_ss_manual: Decimal = Decimal("0")
    nao_sujeito_ss: bool = False
    isento_irt: bool = False


def _colab(db: DB, empresa_id: UUID, colaborador_id: UUID) -> Colaborador:
    c = db.scalar(
        select(Colaborador).where(
            Colaborador.id == colaborador_id, Colaborador.empresa_id == empresa_id
        )
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Colaborador não encontrado.")
    return c


def _proximo_numero(db: DB, empresa_id: UUID) -> str:
    numeros = db.scalars(
        select(Colaborador.numero).where(Colaborador.empresa_id == empresa_id)
    ).all()
    maximo = max((int(n) for n in numeros if n and n.isdigit()), default=0)
    return f"{maximo + 1:03d}"


# ---------------------------------------------------------------------------
# Colaboradores
# ---------------------------------------------------------------------------
@router.get("/colaboradores")
def listar_colaboradores(
    empresa: EmpresaAtual, db: DB, so_ativos: bool = False
) -> list[dict]:
    q = select(Colaborador).where(Colaborador.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Colaborador.estado == "activo")
    return [
        {
            "id": c.id, "numero": c.numero, "nome": c.nome, "categoria": c.categoria,
            "salario_base": c.salario_base, "subsidios": c.subsidios,
            "subsidio_ferias": c.subsidio_ferias, "subsidio_natal": c.subsidio_natal,
            "subs_nao_sujeitos": c.subs_nao_sujeitos,
            "data_admissao": c.data_admissao, "iban": c.iban, "nif": c.nif,
            "num_ss": c.num_ss, "provincia": c.provincia, "municipio": c.municipio,
            "estado": c.estado,
        }
        for c in db.scalars(q.order_by(Colaborador.numero)).all()
    ]


@router.post("/colaboradores", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_colaborador(
    request: Request, dados: ColaboradorEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    c = Colaborador(
        empresa_id=empresa.id,
        numero=dados.numero or _proximo_numero(db, empresa.id),
        **dados.model_dump(exclude={"numero"}),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "numero": c.numero, "nome": c.nome}


@router.patch("/colaboradores/{colaborador_id}", dependencies=[GERIR])
def atualizar_colaborador(
    request: Request,
    colaborador_id: UUID,
    dados: ColaboradorEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    c = _colab(db, empresa.id, colaborador_id)
    for campo, valor in dados.model_dump(exclude_unset=True, exclude={"numero"}).items():
        setattr(c, campo, valor)
    db.commit()
    return {"id": c.id, "nome": c.nome}


@router.delete(
    "/colaboradores/{colaborador_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[GERIR],
)
def remover_colaborador(
    request: Request, colaborador_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    db.delete(_colab(db, empresa.id, colaborador_id))
    db.commit()


# ---------------------------------------------------------------------------
# Alterações mensais
# ---------------------------------------------------------------------------
@router.get("/alteracoes")
def listar_alteracoes(empresa: EmpresaAtual, db: DB, mes: str) -> list[dict]:
    alts = svc.listar_alteracoes(db, empresa_id=empresa.id, mes=mes)
    return [
        {"id": a.id, "colaborador_id": a.colaborador_id, "mes": a.mes,
         "faltas": a.faltas, "abonos": a.abonos, "descontos": a.descontos}
        for a in alts
    ]


@router.put("/alteracoes/{colaborador_id}", dependencies=[GERIR])
def gravar_alteracao(
    request: Request,
    colaborador_id: UUID,
    dados: AlteracaoEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    _colab(db, empresa.id, colaborador_id)
    a = svc.guardar_alteracao(
        db, empresa_id=empresa.id, colaborador_id=colaborador_id, mes=dados.mes,
        faltas=dados.faltas, abonos=dados.abonos, descontos=dados.descontos,
    )
    db.commit()
    return {"colaborador_id": colaborador_id, "mes": a.mes, "faltas": a.faltas}


# ---------------------------------------------------------------------------
# Folha, processamento e pagamento
# ---------------------------------------------------------------------------
@router.get("/folha")
def obter_folha(
    empresa: EmpresaAtual, db: DB, mes: str | None = None, so_ativos: bool = True
) -> dict:
    """Simulação da folha do mês — não grava nem lança nada."""
    return svc.folha(db, empresa_id=empresa.id, mes=mes, so_ativos=so_ativos)


@router.get("/estado")
def estado_mes(empresa: EmpresaAtual, db: DB, mes: str) -> dict:
    return {"mes": mes, "estado": svc.estado_mes(db, empresa.id, mes)}


@router.get("/processamentos")
def listar_processamentos(
    empresa: EmpresaAtual, db: DB, offset: int = 0, limite: int = LIMITE_OMISSAO
) -> dict:
    """Processamentos, uma página de cada vez.

    Doze por ano parece pouco — mas uma empresa com dez anos de histórico tem
    cento e vinte, e a lista nunca deixa de crescer. A regra não abre excepção
    para listas que crescem devagar; abre para as que não crescem.
    """
    return pagina(
        db,
        select(ProcessamentoSalarial)
        .where(ProcessamentoSalarial.empresa_id == empresa.id)
        .order_by(ProcessamentoSalarial.mes.desc()),
        offset=offset,
        limite=limite,
        formatar=lambda p: {
            "id": p.id, "mes": p.mes, "totais": p.totais, "lancado": p.lancado,
            "lancamento_id": p.lancamento_id, "criado_em": p.criado_em,
        },
    )


@router.post("/processamentos", dependencies=[GERIR])
def processar(
    request: Request, dados: ProcessarPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    r = svc.processar_mes(
        db, empresa_id=empresa.id, mes=dados.mes, data=dados.data,
        exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


@router.get("/pagamentos")
def listar_pagamentos(
    empresa: EmpresaAtual, db: DB, offset: int = 0, limite: int = LIMITE_OMISSAO
) -> dict:
    return pagina(
        db,
        select(PagamentoSalarial)
        .where(PagamentoSalarial.empresa_id == empresa.id)
        .order_by(PagamentoSalarial.mes.desc()),
        offset=offset,
        limite=limite,
        formatar=lambda p: {
            "id": p.id, "mes": p.mes, "valor": p.valor, "conta": p.conta,
            "lancado": p.lancado, "numero_op": p.numero_op,
        },
    )


@router.get("/resumo-pagamentos")
def resumo_pagamentos(empresa: EmpresaAtual, db: DB) -> dict:
    """Os quatro números do topo do ecrã de pagamentos.

    Vêm do servidor porque a lista passou a ser paginada: somados no cliente,
    o «total pago» passaria a ser o total da PÁGINA — e um total de salários
    que muda quando se carrega em «seguinte» não é um total, é um acidente.

    «Por pagar» é o que foi processado e ainda não tem pagamento: cruza os dois
    conjuntos pelo mês, que é a chave por que a folha se organiza.
    """
    pagos = select(PagamentoSalarial.mes).where(
        PagamentoSalarial.empresa_id == empresa.id
    )
    total_pago, n_pagamentos = db.execute(
        select(
            func.coalesce(func.sum(PagamentoSalarial.valor), 0), func.count()
        ).where(PagamentoSalarial.empresa_id == empresa.id)
    ).one()

    processados = db.scalars(
        select(ProcessamentoSalarial).where(
            ProcessamentoSalarial.empresa_id == empresa.id
        )
    ).all()
    meses_pagos = set(db.scalars(pagos).all())
    por_pagar = sum(
        (
            Decimal(str((p.totais or {}).get("liquido") or 0))
            for p in processados
            if p.mes not in meses_pagos
        ),
        Decimal("0"),
    )

    return {
        "total_pago": total_pago,
        "n_pagamentos": n_pagamentos,
        "meses_processados": len(processados),
        "por_pagar": por_pagar,
    }


@router.post("/pagamentos", dependencies=[GERIR])
def pagar(request: Request, dados: PagarPedido, empresa: EmpresaAtual, db: DB) -> dict:
    r = svc.pagar_mes(
        db, empresa_id=empresa.id, mes=dados.mes, conta=dados.conta,
        data=dados.data, exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


# ---------------------------------------------------------------------------
# Independentes e honorários
# ---------------------------------------------------------------------------
@router.get("/independentes")
def listar_independentes(empresa: EmpresaAtual, db: DB) -> list[dict]:
    return [
        {"id": i.id, "nome": i.nome, "nif": i.nif, "atividade": i.atividade,
         "taxa_ret": i.taxa_ret, "estado": i.estado}
        for i in db.scalars(
            select(Independente)
            .where(Independente.empresa_id == empresa.id)
            .order_by(Independente.nome)
        ).all()
    ]


@router.post("/independentes", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_independente(
    request: Request, dados: IndependenteEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    i = Independente(empresa_id=empresa.id, **dados.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return {"id": i.id, "nome": i.nome, "taxa_ret": i.taxa_ret}


@router.get("/honorarios")
def listar_honorarios(empresa: EmpresaAtual, db: DB, mes: str | None = None) -> list[dict]:
    return [
        {"id": h.id, "nome": h.nome, "data": h.data, "mes": h.mes,
         "descricao": h.descricao, "bruto": h.bruto, "taxa": h.taxa,
         "retencao": h.retencao, "liquido": h.liquido, "numero_op": h.numero_op}
        for h in svc.listar_honorarios(db, empresa_id=empresa.id, mes=mes)
    ]


@router.post("/honorarios", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_honorario(
    request: Request, dados: HonorarioPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    r = svc.processar_honorario(
        db, empresa_id=empresa.id, independente_id=dados.independente_id,
        valor=dados.valor, data=dados.data, mes=dados.mes,
        descricao=dados.descricao, ref=dados.ref, exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


# ---------------------------------------------------------------------------
# Mapa de Remunerações IRT A2.1
# ---------------------------------------------------------------------------
@router.get("/mapa-irt")
def obter_mapa_irt(
    empresa: EmpresaAtual, db: DB, mes: str, so_ativos: bool = True
) -> dict:
    """Mapa de Remunerações — Modelo IRT A2.1 (AGT), pronto a exportar."""
    linhas = svc.mapa_irt(db, empresa_id=empresa.id, mes=mes, so_ativos=so_ativos)
    return {
        "mes": mes,
        "rubricas_nao_sujeitas": list(SUBS_NAO_SUJEITOS),
        "rubricas_sujeitas": list(SUBS_SUJEITOS),
        "linhas": linhas,
        "totais": {
            k: sum((l[k] for l in linhas), Decimal("0"))
            for k in ("salario_base", "sub_nao_suj", "sub_suj", "salario_iliquido",
                      "base_ss", "contrib_ss", "base_irt", "irt")
        },
    }


@router.put("/mapa-irt/{colaborador_id}", dependencies=[GERIR])
def gravar_mapa_irt(
    request: Request,
    colaborador_id: UUID,
    dados: MapaIrtEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    _colab(db, empresa.id, colaborador_id)
    linha = svc.linha_mapa_irt_para_gravar(
        db, empresa_id=empresa.id, colaborador_id=colaborador_id, mes=dados.mes
    )

    permitidas = set(SUBS_NAO_SUJEITOS) | set(SUBS_SUJEITOS)
    desconhecidas = set(dados.valores) - permitidas
    if desconhecidas:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Rubricas desconhecidas: {', '.join(sorted(desconhecidas))}.",
        )
    for k, v in dados.valores.items():
        setattr(linha, k, v)
    for flag in ("calc_manual_excesso", "registo_manual_ss", "nao_sujeito_ss",
                 "isento_irt"):
        setattr(linha, flag, getattr(dados, flag))
    linha.excesso_subsidios_nao_sujeitos = dados.excesso_subsidios_nao_sujeitos
    linha.base_tributavel_ss_manual = dados.base_tributavel_ss_manual

    db.commit()
    return {"colaborador_id": colaborador_id, "mes": dados.mes}


# ---------------------------------------------------------------------------
# Configuração e tabelas fiscais
# ---------------------------------------------------------------------------
@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    """Configuração de RH: taxas de INSS, tabela do IRT e contas."""
    return svc.cfg_rh(db, empresa.id)


@router.put("/config", dependencies=[GERIR])
def gravar_config(
    request: Request, dados: dict, empresa: EmpresaAtual, db: DB
) -> dict:
    r = svc.guardar_cfg_rh(db, empresa.id, dados)
    db.commit()
    return r


@router.get("/irps")
def irps() -> dict:
    """IRPS — informativo. Entra em vigor a 01-01-2027 e substitui o IRT."""
    return IRPS_INFO
