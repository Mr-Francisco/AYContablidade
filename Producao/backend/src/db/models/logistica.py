"""Logística — artigos, armazéns e movimentos de stock.

Transposto de `Piloto/assets/js/logistica.js`. A valorização é feita por Custo
Médio Ponderado (CUMP), recalculado cronologicamente a cada entrada.

Detalhe que a camada de serviço tem de preservar: o CUMP é derivado do histórico
de movimentos, não guardado. Uma saída não altera o custo médio — só reduz a
quantidade — e sai sempre ao CUMP corrente do armazém de origem, que nunca é
editável pelo utilizador. É isso que garante a coerência da valorização.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

Money = Numeric(18, 2)
Qtd = Numeric(18, 4)


class Armazem(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "armazens"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="armazem_codigo"),)

    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    localizacao: Mapped[str | None] = mapped_column(String(200))

    def __repr__(self) -> str:
        return f"<Armazem {self.codigo} {self.nome!r}>"


class Artigo(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "artigos"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="artigo_codigo"),)

    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    familia: Mapped[str | None] = mapped_column(String(120))
    subfamilia: Mapped[str | None] = mapped_column(String(120))
    unidade: Mapped[str | None] = mapped_column(String(20))
    cod_barras: Mapped[str | None] = mapped_column(String(60))
    # "Mercadoria" | "Matéria-prima" | "Produto acabado" | "Serviço"
    tipo_artigo: Mapped[str | None] = mapped_column(String(40))

    preco_venda: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    preco_compra: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    taxa_iva: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    stock_min: Mapped[Decimal] = mapped_column(Qtd, default=Decimal("0"), nullable=False)

    # Contas próprias do artigo; se vazias usam-se as da configuração do módulo.
    conta_existencia: Mapped[str | None] = mapped_column(String(20))
    conta_custo: Mapped[str | None] = mapped_column(String(20))
    # Guardada por fidelidade ao Piloto, que a grava na ficha do artigo. Ainda
    # não é lida em lado nenhum: as vendas usam a conta de proveito do tipo de
    # documento. Perdê-la agora obrigaria a reintroduzi-la artigo a artigo.
    conta_proveito: Mapped[str | None] = mapped_column(String(20))

    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<Artigo {self.codigo} {self.descricao!r}>"


class MovimentoStock(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Movimento de stock.

    `tipo`: entrada (Recepção) | saida (Expedição) | transferencia | ajuste
    (Inventariação). Num ajuste a quantidade pode ser negativa — é o que
    distingue um acerto positivo de uma quebra, e cada um usa documento e
    contrapartida próprios.
    """

    __tablename__ = "movimentos_stock"
    __table_args__ = (
        UniqueConstraint("empresa_id", "numero", name="movimento_numero"),
        Index("ix_movs_artigo_data", "artigo_id", "data"),
        Index("ix_movs_empresa_data", "empresa_id", "data"),
    )

    numero: Mapped[str] = mapped_column(String(30), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    data: Mapped[date] = mapped_column(Date, nullable=False)

    artigo_id: Mapped[UUID] = mapped_column(
        ForeignKey("artigos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    artigo_desc: Mapped[str | None] = mapped_column(String(300))

    armazem_id: Mapped[UUID] = mapped_column(
        ForeignKey("armazens.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Só preenchido em transferências.
    armazem_destino_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("armazens.id", ondelete="RESTRICT")
    )

    qtd: Mapped[Decimal] = mapped_column(Qtd, nullable=False)
    unidade: Mapped[str | None] = mapped_column(String(20))
    # Em saídas e transferências é o CUMP calculado no momento, não um valor
    # introduzido — fica gravado para o histórico ser reconstituível.
    custo_unit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    valor: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    documento: Mapped[str | None] = mapped_column(String(60))
    descricao: Mapped[str | None] = mapped_column(Text)
    entidade: Mapped[str | None] = mapped_column(String(200))

    lancamento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="SET NULL")
    )
    numero_op: Mapped[str | None] = mapped_column(String(30))

    def __repr__(self) -> str:
        return f"<MovimentoStock {self.numero} {self.tipo} {self.qtd}>"
