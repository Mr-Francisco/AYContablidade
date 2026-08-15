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
#: Já pedem uma janela ao servidor. É para aqui que as outras vão.
LISTAS_PAGINADAS = [
    "comercial/vendas",
    "comercial/consulta-faturas",
    "logistica/compras",
    "plataforma/licencas",
    "rh/processamento",
    "rh/pagamentos",
    "rh/independentes",
]

#: Destas, as que têm filtro do lado do cliente. Mudar o filtro tem de voltar
#: à primeira página — ficar na página 3 de um conjunto que a pesquisa reduziu
#: a duas linhas dá uma lista vazia sem explicação nenhuma.
LISTAS_PAGINADAS_COM_FILTRO = [
    "comercial/vendas",
    "comercial/consulta-faturas",
    "logistica/compras",
    "plataforma/licencas",
]

#: Mapas e listas já limitadas por um filtro de negócio (o mês, o exercício, o
#: período). Não paginam — três destas imprimem-se, e um mapa fiscal que sai no
#: papel com vinte e cinco das trezentas linhas é pior do que não sair. O que
#: cumprem é a outra metade da regra: o scroll é da CAIXA e não da página, e no
#: `@media print` a caixa abre-se e imprime tudo.
LISTAS_EM_CAIXA = [
    "contabilidade/retencoes",
    "imobilizados/amortizacoes",
]
# Os honorários saíram daqui para as paginadas: a caixa era o remendo possível
# enquanto a lista vinha inteira do servidor. Agora vem uma página de cada vez,
# e os totais do rodapé são do mês filtrado e não da página — que era a única
# razão para um mapa não poder paginar.


@pytest.mark.parametrize("pagina", LISTAS_EM_CAIXA)
def test_os_mapas_ficam_em_caixa_com_scroll_proprio(pagina):
    """REGRESSÃO: `useHistorico` num mapa que se imprime.

    A revelação por partes não desenha as linhas escondidas — não estão no DOM.
    Ao imprimir saíam vinte e cinco linhas debaixo de um total de trezentas: um
    documento a contradizer-se a si próprio. A caixa mostra tudo e limita-se em
    altura, e no papel abre-se.
    """
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    ).read_text(encoding="utf-8")
    assert "CaixaHistorico" in fonte, f"{pagina} não tem caixa própria"
    assert "useHistorico(" not in fonte, f"{pagina} ainda esconde linhas do DOM"


def test_a_caixa_abre_se_no_papel():
    """A regra que faz a de cima funcionar: sem ela, a caixa corta na
    impressão exactamente como cortava a revelação."""
    from pathlib import Path

    css = (
        Path(__file__).resolve().parents[2] / "frontend" / "src" / "app" / "globals.css"
    ).read_text(encoding="utf-8")
    i = css.index("@media print")
    assert ".caixa-historico" in css[i:], "o `@media print` não abre a caixa"

#: As duas que faltam. Revelam por partes no cliente mas pedem tudo ao
#: servidor: cumprem metade da regra e falham a outra.
#:
#: São as mais trabalhosas de propósito — as linhas do razão e do extracto
#: levam saldo acumulado, calculado ao longo da lista. Paginar sem passar essa
#: conta para o servidor daria uma segunda página a começar o saldo do zero.
#: Registado em `docs/documentacao/PENDENCIAS_PRIORITARIAS.md`, ponto 9.
#:
#: `contabilidade/movimentos` não está em nenhuma das duas: a lista mudou-se
#: para `ListaLancamentos.tsx` e tem teste próprio mais abaixo.
LISTAS_CRONOLOGICAS = [
    "contabilidade/razao",
    "contabilidade/extrato",
]


@pytest.mark.parametrize("pagina", LISTAS_PAGINADAS)
def test_as_listas_convertidas_pedem_uma_janela_ao_servidor(pagina):
    """REGRESSÃO: `limite=1000` para mostrar quarenta linhas.

    A lista ficava curta no ecrã e o pedido continuava enorme — meio megabyte
    de JSON a cada abertura numa empresa com dois anos de actividade. Nenhuma
    destas pode voltar a pedir tudo.
    """
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    ).read_text(encoding="utf-8")
    assert "usePaginacao" in fonte, f"{pagina} não gere o offset"
    assert "BarraPaginacao" in fonte, f"{pagina} não diz onde vai nem quantos há"
    assert "useHistorico(" not in fonte, f"{pagina} ainda revela no cliente"
    assert "LIMITE_PEDIDO" not in fonte, f"{pagina} ainda pede um lote grande"


@pytest.mark.parametrize("pagina", LISTAS_PAGINADAS_COM_FILTRO)
def test_mudar_de_filtro_volta_a_primeira_pagina(pagina):
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    ).read_text(encoding="utf-8")
    assert "reiniciar()" in fonte, f"{pagina} não volta ao início ao filtrar"


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


def test_a_lista_de_movimentos_pagina_no_servidor():
    """A lista dos movimentos passou de revelação no cliente para PAGINAÇÃO NO
    SERVIDOR.

    Antes vinham mil lançamentos e revelavam-se quarenta a quarenta: a lista
    era curta no ecrã mas o pedido era enorme, e numa empresa com dois anos de
    actividade era meio megabyte de JSON a cada abertura do ecrã mais usado do
    sistema. Agora vêm cinquenta e passa-se de página.
    """
    from pathlib import Path

    pasta = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / "contabilidade" / "movimentos"
    )
    lista = (pasta / "ListaLancamentos.tsx").read_text(encoding="utf-8")
    assert "BarraPaginacao" in lista, "a lista não pagina"

    pagina = (pasta / "page.tsx").read_text(encoding="utf-8")
    assert "usePaginacao" in pagina, "a página não gere o offset"
    assert "offset" in pagina, "a página não pede uma janela ao servidor"


def test_a_auditoria_partilhada_tambem_limita():
    """Cobre `/plataforma/auditoria` e `/gestao/auditoria` de uma vez."""
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "components" / "auditoria" / "TabelaAuditoria.tsx"
    ).read_text(encoding="utf-8")
    assert "useHistorico" in fonte
    assert "RodapeHistorico" in fonte


def test_o_total_vem_do_servidor():
    """REGRESSÃO: a interface mostrava o que veio como se fosse o total.

    «810 movimentos» quando são 4 000 é pior do que não dizer nada. A resposta
    paginada traz o `total` do conjunto, e é ele que se escreve — é o que
    permite dizer «1–25 de 4 812» em vez de inventar.
    """
    from pathlib import Path

    fonte = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "components" / "ui" / "Paginacao.tsx"
    ).read_text(encoding="utf-8")
    assert "pagina.total" in fonte, "a barra não mostra o total do servidor"
    assert "maxHeight" in fonte, "a caixa de histórico não limita a altura"


def test_as_rotas_paginadas_devolvem_total_e_janela():
    """Sem `total`, o cliente não sabe se há mais nada e o «seguinte» é um
    salto no escuro."""
    from src.api.paginacao import LIMITE_MAXIMO, pagina

    assert LIMITE_MAXIMO <= 200, (
        "um tecto alto de mais desfaz a regra: `limite=100000` na barra de "
        "endereços traria a tabela inteira"
    )
    assert pagina.__doc__ and "total" in pagina.__doc__


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
