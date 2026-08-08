"""aviso de palavra-passe provisoria

Marca as contas cuja palavra-passe foi definida por outra pessoa, para as
avisar no primeiro acesso. Não tranca nada.

Revision ID: 70d27e3fb9c2
Revises: 40a9bbcc03e5
Create Date: 2026-08-08 19:25:56.647234
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "70d27e3fb9c2"
down_revision: str | Sequence[str] | None = "40a9bbcc03e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `server_default` é obrigatório: a coluna é NOT NULL e a tabela já tem
    # linhas. Sem ele o ALTER falha (docs/LESSONS.md).
    op.add_column(
        "users",
        sa.Column(
            "password_provisoria",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_provisoria")
