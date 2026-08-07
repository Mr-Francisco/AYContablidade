"""Palavras-passe e tokens JWT."""

import base64
import hashlib
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
