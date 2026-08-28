"""Desconto por linha, e o total descontado no documento

POR LINHA E NÃO POR DOCUMENTO. Numa mesma factura desconta-se um artigo e não
o outro — negoceia-se o preço de um equipamento e mantém-se o da instalação. Um
desconto de cabeçalho não sabe representar isso, e obrigava quem o quisesse
fazer a baixar o preço unitário à mão: o documento passava a mentir sobre o
preço de tabela, e no ano seguinte já ninguém sabia que ali tinha havido
desconto.

O `subtotal` DO DOCUMENTO NÃO MUDA DE SIGNIFICADO: continua a ser o ilíquido,
a soma de `qtd x preço` antes de qualquer desconto — que é o «Total Ilíquido»
que já se imprime. O que é novo é o `desconto`, que soma o que as linhas
descontaram, e o total passa a ser `subtotal - desconto + iva`. Com desconto
zero, que é o caso de tudo o que já existe, a conta dá exactamente o mesmo
número de antes.

A LINHA GUARDA O LÍQUIDO no seu `total`, que é o que o cliente lê na coluna
«Total» e o que entra na soma. O ilíquido da linha continua a ler-se em
`qtd x preço`, sem ser preciso guardá-lo duas vezes.

Ambas as colunas nascem a zero, com `server_default`, para que as linhas e os
documentos que já existem não fiquem nulos nem precisem de ser percorridos.

Revision ID: f7c25e08b431
Revises: e6b94a72d315
"""

import sqlalchemy as sa
from alembic import op

revision = "f7c25e08b431"
down_revision = "e6b94a72d315"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "venda_linhas",
        sa.Column(
            "desconto_perc",
            sa.Numeric(6, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "vendas",
        sa.Column(
            "desconto",
            sa.Numeric(18, 2),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("vendas", "desconto")
    op.drop_column("venda_linhas", "desconto_perc")
