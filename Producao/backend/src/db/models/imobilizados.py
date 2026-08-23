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
    Text,
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

    #: `corporeo` | `incorporeo` | `financeiro`.
    #:
    #: Decide as contas por omissão em dois momentos: a conta de COMPRA
    #: (`3711…` corpóreo, `3712…` incorpóreo, `3713…` financeiro, e dentro de
    #: cada uma conforme o fornecedor seja nacional ou estrangeiro) e, no
    #: imobilizado em curso, a conta onde os custos acumulam e a classe para
    #: onde são transferidos no fecho.
    tipo_imobilizado: Mapped[str | None] = mapped_column(String(20))

    #: Um activo que NÃO amortiza — os terrenos são o exemplo.
    #:
    #: Não se resolve pondo a taxa a zero: a taxa a zero é uma taxa, e não
    #: distingue «não amortiza» de «ainda não sabemos a taxa». Quem ler a ficha
    #: daqui a um ano tem de perceber que foi uma decisão.
    nao_amortizavel: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )

    #: Condições especiais de amortização, e o que elas dizem.
    condicoes_especiais: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )
    condicoes_texto: Mapped[str | None] = mapped_column(Text)

    #: A parte do activo sobre a qual a amortização incide.
    #:
    #: Só conta quando há condições especiais. Sem elas, a base é o valor de
    #: aquisição — que é o que sempre foi e continua a ser.
    valor_sujeito_amortizacao: Mapped[Decimal | None] = mapped_column(Money)

    # ---- Imobilizado em curso ----
    #: O activo ainda está a ser construído ou adquirido.
    #:
    #: Enquanto estiver, NÃO AMORTIZA e vai acumulando itens. Fecha-se quando
    #: estiver concluído, e aí é transferido para o património.
    em_curso: Mapped[bool] = mapped_column(
        default=False, nullable=False, server_default="false"
    )
    #: Quando foi fechado e transferido. Nulo enquanto estiver em curso.
    fechado_em: Mapped[date | None] = mapped_column(Date)
    #: A conta de imobilizado para onde o valor acumulado foi transferido —
    #: uma subconta de `11`, `12` ou `13`, indicada no fecho.
    conta_destino: Mapped[str | None] = mapped_column(String(20))

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
