"""Facturação legal: séries, cadeia de hash e imposto por linha

O que a lei angolana exige de um documento de venda e a base não sabia guardar.

**SÉRIES** (`series_documento`). A série era um pedaço do número — o «2026» em
`FT 2026/0001`. Passa a ser uma entidade: a AGT regista séries (`solicitarSerie`,
`listarSeries`), o SAF-T identifica-as no `documentNo` (`FT FT2026S1/00001`), e
o Decreto Presidencial 71/25 exige numeração sequencial **por tipo de documento
e por ano fiscal** (art. 10.º b).

**CADEIA DE HASH** (`hash_doc`, `hash_anterior`, `hash_controlo`). Cada
documento leva o resumo do anterior da mesma série. Apagar ou alterar um
documento pelo meio parte a cadeia de forma detectável — é o que torna o SAF-T
auditável, e é o que o `codigo_validacao` que existia **não** fazia.

**IMPOSTO POR LINHA** (`taxa_codigo`, `taxa_perc`, `motivo_isencao`). O IVA era
um campo do documento. Uma factura com um serviço a 14% e um bem da cesta
básica a 5% não tinha como ser representada — e é um caso comum. O motivo de
isenção é obrigatório quando não se liquida imposto (art. 10.º f).

**ANULAÇÃO** (`estado_saft`, `anulado_em`, `motivo_anulacao`). Um documento
fiscal emitido não se apaga: marca-se como anulado e continua a constar do
ficheiro. `InvoiceStatus = "A"` no SAF-T.

Nada disto altera documentos existentes: tudo entra NULL ou com o valor por
omissão que corresponde ao comportamento actual (`estado_saft = "N"`,
`estado_agt = "por_comunicar"`).

Revision ID: c9f4a2b71d38
Revises: b8e2d5461fa9
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9f4a2b71d38"
down_revision: str | Sequence[str] | None = "b8e2d5461fa9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- Séries -----------------------------------------------------------
    op.create_table(
        "series_documento",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("empresa_id", sa.UUID(), nullable=False),
        sa.Column("tipo_doc", sa.String(4), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("sufixo", sa.String(10), server_default="1", nullable=False),
        sa.Column("codigo", sa.String(20), nullable=False),
        sa.Column("sequencia", sa.Integer(), server_default="0", nullable=False),
        sa.Column("estado", sa.String(20), server_default="activa", nullable=False),
        sa.Column("agt_id", sa.String(60), nullable=True),
        sa.Column("agt_registada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_hash", sa.String(200), nullable=True),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        # NULLABLE, como em todas as outras tabelas: o `TimestampMixin` só
        # preenche `atualizado_em` quando há uma alteração, e envia NULL
        # explícito na inserção — um NOT NULL aqui rebentava a criação da
        # primeira série.
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "codigo", name="serie_codigo"),
        sa.UniqueConstraint(
            "empresa_id", "tipo_doc", "ano", "sufixo", name="serie_tipo_ano"
        ),
    )
    op.create_index(
        "ix_series_documento_empresa_id", "series_documento", ["empresa_id"]
    )

    # ---- Documento --------------------------------------------------------
    for nome, tipo in [
        ("serie_id", sa.UUID()),
        ("sequencia", sa.Integer()),
        ("hash_doc", sa.String(200)),
        ("hash_anterior", sa.String(200)),
        ("hash_controlo", sa.String(8)),
        ("anulado_em", sa.DateTime(timezone=True)),
        ("motivo_anulacao", sa.String(200)),
        ("entrada_sistema", sa.DateTime(timezone=True)),
        ("local_operacao", sa.String(200)),
        ("cliente_pais", sa.String(2)),
        ("agt_request_id", sa.String(80)),
        ("agt_submetido_em", sa.DateTime(timezone=True)),
        ("agt_mensagem", sa.Text()),
    ]:
        op.add_column("vendas", sa.Column(nome, tipo, nullable=True))

    # Estes dois são NOT NULL: todo o documento tem um estado, e o estado de
    # todos os que já existem é «normal, por comunicar».
    op.add_column(
        "vendas",
        sa.Column("estado_saft", sa.String(1), server_default="N", nullable=False),
    )
    op.add_column(
        "vendas",
        sa.Column(
            "estado_agt", sa.String(20),
            server_default="por_comunicar", nullable=False,
        ),
    )
    op.create_index("ix_vendas_serie_id", "vendas", ["serie_id"])
    op.create_index("ix_vendas_estado_agt", "vendas", ["estado_agt"])
    op.create_foreign_key(
        "fk_vendas_serie", "vendas", "series_documento", ["serie_id"], ["id"],
        ondelete="RESTRICT",
    )

    # ---- Linha ------------------------------------------------------------
    op.add_column("venda_linhas", sa.Column("taxa_codigo", sa.String(10), nullable=True))
    op.add_column("venda_linhas", sa.Column("taxa_perc", sa.Numeric(6, 2), nullable=True))
    op.add_column(
        "venda_linhas", sa.Column("motivo_isencao", sa.String(200), nullable=True)
    )


def downgrade() -> None:
    for c in ("motivo_isencao", "taxa_perc", "taxa_codigo"):
        op.drop_column("venda_linhas", c)

    op.drop_constraint("fk_vendas_serie", "vendas", type_="foreignkey")
    op.drop_index("ix_vendas_estado_agt", table_name="vendas")
    op.drop_index("ix_vendas_serie_id", table_name="vendas")
    for c in (
        "estado_agt", "estado_saft", "agt_mensagem", "agt_submetido_em",
        "agt_request_id", "cliente_pais", "local_operacao", "entrada_sistema",
        "motivo_anulacao", "anulado_em", "hash_controlo", "hash_anterior",
        "hash_doc", "sequencia", "serie_id",
    ):
        op.drop_column("vendas", c)

    op.drop_index("ix_series_documento_empresa_id", table_name="series_documento")
    op.drop_table("series_documento")
