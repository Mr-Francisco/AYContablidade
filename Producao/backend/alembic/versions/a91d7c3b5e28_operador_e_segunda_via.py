"""O operador que emitiu, e o contador de vias

DUAS COISAS SOBRE A PROVENIÊNCIA DO DOCUMENTO, que estavam ambas em falta.

`emitido_por_id` / `emitido_por_nome` — o OPERADOR. Não é o vendedor: o
vendedor é quem angariou e leva comissão, o operador é quem carregou no botão.
Numa loja são frequentemente pessoas diferentes, e um documento que só diz o
vendedor não permite saber quem o emitiu. O nome vai gravado a par do `id`,
como já se faz com o cliente e com o fornecedor: a conta pode ser apagada ou
mudar de nome, e a factura de 2026 tem de continuar a dizer quem a emitiu em
2026.

`impressoes` — QUANTAS VEZES O DOCUMENTO JÁ SAIU EM PAPEL. A primeira é o
original; as seguintes são segundas vias e têm de o dizer. Sem este contador, o
documento carimbava «Original» em todas as impressões, e imprimir a mesma
factura duas vezes dava duas folhas a afirmarem, cada uma, ser a primeira.

É a única fidelidade que se perde por NÃO guardar o PDF gerado — e resolve-se
carimbando, não arquivando. Guardar cada folha desenhada custaria cerca de
quinze vezes o que ocupam os dados que a geram, para resolver um problema que
um inteiro resolve.

As três colunas nascem vazias ou a zero. Os documentos que já existem passam a
declarar zero impressões, o que é verdade no que ao sistema diz respeito: nunca
registou nenhuma.

Revision ID: a91d7c3b5e28
Revises: f7c25e08b431
"""

import sqlalchemy as sa
from alembic import op

revision = "a91d7c3b5e28"
down_revision = "f7c25e08b431"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vendas",
        sa.Column("emitido_por_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "vendas",
        sa.Column("emitido_por_nome", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "vendas",
        sa.Column(
            "impressoes", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.create_foreign_key(
        "fk_vendas_emitido_por",
        "vendas",
        "users",
        ["emitido_por_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_vendas_emitido_por", "vendas", type_="foreignkey")
    op.drop_column("vendas", "impressoes")
    op.drop_column("vendas", "emitido_por_nome")
    op.drop_column("vendas", "emitido_por_id")
