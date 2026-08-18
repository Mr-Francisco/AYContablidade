"""Pedir acesso a uma empresa deixa de exigir palavra-passe

Não fazia sentido: a pessoa escolhia uma credencial para uma conta que a
empresa ainda não tinha aceite, e que podia nunca vir a existir. O pedido passa
a guardar só quem é a pessoa; a palavra-passe nasce quando o pedido é aceite e
é entregue nesse momento.

`password_definida` fica a `true` para todas as contas que já existem — todas
elas têm palavra-passe. Nasce a `false` apenas nos pedidos novos.

Revision ID: b7d2f4a91c05
Revises: a4e18c62b930
"""

import sqlalchemy as sa
from alembic import op

revision = "b7d2f4a91c05"
down_revision = "a4e18c62b930"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "password_definida",
            sa.Boolean(),
            nullable=False,
            # `true` para o que já existe: todas as contas actuais têm
            # palavra-passe, e sem isto ficavam todas trancadas de fora.
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "password_definida")
