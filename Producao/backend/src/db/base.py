"""Camada de dados: base declarativa, sessão e mixins partilhados."""

from collections.abc import Generator
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, MetaData, create_engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    declared_attr,
    mapped_column,
    sessionmaker,
)

from src.core.config import get_settings

# Convenção de nomes explícita: sem ela o Alembic gera nomes anónimos para
# constraints e os autogenerate seguintes não conseguem alterá-las.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def agora() -> datetime:
    """Instante actual em UTC, com fuso explícito."""
    return datetime.now(UTC)


class UUIDMixin:
    """Chave primária UUID gerada pela aplicação."""

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class TimestampMixin:
    """Datas de criação e actualização (criadoEm/atualizadoEm no Piloto)."""

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=agora, nullable=False
    )
    atualizado_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=agora, nullable=True
    )


class EmpresaScopedMixin:
    """Isolamento multiempresa.

    Toda a tabela de dados de negócio herda daqui. Nenhuma consulta a uma destas
    tabelas pode correr sem filtro por `empresa_id` — ver
    `docs/TENANCY_AND_ACCESS.md`: «Um utilizador de uma empresa nunca deve
    conseguir visualizar ou aceder aos dados de outra empresa.»
    """

    @declared_attr
    @classmethod
    def empresa_id(cls) -> Mapped[UUID]:
        return mapped_column(
            ForeignKey("empresas.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )


# ---------------------------------------------------------------------------
# Motor e sessão
# ---------------------------------------------------------------------------
_settings = get_settings()

engine = create_engine(
    str(_settings.DATABASE_URL),
    pool_pre_ping=True,  # recicla ligações mortas em vez de rebentar no primeiro pedido
    echo=_settings.AMBIENTE == "dev",
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Dependência FastAPI: uma sessão por pedido."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
