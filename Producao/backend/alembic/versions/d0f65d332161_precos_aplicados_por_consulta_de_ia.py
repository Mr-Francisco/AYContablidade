"""precos aplicados por consulta de ia

Guarda em cada consulta os preços que lhe foram aplicados. Sem isto, mudar a
tabela de preços tornava a facturação histórica inauditável: ficava o custo mas
não havia como reconstruir de onde vinha.

As consultas já existentes ficam com NULL, e é o correcto — não se sabe que
preços tinham na altura, e inventá-los seria pior do que admitir que não se sabe.

Revision ID: d0f65d332161
Revises: 70d27e3fb9c2
Create Date: 2026-08-08 19:52:31.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d0f65d332161"
down_revision: str | Sequence[str] | None = "70d27e3fb9c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: o histórico anterior não tem esta informação e não deve fingir
    # que tem.
    op.add_column(
        "ia_consultas", sa.Column("preco_entrada", sa.Numeric(12, 6), nullable=True)
    )
    op.add_column(
        "ia_consultas", sa.Column("preco_saida", sa.Numeric(12, 6), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("ia_consultas", "preco_saida")
    op.drop_column("ia_consultas", "preco_entrada")
