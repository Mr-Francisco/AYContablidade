"""Coordenadas bancárias da empresa

ONDE O CLIENTE PAGA, para sair no rodapé dos documentos. Uma proforma existe
para ser paga, e sem isto obriga a um telefonema ou a um segundo e-mail só para
pedir o IBAN — que é exactamente o atrito que o documento devia poupar.

TEXTO LIVRE E DE VÁRIAS LINHAS, e não campos separados. Uma empresa tem um
IBAN; outra tem três bancos e um número de transferência expressa; a que vier a
seguir há-de ter outra coisa qualquer. Um formulário com «Banco», «IBAN» e
«Conta» servia bem a primeira e obrigava as outras a escrever tudo dentro da
mesma casa — que é o mesmo que ter texto livre, mas com o campo a mentir sobre
o que lá cabe.

Nasce vazia em todas as empresas, e vazia quer dizer «não mostrar o bloco».
Nenhum documento já emitido muda de conteúdo.

Revision ID: e6b94a72d315
Revises: d5a83f61c204
"""

import sqlalchemy as sa
from alembic import op

revision = "e6b94a72d315"
down_revision = "d5a83f61c204"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("empresas", sa.Column("coordenadas_bancarias", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("empresas", "coordenadas_bancarias")
