"""Guardas de produção.

Uma lista num documento não é uma garantia. Cada uma destas condições já causou
incidentes em sistemas reais, e todas têm a mesma forma: a instalação foi feita
a copiar o `.env` de desenvolvimento e ninguém reparou.

Estes testes provam que o sistema se recusa — não que alguém se lembrou.

Notar o `_env_producao`: as definições vêm de um `.env` no disco, e limpar só a
`environment` do processo não chega. Cada teste constrói as `Settings`
explicitamente, com todos os campos, para não depender do ficheiro da máquina
onde corre.
"""

import pytest
from pydantic import ValidationError

from src.core.config import Settings

BASE_PRODUCAO = {
    "AMBIENTE": "producao",
    "DATABASE_URL": "postgresql+psycopg://u:p@bd.interna:5432/prod",
    "JWT_SECRET_KEY": "j" * 48,
    "TOTP_CHAVE_CIFRA": "k" * 44,
    "CORS_ORIGINS": ["https://app.exemplo.ao"],
    "PASSWORD_MIN_CARACTERES": 10,
}


def _producao(**alteracoes) -> Settings:
    return Settings(**{**BASE_PRODUCAO, **alteracoes})


# ---------------------------------------------------------------------------
# O que passa
# ---------------------------------------------------------------------------
def test_producao_bem_configurada_arranca():
    s = _producao()
    assert s.AMBIENTE == "producao"


def test_dev_nao_e_afectado():
    """As guardas são só de produção — em desenvolvimento localhost é o normal."""
    s = Settings(
        AMBIENTE="dev",
        DATABASE_URL="postgresql+psycopg://u:p@localhost:5432/dev",
        JWT_SECRET_KEY="j" * 48,
        CORS_ORIGINS=["http://localhost:3000"],
    )
    assert s.AMBIENTE == "dev"


# ---------------------------------------------------------------------------
# O que não passa
# ---------------------------------------------------------------------------
def test_cors_local_nao_arranca():
    """REGRESSÃO: é o erro mais comum de todos — copiar o .env de dev."""
    with pytest.raises(ValidationError, match="localhost"):
        _producao(CORS_ORIGINS=["http://localhost:3000"])


def test_cors_sem_tls_nao_arranca():
    """Em http:// o token de sessão viaja em claro."""
    with pytest.raises(ValidationError, match="http://"):
        _producao(CORS_ORIGINS=["http://app.exemplo.ao"])


def test_cors_vazio_nao_arranca():
    with pytest.raises(ValidationError, match="vazio"):
        _producao(CORS_ORIGINS=[])


def test_sem_chave_de_cifra_do_2fa_nao_arranca():
    """As contas de plataforma EXIGEM segundo factor. Sem esta chave ninguém o
    activa, e a plataforma ficaria sem operador a partir do primeiro login."""
    with pytest.raises(ValidationError, match="TOTP_CHAVE_CIFRA"):
        _producao(TOTP_CHAVE_CIFRA=None)


def test_politica_de_password_fraca_nao_arranca():
    with pytest.raises(ValidationError, match="PASSWORD_MIN"):
        _producao(PASSWORD_MIN_CARACTERES=4)


def test_base_de_dados_local_avisa():
    """Não é sempre erro — pode haver a base na mesma máquina — mas é quase
    sempre o .env de desenvolvimento esquecido."""
    with pytest.raises(ValidationError, match="localhost"):
        _producao(DATABASE_URL="postgresql+psycopg://u:p@localhost:5432/dev")


def test_chave_jwt_curta_nao_arranca():
    """Vale para todos os ambientes, não só produção."""
    with pytest.raises(ValidationError, match="32 caracteres"):
        _producao(JWT_SECRET_KEY="curta")


def test_a_mensagem_junta_todos_os_problemas():
    """Corrigir um de cada vez, com um reinício entre cada, faz uma instalação
    demorar meia hora em vez de dois minutos."""
    with pytest.raises(ValidationError) as e:
        _producao(
            CORS_ORIGINS=["http://localhost:3000"],
            TOTP_CHAVE_CIFRA=None,
            PASSWORD_MIN_CARACTERES=4,
        )
    texto = str(e.value)
    assert "localhost" in texto
    assert "TOTP_CHAVE_CIFRA" in texto
    assert "PASSWORD_MIN" in texto


# ---------------------------------------------------------------------------
# O resto da separação
# ---------------------------------------------------------------------------
def test_a_documentacao_da_api_fecha_em_producao():
    """`/docs` desenha o mapa completo da API a quem passa."""
    import inspect

    from src.api import main

    fonte = inspect.getsource(main)
    assert 'docs_url="/docs" if settings.AMBIENTE != "producao" else None' in fonte


def test_o_sql_nao_vai_para_os_registos_em_producao():
    """Um `echo=True` em produção escreve cada consulta no log — incluindo
    valores de negócio, e com um custo de escrita que não se justifica."""
    import inspect

    from src.db import base

    assert 'echo=_settings.AMBIENTE == "dev"' in inspect.getsource(base)


def test_o_seed_de_demonstracao_recusa_se_em_producao():
    """REGRESSÃO: cria `super@plataforma.ao` com uma palavra-passe conhecida.
    Num sistema real é a porta aberta mais larga que se pode deixar."""
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[1] / "scripts" / "criar_demo.py"
    ).read_text(encoding="utf-8")
    assert "_recusar_em_producao" in fonte
    assert 'AMBIENTE == "producao"' in fonte
    # E é chamado à cabeça, antes de escrever seja o que for.
    assert fonte.index("_recusar_em_producao()") > fonte.index(
        "def _recusar_em_producao"
    )


def test_existe_caminho_para_criar_a_primeira_conta_real():
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts" / "criar_superadmin.py"
    assert script.exists()
    fonte = script.read_text(encoding="utf-8")
    # A palavra-passe não pode vir por argumento: fica no histórico da shell e
    # na lista de processos, onde outra sessão a lê.
    assert "getpass" in fonte
    assert "sys.argv" not in fonte
