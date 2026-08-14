"""Ficha de conta do Piloto: agrupamento, conta alternativa, fiscalidade,
integração e tesouraria.

A janela «Nova conta» de `plano-contas.html` tem catorze campos; a tabela
`contas` tinha seis. Estes onze são os que faltavam.

Nenhum entra no motor de lançamentos — são informativos ou de parametrização.
Por isso todos aceitam nulo, e os três interruptores e o custo fixo trazem
`server_default`: a tabela já tem 1619 linhas por empresa, e sem valor por
omissão o `NOT NULL` não passava.

Revision ID: c4a81f2e6b90
Revises: b3d71ca90e18
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4a81f2e6b90"
down_revision: str | Sequence[str] | None = "b3d71ca90e18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("contas", sa.Column("classe_primavera", sa.String(20), nullable=True))
    op.add_column("contas", sa.Column("conta_alt_codigo", sa.String(20), nullable=True))
    op.add_column("contas", sa.Column("conta_alt_nome", sa.String(200), nullable=True))
    op.add_column("contas", sa.Column("retencao", sa.String(40), nullable=True))
    op.add_column(
        "contas", sa.Column("motivo_tributacao", sa.String(200), nullable=True)
    )
    op.add_column(
        "contas",
        sa.Column(
            "trat_pendentes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "contas",
        sa.Column(
            "integra_equipamentos",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "contas",
        sa.Column(
            "integra_ativos",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("contas", sa.Column("investimento", sa.String(40), nullable=True))
    op.add_column(
        "contas",
        sa.Column(
            "custo_fixo",
            sa.Numeric(6, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("contas", sa.Column("item_tesouraria", sa.String(40), nullable=True))


def downgrade() -> None:
    for coluna in (
        "item_tesouraria",
        "custo_fixo",
        "investimento",
        "integra_ativos",
        "integra_equipamentos",
        "trat_pendentes",
        "motivo_tributacao",
        "retencao",
        "conta_alt_nome",
        "conta_alt_codigo",
        "classe_primavera",
    ):
        op.drop_column("contas", coluna)
