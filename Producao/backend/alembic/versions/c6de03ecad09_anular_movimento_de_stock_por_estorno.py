"""Anular movimento de stock por estorno

Um movimento de stock contabilizado deixa de se poder apagar. Anular passa a
criar um movimento CONTRÁRIO e um lançamento de sinal trocado; o original fica
no histórico, marcado com quem o anulou e quando.

Três colunas:

- `estorna_id` — no movimento NOVO, aponta para o que ele reverte.
- `estornado_em` e `estornado_por_id` — no ORIGINAL. São a marca que impede uma
  segunda anulação, e o que responde a um auditor sem ter de cruzar tabelas.

Escrita à mão e não pelo autogenerate: a base tem desvios anteriores noutras
tabelas (`config_plataforma`, `ia_modelos`, `ia_consultas`) que o autogenerate
quis arrastar para aqui. Não são desta alteração e não vêm à boleia dela.

Revision ID: c6de03ecad09
Revises: c4a81f2e6b90
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6de03ecad09"
down_revision: str | Sequence[str] | None = "c4a81f2e6b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "movimentos_stock", sa.Column("estorna_id", sa.Uuid(), nullable=True)
    )
    op.add_column(
        "movimentos_stock",
        sa.Column("estornado_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "movimentos_stock", sa.Column("estornado_por_id", sa.Uuid(), nullable=True)
    )
    op.create_index(
        op.f("ix_movimentos_stock_estorna_id"),
        "movimentos_stock",
        ["estorna_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_movimentos_stock_estorna_id_movimentos_stock"),
        "movimentos_stock", "movimentos_stock",
        ["estorna_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_movimentos_stock_estornado_por_id_users"),
        "movimentos_stock", "users",
        ["estornado_por_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_movimentos_stock_estornado_por_id_users"),
        "movimentos_stock", type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_movimentos_stock_estorna_id_movimentos_stock"),
        "movimentos_stock", type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_movimentos_stock_estorna_id"), table_name="movimentos_stock"
    )
    op.drop_column("movimentos_stock", "estornado_por_id")
    op.drop_column("movimentos_stock", "estornado_em")
    op.drop_column("movimentos_stock", "estorna_id")
