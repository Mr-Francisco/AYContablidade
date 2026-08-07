"""Esquemas de autenticação."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.constants import Perfil


class LoginPedido(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RegistoPedido(BaseModel):
    """Registo de um novo utilizador numa empresa existente.

    O Piloto tem auto-registo com aprovação posterior por um administrador; em
    multiempresa é preciso saber *em que* empresa, por isso o NIF é obrigatório.
    O fluxo mantém-se: a conta nasce por aprovar e o administrador da empresa
    valida-a.
    """

    nome: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    nif_empresa: str = Field(min_length=1, max_length=20)
    perfil: Perfil = Perfil.CONSULTA
    telefone: str | None = Field(default=None, max_length=40)


class AlterarPasswordPedido(BaseModel):
    password_atual: str = Field(min_length=1, max_length=200)
    password_nova: str = Field(min_length=8, max_length=200)


class UtilizadorPublico(BaseModel):
    """Utilizador tal como é devolvido à interface. Sem hash de palavra-passe."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    empresa_id: UUID | None
    nome: str
    email: EmailStr
    perfil: Perfil
    ativo: bool
    aprovado: bool
    telefone: str | None
    modulos_permitidos: list[str] | None
    permissoes_extra: list[str]
    permissoes_accao: dict[str, list[str]]
    ultimo_login: datetime | None


class TokenResposta(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Fim absoluto da sessão: a interface sabe quando o refresh deixa de servir.
    expira_absoluto: datetime
    utilizador: UtilizadorPublico
