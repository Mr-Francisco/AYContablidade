"""registo de modelos de ia

Os modelos e os seus preços passam a viver na base, geridos pelo
superadministrador. Antes estavam num ficheiro JSON versionado: mudar um preço
obrigava a mexer no repositório e a reiniciar o serviço, e a lista de modelos
disponíveis era, na prática, uma decisão de programação.

Traz três coisas:

1. A tabela `ia_modelos`, com um índice único parcial sobre `padrao`. É o
   índice, e não o código, que garante que existe no máximo um modelo padrão —
   duas escritas em paralelo passariam por qualquer verificação feita em Python.

2. A semente com os modelos com capacidade para analisar contabilidade, sem os
   caros de mais para a tarefa. O padrão é o equilibrado.

3. Duas colunas em `ia_consultas` para a entrada servida de cache, que a API
   cobra mais barato. Sem elas o custo estimado ficava acima do real em
   perguntas repetidas.

A coluna `config_plataforma.modelo_ia` desaparece: o modelo em uso passa a ser
o que tem `padrao`, e ter a mesma decisão em dois sítios só serve para os
deixar divergir.

Revision ID: b3d71ca90e18
Revises: f0cc58adfca7
Create Date: 2026-08-08 23:50:00.000000
"""

from collections.abc import Sequence
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision: str = "b3d71ca90e18"
down_revision: str | Sequence[str] | None = "f0cc58adfca7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


#: Preços em dólares por 1 000 000 de tokens, à data de criação desta migração.
#: São uma SEMENTE, não a verdade permanente: a partir daqui quem os mantém é
#: quem gere a plataforma, pela interface.
SEMENTE = [
    ("Análises complexas", "gpt-4.1", "2.00", "0.50", "8.00",
     "Para análises mais exigentes", False),
    ("Equilibrado", "gpt-4.1-mini", "0.40", "0.10", "1.60",
     "Bom compromisso entre custo e capacidade", True),
    ("Alto volume", "gpt-4o-mini", "0.15", "0.075", "0.60",
     "Perguntas e análises simples, muitas por dia", False),
]


def upgrade() -> None:
    op.create_table(
        "ia_modelos",
        sa.Column("id", sa.UUID(), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("modelo_id", sa.String(120), nullable=False, unique=True),
        sa.Column("preco_entrada", sa.Numeric(12, 6), nullable=False),
        sa.Column("preco_entrada_cache", sa.Numeric(12, 6)),
        sa.Column("preco_saida", sa.Numeric(12, 6), nullable=False),
        sa.Column("nota", sa.String(160)),
        sa.Column("ativo", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("padrao", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # Nula, como em todas as outras tabelas: o ORM só a escreve quando há
        # uma actualização, e uma coluna NOT NULL recusava o INSERT inicial.
        sa.Column("atualizado_em", sa.DateTime(timezone=True)),
    )
    # Um só padrão. Um índice parcial diz exactamente isto e é o servidor a
    # garanti-lo; uma verificação em Python perdia a corrida entre dois pedidos.
    op.create_index(
        "ux_ia_modelos_padrao",
        "ia_modelos",
        ["padrao"],
        unique=True,
        postgresql_where=sa.text("padrao"),
    )

    # `bulk_insert` e não SQL em texto: os preços são `Decimal` e precisam de
    # ir com o tipo declarado. Passados como texto num `text()`, o servidor
    # recebia-os como VARCHAR e recusava-os.
    tabela = sa.table(
        "ia_modelos",
        sa.column("nome", sa.String),
        sa.column("modelo_id", sa.String),
        sa.column("preco_entrada", sa.Numeric),
        sa.column("preco_entrada_cache", sa.Numeric),
        sa.column("preco_saida", sa.Numeric),
        sa.column("nota", sa.String),
        sa.column("ativo", sa.Boolean),
        sa.column("padrao", sa.Boolean),
    )
    op.bulk_insert(
        tabela,
        [
            {
                "nome": nome,
                "modelo_id": modelo_id,
                "preco_entrada": Decimal(entrada),
                "preco_entrada_cache": Decimal(cache),
                "preco_saida": Decimal(saida),
                "nota": nota,
                "ativo": True,
                "padrao": padrao,
            }
            for nome, modelo_id, entrada, cache, saida, nota, padrao in SEMENTE
        ],
    )

    op.add_column("ia_consultas", sa.Column("tokens_entrada_cache", sa.Integer()))
    op.add_column(
        "ia_consultas", sa.Column("preco_entrada_cache", sa.Numeric(12, 6))
    )

    op.drop_column("config_plataforma", "modelo_ia")


def downgrade() -> None:
    op.add_column("config_plataforma", sa.Column("modelo_ia", sa.String(80)))
    op.drop_column("ia_consultas", "preco_entrada_cache")
    op.drop_column("ia_consultas", "tokens_entrada_cache")
    op.drop_index("ux_ia_modelos_padrao", table_name="ia_modelos")
    op.drop_table("ia_modelos")
