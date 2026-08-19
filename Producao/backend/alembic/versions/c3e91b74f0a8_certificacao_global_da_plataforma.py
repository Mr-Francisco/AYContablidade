"""Certificação da AGT: um valor por omissão na plataforma

O número certifica o programa, e o programa é o mesmo para todas as empresas.
Escrevê-lo empresa a empresa era repetir a mesma coisa tantas vezes quantos os
clientes. Passa a haver um valor na plataforma; o da empresa continua a existir
para os casos em que seja preciso, e ganha-lhe a frente quando está preenchido.

Revision ID: c3e91b74f0a8
Revises: b7d2f4a91c05
"""

import sqlalchemy as sa
from alembic import op

revision = "c3e91b74f0a8"
down_revision = "b7d2f4a91c05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "config_plataforma",
        sa.Column("certificacao_agt", sa.String(30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("config_plataforma", "certificacao_agt")
