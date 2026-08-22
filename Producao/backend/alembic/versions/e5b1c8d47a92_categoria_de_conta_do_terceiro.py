"""Categoria de conta do terceiro: nacional, estrangeiro ou outros

Até aqui a conta-mãe da conta corrente saía do PAÍS: Angola ia para os
nacionais, o resto para os estrangeiros. Isso resolve duas das três categorias
que o plano PGC-AR tem.

A que faltava não é um país. `3791 Outros Devedores` e `3792 Outros Credores`
existem no plano e não estavam a ser usados — uma conta a receber que não vem
de uma venda, ou a pagar que não vem de uma compra, ia para `31121`/`32121` e
ficava a inflar o saldo de clientes ou de fornecedores sem o ser.

A coluna serve OS DOIS LADOS: o que muda entre um cliente e um fornecedor é a
conta a que cada categoria corresponde, não a categoria.

NULA NOS REGISTOS EXISTENTES, e de propósito: sem categoria, decide-se pelo
país como sempre se decidiu. Nenhuma ficha muda de conta por causa desta
migração.

Revision ID: e5b1c8d47a92
Revises: c3e91b74f0a8
"""

import sqlalchemy as sa
from alembic import op

revision = "e5b1c8d47a92"
down_revision = "c3e91b74f0a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "terceiros",
        sa.Column("categoria_conta", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("terceiros", "categoria_conta")
