"""Esquemas de licenciamento e de empresa."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.constants import EstadoLicenca, RegimeIVA


class LicencaCriar(BaseModel):
    """Dados que o superadministrador indica ao gerar uma licença.

    O NIF e o nome ficam GRAVADOS na licença e são confirmados na activação:
    é o que impede que uma chave interceptada sirva para registar outra empresa.
    """

    nif: str = Field(min_length=1, max_length=20)
    nome_empresa: str = Field(min_length=1, max_length=200)
    titular: str | None = Field(default=None, max_length=200)
    plano: str = Field(default="Base", max_length=60)
    duracao_meses: int | None = Field(default=12, ge=1, le=120)
    modulos_incluidos: list[str] = Field(default_factory=list)
    limite_utilizadores: int | None = Field(default=None, ge=1)
    limite_tokens_mes: int | None = Field(default=None, ge=0)
    limite_custo_mes: Decimal | None = Field(default=None, ge=0)
    notas: str | None = None


class LicencaGerada(BaseModel):
    """Resposta da geração. A `chave` aparece AQUI E MAIS EM LADO NENHUM.

    Não é recuperável: a base guarda só o SHA-256. Se se perder, gera-se outra.
    """

    id: UUID
    chave: str
    chave_prefixo: str
    nif_previsto: str
    nome_previsto: str
    plano: str
    expira_activacao: datetime
    dias_para_activar: int


class LicencaPublica(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    empresa_id: UUID | None
    chave_prefixo: str
    nif_previsto: str
    nome_previsto: str
    titular: str
    plano: str
    duracao_meses: int | None
    expira_activacao: datetime
    activada_em: datetime | None
    validade: date | None
    estado: EstadoLicenca
    modulos_incluidos: list[str]
    limite_utilizadores: int | None
    limite_tokens_mes: int | None
    limite_custo_mes: Decimal | None
    notas: str | None


class LicencaAtualizar(BaseModel):
    """Alteração de contrato. A chave nunca muda — para trocar a chave gera-se
    uma licença nova."""

    plano: str | None = Field(default=None, max_length=60)
    validade: date | None = None
    estado: EstadoLicenca | None = None
    modulos_incluidos: list[str] | None = None
    limite_utilizadores: int | None = Field(default=None, ge=1)
    limite_tokens_mes: int | None = Field(default=None, ge=0)
    limite_custo_mes: Decimal | None = Field(default=None, ge=0)
    notas: str | None = None


class ActivacaoPedido(BaseModel):
    """Activação de uma licença — rota pública, feita por quem ainda não tem
    conta."""

    chave: str = Field(min_length=8, max_length=64)
    nif: str = Field(min_length=1, max_length=20)
    nome_empresa: str | None = Field(default=None, max_length=200)
    telefone: str | None = Field(default=None, max_length=40)

    admin_nome: str = Field(min_length=1, max_length=200)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=200)


class ActivacaoResposta(BaseModel):
    empresa_id: UUID
    empresa_nome: str
    #: O código com que a empresa passa a entrar no sistema («BE001»).
    codigo_empresa: str
    plano: str
    validade: date | None


class EmpresaPublica(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    nif: str
    codigo: str
    morada: str | None
    localizacao: str | None
    telefone: str | None
    email: str | None
    moeda: str
    regime: RegimeIVA
    forma_juridica: str | None
    estado: str
    criado_em: datetime
