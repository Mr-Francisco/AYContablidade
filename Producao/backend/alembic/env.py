"""Ambiente do Alembic.

A URL da base de dados vem sempre das definições (`.env`), nunca do
`alembic.ini` — o `alembic.ini` é versionado e não pode conter segredos (Regra 6).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.core.config import get_settings

# Importar o pacote de modelos regista todas as tabelas no metadata. Sem isto o
# autogenerate produz migrações vazias.
from src.db.base import url_do_motor
from src.db.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Injecta a URL real, escapando '%' para o interpolador do ConfigParser não
# se enganar com passwords que o contenham.
# `url_do_motor` para as migrações correrem com a mesma URL da aplicação: os
# alojamentos dão `postgresql://` e sem o condutor `psycopg` o Alembic falha no
# arranque — no sítio mais aborrecido possível, a meio de uma instalação nova.
config.set_main_option(
    "sqlalchemy.url",
    url_do_motor(str(get_settings().DATABASE_URL)).replace("%", "%%"),
)


def run_migrations_offline() -> None:
    """Gera SQL sem ligar à base de dados."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Corre as migrações contra a base de dados."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Sem estes dois, alterações de tipo e de default passam despercebidas
            # ao autogenerate e o esquema real diverge dos modelos em silêncio.
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
