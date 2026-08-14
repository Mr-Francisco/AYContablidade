"""Notificações internas

Duas tabelas: a notificação, dirigida a uma CAPACIDADE e não a uma pessoa; e a
leitura, por pessoa, à parte — porque cinco pessoas com `contab.lancar` vêem a
mesma notificação e cada uma a lê a seu tempo.

Nada se apaga: `resolvida_em` marca que a situação que a originou deixou de
existir, e a notificação fica no histórico com essa marca.

Escrita à mão. O autogenerate quis arrastar desvios anteriores de
`config_plataforma`, `ia_modelos` e `ia_consultas`, que não são desta
alteração.

Revision ID: 942946444514
Revises: c6de03ecad09
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "942946444514"
down_revision: str | Sequence[str] | None = "c6de03ecad09"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notificacoes",
        sa.Column("capacidade", sa.String(length=40), nullable=False),
        sa.Column("origem", sa.String(length=20), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("titulo", sa.String(length=200), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("ligacao", sa.String(length=300), nullable=True),
        sa.Column("alvo_tipo", sa.String(length=40), nullable=True),
        sa.Column("alvo_id", sa.Uuid(), nullable=True),
        sa.Column("chave", sa.String(length=200), nullable=False),
        sa.Column("resolvida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("empresa_id", sa.Uuid(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"],
            name=op.f("fk_notificacoes_empresa_id_empresas"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notificacoes")),
    )
    op.create_index(
        "ix_notif_chave", "notificacoes", ["empresa_id", "chave"], unique=False
    )
    op.create_index(
        "ix_notif_empresa_criado", "notificacoes", ["empresa_id", "criado_em"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notificacoes_capacidade"), "notificacoes", ["capacidade"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notificacoes_empresa_id"), "notificacoes", ["empresa_id"],
        unique=False,
    )

    op.create_table(
        "notificacoes_lidas",
        sa.Column("notificacao_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["notificacao_id"], ["notificacoes.id"],
            name=op.f("fk_notificacoes_lidas_notificacao_id_notificacoes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_notificacoes_lidas_user_id_users"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notificacoes_lidas")),
        sa.UniqueConstraint("notificacao_id", "user_id", name="uq_notif_lida"),
    )
    op.create_index(
        op.f("ix_notificacoes_lidas_notificacao_id"), "notificacoes_lidas",
        ["notificacao_id"], unique=False,
    )
    op.create_index(
        op.f("ix_notificacoes_lidas_user_id"), "notificacoes_lidas", ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_notificacoes_lidas_user_id"), table_name="notificacoes_lidas"
    )
    op.drop_index(
        op.f("ix_notificacoes_lidas_notificacao_id"), table_name="notificacoes_lidas"
    )
    op.drop_table("notificacoes_lidas")
    op.drop_index(op.f("ix_notificacoes_empresa_id"), table_name="notificacoes")
    op.drop_index(op.f("ix_notificacoes_capacidade"), table_name="notificacoes")
    op.drop_index("ix_notif_empresa_criado", table_name="notificacoes")
    op.drop_index("ix_notif_chave", table_name="notificacoes")
    op.drop_table("notificacoes")
