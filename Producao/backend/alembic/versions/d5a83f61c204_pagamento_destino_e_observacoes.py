"""Vencimento, forma de pagamento, local de destino e observações na venda

QUATRO COLUNAS NUM DOCUMENTO COMERCIAL, todas opcionais e todas a nascer
vazias. Nenhum documento já emitido muda de conteúdo, nenhum total é recalculado
e nenhuma numeração se mexe.

`vencimento` — até quando o cliente tem para pagar. Vazio quer dizer pronto
pagamento, que é o que todos os documentos existentes passam a declarar por
omissão, e é o que eles já eram na prática: não havia onde escrever outra coisa.

`forma_pagamento` — «Transferência bancária», «Numerário», «Multicaixa». Texto
e não código, porque é o que se lê no papel e porque a lista de meios de
pagamento de uma empresa não é a de outra. Um código obrigaria a uma tabela
para gerir aquilo que cada empresa escreve numa linha.

`local_destino` — o ponto de chegada. Já havia `local_operacao`, que é o de
PARTIDA (art. 10.º g) do DP 71/25), e os dois estavam a caber num campo só. Um
documento que acompanha mercadoria tem de dizer de onde saiu e para onde vai;
com um campo apenas, quem precisava dos dois escrevia-os na mesma linha
separados por um travessão, e nenhum ficheiro os sabia ler.

`observacoes` — o que quem emite quer dizer a quem recebe. Distinto do motivo
de anulação e do motivo de isenção, que já existem: esses têm consequência
fiscal e vão para sítios próprios. Este não tem nenhuma, e é por isso que não
pode partilhar campo com eles.

Revision ID: d5a83f61c204
Revises: a4c92e17b053
"""

import sqlalchemy as sa
from alembic import op

revision = "d5a83f61c204"
down_revision = "a4c92e17b053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendas", sa.Column("local_destino", sa.String(length=200), nullable=True))
    op.add_column("vendas", sa.Column("vencimento", sa.Date(), nullable=True))
    op.add_column("vendas", sa.Column("forma_pagamento", sa.String(length=60), nullable=True))
    op.add_column("vendas", sa.Column("observacoes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vendas", "observacoes")
    op.drop_column("vendas", "forma_pagamento")
    op.drop_column("vendas", "vencimento")
    op.drop_column("vendas", "local_destino")
