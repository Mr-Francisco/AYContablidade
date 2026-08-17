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
    """A ficha de terceiro do Piloto, inteira.

    O modelo já tinha todos estes campos; era esta porta que só deixava passar
    dez deles. A ficha do Piloto tem sete separadores — moradas, dados fiscais,
    bancos, dados comerciais, crédito, contabilidade e observações — e o que
    ficasse de fora daqui não havia forma de gravar: o utilizador preenchia e o
    campo desaparecia sem aviso, que é a pior maneira de perder trabalho.
    """

    nome: str = Field(min_length=1, max_length=200)
    numero: str | None = None

    # ---- Moradas ----
    morada: str | None = None
    morada2: str | None = None
    localidade: str | None = None
    codigo_postal: str | None = None
    provincia: str | None = None
    pais: str = "Angola"
    telefone: str | None = None
    telefone2: str | None = None
    fax: str | None = None
    email: str | None = None
    web: str | None = None
    tipo_terceiro: str | None = None

    # ---- Dados fiscais ----
    nif: str | None = None
    regime_iva: str | None = None
    isento_iva: bool = False
    retencao_fonte: bool = False
    reparticao_fiscal: str | None = None

    # ---- Bancos ----
    banco: str | None = None
    iban: str | None = None
    swift: str | None = None

    # ---- Dados comerciais ----
    condicoes_pagamento: str | None = None
    desconto_comercial: Decimal = Decimal("0")
    moeda: str = "AKZ"
    responsavel: str | None = None

    # ---- Crédito ----
    limite_credito: Decimal = Decimal("0")
    dias_credito: int = 30
    estado: str = "activo"

    # ---- Contabilidade e notas ----
    conta: str | None = None
    observacoes: str | None = None


def _terceiro_publico(c: Terceiro) -> dict:
    """A ficha toda.

    Devolvia-se um punhado de campos, e abrir um cliente para alterar trazia o
    formulário meio vazio — gravar por cima apagava o resto. Devolver tudo o
    que se pode gravar é a única forma de a ficha ser reversível.
    """
    return {
        "id": c.id, "numero": c.numero, "nome": c.nome, "estado": c.estado,
        "morada": c.morada, "morada2": c.morada2, "localidade": c.localidade,
        "codigo_postal": c.codigo_postal, "provincia": c.provincia,
        "pais": c.pais, "telefone": c.telefone, "telefone2": c.telefone2,
        "fax": c.fax, "email": c.email, "web": c.web,
        "tipo_terceiro": c.tipo_terceiro,
        "nif": c.nif, "regime_iva": c.regime_iva, "isento_iva": c.isento_iva,
        "retencao_fonte": c.retencao_fonte,
        "reparticao_fiscal": c.reparticao_fiscal,
        "banco": c.banco, "iban": c.iban, "swift": c.swift,
        "condicoes_pagamento": c.condicoes_pagamento,
        "desconto_comercial": c.desconto_comercial, "moeda": c.moeda,
        "responsavel": c.responsavel,
        "limite_credito": c.limite_credito, "dias_credito": c.dias_credito,
        "conta": c.conta, "observacoes": c.observacoes,
    }


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
    return [_terceiro_publico(c) for c in db.scalars(q.order_by(Terceiro.numero)).all()]


@router.post("/clientes", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_cliente(
    request: Request, dados: TerceiroEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    # `tipo_terceiro` é escolhido na ficha («Cliente», «Cliente e Fornecedor»,
    # …) e por isso sai do `model_dump` — passá-lo aqui e lá dava argumento
    # repetido. Sem escolha, fica «Cliente», que é o que esta rota cria.
    c = Terceiro(
        empresa_id=empresa.id, tipo="cliente",
        tipo_terceiro=dados.tipo_terceiro or "Cliente",
        numero=dados.numero or _proximo_numero_terceiro(db, empresa.id, "cliente"),
        **dados.model_dump(exclude={"numero", "tipo_terceiro"}),
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
    """A ficha inteira, opcional campo a campo.

    O NÚMERO não se altera: é o que identifica o cliente nos documentos já
    emitidos e o que forma a conta corrente.

    Tudo o resto entra. Aceitar só dez dos trinta campos fazia com que alterar
    a ficha perdesse silenciosamente o que não coubesse — e o que se perde numa
    ficha de cliente é o IBAN, a repartição fiscal ou o desconto acordado.
    """

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    morada: str | None = None
    morada2: str | None = None
    localidade: str | None = None
    codigo_postal: str | None = None
    provincia: str | None = None
    pais: str | None = None
    telefone: str | None = None
    telefone2: str | None = None
    fax: str | None = None
    email: str | None = None
    web: str | None = None
    tipo_terceiro: str | None = None

    nif: str | None = None
    regime_iva: str | None = None
    isento_iva: bool | None = None
    retencao_fonte: bool | None = None
    reparticao_fiscal: str | None = None

    banco: str | None = None
    iban: str | None = None
    swift: str | None = None

    condicoes_pagamento: str | None = None
    desconto_comercial: Decimal | None = None
    moeda: str | None = None
    responsavel: str | None = None

    limite_credito: Decimal | None = None
    dias_credito: int | None = None
    estado: str | None = None

    conta: str | None = None
    observacoes: str | None = None


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
        # ---- Facturação legal ----
        # O `hash_controlo` é o que se IMPRIME no documento. O
        # `codigo_validacao` fica porque os documentos antigos só têm esse, mas
        # o que vale é este: vem da cadeia de resumos e não de um cálculo
        # inventado sobre o número e o total.
        "hash_controlo": v.hash_controlo,
        "iva_perc": v.iva_perc,
        "emitido_em": v.emitido_em,
        "entrada_sistema": v.entrada_sistema,
        "estado_saft": v.estado_saft,
        "estado_agt": v.estado_agt,
        "doc_origem_num": v.doc_origem_num,
        "local_operacao": v.local_operacao,
    }


@router.get("/vendas")
def listar_vendas(
    empresa: EmpresaAtual,
    db: DB,
    estado: str | None = None,
    tipo_doc: str | None = None,
    cliente_id: UUID | None = None,
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
    if cliente_id is not None:
        q = q.where(Venda.cliente_id == cliente_id)
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
        # O documento legal precisa disto para se imprimir como a lei manda.
        "hash_controlo": v.hash_controlo,
        "entrada_sistema": v.entrada_sistema,
        "estado_saft": v.estado_saft,
        "estado_agt": v.estado_agt,
        "doc_origem_num": v.doc_origem_num,
        "local_operacao": v.local_operacao,
        "cliente_pais": v.cliente_pais,
        "linhas": [
            {"ordem": l.ordem, "artigo_id": l.artigo_id, "descricao": l.descricao,
             "unidade": l.unidade, "qtd": l.qtd, "preco": l.preco, "total": l.total,
             "taxa_codigo": l.taxa_codigo, "taxa_perc": l.taxa_perc,
             "motivo_isencao": l.motivo_isencao}
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
