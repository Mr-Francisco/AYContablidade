"""Esquemas do fluxo de licenciamento (docs/TENANCY_AND_ACCESS.md)."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.constants import EstadoLicenca, EstadoPedidoLicenca, RegimeIVA


class PedidoLicencaCriar(BaseModel):
    """Submetido a partir da página inicial, sem autenticação — nesta altura
    ainda não existe empresa nem utilizador (passos 1-2 do documento)."""

    nome_empresa: str = Field(min_length=1, max_length=200)
    nif: str = Field(min_length=1, max_length=20)
    email_contacto: EmailStr
    responsavel: str = Field(min_length=1, max_length=200)
    telefone: str | None = Field(default=None, max_length=40)
    plano_pretendido: str | None = Field(default=None, max_length=60)
    mensagem: str | None = None


class PedidoLicencaPublico(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome_empresa: str
    nif: str
    email_contacto: EmailStr
    responsavel: str
    telefone: str | None
    plano_pretendido: str | None
    mensagem: str | None
    estado: EstadoPedidoLicenca
    criado_em: datetime
    decidido_em: datetime | None
    motivo_recusa: str | None
    empresa_id: UUID | None


class AprovarPedidoLicenca(BaseModel):
    """Aprovação: cria a empresa, a licença, o administrador inicial e faz o
    seed do plano de contas (passos 3-5 do documento)."""

    plano: str = Field(min_length=1, max_length=60)
    validade: date | None = None
    modulos_incluidos: list[str] = Field(default_factory=list)
    limite_utilizadores: int | None = Field(default=None, ge=1)
    regime: RegimeIVA = RegimeIVA.GERAL

    # Administrador inicial da empresa.
    admin_nome: str = Field(min_length=1, max_length=200)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=200)

    notas: str | None = None


class RecusarPedidoLicenca(BaseModel):
    motivo: str = Field(min_length=1)


class LicencaPublica(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    empresa_id: UUID
    chave: str
    titular: str
    plano: str
    validade: date | None
    estado: EstadoLicenca
    modulos_incluidos: list[str]
    limite_utilizadores: int | None
    aprovada_em: datetime | None
    notas: str | None


class LicencaAtualizar(BaseModel):
    plano: str | None = Field(default=None, max_length=60)
    validade: date | None = None
    estado: EstadoLicenca | None = None
    modulos_incluidos: list[str] | None = None
    limite_utilizadores: int | None = Field(default=None, ge=1)
    notas: str | None = None


class EmpresaPublica(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    nif: str
    morada: str | None
    localizacao: str | None
    telefone: str | None
    email: str | None
    moeda: str
    regime: RegimeIVA
    forma_juridica: str | None
    estado: str
    criado_em: datetime
