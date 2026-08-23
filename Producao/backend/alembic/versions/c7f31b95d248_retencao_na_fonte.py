"""Retenção na fonte nos documentos de venda

O recibo do cliente mostra três blocos — a factura, este recibo, e a situação
depois — e nenhum deles se consegue calcular sem saber quanto foi retido.

A BASE É UM CAMPO, e não o subtotal. Num documento real, uma factura de 230 000
tinha 9 750 de retenção: 6,5% de 150 000, não de 230 000. A retenção incide
sobre a parte que lhe está sujeita, e uma factura pode misturar o que está e o
que não está. A linha de venda não distingue mercadoria de serviço — só a
factura o faz —, por isso a base fica explícita em vez de deduzida por uma
regra que os dados não suportam.

TUDO NASCE A ZERO. Nenhum documento emitido muda de valor por causa desta
migração: sem taxa, não há retenção, e o total continua a ser o que era.

Revision ID: c7f31b95d248
Revises: b8e42d1a76f3
"""

import sqlalchemy as sa
from alembic import op

revision = "c7f31b95d248"
down_revision = "b8e42d1a76f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vendas",
        sa.Column(
            "retencao_perc",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "vendas", sa.Column("retencao_base", sa.Numeric(18, 2), nullable=True)
    )
    op.add_column(
        "vendas",
        sa.Column(
            "retencao", sa.Numeric(18, 2), nullable=False, server_default="0"
        ),
    )


def downgrade() -> None:
    op.drop_column("vendas", "retencao")
    op.drop_column("vendas", "retencao_base")
    op.drop_column("vendas", "retencao_perc")
