"""Comercial: clientes, vendedores, vendas e facturação.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from src.api.mestres import aplicar, obter_da_empresa, recusar_se_usado
from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.db.models.comercial import TIPOS_DOC, Venda, VendaLinha, Vendedor
from src.db.models.terceiros import PROVINCIAS, Terceiro
from src.services import comercial as svc

router = APIRouter(
    prefix="/api/comercial",
    tags=["comercial"],
    dependencies=[Depends(exigir_cap("comercial.ver"))],
)

GERIR = Depends(exigir_cap("comercial.gerir"))


class LinhaEntrada(BaseModel):
    artigo_id: UUID | None = None
    descricao: str | None = None
    unidade: str | None = None
    qtd: Decimal = Decimal("0")
    preco: Decimal = Decimal("0")


class VendaEntrada(BaseModel):
    data: Date
    tipo_doc: str = "FT"
    tipo: str = "mercadorias"
    cliente_id: UUID | None = None
    cliente_nome: str | None = None
    vendedor_id: UUID | None = None
    iva_perc: Decimal = Decimal("0")
    conta_recebimento: str | None = None
    doc_origem_num: str | None = None
    linhas: list[LinhaEntrada] = Field(default_factory=list)


class EmitirPedido(BaseModel):
    conta: str | None = None
    exercicio_id: UUID | None = None


class VendedorEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    tipo_comissao: str = "percentagem"
    comissao_perc: Decimal = Decimal("0")
    estado: str = "activo"


class TerceiroEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    numero: str | None = None
    nif: str | None = None
    morada: str | None = None
    localidade: str | None = None
    provincia: str | None = None
    pais: str = "Angola"
    telefone: str | None = None
    email: str | None = None
    conta: str | None = None
    regime_iva: str | None = None
    condicoes_pagamento: str | None = None
    limite_credito: Decimal = Decimal("0")
    dias_credito: int = 30
    estado: str = "activo"
    observacoes: str | None = None


def _proximo_numero_terceiro(db: DB, empresa_id: UUID, tipo: str) -> str:
    numeros = db.scalars(
        select(Terceiro.numero).where(
            Terceiro.empresa_id == empresa_id, Terceiro.tipo == tipo
        )
    ).all()
    return f"{max((int(n) for n in numeros if n and n.isdigit()), default=0) + 1:03d}"


def _venda(db: DB, empresa_id: UUID, venda_id: UUID) -> Venda:
    v = db.scalar(
        select(Venda).where(Venda.id == venda_id, Venda.empresa_id == empresa_id)
    )
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado.")
    return v


# ---------------------------------------------------------------------------
# Tabelas
# ---------------------------------------------------------------------------
@router.get("/tipos-documento")
def tipos_documento() -> list[dict]:
    """Tipos do Regime Jurídico das Facturas (Decreto Presidencial 71/25)."""
    return [dict(t) for t in TIPOS_DOC]


@router.get("/provincias")
def provincias() -> list[str]:
    return list(PROVINCIAS)


@router.get("/clientes")
def listar_clientes(empresa: EmpresaAtual, db: DB, procura: str | None = None) -> list[dict]:
    q = select(Terceiro).where(
        Terceiro.empresa_id == empresa.id, Terceiro.tipo == "cliente"
    )
    if procura:
        termo = f"%{procura}%"
        q = q.where(Terceiro.nome.ilike(termo) | Terceiro.nif.ilike(termo))
    return [
        {"id": c.id, "numero": c.numero, "nome": c.nome, "nif": c.nif,
         "localidade": c.localidade, "telefone": c.telefone, "conta": c.conta,
         "estado": c.estado,
         # Acrescentados para o formulário de alteração poder vir preenchido.
         # Aditivo: quem já consumia a rota não nota diferença.
         "morada": c.morada, "provincia": c.provincia, "email": c.email}
        for c in db.scalars(q.order_by(Terceiro.numero)).all()
    ]


@router.post("/clientes", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_cliente(
    request: Request, dados: TerceiroEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    c = Terceiro(
        empresa_id=empresa.id, tipo="cliente", tipo_terceiro="Cliente",
        numero=dados.numero or _proximo_numero_terceiro(db, empresa.id, "cliente"),
        **dados.model_dump(exclude={"numero"}),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "numero": c.numero, "nome": c.nome}


@router.get("/vendedores")
def listar_vendedores(empresa: EmpresaAtual, db: DB) -> list[dict]:
    return [
        {"id": v.id, "nome": v.nome, "tipo_comissao": v.tipo_comissao,
         "comissao_perc": v.comissao_perc, "estado": v.estado}
        for v in db.scalars(
            select(Vendedor).where(Vendedor.empresa_id == empresa.id).order_by(Vendedor.nome)
        ).all()
    ]


@router.post("/vendedores", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_vendedor(
    request: Request, dados: VendedorEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    v = Vendedor(empresa_id=empresa.id, **dados.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "nome": v.nome}


class TerceiroAtualizar(BaseModel):
    """O NÚMERO não se altera: é o que identifica o cliente nos documentos já
    emitidos e o que forma a conta corrente."""

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    nif: str | None = None
    morada: str | None = None
    localidade: str | None = None
    provincia: str | None = None
    pais: str | None = None
    telefone: str | None = None
    email: str | None = None
    conta: str | None = None
    estado: str | None = None


class VendedorAtualizar(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    tipo_comissao: str | None = None
    comissao_perc: Decimal | None = None
    estado: str | None = None


@router.patch("/clientes/{cliente_id}", dependencies=[GERIR])
def actualizar_cliente(
    request: Request, cliente_id: UUID, dados: TerceiroAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    c = obter_da_empresa(db, Terceiro, cliente_id, empresa.id, nome="Cliente")
    if c.tipo != "cliente":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente não encontrado.")
    aplicar(c, dados)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "numero": c.numero, "nome": c.nome, "estado": c.estado}


@router.delete("/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_cliente(cliente_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um cliente com documentos não se apaga.

    A factura guarda o id do cliente e a conta corrente é construída a partir
    dele. Apagar a ficha deixava documentos emitidos sem titular.
    """
    c = obter_da_empresa(db, Terceiro, cliente_id, empresa.id, nome="Cliente")
    if c.tipo != "cliente":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente não encontrado.")
    recusar_se_usado(
        db,
        [(select(Venda.id).where(Venda.cliente_id == c.id), "documentos de venda")],
        o_que=f"O cliente {c.numero}",
    )
    db.delete(c)
    db.commit()


@router.patch("/vendedores/{vendedor_id}", dependencies=[GERIR])
def actualizar_vendedor(
    request: Request, vendedor_id: UUID, dados: VendedorAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    v = obter_da_empresa(db, Vendedor, vendedor_id, empresa.id, nome="Vendedor")
    aplicar(v, dados)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "nome": v.nome, "estado": v.estado}


@router.delete("/vendedores/{vendedor_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_vendedor(vendedor_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um vendedor com vendas não se apaga — as comissões já calculadas
    deixariam de ter a quem ser atribuídas."""
    v = obter_da_empresa(db, Vendedor, vendedor_id, empresa.id, nome="Vendedor")
    recusar_se_usado(
        db,
        [(select(Venda.id).where(Venda.vendedor_id == v.id), "vendas associadas")],
        o_que=f"O vendedor {v.nome}",
    )
    db.delete(v)
    db.commit()


# ---------------------------------------------------------------------------
# Vendas
# ---------------------------------------------------------------------------
def _venda_publica(v: Venda) -> dict:
    return {
        "id": v.id, "numero": v.numero, "tipo_doc": v.tipo_doc, "tipo": v.tipo,
        "data": v.data, "cliente_id": v.cliente_id, "cliente_nome": v.cliente_nome,
        "subtotal": v.subtotal, "iva": v.iva, "total": v.total, "estado": v.estado,
        "numero_op": v.numero_op, "codigo_validacao": v.codigo_validacao,
    }


@router.get("/vendas")
def listar_vendas(
    empresa: EmpresaAtual,
    db: DB,
    estado: str | None = None,
    tipo_doc: str | None = None,
    procura: str | None = None,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
) -> dict:
    """Vendas, uma página de cada vez.

    Devolve `{linhas, total, offset, limite, totais}` e não uma lista: sem o
    `total`, o ecrã tinha de dizer quantos documentos há contando os que
    recebeu — e recebia os primeiros mil.

    Os `totais` são do CONJUNTO FILTRADO e não da página. Sem eles, os
    indicadores no topo («Documentos», «Total facturado», «Total IVA»,
    «Clientes») passariam a somar vinte e cinco linhas em vez de todas: um
    número errado com ar de certo, que é o pior tipo de número.

    `procura` cobre número, cliente, código de validação e nº de operação —
    os quatro campos por onde se procura uma factura já emitida.
    """
    q = select(Venda).where(Venda.empresa_id == empresa.id)
    if estado:
        q = q.where(Venda.estado == estado)
    if tipo_doc:
        q = q.where(Venda.tipo_doc == tipo_doc)
    if procura and procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(
            or_(
                Venda.numero.ilike(termo),
                Venda.cliente_nome.ilike(termo),
                Venda.codigo_validacao.ilike(termo),
                Venda.numero_op.ilike(termo),
            )
        )

    ordenada = q.order_by(Venda.data.desc(), Venda.criado_em.desc())
    p = pagina(
        db, ordenada, offset=offset, limite=limite, formatar=_venda_publica
    )

    agregados = q.with_only_columns(
        func.coalesce(func.sum(Venda.total), 0),
        func.coalesce(func.sum(Venda.iva), 0),
        func.count(func.distinct(Venda.cliente_id)),
    ).order_by(None)
    total_valor, total_iva, clientes = db.execute(agregados).one()
    return {
        **p,
        "totais": {
            "total": total_valor,
            "iva": total_iva,
            "clientes": clientes,
        },
    }


@router.get("/vendas/{venda_id}")
def obter_venda(venda_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    v = _venda(db, empresa.id, venda_id)
    return {
        "id": v.id, "numero": v.numero, "tipo_doc": v.tipo_doc, "tipo": v.tipo,
        "data": v.data, "cliente_id": v.cliente_id, "cliente_nome": v.cliente_nome,
        "vendedor_id": v.vendedor_id, "iva_perc": v.iva_perc, "subtotal": v.subtotal,
        "iva": v.iva, "total": v.total, "estado": v.estado, "numero_op": v.numero_op,
        "codigo_validacao": v.codigo_validacao, "emitido_em": v.emitido_em,
        "linhas": [
            {"ordem": l.ordem, "artigo_id": l.artigo_id, "descricao": l.descricao,
             "unidade": l.unidade, "qtd": l.qtd, "preco": l.preco, "total": l.total}
            for l in v.linhas
        ],
    }


@router.post("/vendas", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_venda(
    request: Request, dados: VendaEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    """Cria o documento em rascunho. O número só é atribuído na emissão."""
    td = svc.tipo_doc(dados.tipo_doc)
    iva_perc = dados.iva_perc if td.get("iva") else Decimal("0")
    linhas = [l.model_dump() for l in dados.linhas]
    t = svc.calc_totais(linhas, iva_perc)

    cliente_nome = dados.cliente_nome
    if dados.cliente_id:
        cl = db.get(Terceiro, dados.cliente_id)
        if cl is None or cl.empresa_id != empresa.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente não encontrado.")
        cliente_nome = cl.nome

    v = Venda(
        empresa_id=empresa.id, data=dados.data, tipo_doc=dados.tipo_doc,
        tipo=dados.tipo, cliente_id=dados.cliente_id, cliente_nome=cliente_nome,
        vendedor_id=dados.vendedor_id, iva_perc=iva_perc,
        conta_recebimento=dados.conta_recebimento, doc_origem_num=dados.doc_origem_num,
        subtotal=t["subtotal"], iva=t["iva"], total=t["total"], estado="rascunho",
        linhas=[
            VendaLinha(
                ordem=i, artigo_id=l["artigo_id"], descricao=l["descricao"],
                unidade=l["unidade"], qtd=l["qtd"], preco=l["preco"],
                total=Decimal(str(l["qtd"])) * Decimal(str(l["preco"])),
            )
            for i, l in enumerate(linhas)
            if l["descricao"] or (l["qtd"] and l["preco"])
        ],
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "estado": v.estado, "subtotal": v.subtotal, "iva": v.iva,
            "total": v.total}


@router.post("/vendas/{venda_id}/emitir", dependencies=[GERIR])
def emitir_venda(
    request: Request, venda_id: UUID, dados: EmitirPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Emite o documento: atribui número, lança na contabilidade e, tratando-se
    de venda de mercadorias, baixa o stock e lança o CMVMC.

    `avisos_stock` traz problemas na baixa de stock que NÃO impediram a emissão
    — a factura já está numerada e não pode ser desfeita.
    """
    v = _venda(db, empresa.id, venda_id)
    r = svc.emitir(
        db, empresa_id=empresa.id, venda=v, conta=dados.conta,
        exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


@router.delete("/vendas/{venda_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_venda(
    request: Request, venda_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    v = _venda(db, empresa.id, venda_id)
    if v.estado == "emitida":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Um documento emitido não pode ser eliminado — emita uma nota de crédito.",
        )
    db.delete(v)
    db.commit()


# ---------------------------------------------------------------------------
# Análise
# ---------------------------------------------------------------------------
@router.get("/comissoes")
def comissoes(empresa: EmpresaAtual, db: DB, so_faturadas: bool = True) -> list[dict]:
    return svc.comissoes(db, empresa_id=empresa.id, so_faturadas=so_faturadas)


@router.get("/resumo")
def resumo(empresa: EmpresaAtual, db: DB) -> dict:
    return svc.resumo(db, empresa_id=empresa.id)


@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    return svc.cfg_com(db, empresa.id)


@router.put("/config", dependencies=[GERIR])
def gravar_config(request: Request, dados: dict, empresa: EmpresaAtual, db: DB) -> dict:
    r = svc.guardar_cfg_com(db, empresa.id, dados)
    db.commit()
    return r
