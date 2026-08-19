"""Logística: artigos, armazéns, movimentos de stock e existências.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.api.mestres import aplicar, obter_da_empresa, recusar_se_usado
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.services import certificacao as svc_certificacao
from src.services import logistica as svc
from src.services.contabilidade import ErroContabilistico
from src.services.auditoria import auditar

router = APIRouter(
    prefix="/api/logistica",
    tags=["logística"],
    dependencies=[Depends(exigir_cap("logistica.ver"))],
)

GERIR = Depends(exigir_cap("logistica.gerir"))


class ArtigoEntrada(BaseModel):
    descricao: str = Field(min_length=1, max_length=300)
    codigo: str | None = Field(default=None, max_length=20)
    familia: str | None = None
    subfamilia: str | None = None
    unidade: str | None = None
    cod_barras: str | None = None
    tipo_artigo: str | None = None
    preco_venda: Decimal = Decimal("0")
    preco_compra: Decimal = Decimal("0")
    taxa_iva: Decimal = Decimal("0")
    stock_min: Decimal = Decimal("0")
    conta_existencia: str | None = None
    conta_custo: str | None = None
    conta_proveito: str | None = None
    estado: str = "activo"


class ArmazemEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=20)
    nome: str = Field(min_length=1, max_length=200)
    localizacao: str | None = None


class MovimentoEntrada(BaseModel):
    tipo: str = Field(pattern="^(entrada|saida|transferencia|ajuste)$")
    artigo_id: UUID
    armazem_id: UUID
    qtd: Decimal
    data: Date | None = None
    armazem_destino_id: UUID | None = None
    custo_unit: Decimal | None = None
    iva_perc: Decimal | None = None
    documento: str | None = None
    descricao: str | None = None
    entidade: str | None = None
    exercicio_id: UUID | None = None


@router.get("/artigos")
def listar_artigos(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> list[dict]:
    q = select(Artigo).where(Artigo.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Artigo.estado == "activo")
    return [
        {"id": a.id, "codigo": a.codigo, "descricao": a.descricao, "familia": a.familia,
         "subfamilia": a.subfamilia, "unidade": a.unidade,
         "cod_barras": a.cod_barras, "tipo_artigo": a.tipo_artigo,
         "conta_existencia": a.conta_existencia, "conta_custo": a.conta_custo,
         "conta_proveito": a.conta_proveito,
         "preco_venda": a.preco_venda, "preco_compra": a.preco_compra,
         "taxa_iva": a.taxa_iva, "stock_min": a.stock_min, "estado": a.estado}
        for a in db.scalars(q.order_by(Artigo.codigo)).all()
    ]


@router.post("/artigos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_artigo(
    request: Request, dados: ArtigoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = Artigo(
        empresa_id=empresa.id,
        codigo=dados.codigo or svc.proximo_codigo_artigo(db, empresa.id),
        **dados.model_dump(exclude={"codigo"}),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "codigo": a.codigo, "descricao": a.descricao}


@router.get("/armazens")
def listar_armazens(empresa: EmpresaAtual, db: DB) -> list[dict]:
    return [
        {"id": w.id, "codigo": w.codigo, "nome": w.nome, "localizacao": w.localizacao}
        for w in db.scalars(
            select(Armazem).where(Armazem.empresa_id == empresa.id).order_by(Armazem.codigo)
        ).all()
    ]


@router.post("/armazens", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_armazem(
    request: Request, dados: ArmazemEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    w = Armazem(empresa_id=empresa.id, **dados.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return {"id": w.id, "codigo": w.codigo, "nome": w.nome}


class ArtigoAtualizar(BaseModel):
    """O CÓDIGO não se altera: os movimentos de stock e as linhas de documento
    referem o artigo pela chave, mas o código é o que aparece impresso e o que
    as pessoas usam para o encontrar. Mudá-lo torna ilegível o que já foi
    emitido."""

    descricao: str | None = Field(default=None, min_length=1, max_length=300)
    familia: str | None = None
    subfamilia: str | None = None
    unidade: str | None = None
    cod_barras: str | None = None
    tipo_artigo: str | None = None
    preco_venda: Decimal | None = None
    preco_compra: Decimal | None = None
    taxa_iva: Decimal | None = None
    stock_min: Decimal | None = None
    conta_existencia: str | None = None
    conta_custo: str | None = None
    conta_proveito: str | None = None
    estado: str | None = None


class ArmazemAtualizar(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    localizacao: str | None = None


@router.patch("/artigos/{artigo_id}", dependencies=[GERIR])
def actualizar_artigo(
    request: Request, artigo_id: UUID, dados: ArtigoAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    a = obter_da_empresa(db, Artigo, artigo_id, empresa.id, nome="Artigo")
    aplicar(a, dados)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "codigo": a.codigo, "descricao": a.descricao,
            "estado": a.estado}


@router.delete("/artigos/{artigo_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_artigo(artigo_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um artigo com movimentos de stock ou em documentos não se apaga."""
    from src.db.models.comercial import CompraLinha, VendaLinha

    a = obter_da_empresa(db, Artigo, artigo_id, empresa.id, nome="Artigo")
    recusar_se_usado(
        db,
        [
            (select(MovimentoStock.id).where(MovimentoStock.artigo_id == a.id),
             "movimentos de stock"),
            (select(VendaLinha.id).where(VendaLinha.artigo_id == a.id),
             "linhas em documentos de venda"),
            (select(CompraLinha.id).where(CompraLinha.artigo_id == a.id),
             "linhas em documentos de compra"),
        ],
        o_que=f"O artigo {a.codigo}",
    )
    db.delete(a)
    db.commit()


@router.patch("/armazens/{armazem_id}", dependencies=[GERIR])
def actualizar_armazem(
    request: Request, armazem_id: UUID, dados: ArmazemAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    w = obter_da_empresa(db, Armazem, armazem_id, empresa.id, nome="Armazém")
    aplicar(w, dados)
    db.commit()
    db.refresh(w)
    return {"id": w.id, "codigo": w.codigo, "nome": w.nome,
            "localizacao": w.localizacao}


@router.delete("/armazens/{armazem_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_armazem(armazem_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um armazém com movimentos não se apaga.

    O stock por armazém é reconstruído a partir dos movimentos: apagar o
    armazém deixava existências atribuídas a um destino que já não existe.
    """
    w = obter_da_empresa(db, Armazem, armazem_id, empresa.id, nome="Armazém")
    recusar_se_usado(
        db,
        [
            (
                select(MovimentoStock.id).where(
                    (MovimentoStock.armazem_id == w.id)
                    | (MovimentoStock.armazem_destino_id == w.id)
                ),
                "movimentos de stock",
            )
        ],
        o_que=f"O armazém {w.codigo}",
    )
    db.delete(w)
    db.commit()


@router.get("/movimentos")
def listar_movimentos(
    empresa: EmpresaAtual,
    db: DB,
    artigo_id: UUID | None = None,
    armazem_id: UUID | None = None,
    tipo: str | None = None,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
) -> dict:
    q = select(MovimentoStock).where(MovimentoStock.empresa_id == empresa.id)
    if artigo_id:
        q = q.where(MovimentoStock.artigo_id == artigo_id)
    if armazem_id:
        q = q.where(MovimentoStock.armazem_id == armazem_id)
    if tipo:
        q = q.where(MovimentoStock.tipo == tipo)
    return pagina(
        db, q.order_by(
            MovimentoStock.data.desc(), MovimentoStock.criado_em.desc()
        ),
        offset=offset, limite=limite,
        formatar=lambda m: {
         "id": m.id, "numero": m.numero, "tipo": m.tipo, "data": m.data,
         "artigo_id": m.artigo_id, "artigo_desc": m.artigo_desc,
         "armazem_id": m.armazem_id, "armazem_destino_id": m.armazem_destino_id,
         "qtd": m.qtd, "unidade": m.unidade, "custo_unit": m.custo_unit,
         "valor": m.valor, "documento": m.documento, "entidade": m.entidade,
         "numero_op": m.numero_op,
         # Quem já foi anulado, e quem é a anulação de quem: sem isto a lista
         # mostrava o movimento original e o seu contrário sem os relacionar.
         "estornado_em": m.estornado_em, "estorna_id": m.estorna_id,
        },
    )


@router.post("/movimentos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_movimento(
    request: Request, dados: MovimentoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    """Recepção, Expedição, Transferência ou Inventariação.

    Em saídas e transferências o custo unitário é ignorado — usa-se sempre o
    custo médio corrente do armazém de origem.
    """
    m = svc.registar_movimento(db, empresa_id=empresa.id, **dados.model_dump())
    db.commit()
    return {"id": m.id, "numero": m.numero, "custo_unit": m.custo_unit,
            "valor": m.valor, "numero_op": m.numero_op}


@router.post("/movimentos/{movimento_id}/anular", dependencies=[GERIR])
def anular_movimento(
    request: Request, movimento_id: UUID, empresa: EmpresaAtual,
    quem: UtilizadorAtual, db: DB,
) -> dict:
    """Anula um movimento de stock por ESTORNO — o original não se apaga.

    Cria o movimento contrário e reverte o lançamento, na mesma transacção. O
    original fica no histórico marcado com quem anulou e quando: é o que
    permite responder a um auditor «foi lançado, e foi revertido no dia X por
    fulano», coisa que uma linha apagada não permite.
    """
    try:
        original, inverso = svc.anular_movimento(
            db, empresa_id=empresa.id, movimento_id=movimento_id, quem_id=quem.id
        )
    except ErroContabilistico as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

    auditar(
        db, actor=quem, accao="logistica.movimento.anular", request=request,
        alvo_tipo="movimento_stock", alvo_id=original.id,
        alvo_desc=original.numero, empresa_id=empresa.id,
        detalhes={
            "anulado": original.numero,
            "compensacao": inverso.numero,
            "lancamento_anulado": original.numero_op,
            "lancamento_compensacao": inverso.numero_op,
        },
    )
    db.commit()
    return {
        "anulado": original.numero,
        "compensacao": inverso.numero,
        "numero_op": inverso.numero_op,
    }


@router.get("/armazens/resumo")
def resumo_dos_armazens(empresa: EmpresaAtual, db: DB) -> list[dict]:
    """Quantos artigos e quanto vale o stock de cada armazém.

    Uma lista de armazéns responde «onde» e não responde «o quê» — e é a
    segunda a pergunta que se faz ao olhar para ela.

    Percorre os armazéns e reaproveita o cálculo das existências em vez de o
    reescrever agrupado: o custo médio ponderado é por artigo E armazém, e uma
    segunda implementação divergiria da primeira à primeira correcção. Os
    armazéns de uma empresa contam-se pelos dedos; se algum dia forem centenas,
    é aqui que se muda.
    """
    from src.db.models.logistica import Armazem

    saida = []
    for a in db.scalars(
        select(Armazem)
        .where(Armazem.empresa_id == empresa.id)
        .order_by(Armazem.codigo)
    ).all():
        linhas = [
            l
            for l in svc.existencias(db, empresa_id=empresa.id, armazem_id=a.id)
            if l["stock"] > 0
        ]
        saida.append(
            {
                "armazem_id": a.id,
                "codigo": a.codigo,
                "artigos": len(linhas),
                "valor": sum((l["valor"] for l in linhas), Decimal("0")),
            }
        )
    return saida


@router.get("/existencias")
def listar_existencias(
    empresa: EmpresaAtual, db: DB, armazem_id: UUID | None = None,
    so_ativos: bool = False,
) -> dict:
    linhas = svc.existencias(
        db, empresa_id=empresa.id, armazem_id=armazem_id, so_ativos=so_ativos
    )
    return {
        "linhas": linhas,
        "valor_total": sum((l["valor"] for l in linhas), Decimal("0")),
        "em_rutura": sum(1 for l in linhas if l["rutura"]),
    }


@router.get("/stock/{artigo_id}")
def obter_stock(
    artigo_id: UUID, empresa: EmpresaAtual, db: DB, armazem_id: UUID | None = None
) -> dict:
    if db.scalar(
        select(Artigo.id).where(Artigo.id == artigo_id, Artigo.empresa_id == empresa.id)
    ) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artigo não encontrado.")
    return {
        "artigo_id": artigo_id,
        "stock": svc.stock(db, empresa_id=empresa.id, artigo_id=artigo_id,
                           armazem_id=armazem_id),
        "custo_medio": svc.custo_medio(db, empresa_id=empresa.id, artigo_id=artigo_id,
                                       armazem_id=armazem_id),
    }


@router.get("/tipos-movimento")
def tipos_movimento() -> list[dict]:
    return [{"cod": t["cod"], "nome": t["nome"]} for t in svc.TIPOS_MOV]


@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    # A certificação vai junto para a empresa a PODER VER — não é uma
    # parametrização, e o ecrã mostra-a só de leitura. Estava a ser lida deste
    # endereço e nunca era devolvida: o campo aparecia sempre vazio, mesmo com
    # certificação atribuída.
    return {
        **svc.cfg_log(db, empresa.id),
        **svc_certificacao.descrever(db, empresa),
    }


@router.put("/config", dependencies=[GERIR])
def gravar_config(request: Request, dados: dict, empresa: EmpresaAtual, db: DB) -> dict:
    """As parametrizações de logística da empresa.

    A certificação NÃO se altera por aqui, mesmo que venha no pedido: o serviço
    deixa-a cair. Ver `SO_A_PLATAFORMA_ESCREVE`.
    """
    r = svc.guardar_cfg_log(db, empresa.id, dados)
    db.commit()
    return {**r, **svc_certificacao.descrever(db, empresa)}
