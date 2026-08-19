"""Esquemas de licenciamento e de empresa."""

import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from src.core.constants import EstadoEmpresa, EstadoLicenca, Perfil, RegimeIVA


class LicencaCriar(BaseModel):
    """Dados que o superadministrador indica ao gerar uma licença.

    O NIF e o nome ficam GRAVADOS na licença e são confirmados na activação:
    é o que impede que uma chave interceptada sirva para registar outra empresa.
    """

    nif: str = Field(min_length=1, max_length=20)
    nome_empresa: str = Field(min_length=1, max_length=200)
    titular: str | None = Field(default=None, max_length=200)
    #: O plano. Preenche os módulos e os limites que vierem em branco — ver
    #: `core/planos.py`. Deixou de ser uma etiqueta: decide o que a empresa vê.
    plano: str = Field(default="gestao", max_length=60)
    duracao_meses: int | None = Field(default=12, ge=1, le=120)

    #: Os campos abaixo, em branco, HERDAM DO PLANO. Preenchidos, ganham-lhe a
    #: frente — é o que permite dar um módulo a mais ou um tecto diferente a um
    #: cliente sem inventar um plano novo para ele sozinho.
    #:
    #: `None` e lista vazia querem dizer coisas diferentes aqui, e é por isso
    #: que os módulos usam `None`: uma lista VAZIA é um valor legítimo — quer
    #: dizer «todos os módulos» — e não se distingue de «não indiquei nada».
    modulos_incluidos: list[str] | None = None
    limite_utilizadores: int | None = Field(default=None, ge=1)
    limite_tokens_mes: int | None = Field(default=None, ge=0)
    limite_custo_mes: Decimal | None = Field(default=None, ge=0)
    notas: str | None = None

    @field_validator("plano")
    @classmethod
    def _plano_conhecido(cls, v: str) -> str:
        from src.core import planos

        p = planos.por_codigo(v)
        if p is None:
            nomes = ", ".join(x.nome for x in planos.PLANOS)
            raise ValueError(
                f"«{v}» não é um plano do sistema. Os planos são: {nomes}."
            )
        return p.codigo


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
    #: Número de certificação do software atribuído pela AGT. Só a plataforma
    #: o escreve — ver `EmpresaCertificacaoPedido`.
    certificacao_agt: str | None = None
    criado_em: datetime


class EmpresaCertificacaoPedido(BaseModel):
    """O número de certificação da AGT de uma empresa. SÓ O SUPERADMIN.

    O formato é o que o esquema do SAF-T impõe: `NNN/AGT/AAAA`. Vazio limpa o
    número, e limpar quer dizer «esta empresa não tem certificação» — que é um
    estado legítimo e previsto pela norma, não uma falha.

    A validação do formato está aqui, à entrada, e não só no gerador do SAF-T:
    um número mal escrito guardado hoje só daria erro no dia da entrega.
    """

    numero: str = Field(default="", max_length=30)
    #: Fica na auditoria, como no estado. Um número que muda sem motivo é
    #: exactamente o que se quer poder investigar mais tarde.
    motivo: str | None = Field(default=None, max_length=300)

    @field_validator("numero")
    @classmethod
    def _formato(cls, v: str) -> str:
        v = (v or "").strip()
        if v in ("", "0"):
            return ""
        if not re.match(r"^\d+/AGT/\d{4}$", v):
            raise ValueError(
                "O número de certificação tem de ter o formato 141/AGT/2026. "
                "Deixe em branco se esta empresa ainda não tem certificação."
            )
        return v


class EmpresaEstadoPedido(BaseModel):
    """Mudança de estado de uma empresa, feita pelo superadministrador."""

    estado: EstadoEmpresa
    #: Fica na auditoria. Daqui a um ano, «suspensa» sem motivo não explica
    #: nada a quem for ver porque é que a empresa deixou de entrar.
    motivo: str | None = Field(default=None, max_length=300)


# ---------------------------------------------------------------------------
# Utilizadores vistos pelo superadministrador
# ---------------------------------------------------------------------------
class UtilizadorDaEmpresa(BaseModel):
    """Um membro de uma empresa, visto pela administração da plataforma.

    Só identificação e acesso. Nada de dados de negócio: o superadministrador
    gere contas, não consulta a contabilidade dos clientes.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    email: EmailStr
    perfil: Perfil
    ativo: bool
    aprovado: bool
    totp_ativo: bool
    ultimo_login: datetime | None
    criado_em: datetime


class MudarPerfilPedido(BaseModel):
    perfil: Perfil


class SuperadminCriar(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    email: EmailStr
    #: Palavra-passe de quem está a criar. Criar outra conta de administração
    #: da plataforma é das acções mais poderosas do sistema: um ecrã deixado
    #: aberto não pode bastar para a fazer.
    password_actual: str = Field(min_length=1)


class SuperadminCriado(BaseModel):
    """A palavra-passe inicial, mostrada UMA vez.

    Gerada pelo servidor e não escolhida por quem cria: uma palavra-passe
    inventada à pressa para a conta mais poderosa do sistema é o pior sítio
    possível para o fazer.
    """

    id: UUID
    nome: str
    email: EmailStr
    password_inicial: str


class SuperadminPublico(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    email: EmailStr
    ativo: bool
    totp_ativo: bool
    ultimo_login: datetime | None
    criado_em: datetime


class SuperadminAtualizar(BaseModel):
    ativo: bool


class PasswordTemporaria(BaseModel):
    """Palavra-passe gerada para devolver o acesso a quem o perdeu."""

    password_temporaria: str


class CertificacaoPlataforma(BaseModel):
    """O número de certificação por omissão, e quem o está a usar."""

    numero: str
    #: Quantas empresas o herdam — as que não têm número próprio. Serve para
    #: quem altera saber o alcance antes de o fazer.
    empresas_a_herdar: int
    #: E quantas têm um número seu, que este não afecta.
    empresas_com_numero_proprio: int


class CertificacaoPlataformaPedido(BaseModel):
    """O número por omissão da plataforma. Vazio quer dizer «não há»."""

    numero: str = Field(default="", max_length=30)
    motivo: str | None = Field(default=None, max_length=300)

    @field_validator("numero")
    @classmethod
    def _formato(cls, v: str) -> str:
        v = (v or "").strip()
        if v in ("", "0"):
            return ""
        if not re.match(r"^\d+/AGT/\d{4}$", v):
            raise ValueError(
                "O número de certificação tem de ter o formato 141/AGT/2026. "
                "Deixe em branco enquanto o programa não estiver certificado."
            )
        return v


class ConfigIaPublica(BaseModel):
    """Definições de IA da plataforma, com os limites de cada campo."""

    max_tokens_saida: int
    minimo: int
    maximo: int
    #: Dias até o pacote enviado ser descartado — é o que ocupa espaço.
    ia_dias_pacote: int
    dias_pacote_min: int
    dias_pacote_max: int
    #: Dias até a consulta ser apagada. Aqui perde-se também o consumo.
    ia_dias_historico: int
    dias_historico_min: int
    dias_historico_max: int
    #: Modelo em uso agora — já resolvido, nunca `None`. É o do registo marcado
    #: como padrão; sem padrão activo, o do ambiente. A interface mostra o que
    #: está mesmo a responder, e não um campo vazio.
    modelo_ia: str
    #: Interruptor geral do assistente.
    ia_ativa: bool


class ConfigIaAtualizar(BaseModel):
    """Todos os campos opcionais: a interface grava uma secção de cada vez.

    O MODELO NÃO ESTÁ AQUI. Escolhe-se marcando o padrão no registo de modelos
    (`/licencas/modelos-ia`), onde vive junto com os preços que lhe
    correspondem — a mesma decisão em dois sítios acabaria por divergir.
    """

    max_tokens_saida: int | None = Field(default=None, ge=200, le=4000)
    ia_dias_pacote: int | None = Field(default=None, ge=7, le=365)
    ia_dias_historico: int | None = Field(default=None, ge=90, le=3650)
    ia_ativa: bool | None = None


# ---------------------------------------------------------------------------
# Registo de modelos de IA
# ---------------------------------------------------------------------------
class ModeloIaPublico(BaseModel):
    """Um modelo do registo, como a interface o vê.

    Os preços saem como STRING, como todo o dinheiro nesta API: em vírgula
    flutuante, `0.075` não é exactamente setenta e cinco milésimos, e estes
    números multiplicam-se por milhões de tokens.
    """

    id: UUID
    nome: str
    modelo_id: str
    preco_entrada: str
    preco_entrada_cache: str | None
    preco_saida: str
    nota: str | None
    ativo: bool
    padrao: bool

    model_config = ConfigDict(from_attributes=True)


class ModeloIaCriar(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    modelo_id: str = Field(min_length=1, max_length=120)
    #: Texto, e validados no serviço: os limites e a relação entre eles são
    #: regras de negócio, não de formato.
    preco_entrada: str
    preco_saida: str
    preco_entrada_cache: str | None = None
    nota: str | None = Field(default=None, max_length=160)


class ModeloIaAtualizar(BaseModel):
    nome: str | None = Field(default=None, max_length=80)
    preco_entrada: str | None = None
    preco_saida: str | None = None
    preco_entrada_cache: str | None = None
    nota: str | None = Field(default=None, max_length=160)
    ativo: bool | None = None
