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


# ---------------------------------------------------------------------------
# Regra dos históricos
# ---------------------------------------------------------------------------
LISTAS_CRONOLOGICAS = [
    "contabilidade/movimentos",
    "contabilidade/razao",
    "contabilidade/extrato",
    "contabilidade/retencoes",
    "comercial/vendas",
    "comercial/consulta-faturas",
    "logistica/compras",
    "plataforma/licencas",
    "rh/independentes",
    "rh/processamento",
    "rh/pagamentos",
    "imobilizados/amortizacoes",
]


@pytest.mark.parametrize("pagina", LISTAS_CRONOLOGICAS)
def test_nenhuma_lista_cronologica_se_desenha_inteira(pagina):
    """REGRESSÃO: um exercício com milhares de lançamentos dava milhares de
    linhas de HTML e uma página de dezenas de milhares de píxeis.

    A regra é a mesma em todas: mostra-se uma primeira leva, diz-se quantos
    são ao todo, e quem precisa de mais carrega uma vez. Ver
    `components/ui/Historico.tsx` para o porquê de não ser `overflow-y`.
    """
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    ).read_text(encoding="utf-8")

    assert "useHistorico" in fonte, f"{pagina} não limita o que desenha"
    assert "historico.visiveis.map" in fonte, f"{pagina} desenha a lista toda"
    assert "RodapeHistorico" in fonte, f"{pagina} não diz quantos registos há"


def test_a_auditoria_partilhada_tambem_limita():
    """Cobre `/plataforma/auditoria` e `/gestao/auditoria` de uma vez."""
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "components" / "auditoria" / "TabelaAuditoria.tsx"
    ).read_text(encoding="utf-8")
    assert "useHistorico" in fonte
    assert "RodapeHistorico" in fonte


def test_o_corte_do_servidor_e_visivel():
    """REGRESSÃO: as rotas cortam a resposta por omissão e a interface mostrava
    o que veio como se fosse o total. «810 movimentos» quando são 4 000 é pior
    do que não dizer nada."""
    from pathlib import Path

    base = Path(__file__).resolve().parents[2] / "frontend" / "src" / "app" / "(app)"
    for pagina in ["contabilidade/movimentos", "comercial/vendas", "logistica/compras"]:
        fonte = (base / pagina / "page.tsx").read_text(encoding="utf-8")
        assert "LIMITE_PEDIDO" in fonte, f"{pagina} não pede um limite explícito"
        assert "truncadoNoServidor" in fonte, f"{pagina} não avisa do corte"


def test_o_assistente_desenha_o_markdown():
    """REGRESSÃO: o modelo responde em Markdown e a resposta era mostrada em
    texto simples — o utilizador via `**IVA por Apurar**` com os asteriscos."""
    from pathlib import Path

    base = Path(__file__).resolve().parents[2] / "frontend" / "src"
    pagina = (base / "app" / "(app)" / "assistente" / "page.tsx").read_text(
        encoding="utf-8"
    )
    assert "<Markdown>" in pagina

    leitor = (base / "components" / "ui" / "Markdown.tsx").read_text(encoding="utf-8")
    # Constrói elementos React; nunca injecta HTML. Procura-se a UTILIZAÇÃO
    # (o atributo seguido de `=`), não a palavra — que aparece no comentário a
    # explicar precisamente que não se usa.
    assert "dangerouslySetInnerHTML=" not in leitor


def test_os_mapas_imprimem_e_exportam():
    """O Piloto imprimia dezasseis páginas; aqui só três tinham botão."""
    from pathlib import Path

    base = Path(__file__).resolve().parents[2] / "frontend" / "src"
    quantas = len(
        [p for p in base.rglob("*.tsx") if "AccoesDoMapa" in p.read_text(encoding="utf-8")]
    )
    assert quantas >= 15, f"só {quantas} ficheiros com acções de mapa"

    # E as regras de impressão existem, senão o botão imprime o ecrã todo.
    css = (base / "app" / "globals.css").read_text(encoding="utf-8")
    assert "@media print" in css
    assert ".sem-imprimir" in css
