"""Esquemas Pydantic da API."""

from src.db.schemas.auth import (
    AlterarPasswordPedido,
    LoginPedido,
    RegistoPedido,
    TokenResposta,
    UtilizadorPublico,
)
from src.db.schemas.licenca import (
    AprovarPedidoLicenca,
    EmpresaPublica,
    LicencaAtualizar,
    LicencaPublica,
    PedidoLicencaCriar,
    PedidoLicencaPublico,
    RecusarPedidoLicenca,
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
    "AprovarPedidoLicenca",
    "DefinirPassword",
    "EmpresaPublica",
    "LicencaAtualizar",
    "LicencaPublica",
    "LoginPedido",
    "PedidoLicencaCriar",
    "PedidoLicencaPublico",
    "RecusarPedidoLicenca",
    "RegistoPedido",
    "TokenResposta",
    "UtilizadorAtualizar",
    "UtilizadorCriar",
    "UtilizadorPublico",
]
