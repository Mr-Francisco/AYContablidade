"""Esquemas Pydantic da API."""

from src.db.schemas.auth import (
    AlterarPasswordPedido,
    LoginPedido,
    RegistoPedido,
    TokenResposta,
    UtilizadorPublico,
)
from src.db.schemas.licenca import (
    EmpresaPublica,
    LicencaAtualizar,
    LicencaPublica,
)
from src.db.schemas.user import (
    AprovarPedido,
    DefinirPassword,
    UtilizadorAtualizar,
    UtilizadorCriar,
)

__all__ = [
    "AlterarPasswordPedido",
    "AprovarPedido",
    "DefinirPassword",
    "EmpresaPublica",
    "LicencaAtualizar",
    "LicencaPublica",
    "LoginPedido",
    "RegistoPedido",
    "TokenResposta",
    "UtilizadorAtualizar",
    "UtilizadorCriar",
    "UtilizadorPublico",
]
