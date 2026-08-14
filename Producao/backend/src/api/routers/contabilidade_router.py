"""Contabilidade: tabelas base, lançamentos, razão, contas correntes e analítica.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.paginacao import LIMITE_MAXIMO, LIMITE_OMISSAO, pagina
from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.api.mestres import aplicar, obter_da_empresa
from src.core.pgc import CATEGORIAS_DIARIO, PERIODOS
from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    Diario,
    DiarioFecho,
    DocumentoContabilistico,
    Fluxo,
    Lancamento,
    LancamentoLinha,
)
from src.db.models.tenancy import Exercicio
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


class FichaConta(BaseModel):
    """Os campos da ficha de conta do Piloto.

    Nenhum entra no motor de lançamentos — são informativos ou de
    parametrização. Partilhados por criar e alterar para não divergirem.
    """

    classe_iva: str | None = Field(default=None, max_length=20)
    classe_primavera: str | None = Field(default=None, max_length=20)
    conta_alt_codigo: str | None = Field(default=None, max_length=20)
    conta_alt_nome: str | None = Field(default=None, max_length=200)
    retencao: str | None = Field(default=None, max_length=40)
    motivo_tributacao: str | None = Field(default=None, max_length=200)
    trat_pendentes: bool | None = None
    integra_equipamentos: bool | None = None
    integra_ativos: bool | None = None
    investimento: str | None = Field(default=None, max_length=40)
    custo_fixo: Decimal | None = None
    item_tesouraria: str | None = Field(default=None, max_length=40)


class ContaCriar(FichaConta):
    codigo: str = Field(min_length=1, max_length=20)
    nome: str = Field(min_length=1, max_length=200)
    tipo: str | None = Field(default=None, max_length=1)
    natureza: str | None = Field(default=None, max_length=1)
    ativa: bool = True


class ContaAtualizar(FichaConta):
    """O CÓDIGO NÃO SE ALTERA. Os lançamentos guardam o código da conta, não a
    sua chave interna — mudá-lo aqui deixava os movimentos antigos a apontar
    para uma conta que já não existe. Para outro código, cria-se outra conta."""

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    natureza: str | None = Field(default=None, max_length=1)
    ativa: bool | None = None


class ImportarPlanoPedido(BaseModel):
    linhas: list[dict]
    substituir: bool = False


class DiarioPedido(BaseModel):
    codigo: str = Field(min_length=1, max_length=10)
    nome: str = Field(min_length=1, max_length=120)
    categoria: str = Field(min_length=1, max_length=30)
    ativo: bool = True


class DiarioAtualizar(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    categoria: str | None = Field(default=None, max_length=30)
    ativo: bool | None = None


class DocumentoPedido(BaseModel):
    codigo: str = Field(min_length=1, max_length=10)
    descricao: str = Field(min_length=1, max_length=120)
    diario_codigo: str = Field(min_length=1, max_length=10)
    conta_debito: str | None = Field(default=None, max_length=20)
    conta_credito: str | None = Field(default=None, max_length=20)
    retencao: bool = False
    ativo: bool = True


class DocumentoAtualizar(BaseModel):
    descricao: str | None = Field(default=None, min_length=1, max_length=120)
    diario_codigo: str | None = Field(default=None, max_length=10)
    conta_debito: str | None = Field(default=None, max_length=20)
    conta_credito: str | None = Field(default=None, max_length=20)
    retencao: bool | None = None
    ativo: bool | None = None


class CentroPedido(BaseModel):
    codigo: str = Field(min_length=1, max_length=20)
    nome: str = Field(min_length=1, max_length=120)
    tipo: str = Field(default="custo", max_length=20)
    responsavel: str | None = Field(default=None, max_length=120)
    estado: str = Field(default="activo", max_length=20)


class CentroAtualizar(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    tipo: str | None = Field(default=None, max_length=20)
    responsavel: str | None = Field(default=None, max_length=120)
    estado: str | None = Field(default=None, max_length=20)


class FechoPedido(BaseModel):
    diario_codigo: str
    mes: str = Field(min_length=1, max_length=2)
    exercicio_id: UUID | None = None


class ExercicioPedido(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    inicio: Date
    fim: Date
    ativo: bool = True


class ExercicioAtualizar(BaseModel):
    """Só o estado e o interruptor de activo.

    O nome e as datas ficam DE FORA de propósito: os lançamentos guardam o id
    do exercício, não as suas datas. Mover as datas por baixo deles mudava o
    período a que pertencem sem lhes tocar — um balancete pedido pelo exercício
    passava a trazer movimentos que nunca lá estiveram, e ninguém dava por isso
    porque o lançamento continuava igual.
    """

    estado: str | None = Field(default=None, pattern="^(aberto|fechado)$")
    ativo: bool | None = None


# ---------------------------------------------------------------------------
# Tabelas base
# ---------------------------------------------------------------------------
@router.get("/periodos", dependencies=[VER])
def periodos() -> list[dict]:
    """Períodos contabilísticos 00–15."""
    return [{"codigo": c, "nome": n} for c, n in PERIODOS]


def _exercicio_publico(e: Exercicio) -> dict:
    return {"id": e.id, "nome": e.nome, "inicio": e.inicio, "fim": e.fim,
            "estado": e.estado, "ativo": e.ativo, "apuramento": e.apuramento}


@router.get("/exercicios", dependencies=[VER])
def listar_exercicios(empresa: EmpresaAtual, db: DB) -> list[dict]:
    """Exercícios económicos da empresa, mais recente primeiro.

    Vários podem estar activos em simultâneo (transição de ano) — `ativo` é um
    interruptor independente, não uma escolha exclusiva, como no Piloto.
    """
    exs = db.scalars(
        select(Exercicio)
        .where(Exercicio.empresa_id == empresa.id)
        .order_by(Exercicio.inicio.desc())
    ).all()
    return [_exercicio_publico(e) for e in exs]


@router.post("/exercicios", status_code=status.HTTP_201_CREATED,
             dependencies=[FECHAR])
def criar_exercicio(dados: ExercicioPedido, empresa: EmpresaAtual, db: DB) -> dict:
    """Abre um exercício novo. Nasce SEMPRE aberto.

    `estado` não vem no pedido: criar um exercício já fechado não serve para
    nada e seria uma forma silenciosa de bloquear lançamentos.
    """
    if dados.fim <= dados.inicio:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "O fim do exercício tem de ser depois do início.",
        )
    ja = db.scalar(
        select(Exercicio.id).where(
            Exercicio.empresa_id == empresa.id, Exercicio.nome == dados.nome
        )
    )
    if ja is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Já existe o exercício «{dados.nome}»."
        )
    e = Exercicio(empresa_id=empresa.id, estado="aberto", **dados.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return _exercicio_publico(e)


@router.patch("/exercicios/{exercicio_id}", dependencies=[FECHAR])
def actualizar_exercicio(
    exercicio_id: UUID, dados: ExercicioAtualizar, empresa: EmpresaAtual, db: DB
) -> dict:
    """Fecha, reabre, activa ou desactiva.

    Fechar e reabrir é reversível a qualquer momento, como no Piloto. Quem
    barra o lançamento é `svc.gravar_lancamento`, que lê este `estado` — esta
    rota não repete a regra, só lhe muda o valor.
    """
    e = obter_da_empresa(db, Exercicio, exercicio_id, empresa.id, nome="Exercício")
    aplicar(e, dados)
    db.commit()
    db.refresh(e)
    return _exercicio_publico(e)


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
    return [_conta_publica(c) for c in contas[:limite]]


def _aplicar_ficha(c: Conta, dados) -> None:
    """Escreve os campos da ficha que vieram no pedido.

    `exclude_unset` e não `exclude_none`: um campo enviado explicitamente a
    `null` é uma ordem para limpar, e tem de chegar.
    """
    enviados = dados.model_dump(exclude_unset=True)
    for campo in FichaConta.model_fields:
        if campo in enviados:
            setattr(c, campo, enviados[campo])


def _conta_publica(c: Conta) -> dict:
    """A ficha completa. Os onze campos do Piloto vêm sempre — um campo que a
    resposta omite é um campo que o formulário perde ao gravar de volta."""
    return {
        "id": c.id, "codigo": c.codigo, "nome": c.nome, "tipo": c.tipo,
        "natureza": c.natureza, "classe_iva": c.classe_iva, "ativa": c.ativa,
        "classe_primavera": c.classe_primavera,
        "conta_alt_codigo": c.conta_alt_codigo,
        "conta_alt_nome": c.conta_alt_nome,
        "retencao": c.retencao,
        "motivo_tributacao": c.motivo_tributacao,
        "trat_pendentes": c.trat_pendentes,
        "integra_equipamentos": c.integra_equipamentos,
        "integra_ativos": c.integra_ativos,
        "investimento": c.investimento,
        "custo_fixo": c.custo_fixo,
        "item_tesouraria": c.item_tesouraria,
    }


@router.post("/contas", status_code=status.HTTP_201_CREATED, dependencies=[PLANO])
def criar_conta(
    request: Request, dados: ContaCriar, empresa: EmpresaAtual, db: DB
) -> dict:
    """Cria uma conta pela regra do Piloto (`criarConta` / `criarSubconta`).

    REGRESSÃO CORRIGIDA: esta rota inseria a linha e mais nada. Criar `2611001`
    a partir de `2611`, que tinha cinco linhas de lançamento, deixava `2611`
    como conta de MOVIMENTO com movimentos **e** com uma filha — o estado que
    `postar` recusa («a conta é integradora») e que faz o balancete somar o
    valor duas vezes, na mãe e na agregação dos filhos.

    `svc.criar_conta` é quem sabe fazer isto: quando o código estende uma conta
    de movimento, a mãe passa a integradora e os movimentos dela MIGRAM para a
    subconta nova. O serviço já existia e nenhuma rota o usava.
    """
    resultado = svc.criar_conta(
        db,
        empresa.id,
        codigo=dados.codigo,
        nome=dados.nome,
        natureza=dados.natureza,
    )
    criada = db.scalar(
        select(Conta).where(
            Conta.empresa_id == empresa.id, Conta.codigo == resultado["criada"]
        )
    )
    if criada is not None:
        # A ficha aplica-se depois: `svc.criar_conta` só sabe de código, nome e
        # natureza — o resto é parametrização que não lhe diz respeito.
        _aplicar_ficha(criada, dados)
        criada.ativa = dados.ativa
    db.commit()

    c = db.scalar(
        select(Conta).where(
            Conta.empresa_id == empresa.id, Conta.codigo == resultado["criada"]
        )
    )
    return {
        "id": c.id, "codigo": c.codigo, "nome": c.nome,
        # Quem chama precisa de saber que a mãe mudou de natureza, para o dizer
        # a quem carregou no botão em vez de o descobrir mais tarde num mapa.
        "tornou_integradora": resultado["tornou_integradora"],
        "movidos": resultado["movidos"],
    }


@router.patch("/contas/{conta_id}", dependencies=[PLANO])
def actualizar_conta(
    request: Request, conta_id: UUID, dados: ContaAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    """Altera a ficha de uma conta: nome, natureza, estado e os campos de
    fiscalidade, integração e tesouraria do Piloto.

    O código fica de fora de propósito — ver `ContaAtualizar`.
    """
    c = db.scalar(
        select(Conta).where(Conta.id == conta_id, Conta.empresa_id == empresa.id)
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada.")

    pedido = dados.model_dump(exclude_unset=True)
    if not pedido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nada para alterar.")
    for campo, valor in pedido.items():
        setattr(c, campo, valor)
    db.commit()
    db.refresh(c)
    return _conta_publica(c)


@router.delete("/contas/{conta_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[PLANO])
def remover_conta(conta_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Elimina uma conta que nunca foi usada.

    UMA CONTA COM MOVIMENTOS NÃO SE APAGA. Os lançamentos guardam o código, não
    a chave: apagar a conta deixava o balancete com linhas sem designação e o
    razão a referir uma conta inexistente. Para a tirar de uso, desactive-a —
    deixa de aparecer nas escolhas e o histórico continua a ler-se.

    É mais restritivo do que o Piloto, que apagava sempre. A justificação é
    esta: lá, a mesma operação partia os movimentos antigos em silêncio.
    """
    c = db.scalar(
        select(Conta).where(Conta.id == conta_id, Conta.empresa_id == empresa.id)
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada.")

    usada = db.scalar(
        select(LancamentoLinha.id)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa.id,
            LancamentoLinha.conta_codigo == c.codigo,
        )
        .limit(1)
    )
    if usada is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A conta {c.codigo} tem movimentos e não pode ser eliminada. "
            "Desactive-a para deixar de a usar sem perder o histórico.",
        )
    db.delete(c)
    db.commit()


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


def _diario_publico(d: Diario) -> dict:
    return {"id": d.id, "codigo": d.codigo, "nome": d.nome,
            "categoria": d.categoria, "ativo": d.ativo}


@router.post("/diarios", status_code=status.HTTP_201_CREATED, dependencies=[PLANO])
def criar_diario(
    request: Request, dados: DiarioPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    ja = db.scalar(
        select(Diario.id).where(
            Diario.empresa_id == empresa.id, Diario.codigo == dados.codigo
        )
    )
    if ja is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Já existe o diário {dados.codigo}."
        )
    d = Diario(empresa_id=empresa.id, **dados.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return _diario_publico(d)


@router.patch("/diarios/{diario_id}", dependencies=[PLANO])
def actualizar_diario(
    request: Request, diario_id: UUID, dados: DiarioAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    """O CÓDIGO NÃO SE ALTERA: os lançamentos e os fechos guardam-no."""
    d = db.scalar(
        select(Diario).where(Diario.id == diario_id, Diario.empresa_id == empresa.id)
    )
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Diário não encontrado.")
    pedido = dados.model_dump(exclude_unset=True)
    if not pedido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nada para alterar.")
    for campo, valor in pedido.items():
        setattr(d, campo, valor)
    db.commit()
    db.refresh(d)
    return _diario_publico(d)


@router.delete("/diarios/{diario_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[PLANO])
def remover_diario(diario_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um diário com movimentos ou com documentos associados não se apaga.

    Pela mesma razão das contas: os lançamentos guardam o CÓDIGO do diário, e
    apagá-lo deixava-os a apontar para nada. Desactivar tira-o das escolhas
    novas sem tocar no que já foi lançado.
    """
    d = db.scalar(
        select(Diario).where(Diario.id == diario_id, Diario.empresa_id == empresa.id)
    )
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Diário não encontrado.")

    com_movimentos = db.scalar(
        select(Lancamento.id)
        .where(
            Lancamento.empresa_id == empresa.id,
            Lancamento.diario_codigo == d.codigo,
        )
        .limit(1)
    )
    if com_movimentos is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O diário {d.codigo} tem movimentos e não pode ser eliminado. "
            "Desactive-o para deixar de o usar sem perder o histórico.",
        )
    com_documentos = db.scalar(
        select(DocumentoContabilistico.id)
        .where(
            DocumentoContabilistico.empresa_id == empresa.id,
            DocumentoContabilistico.diario_codigo == d.codigo,
        )
        .limit(1)
    )
    if com_documentos is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O diário {d.codigo} tem documentos associados. Elimine-os ou "
            "mude-os de diário primeiro.",
        )
    db.delete(d)
    db.commit()


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


def _documento_publico(d: DocumentoContabilistico) -> dict:
    return {"id": d.id, "codigo": d.codigo, "descricao": d.descricao,
            "diario_codigo": d.diario_codigo, "conta_debito": d.conta_debito,
            "conta_credito": d.conta_credito, "retencao": d.retencao,
            "ativo": d.ativo}


def _exigir_diario(db: DB, empresa_id: UUID, codigo: str) -> None:
    """Um documento aponta para um diário pelo código. Se o diário não existir,
    o documento fica inutilizável e só se descobre ao tentar lançar."""
    existe = db.scalar(
        select(Diario.id).where(
            Diario.empresa_id == empresa_id, Diario.codigo == codigo
        )
    )
    if existe is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"O diário {codigo} não existe nesta empresa.",
        )


@router.post("/documentos", status_code=status.HTTP_201_CREATED, dependencies=[PLANO])
def criar_documento(
    request: Request, dados: DocumentoPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    ja = db.scalar(
        select(DocumentoContabilistico.id).where(
            DocumentoContabilistico.empresa_id == empresa.id,
            DocumentoContabilistico.codigo == dados.codigo,
        )
    )
    if ja is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Já existe o documento {dados.codigo}."
        )
    _exigir_diario(db, empresa.id, dados.diario_codigo)
    d = DocumentoContabilistico(empresa_id=empresa.id, **dados.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return _documento_publico(d)


@router.patch("/documentos/{documento_id}", dependencies=[PLANO])
def actualizar_documento(
    request: Request, documento_id: UUID, dados: DocumentoAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    d = db.scalar(
        select(DocumentoContabilistico).where(
            DocumentoContabilistico.id == documento_id,
            DocumentoContabilistico.empresa_id == empresa.id,
        )
    )
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado.")
    pedido = dados.model_dump(exclude_unset=True)
    if not pedido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nada para alterar.")
    if pedido.get("diario_codigo"):
        _exigir_diario(db, empresa.id, pedido["diario_codigo"])
    for campo, valor in pedido.items():
        setattr(d, campo, valor)
    db.commit()
    db.refresh(d)
    return _documento_publico(d)


@router.delete("/documentos/{documento_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[PLANO])
def remover_documento(documento_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um documento com movimentos não se apaga — desactiva-se."""
    d = db.scalar(
        select(DocumentoContabilistico).where(
            DocumentoContabilistico.id == documento_id,
            DocumentoContabilistico.empresa_id == empresa.id,
        )
    )
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado.")
    usado = db.scalar(
        select(Lancamento.id)
        .where(
            Lancamento.empresa_id == empresa.id,
            Lancamento.documento_codigo == d.codigo,
        )
        .limit(1)
    )
    if usado is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O documento {d.codigo} tem movimentos e não pode ser eliminado. "
            "Desactive-o para deixar de o usar sem perder o histórico.",
        )
    db.delete(d)
    db.commit()


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


def _centro_publico(c: CentroCusto) -> dict:
    return {"id": c.id, "codigo": c.codigo, "nome": c.nome, "tipo": c.tipo,
            "responsavel": c.responsavel, "estado": c.estado}


@router.post("/centros", status_code=status.HTTP_201_CREATED, dependencies=[PLANO])
def criar_centro(
    request: Request, dados: CentroPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    ja = db.scalar(
        select(CentroCusto.id).where(
            CentroCusto.empresa_id == empresa.id, CentroCusto.codigo == dados.codigo
        )
    )
    if ja is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Já existe o centro {dados.codigo}."
        )
    c = CentroCusto(empresa_id=empresa.id, **dados.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return _centro_publico(c)


@router.patch("/centros/{centro_id}", dependencies=[PLANO])
def actualizar_centro(
    request: Request, centro_id: UUID, dados: CentroAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    c = db.scalar(
        select(CentroCusto).where(
            CentroCusto.id == centro_id, CentroCusto.empresa_id == empresa.id
        )
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Centro não encontrado.")
    pedido = dados.model_dump(exclude_unset=True)
    if not pedido:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nada para alterar.")
    for campo, valor in pedido.items():
        setattr(c, campo, valor)
    db.commit()
    db.refresh(c)
    return _centro_publico(c)


@router.delete("/centros/{centro_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[PLANO])
def remover_centro(centro_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um centro já usado em linhas de lançamento não se apaga.

    O mapa de custos é construído a partir do código do centro guardado na
    linha. Apagá-lo transformava custos imputados em custos órfãos, e o mapa
    passava a somar menos do que a contabilidade.
    """
    c = db.scalar(
        select(CentroCusto).where(
            CentroCusto.id == centro_id, CentroCusto.empresa_id == empresa.id
        )
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Centro não encontrado.")
    usado = db.scalar(
        select(LancamentoLinha.id)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa.id,
            LancamentoLinha.centro_codigo == c.codigo,
        )
        .limit(1)
    )
    if usado is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O centro {c.codigo} tem custos imputados e não pode ser "
            "eliminado. Mude-o para inactivo.",
        )
    db.delete(c)
    db.commit()


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
    offset: int = 0,
    limite: int = Query(default=LIMITE_OMISSAO, le=LIMITE_MAXIMO),
) -> dict:
    """Uma página de lançamentos, mais recentes primeiro.

    Devolve `{linhas, total, offset, limite}` e não uma lista: sem o total, o
    ecrã não sabe se há mais nada — ver a regra de listagens em `CLAUDE.md`.
    """
    q = (
        select(Lancamento)
        .where(Lancamento.empresa_id == empresa.id)
        .order_by(Lancamento.data.desc(), Lancamento.numero.desc())
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

    return pagina(
        db, q, offset=offset, limite=limite,
        formatar=lambda l: {
            "id": l.id, "numero": l.numero, "numero_op": l.numero_op, "data": l.data,
            "mes": l.mes, "diario_codigo": l.diario_codigo,
            "documento_codigo": l.documento_codigo, "descricao": l.descricao,
            "documento_ref": l.documento_ref, "origem": l.origem,
            "diferido": l.diferido,
            "total": sum((x.debito for x in l.linhas), Decimal("0")),
        },
    )


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
                # REGRESSÃO: os três seguintes existem no modelo e não vinham na
                # resposta. Carregar um movimento no editor perdia-os em
                # silêncio, e gravar de volta escrevia zeros por cima.
                "tipo_entidade": x.tipo_entidade,
                "perc_nao_ded": x.perc_nao_ded,
                "iva_autoliq": x.iva_autoliq,
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


#: De onde vem um movimento que NÃO foi lançado à mão, e onde se altera.
#: Editar aqui um lançamento gerado por outro módulo deixaria o documento de
#: origem a discordar da contabilidade — a venda a dizer um valor e o razão
#: outro. No Piloto o problema não existe porque lá não há essa ligação.
ONDE_SE_ALTERA = {
    "venda": "no documento de venda que o gerou",
    "compra": "no documento de compra que o gerou",
    "rh": "no processamento de salários que o gerou",
    "salarios": "no processamento de salários que o gerou",
    "logistica": "no movimento de stock que o gerou",
    "imobilizado": "no processamento de amortizações que o gerou",
    "amortizacao": "no processamento de amortizações que o gerou",
    "apuramento": "reabrindo o apuramento que o gerou",
}


@router.put("/lancamentos/{lancamento_id}", dependencies=[LANCAR])
def actualizar_lancamento(
    request: Request,
    lancamento_id: UUID,
    dados: LancamentoCriar,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    """Altera um movimento já gravado, como o Piloto faz.

    SÓ MOVIMENTOS MANUAIS. É a única diferença deliberada face ao Piloto neste
    ecrã, e a razão só existe na Produção: aqui as vendas, compras,
    processamentos de salários e amortizações guardam o `lancamento_id`. Editar
    à mão o lançamento de um recibo de vencimento deixava o recibo a dizer uma
    coisa e a contabilidade outra, sem nada a assinalar a divergência.

    A mensagem diz ONDE se altera, para não ser um «não pode» sem saída.
    """
    l = db.scalar(
        select(Lancamento).where(
            Lancamento.id == lancamento_id, Lancamento.empresa_id == empresa.id
        )
    )
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movimento não encontrado.")

    if l.origem != "manual":
        onde = ONDE_SE_ALTERA.get(l.origem, f"no módulo que o gerou ({l.origem})")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Este movimento foi gerado automaticamente e altera-se {onde} — "
            "não aqui. Assim a contabilidade e o documento de origem não se "
            "contradizem.",
        )

    svc.actualizar(
        db,
        l,
        data=dados.data,
        diario_codigo=dados.diario_codigo,
        documento_codigo=dados.documento_codigo,
        linhas=[x.model_dump() for x in dados.linhas],
        mes=dados.mes,
        descricao=dados.descricao,
        documento_ref=dados.documento_ref,
        diferido=dados.diferido,
    )
    db.commit()
    return {"id": l.id, "numero": l.numero, "numero_op": l.numero_op}


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
