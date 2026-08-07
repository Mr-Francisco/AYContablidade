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
