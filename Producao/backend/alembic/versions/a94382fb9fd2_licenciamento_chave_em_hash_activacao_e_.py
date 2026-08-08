"""licenciamento: chave em hash, activacao e codigo da empresa

Revision ID: a94382fb9fd2
Revises: 9f38a0570ea5
Create Date: 2026-08-08 13:24:24.544935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a94382fb9fd2'
down_revision: Union[str, Sequence[str], None] = '9f38a0570ea5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def _preencher(conn) -> None:
    """Dá valor às colunas novas nas linhas que já existem."""
    import hashlib
    import re
    import unicodedata
    from datetime import datetime, timedelta, timezone

    # ---- Código da empresa: iniciais do nome + sequência ----
    ignorar = {"de", "da", "do", "das", "dos", "e", "lda", "sa", "sarl", "ei", "eirl"}
    usados: set[str] = set()
    empresas = conn.execute(sa.text("SELECT id, nome FROM empresas ORDER BY criado_em")).fetchall()
    for eid, nome in empresas:
        sem_acentos = unicodedata.normalize("NFKD", nome or "")
        limpo = "".join(c for c in sem_acentos if not unicodedata.combining(c))
        palavras = [p for p in re.findall(r"[A-Za-z]+", limpo) if p.lower() not in ignorar]
        base = "".join(p[0].upper() for p in palavras[:3]) or "EMP"
        n = 1
        while f"{base}{n:03d}" in usados:
            n += 1
        codigo = f"{base}{n:03d}"
        usados.add(codigo)
        conn.execute(
            sa.text("UPDATE empresas SET codigo = :c WHERE id = :i"),
            {"c": codigo, "i": eid},
        )

    # ---- Licenças ----
    agora = datetime.now(timezone.utc)
    linhas = conn.execute(sa.text(
        "SELECT l.id, l.chave, l.titular, e.nif, e.nome "
        "FROM licencas l LEFT JOIN empresas e ON e.id = l.empresa_id"
    )).fetchall()
    for lid, chave, titular, nif, nome in linhas:
        limpa = re.sub(r"[^A-Za-z0-9]", "", chave or "").upper()
        conn.execute(
            sa.text(
                "UPDATE licencas SET chave_hash = :h, chave_prefixo = :p, "
                "nif_previsto = :nif, nome_previsto = :nome, "
                "expira_activacao = :exp, activada_em = COALESCE(activada_em, :act) "
                "WHERE id = :i"
            ),
            {
                "h": hashlib.sha256(limpa.encode("ascii", "ignore")).hexdigest(),
                "p": (chave or "")[:8],
                "nif": nif or "000000000",
                "nome": nome or titular or "Empresa",
                # Já activadas: o prazo de activação não se aplica, mas a coluna
                # é obrigatória. Fica no passado, coerente com o que aconteceu.
                "exp": agora - timedelta(days=1) if nif else agora + timedelta(days=7),
                "act": agora if nif else None,
                "i": lid,
            },
        )


def upgrade() -> None:
    """Upgrade schema.

    As colunas novas são obrigatórias, e há linhas na base. Por isso entram
    NULÁVEIS, são preenchidas, e só então recebem a restrição — a ordem
    inversa rebentaria em qualquer base que já tenha empresas.

    O preenchimento das licenças existentes usa o hash da chave que lá está.
    A chave em claro nunca mais é recuperável a partir daqui, que é
    precisamente o objectivo desta migração; as licenças já activadas não
    precisam dela, e as pendentes têm de ser regeradas.
    """
    op.drop_index(op.f('ix_pedidos_licenca_estado'), table_name='pedidos_licenca')
    op.drop_index(op.f('ix_pedidos_licenca_nif'), table_name='pedidos_licenca')
    op.drop_table('pedidos_licenca')

    op.add_column('empresas', sa.Column('codigo', sa.String(length=12), nullable=True))
    op.add_column('licencas', sa.Column('chave_hash', sa.String(length=64), nullable=True))
    op.add_column('licencas', sa.Column('chave_prefixo', sa.String(length=16), nullable=True))
    op.add_column('licencas', sa.Column('nif_previsto', sa.String(length=20), nullable=True))
    op.add_column('licencas', sa.Column('nome_previsto', sa.String(length=200), nullable=True))
    op.add_column('licencas', sa.Column('duracao_meses', sa.Integer(), nullable=True))
    op.add_column('licencas', sa.Column('expira_activacao', sa.DateTime(timezone=True), nullable=True))
    op.add_column('licencas', sa.Column('activada_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('licencas', sa.Column('limite_tokens_mes', sa.Integer(), nullable=True))
    op.add_column('licencas', sa.Column('limite_custo_mes', sa.Numeric(precision=12, scale=4), nullable=True))
    op.add_column('licencas', sa.Column('criada_por_id', sa.Uuid(), nullable=True))
    op.alter_column('licencas', 'empresa_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.drop_index(op.f('ix_licencas_chave'), table_name='licencas')
    op.create_index(op.f('ix_licencas_chave_hash'), 'licencas', ['chave_hash'], unique=True)
    op.create_index(op.f('ix_licencas_expira_activacao'), 'licencas', ['expira_activacao'], unique=False)
    op.create_index(op.f('ix_licencas_nif_previsto'), 'licencas', ['nif_previsto'], unique=False)
    op.drop_constraint(op.f('fk_licencas_aprovada_por_id_users'), 'licencas', type_='foreignkey')
    op.create_foreign_key(op.f('fk_licencas_criada_por_id_users'), 'licencas', 'users', ['criada_por_id'], ['id'], ondelete='SET NULL')
    _preencher(op.get_bind())

    op.create_index(op.f('ix_empresas_codigo'), 'empresas', ['codigo'], unique=True)
    op.alter_column('empresas', 'codigo', nullable=False)
    for coluna in ('chave_hash', 'chave_prefixo', 'nif_previsto',
                   'nome_previsto', 'expira_activacao'):
        op.alter_column('licencas', coluna, nullable=False)

    op.drop_column('licencas', 'chave')
    op.drop_column('licencas', 'aprovada_em')
    op.drop_column('licencas', 'aprovada_por_id')
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('licencas', sa.Column('aprovada_por_id', sa.UUID(), autoincrement=False, nullable=True))
    op.add_column('licencas', sa.Column('aprovada_em', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True))
    op.add_column('licencas', sa.Column('chave', sa.VARCHAR(length=64), autoincrement=False, nullable=False))
    op.drop_constraint(op.f('fk_licencas_criada_por_id_users'), 'licencas', type_='foreignkey')
    op.create_foreign_key(op.f('fk_licencas_aprovada_por_id_users'), 'licencas', 'users', ['aprovada_por_id'], ['id'], ondelete='SET NULL')
    op.drop_index(op.f('ix_licencas_nif_previsto'), table_name='licencas')
    op.drop_index(op.f('ix_licencas_expira_activacao'), table_name='licencas')
    op.drop_index(op.f('ix_licencas_chave_hash'), table_name='licencas')
    op.create_index(op.f('ix_licencas_chave'), 'licencas', ['chave'], unique=True)
    op.alter_column('licencas', 'empresa_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.drop_column('licencas', 'criada_por_id')
    op.drop_column('licencas', 'limite_custo_mes')
    op.drop_column('licencas', 'limite_tokens_mes')
    op.drop_column('licencas', 'activada_em')
    op.drop_column('licencas', 'expira_activacao')
    op.drop_column('licencas', 'duracao_meses')
    op.drop_column('licencas', 'nome_previsto')
    op.drop_column('licencas', 'nif_previsto')
    op.drop_column('licencas', 'chave_prefixo')
    op.drop_column('licencas', 'chave_hash')
    op.drop_index(op.f('ix_empresas_codigo'), table_name='empresas')
    op.drop_column('empresas', 'codigo')
    op.create_table('pedidos_licenca',
    sa.Column('nome_empresa', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
    sa.Column('nif', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('email_contacto', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
    sa.Column('telefone', sa.VARCHAR(length=40), autoincrement=False, nullable=True),
    sa.Column('responsavel', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
    sa.Column('plano_pretendido', sa.VARCHAR(length=60), autoincrement=False, nullable=True),
    sa.Column('mensagem', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('estado', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('decidido_por_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('decidido_em', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('motivo_recusa', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('criado_em', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.Column('atualizado_em', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['decidido_por_id'], ['users.id'], name=op.f('fk_pedidos_licenca_decidido_por_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('fk_pedidos_licenca_empresa_id_empresas'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_pedidos_licenca')),
    sa.UniqueConstraint('nif', 'estado', name=op.f('pedido_nif_estado'), postgresql_include=[], postgresql_nulls_not_distinct=False)
    )
    op.create_index(op.f('ix_pedidos_licenca_nif'), 'pedidos_licenca', ['nif'], unique=False)
    op.create_index(op.f('ix_pedidos_licenca_estado'), 'pedidos_licenca', ['estado'], unique=False)
    # ### end Alembic commands ###
