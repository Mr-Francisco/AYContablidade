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

    estado: Mapped[str] = mapped_column(String(20), default="rascunho", nullable=False, index=True)
    emitido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Código de validação do documento (codigoValidacao no Piloto).
    codigo_validacao: Mapped[str | None] = mapped_column(String(20))

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
