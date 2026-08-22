"""Notificações internas — leitura e marcação.

Nota: NÃO usar `from __future__ import annotations` — slowapi.

Não há rota para CRIAR uma notificação, e é de propósito: uma notificação é
consequência de uma operação, não um pedido. Nascem nos serviços, dentro da
transacção da operação que as originou.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual
from src.api.paginacao import LIMITE_OMISSAO
from src.services import notificacoes as svc

router = APIRouter(prefix="/api/notificacoes", tags=["notificações"])


@router.get("")
def listar(
    empresa: EmpresaAtual,
    quem: UtilizadorAtual,
    db: DB,
    apenas_por_resolver: bool = False,
    origem: str | None = None,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
) -> dict:
    """As notificações desta pessoa, e quantas tem por ler.

    Vêm por capacidade: quem tem `contab.lancar` vê as da contabilidade. As já
    resolvidas continuam na lista — o histórico não se apaga — mas não contam
    para o sino.

    `origem` filtra por módulo, no servidor. Filtrar no cliente só filtrava a
    página carregada: com o histórico paginado, escolher «Comercial» devolvia
    as comerciais das últimas vinte e cinco e mais nenhumas.
    """
    p = svc.listar(
        db, empresa_id=empresa.id, utilizador=quem,
        apenas_por_resolver=apenas_por_resolver, origem=origem,
        offset=offset, limite=limite,
    )
    return {
        **p,
        "por_ler": svc.contar_por_ler(
            db, empresa_id=empresa.id, utilizador=quem
        ),
        # As contagens vão sobre TODAS as notificações, não sobre a página —
        # é o que permite ao filtro dizer quantas há em cada módulo.
        "por_origem": svc.contar_por_origem(
            db, empresa_id=empresa.id, utilizador=quem
        ),
    }


@router.post("/{notificacao_id}/lida", status_code=status.HTTP_204_NO_CONTENT)
def marcar_lida(
    notificacao_id: UUID, empresa: EmpresaAtual, quem: UtilizadorAtual, db: DB
) -> None:
    if not svc.marcar_lida(
        db, empresa_id=empresa.id, utilizador=quem, notificacao_id=notificacao_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notificação não encontrada.")
    db.commit()


@router.delete("/{notificacao_id}/lida", status_code=status.HTTP_204_NO_CONTENT)
def marcar_nao_lida(
    notificacao_id: UUID, empresa: EmpresaAtual, quem: UtilizadorAtual, db: DB
) -> None:
    """Volta a pôr como não lida. `DELETE` da marca de leitura, não da
    notificação — essa não se apaga."""
    if not svc.marcar_nao_lida(
        db, empresa_id=empresa.id, utilizador=quem, notificacao_id=notificacao_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notificação não encontrada.")
    db.commit()


@router.post("/lidas")
def marcar_todas_lidas(
    empresa: EmpresaAtual, quem: UtilizadorAtual, db: DB
) -> dict:
    n = svc.marcar_todas_lidas(db, empresa_id=empresa.id, utilizador=quem)
    db.commit()
    return {"marcadas": n}
