"""Subsídio de férias em percentagem do salário base

O subsídio de férias escreve-se em kwanzas. Em muitas empresas ele é, na
prática, uma percentagem do salário base — e quem preenche a ficha faz a conta
de cabeça, escreve o resultado, e no dia em que o salário muda ninguém se
lembra de refazer a conta.

Passa a poder guardar-se a percentagem. **O valor continua a ser o que manda**:
`subsidio_ferias` é o que o processamento lê, e é calculado ao gravar quando há
percentagem. Guardar só a percentagem obrigaria o motor de cálculo a saber
disto, e o motor não muda.

Fica NULL em todas as fichas existentes — que continuam com o valor fixo que
sempre tiveram.

Revision ID: b8e2d5461fa9
Revises: a7f3c19d84b2
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8e2d5461fa9"
down_revision: str | Sequence[str] | None = "a7f3c19d84b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "colaboradores",
        sa.Column("subsidio_ferias_perc", sa.Numeric(5, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("colaboradores", "subsidio_ferias_perc")
