"""Configuração do segundo factor pelo próprio utilizador.

Etapa 2 de 6. Aqui trata-se só de LIGAR e DESLIGAR o 2FA numa conta. O login
ainda não pede código nenhum — isso é a etapa 3. Quem activar o 2FA agora vê o
estado mudar mas continua a entrar como antes; nada fica meio-partido pelo meio.

A DECISÃO QUE GOVERNA ESTE FICHEIRO: o segredo é gravado quando a configuração
começa, mas `totp_ativo` só passa a verdadeiro **depois** de o utilizador provar
que o conseguiu ler, escrevendo um código. Se activássemos logo, quem começasse
a configuração e fechasse a janela — ou lesse mal o QR — ficava fora da conta no
login seguinte, sem nunca ter tido um código que funcionasse.

Nota: NÃO usar `from __future__ import annotations` — o `@limiter.limit` do
slowapi rebenta com anotações adiadas (docs/LESSONS.md).
"""

from fastapi import APIRouter, HTTPException, Request, status

from src.api.deps import DB, UtilizadorAtual
from src.api.limites import LIMITE_LOGIN, limiter
from src.auth import totp
from src.auth.security import verificar_password
from src.core.constants import Perfil
from src.db.base import agora
from src.db.schemas.auth import (
    TotpConfirmarPedido,
    TotpConfirmarResposta,
    TotpDesactivarPedido,
    TotpEstado,
    TotpInicioResposta,
)
from src.services.auditoria import auditar

router = APIRouter(prefix="/api/auth/2fa", tags=["autenticação"])


def _obrigatorio(user) -> bool:
    """Perfis que não podem desligar o segundo factor.

    O superadmin administra toda a plataforma: a conta dele vale todas as
    empresas juntas. Por enquanto isto só impede a DESACTIVAÇÃO — obrigar à
    activação no login é a etapa 6.
    """
    return str(user.perfil) == Perfil.SUPERADMIN


def _estado(user) -> TotpEstado:
    return TotpEstado(
        ativo=user.totp_ativo,
        ativado_em=user.totp_ativado_em,
        codigos_por_usar=len(user.totp_codigos_recuperacao or []),
        obrigatorio=_obrigatorio(user),
    )


@router.get("", response_model=TotpEstado)
def estado(user: UtilizadorAtual) -> TotpEstado:
    """Estado do 2FA da própria conta. Nunca devolve o segredo."""
    return _estado(user)


@router.post("/iniciar", response_model=TotpInicioResposta)
@limiter.limit(LIMITE_LOGIN)
def iniciar(request: Request, user: UtilizadorAtual, db: DB) -> TotpInicioResposta:
    """Gera um segredo novo e devolve o QR para a aplicação autenticadora.

    Chamar isto outra vez ANTES de confirmar gera um segredo novo e deita o
    anterior fora. É de propósito: quem recomeça a configuração — porque
    trocou de telemóvel a meio, ou porque a primeira leitura correu mal —
    espera começar do zero, e um segredo abandonado não deve ficar gravado.

    Depois de o 2FA estar confirmado, esta rota recusa. Regenerar o segredo de
    uma conta já protegida seria uma forma de contornar o segundo factor a
    partir de uma sessão aberta.
    """
    if user.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "O segundo factor já está activo nesta conta. Para o reconfigurar, "
            "desactive-o primeiro.",
        )

    try:
        segredo = totp.gerar_segredo()
        user.totp_segredo = totp.cifrar_segredo(segredo)
    except totp.ErroTotp as e:
        # Sem chave de cifra, o servidor recusa em vez de guardar o segredo em
        # claro. A mensagem diz o que falta configurar.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e

    # Limpa o que possa ter sobrado de uma configuração anterior por confirmar.
    user.totp_ultimo_contador = None
    user.totp_codigos_recuperacao = []
    db.commit()

    uri = totp.uri_otpauth(segredo, user.email)
    return TotpInicioResposta(qr_svg=totp.qr_svg(uri), segredo=segredo, uri=uri)


@router.post("/confirmar", response_model=TotpConfirmarResposta)
@limiter.limit(LIMITE_LOGIN)
def confirmar(
    request: Request, dados: TotpConfirmarPedido, user: UtilizadorAtual, db: DB
) -> TotpConfirmarResposta:
    """Confirma a configuração com um código e activa o 2FA.

    Só aqui é que `totp_ativo` passa a verdadeiro: o código provado significa
    que o utilizador tem mesmo o segredo do outro lado.

    Devolve os códigos de recuperação — a **única** vez que são visíveis. Ficam
    guardados em hash, e nem o servidor os consegue mostrar de novo.
    """
    if user.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "O segundo factor já está activo nesta conta."
        )
    if not user.totp_segredo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ainda não há nenhuma configuração por confirmar. Comece por gerar "
            "o código QR.",
        )

    try:
        segredo = totp.decifrar_segredo(user.totp_segredo)
    except totp.ErroTotp as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e

    valido, contador = totp.verificar_codigo(segredo, dados.codigo)
    if not valido:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O código não está correcto. Confirme que está a ler o código mais "
            "recente da aplicação e que a hora do telemóvel está certa.",
        )

    codigos = totp.gerar_codigos_recuperacao()
    user.totp_codigos_recuperacao = [totp.hash_codigo(c) for c in codigos]
    user.totp_ativo = True
    user.totp_ativado_em = agora()
    # Grava o contador que acabou de validar: este código já não serve outra vez.
    user.totp_ultimo_contador = contador
    user.totp_falhas = 0
    user.totp_bloqueado_ate = None

    auditar(
        db,
        actor=user,
        accao="2fa.activar",
        alvo_tipo="utilizador",
        alvo_id=user.id,
        alvo_desc=user.nome,
        empresa_id=user.empresa_id,
        request=request,
    )
    db.commit()
    return TotpConfirmarResposta(codigos_recuperacao=codigos)


@router.post("/desactivar", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(LIMITE_LOGIN)
def desactivar(
    request: Request, dados: TotpDesactivarPedido, user: UtilizadorAtual, db: DB
) -> None:
    """Desliga o 2FA. Exige a palavra-passe.

    Sem a palavra-passe, um ecrã deixado aberto bastava para retirar o segundo
    factor — o cenário exacto contra o qual ele existe. Apaga também o segredo:
    voltar a ligar obriga a uma configuração nova, para que um segredo que
    possa ter sido copiado não continue a valer.
    """
    if _obrigatorio(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "O segundo factor é obrigatório nas contas de administração da "
            "plataforma e não pode ser desactivado.",
        )
    if not verificar_password(dados.password, user.password_hash):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "A palavra-passe não está correcta."
        )
    if not user.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "O segundo factor não está activo nesta conta."
        )

    user.totp_ativo = False
    user.totp_segredo = None
    user.totp_ativado_em = None
    user.totp_ultimo_contador = None
    user.totp_codigos_recuperacao = []
    user.totp_falhas = 0
    user.totp_bloqueado_ate = None

    auditar(
        db,
        actor=user,
        accao="2fa.desactivar",
        alvo_tipo="utilizador",
        alvo_id=user.id,
        alvo_desc=user.nome,
        empresa_id=user.empresa_id,
        request=request,
    )
    db.commit()


@router.post("/codigos", response_model=TotpConfirmarResposta)
@limiter.limit(LIMITE_LOGIN)
def regenerar_codigos(
    request: Request, dados: TotpDesactivarPedido, user: UtilizadorAtual, db: DB
) -> TotpConfirmarResposta:
    """Gera códigos de recuperação novos, invalidando os anteriores.

    Serve para quem perdeu o papel onde os guardou, ou já gastou quase todos.
    Exige a palavra-passe pela mesma razão que a desactivação: são a chave de
    entrada quando o telemóvel falta.
    """
    if not verificar_password(dados.password, user.password_hash):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "A palavra-passe não está correcta."
        )
    if not user.totp_ativo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Os códigos de recuperação só existem com o segundo factor activo.",
        )

    codigos = totp.gerar_codigos_recuperacao()
    user.totp_codigos_recuperacao = [totp.hash_codigo(c) for c in codigos]

    auditar(
        db,
        actor=user,
        accao="2fa.codigos",
        alvo_tipo="utilizador",
        alvo_id=user.id,
        alvo_desc=user.nome,
        empresa_id=user.empresa_id,
        request=request,
    )
    db.commit()
    return TotpConfirmarResposta(codigos_recuperacao=codigos)
