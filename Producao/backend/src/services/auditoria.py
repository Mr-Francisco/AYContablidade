"""Escrita e leitura do registo de auditoria.

A função `auditar()` é deliberadamente difícil de usar mal:

- filtra os campos sensíveis dos detalhes, mesmo que quem chama se distraia;
- nunca levanta excepção. Um registo de auditoria que falhe não pode fazer
  falhar a operação que estava a registar — o pior desfecho é perder-se um
  registo, e o melhor não é abortar uma aprovação de utilizador por causa dele.
"""

from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models.auditoria import RegistoAuditoria
from src.db.models.user import User

#: Chaves que nunca entram nos detalhes, mesmo que venham no que se passa. A
#: comparação é por SUBSTRING e em minúsculas, para apanhar `password_nova`,
#: `admin_password`, `chave_licenca` e companhia.
_PROIBIDAS = ("password", "senha", "chave", "token", "secret", "hash")


def _limpar(detalhes: dict | None) -> dict:
    """Remove dos detalhes tudo o que não deve ficar registado."""
    saida: dict = {}
    for chave, valor in (detalhes or {}).items():
        if any(p in str(chave).lower() for p in _PROIBIDAS):
            saida[chave] = "[removido]"
        elif isinstance(valor, dict):
            saida[chave] = _limpar(valor)
        else:
            saida[chave] = valor
    return saida


def auditar(
    db: Session,
    *,
    actor: User | None,
    accao: str,
    alvo_tipo: str | None = None,
    alvo_id: UUID | None = None,
    alvo_desc: str | None = None,
    empresa_id: UUID | None = None,
    detalhes: dict | None = None,
    request: Request | None = None,
) -> None:
    """Regista uma acção administrativa.

    Não faz commit — entra na transacção da operação que a originou, para que
    um registo não sobreviva a uma acção que foi revertida.
    """
    try:
        db.add(
            RegistoAuditoria(
                actor_id=actor.id if actor else None,
                actor_email=actor.email if actor else None,
                actor_nome=actor.nome if actor else None,
                actor_perfil=str(actor.perfil) if actor else None,
                accao=accao,
                alvo_tipo=alvo_tipo,
                alvo_id=alvo_id,
                alvo_desc=(alvo_desc or "")[:300] or None,
                empresa_id=empresa_id,
                detalhes=_limpar(detalhes),
                ip=_ip(request),
                user_agent=(request.headers.get("user-agent") if request else None),
            )
        )
    except Exception:  # noqa: BLE001
        # Ver o cabeçalho do módulo: perder um registo é mau, abortar a
        # operação que ele registava é pior.
        pass


def _ip(request: Request | None) -> str | None:
    """IP de quem fez o pedido, respeitando o proxy à frente da aplicação.

    O `X-Forwarded-For` traz a cadeia toda; o primeiro é o cliente original.
    Sem isto, todos os registos ficariam com o IP do proxy.
    """
    if request is None:
        return None
    encaminhado = request.headers.get("x-forwarded-for")
    if encaminhado:
        return encaminhado.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def listar(
    db: Session,
    *,
    empresa_id: UUID | None = None,
    accao: str | None = None,
    actor_id: UUID | None = None,
    limite: int = 200,
) -> list[RegistoAuditoria]:
    """Registos, do mais recente para o mais antigo.

    `empresa_id` filtra pela empresa AFECTADA. Quem chama é que decide se o
    passa: o superadministrador vê tudo, o administrador só a sua empresa — e
    essa decisão é do router, que sabe quem está a perguntar.
    """
    q = select(RegistoAuditoria)
    if empresa_id is not None:
        q = q.where(RegistoAuditoria.empresa_id == empresa_id)
    if accao:
        q = q.where(RegistoAuditoria.accao == accao)
    if actor_id is not None:
        q = q.where(RegistoAuditoria.actor_id == actor_id)
    return list(
        db.scalars(
            q.order_by(RegistoAuditoria.criado_em.desc()).limit(min(limite, 1000))
        ).all()
    )
