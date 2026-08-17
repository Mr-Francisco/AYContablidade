"""Código de actividade económica (EAC) da empresa

Cinco dígitos que vão no cabeçalho do SAF-T e em cada documento comunicado à
AGT (`eacCode`). Sem eles a comunicação é rejeitada.

Fica NULL nas empresas existentes: é um dado que se pede à empresa, e não algo
que se possa adivinhar. O ecrã de configurações avisa quando falta.

Revision ID: d1a7c3e95b46
Revises: c9f4a2b71d38
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d1a7c3e95b46"
down_revision: str | Sequence[str] | None = "c9f4a2b71d38"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("empresas", sa.Column("eac", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("empresas", "eac")
