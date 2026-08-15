"""Ficha do colaborador como no Piloto

A ficha do Piloto (`pessoal.html`) tem oito separadores — Identificação,
Documentos, Dados Fiscais, Contrato, Processamento, Pagamento, Subsídios e
Férias, Habilitações — e perto de trinta campos. A tabela tinha quinze.

Os que faltavam não tinham onde ser guardados: quem preenchesse a morada, o
contacto ou o número do documento perdia-os ao gravar, sem aviso nenhum. E
alguns não são acessórios — o número do documento e o contacto são o que
identifica um trabalhador quando não há NIF.

Todas as colunas entram NULL ou com valor por omissão, por isso não há
migração de dados a fazer: as fichas que já existem continuam válidas e vão
sendo completadas à medida que forem abertas.

`dependentes` e `dias_ferias` são NOT NULL com `server_default`, que é o que
permite acrescentá-las a uma tabela com linhas — sem ele, o PostgreSQL recusa.

Escrita à mão e não pelo autogenerate: a base tem desvios anteriores noutras
tabelas que o autogenerate quer arrastar para aqui, e não são desta alteração.

Revision ID: a7f3c19d84b2
Revises: 942946444514
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7f3c19d84b2"
down_revision: str | Sequence[str] | None = "942946444514"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: (nome, tipo) — todas opcionais.
COLUNAS_OPCIONAIS = [
    # Identificação
    ("nome_abreviado", sa.String(80)),
    ("genero", sa.String(20)),
    ("data_nascimento", sa.Date()),
    ("nacionalidade", sa.String(60)),
    ("naturalidade", sa.String(120)),
    ("morada", sa.String(300)),
    ("localidade", sa.String(120)),
    ("codigo_postal", sa.String(20)),
    ("pais", sa.String(60)),
    ("comuna", sa.String(80)),
    ("email", sa.String(200)),
    ("telefone", sa.String(40)),
    ("telemovel", sa.String(40)),
    # Documentos
    ("tipo_documento", sa.String(40)),
    ("num_documento", sa.String(40)),
    ("validade_documento", sa.Date()),
    # Dados fiscais
    ("estado_civil", sa.String(30)),
    ("regime_irt", sa.String(80)),
    # Contrato
    ("tipo_contrato", sa.String(40)),
    ("data_fim", sa.Date()),
    # Pagamento
    ("forma_pagamento", sa.String(40)),
    ("banco", sa.String(120)),
    # Habilitações
    ("habilitacoes", sa.String(200)),
    ("notas", sa.Text()),
]


def upgrade() -> None:
    for nome, tipo in COLUNAS_OPCIONAIS:
        op.add_column("colaboradores", sa.Column(nome, tipo, nullable=True))

    # Estas duas são NOT NULL: um colaborador tem sempre um número de
    # dependentes (zero é um número) e um direito a férias.
    op.add_column(
        "colaboradores",
        sa.Column(
            "dependentes", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "colaboradores",
        sa.Column(
            "dias_ferias", sa.Integer(), nullable=False, server_default="22"
        ),
    )


def downgrade() -> None:
    op.drop_column("colaboradores", "dias_ferias")
    op.drop_column("colaboradores", "dependentes")
    for nome, _ in reversed(COLUNAS_OPCIONAIS):
        op.drop_column("colaboradores", nome)
