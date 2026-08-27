"""Comercial — vendedores, vendas e facturação.

Transposto de `Piloto/assets/js/comercial.js`. Os tipos de documento seguem o
Regime Jurídico das Facturas e Documentos Equivalentes (Decreto Presidencial
n.º 71/25) e cada um lança na contabilidade de forma diferente.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

Money = Numeric(18, 2)

# [código, nome, como lança, exige cliente, tem IVA, exige referência, é pagamento]
# Espelha TIPOS_DOC em comercial.js. `contab` decide o lançamento em `emitir()`.
TIPOS_DOC: tuple[dict, ...] = (
    {"cod": "FT", "nome": "Factura", "contab": "venda", "exige_cliente": True, "iva": True},
    {"cod": "FR", "nome": "Factura-Recibo", "contab": "venda_pronto", "exige_cliente": True, "iva": True, "pagamento": True},
    {"cod": "FS", "nome": "Factura Simplificada", "contab": "venda_pronto", "exige_cliente": False, "iva": True, "pagamento": True},
    {"cod": "FG", "nome": "Factura Global", "contab": "venda", "exige_cliente": True, "iva": True},
    {"cod": "FA", "nome": "Factura de Adiantamento", "contab": "adiantamento", "exige_cliente": True, "iva": True, "pagamento": True},
    {"cod": "VD", "nome": "Venda a Dinheiro / Talão", "contab": "venda_pronto", "exige_cliente": False, "iva": True, "pagamento": True},
    {"cod": "ND", "nome": "Nota de Débito", "contab": "nota_debito", "exige_cliente": True, "iva": True, "ref": True},
    {"cod": "NC", "nome": "Nota de Crédito", "contab": "nota_credito", "exige_cliente": True, "iva": True, "ref": True},
    {"cod": "RC", "nome": "Recibo", "contab": "recibo", "exige_cliente": True, "iva": False, "ref": True, "pagamento": True},
    {"cod": "GR", "nome": "Guia de Remessa / Transporte", "contab": "nenhum", "exige_cliente": True, "iva": False},
    {"cod": "PP", "nome": "Factura Pró-forma", "contab": "nenhum", "exige_cliente": True, "iva": True, "fiscal": False},
)


class Vendedor(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "vendedores"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    # "percentagem" (sobre o subtotal) ou "fixo" (valor por venda).
    tipo_comissao: Mapped[str] = mapped_column(
        String(20), default="percentagem", nullable=False
    )
    comissao_perc: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<Vendedor {self.nome!r}>"


class Venda(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Documento de venda. Nasce em rascunho e passa a emitida em `emitir()`,
    que atribui o número sequencial e gera o lançamento contabilístico."""

    __tablename__ = "vendas"
    __table_args__ = (
        UniqueConstraint("empresa_id", "numero", name="venda_numero"),
        Index("ix_vendas_empresa_data", "empresa_id", "data"),
    )

    # Só é atribuído na emissão (FT 2026/0001), por isso é nulo em rascunho.
    numero: Mapped[str | None] = mapped_column(String(30))
    tipo_doc: Mapped[str] = mapped_column(String(4), default="FT", nullable=False)
    # "mercadorias" | "servicos" — escolhe a conta de proveito e o documento.
    tipo: Mapped[str] = mapped_column(String(20), default="mercadorias", nullable=False)

    data: Mapped[date] = mapped_column(Date, nullable=False)

    cliente_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("terceiros.id", ondelete="RESTRICT"), index=True
    )
    # Snapshot: consumidor final não tem ficha, e o nome tem de constar no documento.
    cliente_nome: Mapped[str | None] = mapped_column(String(200))
    vendedor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("vendedores.id", ondelete="SET NULL")
    )

    iva_perc: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    iva: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # ---- Retenção na fonte ----
    #: A taxa, em percentagem. `6.50` na prestação de serviços.
    retencao_perc: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False, server_default="0"
    )
    #: SOBRE QUE VALOR A RETENÇÃO INCIDE, e é um campo por bom motivo.
    #:
    #: Não é sempre o subtotal. Num documento real do cliente, uma factura de
    #: 230 000 tinha 9 750 de retenção — 6,5% de 150 000, não de 230 000. A
    #: retenção incide sobre a parte que lhe está sujeita, e uma factura pode
    #: misturar o que está e o que não está.
    #:
    #: A linha de venda não distingue mercadoria de serviço — só a factura o
    #: faz —, por isso a base fica explícita em vez de deduzida. Em branco, é o
    #: subtotal: o caso simples continua simples.
    retencao_base: Mapped[Decimal | None] = mapped_column(Money)
    #: O valor retido, guardado e não recalculado: a taxa pode mudar amanhã e
    #: um documento já emitido não muda.
    retencao: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False, server_default="0"
    )

    estado: Mapped[str] = mapped_column(String(20), default="rascunho", nullable=False, index=True)
    emitido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Código de validação do documento (codigoValidacao no Piloto).
    codigo_validacao: Mapped[str | None] = mapped_column(String(20))

    # ---- Facturação legal (DP 71/25 e SAF-T AO) ----
    #: A série que deu o número. Nulo nos documentos anteriores a existirem
    #: séries — que continuam válidos e mantêm o número que têm.
    serie_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("series_documento.id", ondelete="RESTRICT"), index=True
    )
    #: Posição dentro da série. Com o `serie_id`, reconstrói o `documentNo`.
    sequencia: Mapped[int | None] = mapped_column(Integer)

    #: RESUMO ENCADEADO. O hash deste documento inclui o hash do anterior da
    #: mesma série: apagar ou alterar um documento pelo meio parte a cadeia, e
    #: a quebra é detectável sem se saber o que lá estava. É o que o SAF-T
    #: chama `Hash` e o que torna o ficheiro auditável.
    hash_doc: Mapped[str | None] = mapped_column(String(200))
    #: O hash do documento anterior, guardado para se poder verificar a cadeia
    #: sem a percorrer toda de cada vez.
    hash_anterior: Mapped[str | None] = mapped_column(String(200))
    #: Quatro caracteres do hash, que é o que se imprime no documento.
    hash_controlo: Mapped[str | None] = mapped_column(String(8))

    #: Estado no SAF-T: N normal, S autofacturação, A anulado, R resumo.
    #: Um documento fiscal NÃO SE APAGA — anula-se, e continua no ficheiro.
    estado_saft: Mapped[str] = mapped_column(
        String(1), default="N", nullable=False
    )
    anulado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_anulacao: Mapped[str | None] = mapped_column(String(200))

    #: Data e hora em que o documento foi criado no sistema. É o
    #: `systemEntryDate` da AGT e do SAF-T, e NÃO é a data do documento: um
    #: documento pode ser datado de ontem e ter entrado hoje.
    entrada_sistema: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    #: Local da entrega ou da prestação — art. 10.º g) do DP 71/25.
    #: É o ponto de PARTIDA: onde a mercadoria foi carregada ou o serviço
    #: começou.
    local_operacao: Mapped[str | None] = mapped_column(String(200))
    #: E o de CHEGADA. Eram a mesma coisa num campo só, e não são: um documento
    #: que acompanha mercadoria tem de dizer de onde saiu e para onde vai.
    local_destino: Mapped[str | None] = mapped_column(String(200))

    #: Até quando o cliente tem para pagar. Vazio quer dizer pronto pagamento.
    vencimento: Mapped[date | None] = mapped_column(Date)
    #: Como se paga — «Transferência bancária», «Numerário», «Multicaixa».
    #: Texto e não código: é o que se lê no documento, e a lista de meios de
    #: pagamento de uma empresa não é a de outra.
    forma_pagamento: Mapped[str | None] = mapped_column(String(60))
    #: O que a pessoa quer dizer a quem recebe o documento. Não é a anulação
    #: nem o motivo de isenção — esses têm o seu campo e a sua consequência.
    observacoes: Mapped[str | None] = mapped_column(Text)
    #: País do adquirente (`customerCountry`), para não residentes.
    cliente_pais: Mapped[str | None] = mapped_column(String(2))

    # ---- Comunicação à AGT ----
    #: "por_comunicar" | "submetido" | "validado" | "rejeitado" | "nao_aplicavel"
    estado_agt: Mapped[str] = mapped_column(
        String(20), default="por_comunicar", nullable=False, index=True
    )
    agt_request_id: Mapped[str | None] = mapped_column(String(80))
    agt_submetido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    agt_mensagem: Mapped[str | None] = mapped_column(Text)

    conta_recebimento: Mapped[str | None] = mapped_column(String(20))
    # Documento de origem, para notas de crédito/débito e recibos.
    doc_origem_num: Mapped[str | None] = mapped_column(String(30))

    lancamento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="SET NULL")
    )
    numero_op: Mapped[str | None] = mapped_column(String(30))

    linhas: Mapped[list["VendaLinha"]] = relationship(
        back_populates="venda", cascade="all, delete-orphan", order_by="VendaLinha.ordem"
    )

    def __repr__(self) -> str:
        return f"<Venda {self.numero or '(rascunho)'} {self.total}>"


class VendaLinha(UUIDMixin, Base):
    __tablename__ = "venda_linhas"

    venda_id: Mapped[UUID] = mapped_column(
        ForeignKey("vendas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Ligação ao artigo: sem ela não há baixa de stock nem CMVMC.
    artigo_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("artigos.id", ondelete="RESTRICT")
    )
    descricao: Mapped[str | None] = mapped_column(String(300))
    unidade: Mapped[str | None] = mapped_column(String(20))
    qtd: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), default=Decimal("0"), nullable=False
    )
    preco: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # ---- Imposto, por linha ----
    #: Código da taxa (`NOR`, `INT`, `RED`, `CAB`, `ISE`, `NS`) — ver
    #: `core/impostos.py`. É o `taxCode` da AGT e do SAF-T.
    #:
    #: POR LINHA e não por documento: uma factura pode ter um serviço a 14% e
    #: um bem da cesta básica a 5%. Enquanto o IVA foi um campo do documento,
    #: isso era impossível de representar — e é comum.
    taxa_codigo: Mapped[str | None] = mapped_column(String(10))
    #: A percentagem aplicada, gravada com a linha. Guarda-se além do código
    #: porque as taxas mudam por lei: uma factura de 2025 tem de continuar a
    #: dizer a taxa de 2025, e não a de hoje.
    taxa_perc: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    #: Fundamento legal quando não se liquida imposto — art. 10.º f) do
    #: DP 71/25. Uma linha isenta sem motivo é uma factura irregular.
    motivo_isencao: Mapped[str | None] = mapped_column(String(200))

    venda: Mapped[Venda] = relationship(back_populates="linhas")

    def __repr__(self) -> str:
        return f"<VendaLinha {self.descricao!r} {self.qtd}x{self.preco}>"


class Compra(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Documento de compra (factura do fornecedor).

    Transposto de `Piloto/assets/js/compras.js`. Ao emitir, cada linha gera uma
    entrada de stock que É a contabilização da compra — não há lançamento de
    factura em separado, para não duplicar. Por isso todas as linhas têm de
    estar ligadas a um artigo.
    """

    __tablename__ = "compras"
    __table_args__ = (
        UniqueConstraint("empresa_id", "numero", name="compra_numero"),
        Index("ix_compras_empresa_data", "empresa_id", "data"),
    )

    numero: Mapped[str | None] = mapped_column(String(30))
    # O tipo de documento de uma compra É um documento contabilístico do diário
    # de compras — a mesma tabela gerida em Diários e Documentos.
    documento_codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    documento_nome: Mapped[str | None] = mapped_column(String(200))

    data: Mapped[date] = mapped_column(Date, nullable=False)

    fornecedor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("terceiros.id", ondelete="RESTRICT"), index=True
    )
    fornecedor_nome: Mapped[str | None] = mapped_column(String(200))
    armazem_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("armazens.id", ondelete="RESTRICT")
    )

    iva_perc: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    iva: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    estado: Mapped[str] = mapped_column(String(20), default="rascunho", nullable=False, index=True)
    emitido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    linhas: Mapped[list["CompraLinha"]] = relationship(
        back_populates="compra", cascade="all, delete-orphan", order_by="CompraLinha.ordem"
    )

    def __repr__(self) -> str:
        return f"<Compra {self.numero or '(rascunho)'} {self.total}>"


class CompraLinha(UUIDMixin, Base):
    __tablename__ = "compra_linhas"

    compra_id: Mapped[UUID] = mapped_column(
        ForeignKey("compras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Obrigatório na emissão: a compra existe para movimentar stock.
    artigo_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("artigos.id", ondelete="RESTRICT")
    )
    descricao: Mapped[str | None] = mapped_column(String(300))
    unidade: Mapped[str | None] = mapped_column(String(20))
    qtd: Mapped[Decimal] = mapped_column(
        Numeric(18, 4), default=Decimal("0"), nullable=False
    )
    preco: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    compra: Mapped[Compra] = relationship(back_populates="linhas")

    def __repr__(self) -> str:
        return f"<CompraLinha {self.descricao!r}>"


class SerieDocumento(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Uma série de numeração — a `series` que a AGT regista.

    PORQUE É QUE DEIXOU DE CHEGAR UM CONTADOR. Até aqui a série era um pedaço
    do número: `FT 2026/0001`, em que «2026» fazia de série. Servia enquanto o
    número só tinha de ser único aqui dentro.

    Deixou de servir por duas razões, e as duas são exteriores:

    1. **A AGT regista séries.** Há um serviço `solicitarSerie` e outro
       `listarSeries`; uma série passa a ter existência do lado deles, com data
       de registo e um identificador. Isso não cabe num inteiro.
    2. **O SAF-T identifica-as.** O `documentNo` tem a forma
       `FT FT2026S1/00001` — tipo, série, sequencial — e o ficheiro é validado
       contra isso.

    A série é POR TIPO DE DOCUMENTO e POR ANO: é o que a lei exige (DP 71/25,
    art. 10.º b — «numeração sequencial e cronológica, por tipo de documento e
    por ano fiscal»), e é também o que evita que uma nota de crédito e uma
    factura partilhem numeração.
    """

    __tablename__ = "series_documento"
    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo", name="serie_codigo"),
        UniqueConstraint(
            "empresa_id", "tipo_doc", "ano", "sufixo", name="serie_tipo_ano"
        ),
    )

    #: Tipo interno do documento (FT, NC, RC…).
    tipo_doc: Mapped[str] = mapped_column(String(4), nullable=False)
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Distingue duas séries do mesmo tipo no mesmo ano — «1», «LOJA2», «B».
    #: Uma empresa com dois postos de venda precisa disto.
    sufixo: Mapped[str] = mapped_column(String(10), default="1", nullable=False)

    #: O código que vai no documento: `FT2026S1`. Calculado uma vez e gravado,
    #: porque é o que a AGT regista — mudá-lo depois partia a correspondência.
    codigo: Mapped[str] = mapped_column(String(20), nullable=False)

    #: Último número atribuído nesta série. Nunca recua.
    sequencia: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    #: "activa" | "encerrada". Uma série encerrada não volta a dar números —
    #: e não se apaga, porque os documentos que emitiu continuam a existir.
    estado: Mapped[str] = mapped_column(
        String(20), default="activa", nullable=False
    )

    # ---- Do lado da AGT ----
    #: Identificador devolvido por `solicitarSerie`. Nulo enquanto a série não
    #: for registada — o que é o caso normal antes de haver credenciais.
    agt_id: Mapped[str | None] = mapped_column(String(60))
    agt_registada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    #: O hash do último documento desta série. É o que encadeia a cadeia:
    #: cada documento assina o resumo do anterior, e apagar um pelo meio
    #: parte-a de forma detectável. Ver `services/facturacao/cadeia.py`.
    ultimo_hash: Mapped[str | None] = mapped_column(String(200))

    def __repr__(self) -> str:
        return f"<Serie {self.codigo} n={self.sequencia}>"


class SequenciaVenda(UUIDMixin, EmpresaScopedMixin, Base):
    """Contador por tipo de documento (FT, NC, …), como `com_docseq` no Piloto.

    Tabela, e não contador em memória, pela mesma razão da sequência de
    lançamentos: com concorrência, duas facturas apanhariam o mesmo número — e
    numeração de facturas duplicada é uma infracção fiscal, não um bug menor.
    """

    __tablename__ = "sequencias_venda"
    __table_args__ = (
        UniqueConstraint("empresa_id", "prefixo", "ano", name="sequencia_venda"),
    )

    # "FT", "NC", "CP" (compras)…
    prefixo: Mapped[str] = mapped_column(String(6), nullable=False)
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    valor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<SequenciaVenda {self.prefixo}/{self.ano}={self.valor}>"
