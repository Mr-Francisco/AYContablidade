"""Notificações internas.

Uma notificação nasce quando uma operação de um módulo deixa trabalho por
fazer noutro. É esse o critério, e é estreito de propósito: um sino que avisa
de tudo é desligado na primeira semana, e depois já não avisa do que importa.

TRÊS DECISÕES QUE ESTÃO NO MODELO:

**Destinatário por capacidade, não por perfil.** `contab.lancar` continua a
querer dizer a mesma coisa depois de alguém reorganizar os perfis; «quem é
contabilista» não. É a mesma razão pela qual as rotas se guardam por
capacidade.

**A leitura é por pessoa, numa tabela à parte.** Uma notificação dirigida a
uma capacidade é vista por várias pessoas, e cada uma lê-a a seu tempo.
Guardar «lida» na própria notificação obrigaria a escolher quem é que a lê por
todos.

**Resolvida não é o mesmo que lida, e nenhuma das duas apaga.** Uma
notificação fica no histórico para sempre. `resolvida_em` marca que a situação
que a originou deixou de existir — a factura foi contabilizada, o armazém foi
configurado. Lida só quer dizer que alguém a viu.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin


class Notificacao(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Um aviso de que há trabalho por fazer, dirigido a uma capacidade."""

    __tablename__ = "notificacoes"
    __table_args__ = (
        Index("ix_notif_empresa_criado", "empresa_id", "criado_em"),
        Index("ix_notif_chave", "empresa_id", "chave"),
    )

    #: Quem a deve ver: uma capacidade da matriz (`contab.lancar`, …).
    capacidade: Mapped[str] = mapped_column(String(40), nullable=False, index=True)

    #: O módulo onde a operação aconteceu — `comercial`, `logistica`, …
    origem: Mapped[str] = mapped_column(String(20), nullable=False)

    #: `aviso` (há coisa por corrigir) ou `info`.
    tipo: Mapped[str] = mapped_column(String(20), default="aviso", nullable=False)

    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)

    #: Para onde se vai resolver. Caminho da aplicação, não URL absoluto.
    ligacao: Mapped[str | None] = mapped_column(String(300))

    #: O que a originou, para lá voltar e para não a repetir.
    alvo_tipo: Mapped[str | None] = mapped_column(String(40))
    alvo_id: Mapped[UUID | None] = mapped_column()

    #: Identidade da SITUAÇÃO, não do acontecimento.
    #:
    #: «Não há armazém configurado» é uma situação, e enquanto durar não deve
    #: gerar uma notificação por cada factura emitida. A chave é o que permite
    #: reconhecer que já se avisou disto — ver `notificar()`.
    chave: Mapped[str] = mapped_column(String(200), nullable=False)

    #: A situação que a originou deixou de existir. NÃO apaga a notificação.
    resolvida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<Notificacao {self.capacidade} {self.chave}>"


class NotificacaoLida(UUIDMixin, TimestampMixin, Base):
    """Quem já viu qual notificação.

    Numa tabela à parte porque a notificação é para uma capacidade e não para
    uma pessoa: cinco pessoas com `contab.lancar` vêem a mesma, e cada uma
    marca a sua a seu tempo.
    """

    __tablename__ = "notificacoes_lidas"
    __table_args__ = (
        UniqueConstraint("notificacao_id", "user_id", name="uq_notif_lida"),
    )

    notificacao_id: Mapped[UUID] = mapped_column(
        ForeignKey("notificacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
