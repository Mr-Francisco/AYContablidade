"""Registo de auditoria das acções administrativas.

Regista o que o superadministrador faz à plataforma e o que o administrador faz
à sua empresa: quem, o quê, sobre o quê, quando e a partir de onde.

NÃO é isolado por empresa como as tabelas de negócio, e é de propósito: um
registo do superadministrador não pertence a empresa nenhuma, e o `empresa_id`
é o ALVO da acção, não o dono da linha. Por isso não usa o `EmpresaScopedMixin`
— usá-lo faria a leitura ser filtrada pela empresa de quem consulta, e um
administrador deixaria de ver as acções que o superadministrador fez sobre a
empresa dele.

Só se escreve. Não há rota que altere nem apague um registo: um registo de
auditoria que se possa editar não serve para auditar nada.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, UUIDMixin, agora


class RegistoAuditoria(UUIDMixin, Base):
    """Uma acção administrativa, tal como aconteceu."""

    __tablename__ = "auditoria"

    #: Quem. Fica a NULO se a conta for apagada, mas o `actor_email` e o
    #: `actor_nome` continuam lá — apagar o utilizador não pode apagar o rasto
    #: do que ele fez.
    actor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    actor_email: Mapped[str | None] = mapped_column(String(200))
    actor_nome: Mapped[str | None] = mapped_column(String(200))
    actor_perfil: Mapped[str | None] = mapped_column(String(20))

    #: O quê. Verbo em minúsculas com o domínio à frente: «licenca.gerar»,
    #: «utilizador.aprovar», «empresa.actualizar».
    accao: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    #: Sobre o quê. O tipo e o identificador do objecto afectado.
    alvo_tipo: Mapped[str | None] = mapped_column(String(40))
    alvo_id: Mapped[UUID | None] = mapped_column(index=True)
    #: Descrição legível do alvo no momento da acção. Guardada porque o objecto
    #: pode ser apagado a seguir, e «licença SGD-A3F2 de Banco Empresarial» diz
    #: mais do que um UUID que já não resolve.
    alvo_desc: Mapped[str | None] = mapped_column(String(300))

    #: Empresa afectada, quando aplicável. É o ALVO, não o dono da linha.
    empresa_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), index=True
    )

    #: O que mudou. Nunca inclui palavras-passe nem chaves de licença — quem
    #: chama passa só o que é seguro registar, e `auditar()` filtra por cima.
    detalhes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)

    #: Só `criado_em`: um registo de auditoria não se actualiza, por isso não
    #: usa o `TimestampMixin` — ter um `atualizado_em` sugeriria que pode.
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=agora, nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"<Auditoria {self.accao} {self.alvo_desc or ''}>"
