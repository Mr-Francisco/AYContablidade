"""Emitir e ler notificações internas.

Uma notificação nasce quando uma operação de um módulo deixa trabalho por
fazer noutro. Nunca de uma operação que correu bem — o trabalho normal não se
notifica, ou o sino enche-se e as que importam deixam de ser vistas.

## O contrato do `notificar()`

**Nasce dentro da transacção da operação.** Não faz `commit`. Se a operação
reverter, a notificação reverte com ela — uma notificação de uma coisa que não
aconteceu é pior do que nenhuma.

**Nunca levanta.** Se a criação falhar, regista no log e devolve `None`. A
operação é que manda; a notificação é sobre ela, e não vale desfazer uma
factura porque não se conseguiu avisar ninguém.

**Não repete a mesma situação.** A `chave` identifica a SITUAÇÃO e não o
acontecimento: enquanto «não há armazém configurado» durar, há uma notificação
e não uma por cada factura emitida. Uma chave por documento (`venda:{id}`)
distingue documentos; uma chave global (`sem-armazem`) agrupa.

**Não apaga nada.** `resolver()` marca `resolvida_em` e a notificação fica no
histórico. Lida é outra coisa: quer dizer que alguém a viu.
"""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.base import agora
from src.db.models.notificacoes import Notificacao, NotificacaoLida
from src.db.models.user import User

log = logging.getLogger(__name__)


def notificar(
    db: Session,
    *,
    empresa_id: UUID,
    capacidade: str,
    origem: str,
    chave: str,
    titulo: str,
    texto: str,
    ligacao: str | None = None,
    alvo_tipo: str | None = None,
    alvo_id: UUID | None = None,
    tipo: str = "aviso",
) -> Notificacao | None:
    """Cria uma notificação, se ainda não houver uma por resolver com a mesma
    chave. Devolve `None` se falhar — e não levanta."""
    try:
        existente = db.scalar(
            select(Notificacao).where(
                Notificacao.empresa_id == empresa_id,
                Notificacao.chave == chave,
                Notificacao.resolvida_em.is_(None),
            )
        )
        if existente is not None:
            # Já se avisou disto e ainda não foi resolvido. Actualiza-se o
            # texto — o motivo pode ter mudado — mas não se cria outra, nem se
            # marca como não lida outra vez: quem já a viu não precisa de a ver
            # de novo por causa da segunda factura com o mesmo problema.
            existente.texto = texto
            return existente

        n = Notificacao(
            empresa_id=empresa_id, capacidade=capacidade, origem=origem,
            chave=chave, titulo=titulo, texto=texto, ligacao=ligacao,
            alvo_tipo=alvo_tipo, alvo_id=alvo_id, tipo=tipo,
        )
        db.add(n)
        db.flush()
        return n
    except Exception:  # noqa: BLE001 — ver o contrato no topo do módulo
        log.exception(
            "Falhou a criar a notificação %s da empresa %s", chave, empresa_id
        )
        return None


def resolver(db: Session, *, empresa_id: UUID, chave: str) -> int:
    """Marca como resolvidas as notificações com esta chave. NÃO as apaga.

    Devolve quantas marcou. Chamar quando a situação deixa de se verificar —
    a factura foi contabilizada, o armazém foi configurado.
    """
    try:
        pendentes = db.scalars(
            select(Notificacao).where(
                Notificacao.empresa_id == empresa_id,
                Notificacao.chave == chave,
                Notificacao.resolvida_em.is_(None),
            )
        ).all()
        for n in pendentes:
            n.resolvida_em = agora()
        db.flush()
        return len(pendentes)
    except Exception:  # noqa: BLE001
        log.exception("Falhou a resolver a notificação %s", chave)
        return 0


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------
def _capacidades(utilizador: User) -> set[str]:
    """As capacidades efectivas desta pessoa — perfil mais extras."""
    from src.core.constants import CAPS

    return set(CAPS.get(utilizador.perfil, ())) | set(
        utilizador.permissoes_extra or []
    )


def _ve_tudo(utilizador: User) -> bool:
    """O administrador e o superadministrador têm `*` — todas as capacidades.

    Sem isto, quem pode tudo não via NADA: o filtro comparava `contab.lancar`
    com o conjunto `{"*"}` e não encontrava. O administrador da empresa é
    justamente quem tem de saber que ficou trabalho por fazer em qualquer
    módulo.
    """
    return "*" in _capacidades(utilizador)


def _filtro_capacidade(utilizador: User):
    """Condição de visibilidade, ou `None` se vê tudo."""
    if _ve_tudo(utilizador):
        return None
    caps = _capacidades(utilizador)
    return Notificacao.capacidade.in_(caps) if caps else False


def listar(
    db: Session,
    *,
    empresa_id: UUID,
    utilizador: User,
    apenas_por_resolver: bool = False,
    offset: int = 0,
    limite: int = 25,
) -> dict:
    """Uma página de notificações desta pessoa, mais recentes primeiro.

    Devolve `{linhas, total, offset, limite}`: o histórico nunca se apaga, por
    isso cresce para sempre e tem de ser paginado — ver a regra de listagens
    em `CLAUDE.md`.
    """
    filtro = _filtro_capacidade(utilizador)
    if filtro is False:
        return {"linhas": [], "total": 0, "offset": offset, "limite": limite}

    q = (
        select(Notificacao)
        .where(Notificacao.empresa_id == empresa_id)
        .order_by(Notificacao.criado_em.desc())
    )
    if filtro is not None:
        q = q.where(filtro)
    if apenas_por_resolver:
        q = q.where(Notificacao.resolvida_em.is_(None))

    total = db.scalar(
        select(func.count()).select_from(q.order_by(None).subquery())
    ) or 0
    notificacoes = db.scalars(q.offset(max(0, offset)).limit(limite)).all()
    if not notificacoes:
        return {"linhas": [], "total": total, "offset": offset, "limite": limite}

    lidas = set(
        db.scalars(
            select(NotificacaoLida.notificacao_id).where(
                NotificacaoLida.user_id == utilizador.id,
                NotificacaoLida.notificacao_id.in_([n.id for n in notificacoes]),
            )
        ).all()
    )

    return {
        "linhas": [
            {
                "id": n.id, "tipo": n.tipo, "origem": n.origem,
                "titulo": n.titulo, "texto": n.texto, "ligacao": n.ligacao,
                "criado_em": n.criado_em,
                "resolvida_em": n.resolvida_em,
                "lida": n.id in lidas,
            }
            for n in notificacoes
        ],
        "total": total,
        "offset": offset,
        "limite": limite,
    }


def contar_por_ler(db: Session, *, empresa_id: UUID, utilizador: User) -> int:
    """Quantas por ler — o número do sino.

    Conta as POR RESOLVER e por ler. Uma notificação já resolvida não devia
    puxar ninguém para um problema que já não existe; continua no histórico.
    """
    filtro = _filtro_capacidade(utilizador)
    if filtro is False:
        return 0

    lidas = select(NotificacaoLida.notificacao_id).where(
        NotificacaoLida.user_id == utilizador.id
    )
    q = (
        select(func.count())
        .select_from(Notificacao)
        .where(
            Notificacao.empresa_id == empresa_id,
            Notificacao.resolvida_em.is_(None),
            Notificacao.id.not_in(lidas),
        )
    )
    if filtro is not None:
        q = q.where(filtro)
    return db.scalar(q) or 0


def _pode_ver(utilizador: User, n: Notificacao) -> bool:
    return _ve_tudo(utilizador) or n.capacidade in _capacidades(utilizador)


def marcar_lida(
    db: Session, *, empresa_id: UUID, utilizador: User, notificacao_id: UUID
) -> bool:
    """Marca uma como lida. Idempotente."""
    n = db.scalar(
        select(Notificacao).where(
            Notificacao.id == notificacao_id,
            Notificacao.empresa_id == empresa_id,
        )
    )
    if n is None or not _pode_ver(utilizador, n):
        return False
    ja = db.scalar(
        select(NotificacaoLida).where(
            NotificacaoLida.notificacao_id == n.id,
            NotificacaoLida.user_id == utilizador.id,
        )
    )
    if ja is None:
        db.add(NotificacaoLida(notificacao_id=n.id, user_id=utilizador.id))
        db.flush()
    return True


def marcar_nao_lida(
    db: Session, *, empresa_id: UUID, utilizador: User, notificacao_id: UUID
) -> bool:
    """Volta a pôr como não lida — o utilizador pediu para as poder marcar nos
    dois sentidos."""
    n = db.scalar(
        select(Notificacao).where(
            Notificacao.id == notificacao_id,
            Notificacao.empresa_id == empresa_id,
        )
    )
    if n is None or not _pode_ver(utilizador, n):
        return False
    marca = db.scalar(
        select(NotificacaoLida).where(
            NotificacaoLida.notificacao_id == n.id,
            NotificacaoLida.user_id == utilizador.id,
        )
    )
    if marca is not None:
        db.delete(marca)
        db.flush()
    return True


def marcar_todas_lidas(db: Session, *, empresa_id: UUID, utilizador: User) -> int:
    """Marca como lidas todas as que esta pessoa vê e ainda não leu."""
    filtro = _filtro_capacidade(utilizador)
    if filtro is False:
        return 0

    lidas = select(NotificacaoLida.notificacao_id).where(
        NotificacaoLida.user_id == utilizador.id
    )
    q = select(Notificacao.id).where(
        Notificacao.empresa_id == empresa_id,
        Notificacao.id.not_in(lidas),
    )
    if filtro is not None:
        q = q.where(filtro)
    por_ler = db.scalars(q).all()
    for nid in por_ler:
        db.add(NotificacaoLida(notificacao_id=nid, user_id=utilizador.id))
    db.flush()
    return len(por_ler)
