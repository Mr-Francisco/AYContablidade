"""modelo de ia e interruptor geral

Duas definições que hoje só mudavam com um deploy, ou não existiam de todo:

- o MODELO, que estava no `.env`. Trocar de modelo é uma decisão de custo e de
  qualidade que se toma a olhar para a factura, e não uma que justifique
  reiniciar o servidor.
- o INTERRUPTOR do assistente. Não existia: quando algo corre mal, os únicos
  travões eram ir licença a licença ou revogar a chave na OpenAI.

Revision ID: f0cc58adfca7
Revises: 2478fc9aa419
Create Date: 2026-08-08 23:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f0cc58adfca7"
down_revision: str | Sequence[str] | None = "2478fc9aa419"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nulo de propósito: numa instalação que ainda não escolheu, continua a
    # valer o `OPENAI_MODELO` do ambiente. A coluna nova não apaga a escolha
    # que já existia.
    op.add_column(
        "config_plataforma", sa.Column("modelo_ia", sa.String(80), nullable=True)
    )
    op.add_column(
        "config_plataforma",
        sa.Column(
            "ia_ativa", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )


def downgrade() -> None:
    op.drop_column("config_plataforma", "ia_ativa")
    op.drop_column("config_plataforma", "modelo_ia")
