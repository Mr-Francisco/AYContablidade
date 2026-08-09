"""Configuração da aplicação.

Todos os segredos vêm de variáveis de ambiente / `.env` — nunca do código nem do
`config.ini` (Regra 6). Ver `.env.example` para a lista completa.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, field_validator, model_validator
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


    # Quantas contas de administração da plataforma podem existir ao todo.
    # Três: a inicial e mais duas. Ter só uma é um ponto único de falha — perder
    # a palavra-passe dessa conta deixa a plataforma sem operador. Ter muitas
    # multiplica a superfície de ataque mais poderosa do sistema.
    MAX_SUPERADMINS: int = 3
    RATE_LIMIT_GERAL: str = "120/minute"

    # Proxies em cujo `X-Forwarded-For` se pode confiar. Vazio = não há proxy à
    # frente e o cabeçalho é sempre ignorado, que é o comportamento seguro:
    # qualquer cliente o pode forjar. Aceita endereços e blocos CIDR.
    #   PROXIES_CONFIAVEIS=10.0.0.0/8,172.18.0.1
    PROXIES_CONFIAVEIS: Annotated[list[str], NoDecode] = Field(default_factory=list)

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

    @field_validator("PROXIES_CONFIAVEIS", mode="before")
    @classmethod
    def _proxies_de_string(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _origins_de_string(cls, v: object) -> object:
        # Permite CORS_ORIGINS="http://a,http://b" no .env além da forma JSON.
        if isinstance(v, str) and not v.strip().startswith("["):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _producao_nao_arranca_com_definicoes_de_desenvolvimento(self) -> "Settings":
        """Em `AMBIENTE=producao`, recusa arrancar com o que serve para dev.

        UMA LISTA NUM DOCUMENTO NÃO É UMA GARANTIA. Cada uma destas condições
        já causou incidentes em sistemas reais, e todas têm a mesma forma: a
        instalação foi feita a copiar o `.env` de desenvolvimento e ninguém
        reparou. Falhar no arranque, com a razão escrita, é a única maneira de
        isto não passar despercebido.

        Não vale a pena tentar contornar mudando o `AMBIENTE` para `dev` numa
        máquina de produção: perde-se o resto — a documentação da API fica
        aberta, o SQL passa a ser escrito no log — e o problema fica pior.
        """
        if self.AMBIENTE != "producao":
            return self

        problemas: list[str] = []

        locais = [o for o in self.CORS_ORIGINS if "localhost" in o or "127.0.0.1" in o]
        if locais:
            problemas.append(
                f"CORS_ORIGINS ainda aponta para a máquina local ({', '.join(locais)}). "
                "Ponha aqui o endereço público do frontend."
            )
        if not self.CORS_ORIGINS:
            problemas.append(
                "CORS_ORIGINS está vazio: nenhum browser conseguirá falar com a API."
            )
        inseguras = [o for o in self.CORS_ORIGINS if o.startswith("http://")]
        if inseguras:
            problemas.append(
                f"CORS_ORIGINS em http:// sem TLS ({', '.join(inseguras)}). "
                "O token de sessão viaja em claro."
            )

        if not self.TOTP_CHAVE_CIFRA:
            # Não é um aviso: as contas de plataforma EXIGEM segundo factor, e
            # sem esta chave ninguém o consegue activar. A área de
            # administração ficaria inacessível a partir do primeiro login.
            problemas.append(
                "TOTP_CHAVE_CIFRA não está definida. Sem ela não se activa o "
                "segundo factor, e as contas de administração da plataforma "
                "exigem-no — a plataforma ficaria sem operador."
            )

        if self.DATABASE_URL and "localhost" in str(self.DATABASE_URL):
            problemas.append(
                "DATABASE_URL aponta para localhost. Confirme que é mesmo a "
                "base de produção e não a de desenvolvimento."
            )

        if self.PASSWORD_MIN_CARACTERES < 8:
            problemas.append(
                f"PASSWORD_MIN_CARACTERES={self.PASSWORD_MIN_CARACTERES} é "
                "demasiado baixo para produção (mínimo 8)."
            )

        if problemas:
            lista = "\n".join(f"  - {p}" for p in problemas)
            raise ValueError(
                "A aplicação não arranca em AMBIENTE=producao com estas "
                f"definições:\n{lista}\n"
                "Ver Producao/backend/.env.producao.example."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


def em_producao() -> bool:
    """Atalho para quem só precisa de saber se está em produção."""
    return get_settings().AMBIENTE == "producao"
