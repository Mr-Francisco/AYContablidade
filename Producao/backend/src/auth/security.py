"""Palavras-passe e tokens JWT."""

import base64
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import bcrypt
import jwt

from src.core.config import get_settings
from src.db.base import agora


# ---------------------------------------------------------------------------
# Palavras-passe
# ---------------------------------------------------------------------------
def _preparar(password: str) -> bytes:
    """Normaliza a palavra-passe para o bcrypt.

    O bcrypt trunca silenciosamente tudo acima de 72 bytes — com acentos, uma
    frase-passe em português chega lá depressa, e duas palavras-passe diferentes
    passariam a dar o mesmo hash. Passar primeiro por SHA-256 e codificar em
    base64 dá sempre 44 bytes ASCII, eliminando o limite.

    Consequência: estes hashes não são verificáveis com bcrypt puro. Qualquer
    verificação tem de passar por `verificar_password`.
    """
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_preparar(password), bcrypt.gensalt()).decode("ascii")


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_preparar(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        # Hash malformado ou vazio: trata-se como falha, não como erro do servidor.
        return False


class ErroPolitica(ValueError):
    """A palavra-passe não cumpre a política da instalação.

    Tem tipo próprio para a API a poder distinguir de um `ValueError` qualquer
    e responder 422 com a explicação. Enquanto era um `ValueError` simples,
    ninguém a apanhava: a rota rebentava com 500, e um 500 por excepção não
    tratada sai SEM os cabeçalhos de CORS — o browser bloqueia a resposta e o
    utilizador lê «não foi possível contactar o servidor» quando o servidor
    está bem e só a palavra-passe é que era curta.
    """


def validar_forca_password(password: str) -> None:
    """Levanta `ErroPolitica` se a palavra-passe não cumprir a política.

    O Piloto exigia 4 caracteres; a Produção exige 8 (docs/SECURITY.md), e a
    instalação pode exigir mais — a mensagem diz o número real, porque um
    «demasiado curta» sem número obriga a adivinhar.
    """
    minimo = get_settings().PASSWORD_MIN_CARACTERES
    if len(password) < minimo:
        raise ErroPolitica(
            f"A palavra-passe deve ter pelo menos {minimo} caracteres."
        )


# ---------------------------------------------------------------------------
# Tokens JWT
# ---------------------------------------------------------------------------
#: Tipos de token. A distinção é a peça que sustenta o segundo factor: sem ela,
#: o token emitido entre os dois passos do login — que só prova a palavra-passe
#: — seria aceite como sessão completa, e o 2FA ficava contornável saltando o
#: segundo pedido. Todo o token novo leva `tipo`; os antigos, sem o campo, são
#: tratados como de acesso para não invalidar sessões abertas.
TIPO_ACESSO = "acesso"
TIPO_DESAFIO = "desafio"

#: Escopo das sessões que administram a plataforma. Vai no token e é exigido
#: pelas rotas de administração. Não substitui a verificação do perfil — que
#: continua a ser feita contra a base — mas garante que uma sessão emitida sem
#: esta marca nunca administra nada, por muito que o perfil na base mude.
ESCOPO_PLATAFORMA = "plataforma"

#: Repetido aqui para não importar `core.constants` — que importa este módulo
#: por outras vias — e fechar um ciclo. Se divergir, os testes acusam.
PERFIL_SUPERADMIN = "superadmin"


def criar_access_token(
    *,
    user_id: UUID,
    empresa_id: UUID | None,
    perfil: str,
    token_version: int,
    expira_absoluto: datetime | None = None,
) -> tuple[str, datetime]:
    """Emite um access token.

    `expira_absoluto` é o limite máximo da sessão contado desde o login. O
    /auth/refresh volta a passar o mesmo valor, para que renovar o token nunca
    prolongue a sessão indefinidamente (ver "Decisões de Desenho" no CLAUDE.md).

    A SESSÃO DA PLATAFORMA É MAIS CURTA. Uma conta que administra a plataforma
    vale todas as empresas juntas, e o que mais a expõe não é o ataque remoto —
    é um portátil deixado aberto e uma sessão que dura o dia inteiro. Por isso
    o token de quem a administra expira em minutos e a sessão inteira em poucas
    horas, e leva um `escopo` próprio que as rotas da plataforma exigem.

    Devolve (token, expiração absoluta) — quem chama guarda a segunda para o refresh.
    """
    s = get_settings()
    emitido = agora()
    da_plataforma = perfil == PERFIL_SUPERADMIN

    if expira_absoluto is None:
        horas = (
            s.SESSAO_SUPERADMIN_HORAS if da_plataforma else s.SESSAO_ABSOLUTA_HORAS
        )
        expira_absoluto = emitido + timedelta(hours=horas)

    minutos = (
        s.ACCESS_TOKEN_SUPERADMIN_MINUTOS if da_plataforma else s.ACCESS_TOKEN_MINUTOS
    )
    expira = min(emitido + timedelta(minutes=minutos), expira_absoluto)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "emp": str(empresa_id) if empresa_id else None,
        "perfil": perfil,
        "tv": token_version,
        "tipo": TIPO_ACESSO,
        "iat": int(emitido.timestamp()),
        "exp": int(expira.timestamp()),
        "sa": int(expira_absoluto.timestamp()),
    }
    if da_plataforma:
        payload["escopo"] = ESCOPO_PLATAFORMA

    token = jwt.encode(payload, s.JWT_SECRET_KEY, algorithm=s.JWT_ALGORITHM)
    return token, expira_absoluto


class TokenInvalido(Exception):
    """Token ausente, expirado, adulterado ou de uma sessão já revogada."""


def descodificar_token(token: str) -> dict[str, Any]:
    s = get_settings()
    try:
        return jwt.decode(token, s.JWT_SECRET_KEY, algorithms=[s.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise TokenInvalido("Sessão expirada.") from e
    except jwt.InvalidTokenError as e:
        raise TokenInvalido("Token inválido.") from e


# ---------------------------------------------------------------------------
# Desafio entre os dois passos do login
# ---------------------------------------------------------------------------
def criar_token_desafio(*, user_id: UUID, token_version: int) -> tuple[str, datetime]:
    """Token que só serve para completar o segundo passo do login.

    Não leva perfil nem empresa: não é uma sessão, e nada além do
    `/auth/login/2fa` o aceita. Dura poucos minutos — é uma janela em que a
    palavra-passe já foi aceite e só falta o código.
    """
    s = get_settings()
    emitido = agora()
    expira = emitido + timedelta(minutes=s.TOTP_DESAFIO_MINUTOS)
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "tipo": TIPO_DESAFIO,
        "iat": int(emitido.timestamp()),
        "exp": int(expira.timestamp()),
    }
    return jwt.encode(payload, s.JWT_SECRET_KEY, algorithm=s.JWT_ALGORITHM), expira


def criar_desafio_isco(*, user_id: UUID) -> tuple[str, datetime]:
    """Desafio que NUNCA valida. Para uma conta com 2FA e palavra-passe errada.

    Sem isto, o segundo passo do login só apareceria quando a palavra-passe
    estivesse certa — e o formulário passava a confirmar palavras-passe a quem
    as anda a testar. Como as pessoas reutilizam palavras-passe entre serviços,
    essa confirmação vale por si, mesmo sem o código.

    O isco tem de ser INDISTINGUÍVEL do verdadeiro. O conteúdo de um JWT lê-se
    sem chave nenhuma, por isso não pode levar marca nenhuma: o que muda é a
    chave da assinatura, que é aleatória e se perde no fim desta função. O
    segundo passo recusa-o pela assinatura, com a mesma mensagem de um código
    errado.
    """
    s = get_settings()
    emitido = agora()
    expira = emitido + timedelta(minutes=s.TOTP_DESAFIO_MINUTOS)
    payload = {
        "sub": str(user_id),
        "tv": 0,
        "tipo": TIPO_DESAFIO,
        "iat": int(emitido.timestamp()),
        "exp": int(expira.timestamp()),
    }
    chave_perdida = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")
    return jwt.encode(payload, chave_perdida, algorithm=s.JWT_ALGORITHM), expira


def descodificar_desafio(token: str) -> dict[str, Any]:
    """Descodifica um desafio. Recusa qualquer token que não o seja.

    A verificação do `tipo` é o que impede usar um token de acesso — ou o
    contrário — onde ele não pertence.
    """
    payload = descodificar_token(token)
    if payload.get("tipo") != TIPO_DESAFIO:
        raise TokenInvalido("Token inválido.")
    return payload
