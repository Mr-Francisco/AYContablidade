"""De onde veio o pedido, sem deixar quem o faz escolher a resposta.

O `X-Forwarded-For` é um cabeçalho: qualquer cliente o envia com o valor que
quiser. Aceitá-lo sem mais dava a quem atacasse o poder de escolher que IP fica
na auditoria — bastava `X-Forwarded-For: 8.8.8.8` para apagar o rasto da origem
de todas as suas acções.
"""

import os

import pytest

from src.core.config import get_settings
from src.core.rede import ip_do_pedido


class PedidoFalso:
    def __init__(self, host, cabecalhos=None):
        self.client = _Cliente(host) if host else None
        self.headers = cabecalhos or {}


class _Cliente:
    def __init__(self, host):
        self.host = host


@pytest.fixture
def proxies():
    """Define `PROXIES_CONFIAVEIS` e repõe o que estava."""
    antes = os.environ.get("PROXIES_CONFIAVEIS")

    def definir(valor):
        os.environ["PROXIES_CONFIAVEIS"] = valor
        get_settings.cache_clear()

    definir("")
    yield definir
    if antes is None:
        os.environ.pop("PROXIES_CONFIAVEIS", None)
    else:
        os.environ["PROXIES_CONFIAVEIS"] = antes
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Sem proxies declarados
# ---------------------------------------------------------------------------
def test_sem_proxies_o_cabecalho_e_ignorado(proxies):
    """REGRESSÃO: é o caso por omissão — sem proxy à frente, o cabeçalho só
    pode ter vindo do cliente e não vale nada."""
    p = PedidoFalso("203.0.113.7", {"x-forwarded-for": "8.8.8.8"})
    assert ip_do_pedido(p) == "203.0.113.7"


def test_sem_cabecalho_usa_a_ligacao(proxies):
    assert ip_do_pedido(PedidoFalso("203.0.113.7")) == "203.0.113.7"


def test_sem_pedido_ou_sem_cliente(proxies):
    assert ip_do_pedido(None) is None
    assert ip_do_pedido(PedidoFalso(None)) is None


# ---------------------------------------------------------------------------
# Com proxies declarados
# ---------------------------------------------------------------------------
def test_um_proxy_declarado_e_respeitado(proxies):
    proxies("10.0.0.5")
    p = PedidoFalso("10.0.0.5", {"x-forwarded-for": "203.0.113.7"})
    assert ip_do_pedido(p) == "203.0.113.7"


def test_um_bloco_cidr_funciona(proxies):
    proxies("10.0.0.0/8")
    p = PedidoFalso("10.3.2.1", {"x-forwarded-for": "203.0.113.7"})
    assert ip_do_pedido(p) == "203.0.113.7"


def test_quem_nao_esta_na_lista_nao_e_ouvido(proxies):
    """REGRESSÃO: declarar UM proxy não pode passar a confiar em toda a gente."""
    proxies("10.0.0.5")
    p = PedidoFalso("203.0.113.9", {"x-forwarded-for": "8.8.8.8"})
    assert ip_do_pedido(p) == "203.0.113.9"


def test_da_cadeia_vale_o_ULTIMO(proxies):
    """REGRESSÃO: o primeiro valor da cadeia foi escrito por quem está mais à
    frente e pode ter sido inventado pelo cliente. O último é o que o proxy de
    confiança observou de facto."""
    proxies("10.0.0.5")
    p = PedidoFalso(
        "10.0.0.5", {"x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7"}
    )
    assert ip_do_pedido(p) == "203.0.113.7"


def test_uma_configuracao_invalida_nao_derruba_nada(proxies):
    """Um erro de configuração degrada para o comportamento SEGURO — não
    confiar — em vez de deixar o servidor sem arrancar."""
    proxies("isto-nao-e-um-ip")
    p = PedidoFalso("203.0.113.7", {"x-forwarded-for": "8.8.8.8"})
    assert ip_do_pedido(p) == "203.0.113.7"


def test_o_valor_e_truncado(proxies):
    """A coluna da auditoria tem 64 caracteres; um cabeçalho enorme não pode
    rebentar a gravação."""
    proxies("10.0.0.5")
    p = PedidoFalso("10.0.0.5", {"x-forwarded-for": "9" * 500})
    assert len(ip_do_pedido(p)) <= 64


# ---------------------------------------------------------------------------
# A auditoria e o limitador concordam
# ---------------------------------------------------------------------------
def test_a_auditoria_usa_a_mesma_fonte():
    """REGRESSÃO: os dois lados discordavam — a auditoria confiava no cabeçalho
    e o limitador não. Se um contar por um IP e o outro gravar outro, não há
    forma de ligar um bloqueio ao seu autor."""
    import inspect

    from src.api.limites import limiter
    from src.services.auditoria import _ip

    assert "ip_do_pedido" in inspect.getsource(_ip)
    assert limiter._key_func.__module__ == "src.core.rede"


def test_o_arranque_documenta_o_no_proxy_headers():
    """REGRESSÃO: sem `--no-proxy-headers`, o uvicorn reescreve o cliente a
    partir do cabeçalho ANTES de a aplicação o ver, e toda esta lógica passa a
    ser decorativa. Já aconteceu uma vez, ao testar contra o servidor real."""
    from pathlib import Path

    entrada = Path(__file__).resolve().parents[1] / "main.py"
    assert "--no-proxy-headers" in entrada.read_text(encoding="utf-8")
