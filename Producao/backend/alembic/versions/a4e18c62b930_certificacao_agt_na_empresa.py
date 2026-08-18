"""O número de certificação passa a ser da plataforma, não da empresa

Estava nas parametrizações comerciais (`parametrizacoes.com.software_validacao`),
onde qualquer administrador de empresa lhe podia mexer. Passa a uma coluna da
empresa, escrita só pelas rotas da plataforma.

A migração TRAZ CONSIGO o que já lá estava: quem tiver preenchido um número
real nas parametrizações não o perde. Só se copia o que tem formato válido
(`NNN/AGT/AAAA`) — o `0` por omissão fica a nulo, que quer dizer o mesmo e é
mais honesto na coluna nova.

Revision ID: a4e18c62b930
Revises: d1a7c3e95b46
"""

from alembic import op
import sqlalchemy as sa

revision = "a4e18c62b930"
down_revision = "d1a7c3e95b46"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable, como todas as outras colunas acrescentadas a tabelas com dados:
    # NOT NULL com `server_default` rebenta a primeira inserção.
    op.add_column("empresas", sa.Column("certificacao_agt", sa.String(30), nullable=True))

    # O que já existia nas parametrizações vem para cá. O `#>>` do Postgres lê
    # o texto no caminho dado, e o `~` compara com a expressão regular — que é
    # a mesma que o esquema do SAF-T impõe.
    op.execute(
        """
        UPDATE empresas e
           SET certificacao_agt = c.parametrizacoes #>> '{com,software_validacao}'
          FROM config_empresa c
         WHERE c.empresa_id = e.id
           AND c.parametrizacoes #>> '{com,software_validacao}' ~ '^[0-9]+/AGT/[0-9]{4}$'
        """
    )

    # E sai de onde estava, para não haver duas verdades. Se ficasse nos dois
    # sítios, mais tarde alguém leria a errada.
    op.execute(
        """
        UPDATE config_empresa
           SET parametrizacoes = jsonb_set(
                 parametrizacoes,
                 '{com}',
                 (parametrizacoes -> 'com') - 'software_validacao'
               )
         WHERE parametrizacoes -> 'com' ? 'software_validacao'
        """
    )


def downgrade() -> None:
    # O caminho de volta devolve o número às parametrizações, senão descer a
    # migração perdia-o.
    op.execute(
        """
        UPDATE config_empresa c
           SET parametrizacoes = jsonb_set(
                 COALESCE(c.parametrizacoes, '{}'::jsonb),
                 '{com,software_validacao}',
                 to_jsonb(e.certificacao_agt),
                 true
               )
          FROM empresas e
         WHERE e.id = c.empresa_id
           AND e.certificacao_agt IS NOT NULL
        """
    )
    op.drop_column("empresas", "certificacao_agt")
