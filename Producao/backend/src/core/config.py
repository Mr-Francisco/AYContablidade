"""Configuração da aplicação.

Todos os segredos vêm de variáveis de ambiente / `.env` — nunca do código nem do
`config.ini` (Regra 6). Ver `.env.example` para a lista completa.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Aplicação ----------
    APP_NAME: str = "AYContabilidade"
    AMBIENTE: Literal["dev", "teste", "producao"] = "dev"
    API_PORT: int = 8001

    # ---------- Base de dados ----------
    DATABASE_URL: PostgresDsn

    # ---------- Autenticação ----------
    # Sem valor por omissão: em produção uma chave previsível é uma falha de segurança.
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTOS: int = 30
    # Expiração absoluta da sessão: /auth/refresh renova o token mas nunca ultrapassa
    # este limite contado desde o login (ver "Decisões de Desenho" no CLAUDE.md).
    SESSAO_ABSOLUTA_HORAS: int = 12

    # Política de palavras-passe. Mínimo 8 — desvio justificado ao Piloto, que
    # aceitava 4 caracteres em texto simples (ver docs/SECURITY.md).
    PASSWORD_MIN_CARACTERES: int = 8

    # ---------- Rate limiting (SlowAPI) ----------
    RATE_LIMIT_LOGIN: str = "5/minute"

    # --- Segundo factor (TOTP) ---
    # Cifra o segredo TOTP em repouso. Variável PRÓPRIA e não derivada da
    # JWT_SECRET_KEY de propósito: rodar o segredo JWT é normal, e derivá-la
    # trancaria toda a gente fora do 2FA sem aviso. Sem esta variável, activar
    # o 2FA falha com mensagem — nada mais deixa de funcionar.
    #   python -c "import secrets; print(secrets.token_urlsafe(32))"
    TOTP_CHAVE_CIFRA: str | None = None
    # Tentativas de código antes de bloquear, e por quanto tempo.
    TOTP_MAX_TENTATIVAS: int = 3
    TOTP_BLOQUEIO_MINUTOS: int = 15
    # Validade do desafio entre o primeiro e o segundo passo do login. Curta de
    # propósito: é uma janela em que a palavra-passe já foi aceite e só falta o
    # código. Longa demais transforma-se num token de meia-sessão esquecido.
    TOTP_DESAFIO_MINUTOS: int = 5

    # A sessão de quem administra a plataforma é MAIS CURTA. Essa conta vale
    # todas as empresas juntas, e o que mais a expõe não é o ataque remoto — é
    # um portátil deixado aberto e uma sessão que dura o dia inteiro.
    SESSAO_SUPERADMIN_HORAS: int = 2
    ACCESS_TOKEN_SUPERADMIN_MINUTOS: int = 15

    # Tabela de preços da API de IA. Vazio usa backend/config/precos_ia.json.
    # Não é segredo: os preços são públicos e o ficheiro está versionado.
    PRECOS_IA_FICHEIRO: str | None = None

    # Quantas contas de administração da plataforma podem existir ao todo.
    # Três: a inicial e mais duas. Ter só uma é um ponto único de falha — perder
    # a palavra-passe dessa conta deixa a plataforma sem operador. Ter muitas
    # multiplica a superfície de ataque mais poderosa do sistema.
    MAX_SUPERADMINS: int = 3
    RATE_LIMIT_GERAL: str = "120/minute"

    # ---------- CORS ----------
    # NoDecode é obrigatório: sem ele o pydantic-settings tenta json.loads() no valor
    # do .env antes de qualquer validador correr, e "http://localhost:3000" rebenta
    # com SettingsError. Com NoDecode o valor chega em bruto ao validador abaixo.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # ---------- Integração AGT (consulta de NIF) ----------
    # O Piloto é estático e não consegue chamar a AGT directamente (CORS/credenciais);
    # na Produção a chamada passa por aqui. Ver Piloto/assets/js/nif.js.
    AGT_ATIVO: bool = False
    AGT_ENDPOINT: str = (
        "https://sifphml.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter"
    )
    AGT_USERNAME: str | None = None
    AGT_PASSWORD: str | None = None

    # ---------- OpenAI (só o módulo autorizado de perguntas e respostas) ----------
    OPENAI_API_KEY: str | None = None
    # O nome do modelo é configuração, não constante: a lista da OpenAI muda com
    # frequência e um nome fixo no código fica desactualizado ou inválido. O
    # endpoint GET /api/ia/modelos lista os que a chave consegue usar.
    OPENAI_MODELO: str = "gpt-4o"
    OPENAI_TIMEOUT_SEGUNDOS: int = 90

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def _chave_suficientemente_forte(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY tem de ter pelo menos 32 caracteres. "
                'Gerar com: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _origins_de_string(cls, v: object) -> object:
        # Permite CORS_ORIGINS="http://a,http://b" no .env além da forma JSON.
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
