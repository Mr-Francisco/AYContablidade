"""Modelos SQLAlchemy.

Todos os modelos têm de ser importados aqui: o `alembic revision --autogenerate`
só detecta as tabelas que estiverem registadas no `Base.metadata`, e um modelo
que ninguém importe fica invisível para as migrações.
"""

from src.db.base import Base
from src.db.models.tenancy import (
    ConfigEmpresa,
    Empresa,
    Exercicio,
    Licenca,
    PedidoLicenca,
)
from src.db.models.user import User

__all__ = [
    "Base",
    "ConfigEmpresa",
    "Empresa",
    "Exercicio",
    "Licenca",
    "PedidoLicenca",
    "User",
]
