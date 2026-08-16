"""Consulta de NIF — formato, tradução da AGT, e o que acontece quando falha.

Três exigências, e todas nascem de como isto vai ser usado: alguém escreve um
número numa ficha e carrega num botão à espera de que o resto se preencha.

1. **Nunca rebenta.** A AGT desligada, sem credenciais, em baixo ou lenta não
   pode impedir ninguém de registar um cliente. Devolve o que sabe e diz de
   onde veio.
2. **Diz a fonte.** `agt` ou `formato`. Um ecrã que apresente como confirmado
   pela AGT o que foi só validado pelo formato está a mentir ao utilizador.
3. **Avisa quando o contribuinte tem restrições.** Cessado, falecido, anulado
   ou suspenso não pode emitir facturas — quem o está a registar tem de saber
   antes, não no dia em que a factura for recusada.
"""

import asyncio

import pytest

from src.services import nif as svc


def correr(c):
    return asyncio.run(c)


# ---------------------------------------------------------------------------
# Formato
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "numero,esperado",
    [
        ("5000000000", "coletivo"),  # pessoa colectiva: 5 + nove dígitos
        ("5417441737", "coletivo"),
        ("003456789LA041", "singular"),  # nove dígitos + duas letras + três
        ("00345678", "outro"),
        ("AB123456", "estrangeiro"),
        ("123", "invalido"),
        ("", "invalido"),
        ("!!!", "invalido"),
    ],
)
def test_tipo_pelo_formato(numero, esperado):
    assert svc.tipo_de_nif(numero) == esperado


def test_espacos_e_minusculas_nao_contam():
    assert svc.tipo_de_nif(" 5000 000 000 ") == "coletivo"
    assert svc.tipo_de_nif("003456789la041") == "singular"


def test_numero_invalido_diz_que_e_invalido():
    r = correr(svc.consultar("123"))
    assert r["valido"] is False
    assert r["fonte"] == "formato"
    assert "formato" in r["mensagem"].lower()


def test_sem_agt_configurada_valida_o_formato_e_diz_que_e_local():
    """REGRESSÃO A EVITAR: responder «não encontrado» quando não se perguntou."""
    r = correr(svc.consultar("5000000000"))
    assert r["valido"] is True
    assert r["fonte"] == "formato"
    assert r["encontrado"] is False
    # A mensagem tem de dizer que a consulta não foi feita — «não encontrado»
    # levaria alguém a concluir que o NIF não existe.
    assert "AGT" in r["mensagem"]


# ---------------------------------------------------------------------------
# Tradução da resposta da AGT
# ---------------------------------------------------------------------------
def _resposta_agt(**alteracoes):
    contribuinte = {
        "numeroNIF": "5417441737",
        "nome": "PADARIA CENTRAL LDA",
        "estadoContribuinte": "A",
        "regimeIva": "GNAD",
        "tipoContribuinte": "COLLECTIVE",
        "indicadorNaoResidente": "false",
        **alteracoes,
    }
    return {"ObterContribuinte": {"contribuinte": contribuinte}}


def test_traduz_o_contribuinte_activo():
    r = svc._do_contribuinte(_resposta_agt(), "5417441737")
    assert r["fonte"] == "agt"
    assert r["encontrado"] is True
    assert r["nome"] == "PADARIA CENTRAL LDA"
    assert r["tipo"] == "coletivo"
    assert r["estado_rotulo"] == "Activo"
    assert r["regime_rotulo"] == "Regime Geral"
    assert r["regime_na_ficha"] == "Regime Geral"
    assert r["restrito"] is False


@pytest.mark.parametrize("estado,rotulo", [
    ("C", "Cessado"), ("D", "Falecido"), ("F", "Anulado"), ("G", "Suspenso"),
])
def test_estados_com_restricoes_sao_assinalados(estado, rotulo):
    """Um contribuinte nestes estados não pode emitir facturas."""
    r = svc._do_contribuinte(_resposta_agt(estadoContribuinte=estado), "5417441737")
    assert r["restrito"] is True
    assert r["estado_rotulo"] == rotulo
    assert "restri" in r["mensagem"].lower()


def test_regime_simplificado_chega_ao_vocabulario_da_ficha():
    r = svc._do_contribuinte(_resposta_agt(regimeIva="SIMP"), "5417441737")
    assert r["regime_rotulo"] == "Regime Simplificado"
    assert r["regime_na_ficha"] == "Regime Simplificado"


def test_contribuinte_singular():
    r = svc._do_contribuinte(
        _resposta_agt(tipoContribuinte="SINGULAR", nome="MARIA JOÃO"),
        "003456789LA041",
    )
    assert r["tipo"] == "singular"
    assert r["tipo_rotulo"] == "Pessoa singular"


def test_resposta_vazia_da_agt_nao_inventa_contribuinte():
    r = svc._do_contribuinte(
        {"ObterContribuinte": {"mensagem": "Contribuinte inexistente."}},
        "5000000000",
    )
    assert r["encontrado"] is False
    assert "Contribuinte inexistente." in r["mensagem"]


# ---------------------------------------------------------------------------
# A rota
# ---------------------------------------------------------------------------
def test_a_rota_existe_e_exige_sessao():
    """Regra 5: a consulta gasta as credenciais da AGT desta instalação.

    Aberta ao mundo, seria emprestá-las a quem passasse.
    """
    import inspect

    from src.api.main import app
    from src.api.routers import nif_router

    assert "/api/nif" in app.openapi()["paths"]
    fonte = inspect.getsource(nif_router)
    assert "UtilizadorAtual" in fonte, "a rota tem de exigir sessão"
    assert "limiter.limit" in fonte, "a rota tem de ter limite de pedidos"
