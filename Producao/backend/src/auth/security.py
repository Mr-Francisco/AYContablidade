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


def validar_forca_password(password: str) -> None:
    """Levanta ValueError se a palavra-passe não cumprir a política.

    O Piloto exigia 4 caracteres; a Produção exige 8 (docs/SECURITY.md).
    """
    minimo = get_settings().PASSWORD_MIN_CARACTERES
    if len(password) < minimo:
        raise ValueError(
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

    Devolve (token, expiração absoluta) — quem chama guarda a segunda para o refresh.
    """
    s = get_settings()
    emitido = agora()
    if expira_absoluto is None:
        expira_absoluto = emitido + timedelta(hours=s.SESSAO_ABSOLUTA_HORAS)

    expira = min(emitido + timedelta(minutes=s.ACCESS_TOKEN_MINUTOS), expira_absoluto)

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
