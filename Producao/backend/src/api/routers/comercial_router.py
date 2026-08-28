"""Comercial: clientes, vendedores, vendas e facturação.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select

from src.api.mestres import aplicar, obter_da_empresa, recusar_se_usado
from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.db.models.comercial import TIPOS_DOC, Venda, VendaLinha, Vendedor
from src.db.models.terceiros import PROVINCIAS, Terceiro
from src.services.contabilidade import ErroContabilistico
from src.services import certificacao as svc_certificacao
from src.services import comercial as svc
from src.services import comercial_anulacao as svc_anulacao

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
    #: Desconto DESTA linha. Por linha e não por documento: numa mesma factura
    #: desconta-se um artigo e mantém-se o preço do outro.
    desconto_perc: Decimal = Decimal("0")


class VendaEntrada(BaseModel):
    data: Date
    tipo_doc: str = "FT"
    tipo: str = "mercadorias"
    cliente_id: UUID | None = None
    cliente_nome: str | None = None
    vendedor_id: UUID | None = None
    iva_perc: Decimal = Decimal("0")
    #: RETENÇÃO NA FONTE: a taxa, e sobre que valor incide.
    #:
    #: A base não é sempre o subtotal — numa factura real do cliente, 230 000
    #: de ilíquido tinham 9 750 retidos, que são 6,5% de 150 000. Em branco,
    #: incide sobre o subtotal.
    retencao_perc: Decimal = Decimal("0")
    retencao_base: Decimal | None = None
    conta_recebimento: str | None = None
    doc_origem_num: str | None = None
    #: Onde a mercadoria foi carregada e para onde vai — art. 10.º g) do
    #: DP 71/25. Eram a mesma coisa num campo só, e não são.
    local_operacao: str | None = None
    local_destino: str | None = None
    #: Até quando o cliente tem para pagar, e como. Vazio no vencimento quer
    #: dizer pronto pagamento.
    vencimento: Date | None = None
    forma_pagamento: str | None = None
    #: O que quem emite quer dizer a quem recebe. Sem consequência fiscal — o
    #: motivo de isenção e o de anulação têm campos próprios.
    observacoes: str | None = None
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
    #: `nacional`, `estrangeiro` ou `outros` — decide a conta-mãe da conta
    #: corrente. Em branco, decide-se pelo país, como antes.
    categoria_conta: str | None = None
    observacoes: str | None = None

    @field_validator("categoria_conta")
    @classmethod
    def _categoria_conhecida(cls, v: str | None) -> str | None:
        """Recusa uma categoria que não exista, em vez de a ignorar.

        Guardada tal e qual, uma categoria inventada não dava erro nenhum: caía
        no ramo por omissão e a ficha ia parar à conta dos nacionais, sem
        ninguém perceber porquê. Um erro à entrada é mais barato do que uma
        conta corrente na conta errada descoberta no balancete.
        """
        if v is None or not v.strip():
            return None
        limpo = v.strip().lower()
        if limpo not in svc.CATEGORIAS_TERCEIRO:
            raise ValueError(
                "Categoria de conta desconhecida. Escolha nacional, "
                "estrangeiro ou outros."
            )
        return limpo


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
        "categoria_conta": c.categoria_conta,
    }


def _categoria_valida(valor: str | None) -> str | None:
    """Só as três categorias conhecidas entram na ficha.

    Uma categoria inventada não daria erro — daria uma ficha que cai no ramo
    do `else` e vai parar à conta dos nacionais sem ninguém saber porquê.
    Guardar `None` é honesto: significa «decide-se pelo país», que é o
    comportamento de sempre.
    """
    v = (valor or "").strip().lower()
    return v if v in svc.CATEGORIAS_TERCEIRO else None


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


# ---------------------------------------------------------------------------
# Tabelas de pesquisa (F4)
#
# Um campo que representa uma ENTIDADE tem uma tabela por trás, e procura-se lá
# com F4 — como no plano de contas, que é o padrão do Piloto e o que já se fazia
# aqui para as contas. O que estas rotas devolvem é a forma que o campo de
# pesquisa entende: código, nome e uma linha de contexto.
#
# A PROCURA É DO SERVIDOR. Devolver tudo e filtrar no ecrã funciona com trinta
# clientes e deixa de funcionar com três mil — e é com três mil que faz falta.
# ---------------------------------------------------------------------------
@router.get("/clientes/tabela")
def tabela_de_clientes(
    empresa: EmpresaAtual, db: DB, procura: str = "", limite: int = 50
) -> list[dict]:
    q = select(Terceiro).where(
        Terceiro.empresa_id == empresa.id, Terceiro.tipo == "cliente"
    )
    if procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(
            or_(
                Terceiro.nome.ilike(termo),
                Terceiro.nif.ilike(termo),
                Terceiro.numero.ilike(termo),
            )
        )
    return [
        {
            "id": str(c.id),
            "codigo": c.numero or "",
            "nome": c.nome,
            # O NIF e o país, que é o que distingue dois clientes com nomes
            # parecidos — e o país diz logo se é nacional ou estrangeiro.
            "detalhe": " · ".join(x for x in (c.nif, c.pais) if x),
        }
        for c in db.scalars(q.order_by(Terceiro.numero).limit(limite)).all()
    ]


@router.get("/vendedores/tabela")
def tabela_de_vendedores(
    empresa: EmpresaAtual, db: DB, procura: str = "", limite: int = 50
) -> list[dict]:
    q = select(Vendedor).where(
        Vendedor.empresa_id == empresa.id, Vendedor.estado == "activo"
    )
    if procura.strip():
        q = q.where(Vendedor.nome.ilike(f"%{procura.strip()}%"))
    return [
        {
            "id": str(v.id),
            "codigo": (v.nome or "")[:3].upper(),
            "nome": v.nome,
            "detalhe": f"comissão {v.comissao_perc}%",
        }
        for v in db.scalars(q.order_by(Vendedor.nome).limit(limite)).all()
    ]


class ClienteRapido(BaseModel):
    """O mínimo para criar um cliente sem sair da facturação.

    A FICHA COMPLETA CONTINUA A EXISTIR e é onde se preenche o resto. Isto é
    para o caso concreto de se descobrir a meio de uma factura que o cliente
    não está registado: mandar a pessoa a outro ecrã fá-la perder o documento
    que estava a preencher.
    """

    nome: str = Field(min_length=1, max_length=200)
    nif: str | None = Field(default=None, max_length=20)
    telefone: str | None = Field(default=None, max_length=40)
    #: O país da ficha. Continua a decidir entre nacional e estrangeiro quando
    #: não se escolhe categoria — é o comportamento de sempre.
    pais: str = Field(default="Angola", max_length=60)
    #: A CATEGORIA DA CONTA: `nacional`, `estrangeiro` ou `outros`.
    #:
    #: O plano PGC-AR tem as três — `31121 Nacionais`, `31122 Estrangeiros` e
    #: `3791 Outros Devedores` —, e usar sempre a primeira dava um balancete a
    #: dizer que a empresa não tem clientes estrangeiros nem outros devedores.
    #:
    #: «Outros devedores» não é um país: é uma conta a receber que não vem de
    #: uma venda. Por isso é uma escolha e não uma dedução.
    categoria_conta: str | None = Field(default=None, max_length=20)


@router.post(
    "/clientes/rapido", status_code=status.HTTP_201_CREATED, dependencies=[GERIR]
)
def criar_cliente_rapido(
    dados: ClienteRapido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Cria o cliente E a sua conta corrente, sem sair da facturação.

    O NÚMERO É SEQUENCIAL, como na ficha completa e como no Piloto: 001, 002…
    por empresa. A CONTA também: a próxima subconta da conta-mãe que a
    nacionalidade determinar — `31121001`, `31121002`… nos nacionais,
    `31122001`… nos estrangeiros.

    Criar a conta AQUI e não só na primeira factura é deliberado. O Piloto
    criava-a no acto da facturação, e o resultado era um cliente que existia no
    comercial e não existia na contabilidade até alguém lhe facturar alguma
    coisa — quem fosse ver o plano de contas não o encontrava. Um cliente é uma
    entidade contabilística desde que nasce.
    """
    nome = dados.nome.strip()
    if db.scalar(
        select(Terceiro.id).where(
            Terceiro.empresa_id == empresa.id,
            Terceiro.tipo == "cliente",
            func.lower(Terceiro.nome) == nome.lower(),
        )
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Já existe um cliente com o nome «{nome}». Procure-o na lista em "
            "vez de criar outro — dois clientes com o mesmo nome acabam com os "
            "movimentos repartidos entre os dois.",
        )

    c = Terceiro(
        empresa_id=empresa.id,
        tipo="cliente",
        tipo_terceiro="Cliente",
        numero=_proximo_numero_terceiro(db, empresa.id, "cliente"),
        nome=nome,
        nif=(dados.nif or "").strip() or None,
        telefone=(dados.telefone or "").strip() or None,
        pais=dados.pais.strip() or "Angola",
        categoria_conta=_categoria_valida(dados.categoria_conta),
        estado="activo",
    )
    db.add(c)
    db.flush()

    # A CONTA CORRENTE, já. `conta_corrente_cliente` escolhe a conta-mãe pela
    # nacionalidade e cria a próxima subconta, gravando-a na ficha.
    conta = svc.conta_corrente_cliente(db, empresa.id, c, svc.cfg_com(db, empresa.id))
    db.commit()
    db.refresh(c)

    return {
        "id": c.id,
        "numero": c.numero,
        "nome": c.nome,
        "nif": c.nif,
        "pais": c.pais,
        "conta": conta,
        "nacional": svc.eh_nacional(c),
        "categoria_conta": svc.categoria_do_terceiro(c),
    }


@router.get("/vendas/{venda_id}/recibo")
def extracto_do_recibo(venda_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    """O que este recibo regulariza, factura a factura.

    Os três blocos do documento: a factura (fixa), este recibo (o movimento de
    agora) e a situação depois — com o que falta separado entre dinheiro por
    receber e retenção por amortizar, que são dívidas de naturezas diferentes.
    """
    v = _venda(db, empresa.id, venda_id)
    if v.tipo_doc != "RC":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Este documento não é um recibo — o extracto de regularização só "
            "existe para recibos.",
        )
    return svc.extracto_do_recibo(db, empresa.id, v)


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
        "desconto": v.desconto,
        "local_operacao": v.local_operacao,
        "local_destino": v.local_destino,
        "vencimento": v.vencimento,
        "forma_pagamento": v.forma_pagamento,
        "observacoes": v.observacoes,
        # A RETENÇÃO VAI PARA O DOCUMENTO: sem ela, a proforma não mostra o
        # «Total Com Retenção» — que é o que o cliente vai mesmo transferir, e
        # a diferença entre esse número e o total é a razão de ele existir.
        "retencao_perc": v.retencao_perc,
        "retencao_base": v.retencao_base,
        "retencao": v.retencao,
        "liquido": svc.liquido_a_receber(v.total, v.retencao),
    }


@router.get("/vendas")
def listar_vendas(
    empresa: EmpresaAtual,
    db: DB,
    estado: str | None = None,
    tipo_doc: str | None = None,
    cliente_id: UUID | None = None,
    procura: str | None = None,
    de: Date | None = None,
    ate: Date | None = None,
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
    # POR DATA DO DOCUMENTO, e nao pela de criacao: quem procura «as facturas
    # de Marco» quer as que tem data de Marco, mesmo que tenham sido lancadas
    # em Abril. Os limites sao INCLUSIVOS — quem escreve 01/03 a 31/03 conta
    # com o dia 31.
    if de is not None:
        q = q.where(Venda.data >= de)
    if ate is not None:
        q = q.where(Venda.data <= ate)
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
        "desconto": v.desconto,
        "local_operacao": v.local_operacao,
        "local_destino": v.local_destino,
        "vencimento": v.vencimento,
        "forma_pagamento": v.forma_pagamento,
        "observacoes": v.observacoes,
        "cliente_pais": v.cliente_pais,
        # A RETENÇÃO VAI PARA O DOCUMENTO: sem ela, a factura não mostra o
        # «Total Com Retenção» — que é o que o cliente vai mesmo transferir, e
        # a diferença entre esse número e o total é a razão de ele existir.
        "retencao_perc": v.retencao_perc,
        "retencao_base": v.retencao_base,
        "retencao": v.retencao,
        "liquido": svc.liquido_a_receber(v.total, v.retencao),
        "linhas": [
            {"ordem": l.ordem, "artigo_id": l.artigo_id, "descricao": l.descricao,
             "unidade": l.unidade, "qtd": l.qtd, "preco": l.preco, "total": l.total,
             "desconto_perc": l.desconto_perc,
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
    # A RETENÇÃO INCIDE SOBRE O QUE FOI FACTURADO, e não sobre o ilíquido:
    # reter sobre valor que foi descontado seria entregar ao Estado imposto
    # sobre dinheiro que ninguém cobrou. Uma base indicada à mão continua a
    # mandar sobre esta.
    ret = svc.calc_retencao(
        t["subtotal"] - t["desconto"], dados.retencao_perc, dados.retencao_base
    )

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
        local_operacao=dados.local_operacao, local_destino=dados.local_destino,
        vencimento=dados.vencimento, forma_pagamento=dados.forma_pagamento,
        observacoes=dados.observacoes,
        subtotal=t["subtotal"], desconto=t["desconto"], iva=t["iva"],
        total=t["total"], estado="rascunho",
        retencao_perc=ret["perc"], retencao_base=ret["base"] or None,
        retencao=ret["retencao"],
        linhas=[
            VendaLinha(
                ordem=i, artigo_id=l["artigo_id"], descricao=l["descricao"],
                unidade=l["unidade"], qtd=l["qtd"], preco=l["preco"],
                desconto_perc=l.get("desconto_perc") or Decimal("0"),
                # O total da linha é o LÍQUIDO, e vem da mesma função que fez
                # os totais do documento — somar aqui por outra via era o
                # caminho para as duas contas divergirem num cêntimo.
                total=svc.liquido_da_linha(
                    l["qtd"], l["preco"], l.get("desconto_perc")
                )["liquido"],
            )
            for i, l in enumerate(linhas)
            if l["descricao"] or (l["qtd"] and l["preco"])
        ],
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "estado": v.estado, "subtotal": v.subtotal, "iva": v.iva,
            "total": v.total, "retencao": v.retencao,
            "liquido": svc.liquido_a_receber(v.total, v.retencao)}


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
    """Elimina um RASCUNHO. Um documento emitido anula-se — ver `anular_venda`.

    Um documento emitido não se apaga, e não é uma limitação nossa: o número
    vem de uma série e a lei exige numeração sequencial sem falhas, e cada
    documento leva o resumo do anterior — apagar um pelo meio parte a cadeia
    que existe precisamente para tornar isso detectável.
    """
    v = _venda(db, empresa.id, venda_id)
    if v.estado == "emitida":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Um documento emitido não se elimina, porque o número dele já está "
            "na sequência entregue à AGT. Anule-o: o número mantém-se e o "
            "documento passa a valer zero.",
        )
    if v.estado == "anulada":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Este documento está anulado e tem de continuar a existir — é o "
            "que prova que o número não foi usado para outra coisa.",
        )
    db.delete(v)
    db.commit()


class AnularPedido(BaseModel):
    #: Fica na venda e na auditoria. Um documento anulado sem motivo, meses
    #: depois, não explica a ninguém porque é que aquele número vale zero.
    motivo: str | None = Field(default=None, max_length=200)


@router.post("/vendas/{venda_id}/anular", dependencies=[GERIR])
def anular_venda(
    request: Request, venda_id: UUID, dados: AnularPedido,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    """Anula um documento emitido, mantendo-lhe o número.

    NO MESMO PERÍODO, anula-se e pronto — sem nota de crédito. Em período
    diferente, não: o IVA desse período pode já ter sido apurado e entregue, e
    aí o caminho é a nota de crédito. A regra e a mensagem estão em
    `services/comercial_anulacao.py`.

    O lançamento que a emissão criou é revertido com um lançamento de sentido
    contrário — não é apagado. Apagar deixava o balancete certo e o histórico a
    mentir.
    """
    v = _venda(db, empresa.id, venda_id)
    try:
        r = svc_anulacao.anular(
            db, empresa_id=empresa.id, venda=v, motivo=dados.motivo
        )
    except ErroContabilistico as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

    db.commit()
    return r


@router.get("/vendas/{venda_id}/pode-anular", dependencies=[GERIR])
def pode_anular(venda_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    """Pode ser anulado directamente, ou precisa de nota de crédito?

    Existe para o ecrã poder dizer o que vai acontecer ANTES de se carregar no
    botão, em vez de mostrar um erro depois de a pessoa decidir.
    """
    v = _venda(db, empresa.id, venda_id)
    if v.estado != "emitida":
        return {
            "pode": False,
            "motivo": "Só documentos emitidos se anulam.",
            "exige_nota_credito": False,
        }
    pode, motivo = svc_anulacao.pode_anular_sem_nota_de_credito(
        db, empresa_id=empresa.id, venda=v
    )
    return {"pode": pode, "motivo": motivo, "exige_nota_credito": not pode}


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
    # O número de certificação vai junto para a empresa o PODER VER, mas não é
    # uma parametrização: quem o define é a plataforma. Vem marcado como só de
    # leitura para o ecrã não ter de adivinhar.
    return {**svc.cfg_com(db, empresa.id), **svc_certificacao.descrever(db, empresa)}


@router.put("/config", dependencies=[GERIR])
def gravar_config(request: Request, dados: dict, empresa: EmpresaAtual, db: DB) -> dict:
    """As parametrizações comerciais da empresa.

    O número de certificação NÃO se altera por aqui, mesmo que venha no pedido:
    o serviço deixa-o cair. Ver `SO_A_PLATAFORMA_ESCREVE`.
    """
    r = svc.guardar_cfg_com(db, empresa.id, dados)
    db.commit()
    return {**r, **svc_certificacao.descrever(db, empresa)}
