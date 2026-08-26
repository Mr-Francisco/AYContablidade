"""Subclasses de documento, conta de reflexão e sistema de inventariação

TRÊS COLUNAS NUM DOCUMENTO CONTABILÍSTICO, todas opcionais e todas a nascer
vazias. Nenhum documento que já existe muda de comportamento, e nenhum
lançamento já feito é tocado.

`pai_codigo` — a subclasse. O `211` é a classe; o `211.1` é uma subclasse dela
e guarda aqui o `211`. Serve para organizar: uma empresa com quinze variantes
de compra tinha quinze documentos soltos numa lista, sem forma de ver que eram
todos da mesma família. Uma subclasse pede o mesmo que uma classe e pode fixar
a sua própria conta de débito.

`sistema_inventario` — `permanente` ou `periodico`. No permanente o custo
reconhece-se no momento em que ocorre: a compra entra na conta de compras e, no
mesmo lançamento, reflecte-se para a conta de existências. No periódico não há
reflexão — o custo só se apura no fim do período, pelo inventário. Vazio é o
que sempre houve, e é onde ficam todos os documentos que já existem.

`conta_reflexao` — a conta de destino dessa reflexão, tipicamente uma 26 ou uma
22 conforme o inventário que a empresa usa. O outro lado não se guarda porque
não é uma escolha: é a própria `conta_debito` do documento, creditada. Guardar
as duas deixava-as divergir.

PORQUE NÃO HÁ CHAVE ESTRANGEIRA no `pai_codigo`: um documento aponta para o
diário pelo código e não pelo `id`, e o mesmo vale aqui. A coerência é
verificada quando se grava — é onde a mensagem pode ser dita a quem está a
escrever, em vez de vir do motor da base de dados.

Revision ID: a4c92e17b053
Revises: c7f31b95d248
"""

import sqlalchemy as sa
from alembic import op

revision = "a4c92e17b053"
down_revision = "c7f31b95d248"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documentos_contabilisticos",
        sa.Column("pai_codigo", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "documentos_contabilisticos",
        sa.Column("sistema_inventario", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "documentos_contabilisticos",
        sa.Column("conta_reflexao", sa.String(length=20), nullable=True),
    )
    # Correr a lista de subclasses de uma classe é o que a listagem faz a cada
    # abertura do ecrã. Sem índice, é uma varredura da tabela por cada classe.
    op.create_index(
        "ix_documento_pai",
        "documentos_contabilisticos",
        ["empresa_id", "pai_codigo"],
    )


def downgrade() -> None:
    op.drop_index("ix_documento_pai", table_name="documentos_contabilisticos")
    op.drop_column("documentos_contabilisticos", "conta_reflexao")
    op.drop_column("documentos_contabilisticos", "sistema_inventario")
    op.drop_column("documentos_contabilisticos", "pai_codigo")
