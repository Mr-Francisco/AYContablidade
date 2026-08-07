"""Imobilizados — activos fixos e amortizações.

Transposto de `Piloto/assets/js/imobilizados.js`. Métodos: Quotas Constantes
(base) e Quotas Decrescentes (simplificado, com coeficiente por vida útil).
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Date,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

Money = Numeric(18, 2)


class Ativo(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "ativos"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="ativo_codigo"),)

    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    designacao: Mapped[str] = mapped_column(String(300), nullable=False)

    # Trio de contas do activo: imobilizado, amortizações acumuladas e custo do
    # exercício. Sem as três não é possível processar a amortização.
    conta_imob: Mapped[str | None] = mapped_column(String(20))
    conta_amort_acum: Mapped[str | None] = mapped_column(String(20))
    conta_custo_amort: Mapped[str | None] = mapped_column(String(20))

    data_aquisicao: Mapped[date | None] = mapped_column(Date)
    valor_aquisicao: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )
    taxa: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    # "quotas" (constantes) | "degressivas" (decrescentes)
    metodo: Mapped[str] = mapped_column(String(20), default="quotas", nullable=False)
    # Acumulado corrente. Sobe no processamento e desce ao reabrir um período.
    amort_acumulada: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )

    fornecedor: Mapped[str | None] = mapped_column(String(200))
    # "activo" | "abatido" — um activo abatido deixa de amortizar.
    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<Ativo {self.codigo} {self.designacao!r}>"


class ProcessoAmortizacao(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Processamento de amortizações de um exercício × período.

    Idempotente por construção: a restrição única recusa processar duas vezes o
    mesmo período. Para corrigir é preciso reabrir, o que repõe as acumuladas e
    apaga os lançamentos gerados.
    """

    __tablename__ = "processos_amortizacao"
    __table_args__ = (
        UniqueConstraint("empresa_id", "exercicio_id", "mes", name="processo_amortizacao"),
    )

    exercicio_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False)
    data: Mapped[date] = mapped_column(Date, nullable=False)

    # [{ativo_id, codigo, designacao, valor, lancamento_id}] — o detalhe por
    # activo é preciso para reabrir o período e desfazer exactamente o que se fez.
    itens: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)
    total_amort: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )
    por: Mapped[str | None] = mapped_column(String(200))

    def __repr__(self) -> str:
        return f"<ProcessoAmortizacao {self.mes} {self.total_amort}>"
