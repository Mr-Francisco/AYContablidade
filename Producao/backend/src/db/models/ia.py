"""Registo das consultas ao módulo de IA.

Existe por duas razões, e a segunda é a mais importante:

1. Histórico para o utilizador reencontrar respostas.
2. PROVA. `dados_enviados` guarda exactamente o pacote que saiu para a API
   externa — já pseudonimizado e sem identificadores. Sem este registo não há
   forma de demonstrar, mais tarde, que nenhum dado pessoal foi enviado.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin


class ConsultaIA(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "ia_consultas"

    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    pergunta: Mapped[str] = mapped_column(Text, nullable=False)
    # {"ambitos": [...], "exercicio_id": ..., "de": ..., "ate": ..., "mes": ...}
    contexto: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # O pacote exacto que foi enviado para a API externa.
    dados_enviados: Mapped[dict | None] = mapped_column(JSONB)
    # Quantas entidades foram pseudonimizadas neste pedido.
    entidades_pseudonimizadas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    resposta: Mapped[str | None] = mapped_column(Text)
    modelo: Mapped[str | None] = mapped_column(String(80))
    tokens_entrada: Mapped[int | None] = mapped_column(Integer)
    tokens_saida: Mapped[int | None] = mapped_column(Integer)
    # Custo ESTIMADO em dólares, calculado dos tokens pela tabela de preços de
    # `services/ia/consumo.py`. Fica gravado no momento da consulta, e não
    # recalculado depois: se a tabela de preços mudar, o histórico tem de
    # continuar a dizer o que a consulta custou na altura.
    custo: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    duracao_ms: Mapped[int | None] = mapped_column(Integer)
    erro: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<ConsultaIA {self.criado_em} {self.pergunta[:40]!r}>"
