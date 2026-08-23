"""Itens de um imobilizado em curso

Uma obra não se compra de uma vez. Compra-se o terreno, paga-se a licença,
contrata-se a empreitada, acrescenta-se a instalação eléctrica — e só quando
tudo estiver feito é que o activo existe.

Guardar só o total acumulado na ficha dava um número sem história: quem a
abrisse seis meses depois não sabia de onde vinham os oito milhões, nem podia
corrigir uma parcela sem refazer a conta toda.

Revision ID: a3d17f92c4b8
Revises: f2a94c6b8e13
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a3d17f92c4b8"
down_revision = "f2a94c6b8e13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ativo_itens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "empresa_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("empresas.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "ativo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ativos.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("descricao", sa.String(300), nullable=False),
        sa.Column("valor", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("fornecedor", sa.String(200), nullable=True),
        sa.Column("documento", sa.String(60), nullable=True),
        sa.Column("lancamento_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "criado_em",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ativo_itens")
