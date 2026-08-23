"""Imobilizado: tipo, não amortizável, condições especiais e em curso

Quatro coisas pedidas, e nenhuma delas cabia nos campos que havia.

TIPO DE IMOBILIZADO (corpóreo, incorpóreo, investimento financeiro) decide as
contas em dois momentos: a conta de compra dentro de `371`, e — no imobilizado
em curso — onde os custos acumulam e para que classe são transferidos.

NÃO AMORTIZÁVEL não se resolvia pondo a taxa a zero. A taxa a zero é uma taxa,
e não distingue «este activo não amortiza» de «ainda não sabemos a taxa». Um
terreno tem de dizer que é um terreno.

CONDIÇÕES ESPECIAIS trazem o valor sujeito a amortização. Sem elas, a base
continua a ser o valor de aquisição — que é o que sempre foi.

EM CURSO é um activo que ainda não existe como património: acumula itens, não
amortiza, e um dia fecha e transfere-se.

TUDO NASCE FALSO OU NULO, de propósito: nenhum activo existente muda de
comportamento por causa desta migração. Um activo sem tipo continua sem tipo,
e o cálculo da amortização é exactamente o mesmo que era.

Revision ID: f2a94c6b8e13
Revises: e5b1c8d47a92
"""

import sqlalchemy as sa
from alembic import op

revision = "f2a94c6b8e13"
down_revision = "e5b1c8d47a92"
branch_labels = None
depends_on = None

# `server_default` nos booleanos porque a tabela já tem linhas: sem ele, o
# NOT NULL não passa. Ver docs/LESSONS.md.
_COLUNAS = (
    sa.Column("tipo_imobilizado", sa.String(20), nullable=True),
    sa.Column(
        "nao_amortizavel",
        sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    ),
    sa.Column(
        "condicoes_especiais",
        sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    ),
    sa.Column("condicoes_texto", sa.Text(), nullable=True),
    sa.Column("valor_sujeito_amortizacao", sa.Numeric(18, 2), nullable=True),
    sa.Column("em_curso", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("fechado_em", sa.Date(), nullable=True),
    sa.Column("conta_destino", sa.String(20), nullable=True),
)


def upgrade() -> None:
    for coluna in _COLUNAS:
        op.add_column("ativos", coluna)


def downgrade() -> None:
    for coluna in reversed(_COLUNAS):
        op.drop_column("ativos", coluna.name)
