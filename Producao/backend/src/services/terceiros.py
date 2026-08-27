"""Consultas sobre terceiros que mais do que uma área precisa.

A tabela de fornecedores era uma função dentro do router da Logística, e por
isso ficava atrás de `logistica.ver`. Mas quem regista um bem do imobilizado
também precisa de escolher a quem o comprou, e um contabilista não tem — nem
deve ter — acesso à Logística. A consulta passa a viver aqui e cada área
expõe-na com a sua própria permissão.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.db.models.terceiros import Terceiro


def tabela_de_fornecedores(
    db: Session, empresa_id: UUID, procura: str = "", limite: int = 50
) -> list[dict]:
    """Os fornecedores da empresa, no formato que o F4 lê."""
    q = select(Terceiro).where(
        Terceiro.empresa_id == empresa_id, Terceiro.tipo == "fornecedor"
    )
    if procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(
            or_(
                Terceiro.nome.ilike(termo),
                Terceiro.nif.ilike(termo),
                Terceiro.numero.ilike(termo),
            )
        )
    return [
        {
            "id": str(c.id),
            "codigo": c.numero or "",
            "nome": c.nome,
            "detalhe": " · ".join(x for x in (c.nif, c.pais) if x),
        }
        for c in db.scalars(q.order_by(Terceiro.numero).limit(limite)).all()
    ]
