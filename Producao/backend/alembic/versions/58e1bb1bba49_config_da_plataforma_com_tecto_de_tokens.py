"""config da plataforma com tecto de tokens

Linha única com as definições que valem para todas as empresas. Começa com o
tecto de tokens de resposta.

Revision ID: 58e1bb1bba49
Revises: d0f65d332161
Create Date: 2026-08-08 21:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "58e1bb1bba49"
down_revision: str | Sequence[str] | None = "d0f65d332161"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "config_plataforma",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "max_tokens_saida",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("800"),
        ),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "atualizado_em",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    # A linha nasce já criada: assim nenhuma leitura tem de lidar com «ainda
    # não existe», e o valor por omissão fica visível na interface desde o
    # primeiro dia em vez de aparecer só depois de alguém gravar.
    op.execute("INSERT INTO config_plataforma (max_tokens_saida) VALUES (800)")


def downgrade() -> None:
    op.drop_table("config_plataforma")
