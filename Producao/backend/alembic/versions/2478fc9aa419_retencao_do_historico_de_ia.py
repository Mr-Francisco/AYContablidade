"""retencao do historico de ia

Dois prazos, porque são duas coisas diferentes: descartar o pacote enviado
(que é o que ocupa espaço) e apagar a consulta (que é o que apaga o consumo).

Acrescenta também o índice que a limpeza usa. Sem ele, cada nova consulta
provocava uma varredura da tabela toda para procurar as velhas — a limpeza
ficava mais cara do que aquilo que poupa.

Revision ID: 2478fc9aa419
Revises: 58e1bb1bba49
Create Date: 2026-08-08 22:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2478fc9aa419"
down_revision: str | Sequence[str] | None = "58e1bb1bba49"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "config_plataforma",
        sa.Column(
            "ia_dias_pacote", sa.Integer(), nullable=False, server_default=sa.text("30")
        ),
    )
    op.add_column(
        "config_plataforma",
        sa.Column(
            "ia_dias_historico",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("365"),
        ),
    )
    # (empresa_id, criado_em): a limpeza filtra sempre pelos dois, e é também
    # o par que o cálculo do consumo do mês usa.
    op.create_index(
        "ix_ia_consultas_empresa_criado",
        "ia_consultas",
        ["empresa_id", "criado_em"],
    )


def downgrade() -> None:
    op.drop_index("ix_ia_consultas_empresa_criado", table_name="ia_consultas")
    op.drop_column("config_plataforma", "ia_dias_historico")
    op.drop_column("config_plataforma", "ia_dias_pacote")
