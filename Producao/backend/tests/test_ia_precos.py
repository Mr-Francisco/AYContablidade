"""Tabela de preços em configuração, e preços gravados por consulta.

Duas coisas que respondem à mesma pergunta — «de onde veio este custo?»:

  - os preços vivem fora do código, porque mudam sem aviso e não devem obrigar
    a um deploy;
  - cada consulta guarda os preços que lhe foram APLICADOS, senão mudar a
    tabela tornava a facturação histórica inexplicável.
"""

import json
from decimal import Decimal

import pytest

from src.services.ia import precos


@pytest.fixture(autouse=True)
def _repor():
    """A tabela é lida uma vez e fica em cache; um teste não pode contaminar o
    seguinte."""
    precos.recarregar()
    yield
    precos.recarregar()


# ---------------------------------------------------------------------------
# Leitura da configuração
# ---------------------------------------------------------------------------
def test_le_do_ficheiro_de_configuracao():
    t = precos.tabela()
    assert t.origem.endswith("precos_ia.json")
    assert t.modelos, "a tabela de configuração não pode vir vazia"


def test_os_precos_sao_decimais_exactos():
    """REGRESSÃO: `0.1` em vírgula flutuante não é exactamente um décimo, e
    aqui somam-se dinheiros. Por isso o JSON traz os preços como TEXTO."""
    for p in precos.tabela().modelos.values():
        assert isinstance(p.entrada, Decimal)
        assert isinstance(p.saida, Decimal)
    assert precos.preco_de("gpt-4o-mini").entrada == Decimal("0.15")


def test_o_ficheiro_declara_quando_foi_confirmado():
    """Um preço sem data não se sabe se está velho de uma semana ou de um ano."""
    assert precos.tabela().confirmado_em


def test_modelo_desconhecido_usa_o_de_omissao(monkeypatch):
    t = precos.tabela()
    assert precos.preco_de("modelo-inventado") == t.por_omissao


def test_o_de_omissao_e_o_mais_caro():
    """A direcção importa: um modelo fora da tabela deve SOBRESTIMAR. Subestimar
    é que deixa passar consumo a mais sem ninguém dar por isso."""
    t = precos.tabela()
    mais_caro = max(t.modelos.values(), key=lambda p: p.entrada + p.saida)
    assert t.por_omissao.entrada + t.por_omissao.saida >= (
        mais_caro.entrada + mais_caro.saida
    )


# ---------------------------------------------------------------------------
# Falha aberta
# ---------------------------------------------------------------------------
def _apontar_para(monkeypatch, caminho):
    monkeypatch.setattr(precos, "_caminho", lambda: caminho)
    return precos.recarregar()


def test_ficheiro_em_falta_nao_derruba_nada(monkeypatch, tmp_path):
    """REGRESSÃO: um ficheiro de preços partido não pode desligar a IA. O que
    ele afecta é a ESTIMATIVA — os tokens vêm da resposta da API e são exactos.
    """
    t = _apontar_para(monkeypatch, tmp_path / "nao-existe.json")
    assert t.origem == "embutida"
    assert t.modelos == precos.EMBUTIDOS
    assert precos.preco_de("gpt-4o").entrada == Decimal("2.50")


def test_ficheiro_mal_formado_cai_no_embutido(monkeypatch, tmp_path):
    f = tmp_path / "estragado.json"
    f.write_text("{isto não é json", encoding="utf-8")
    assert _apontar_para(monkeypatch, f).origem == "embutida"


def test_tabela_vazia_conta_como_invalida(monkeypatch, tmp_path):
    """Um ficheiro com `modelos: {}` faria tudo cair no preço de omissão sem
    ninguém perceber porquê. Vale mais tratá-lo como configuração ausente."""
    f = tmp_path / "vazio.json"
    f.write_text(json.dumps({"modelos": {}}), encoding="utf-8")
    assert _apontar_para(monkeypatch, f).origem == "embutida"


def test_um_ficheiro_valido_substitui_a_tabela(monkeypatch, tmp_path):
    f = tmp_path / "meus.json"
    f.write_text(
        json.dumps(
            {
                "modelos": {"modelo-x": {"entrada": "1.23", "saida": "4.56"}},
                "por_omissao": {"entrada": "9.99", "saida": "99.99"},
            }
        ),
        encoding="utf-8",
    )
    t = _apontar_para(monkeypatch, f)
    assert t.modelos["modelo-x"].entrada == Decimal("1.23")
    assert precos.preco_de("outro").entrada == Decimal("9.99")


# ---------------------------------------------------------------------------
# O custo e os preços aplicados
# ---------------------------------------------------------------------------
def test_o_custo_vem_acompanhado_dos_precos_aplicados():
    """REGRESSÃO: sem devolver os preços, quem grava a consulta não tinha o que
    guardar — e o custo ficava um número impossível de reconstruir."""
    from src.services.ia.consumo import custo_de

    custo, preco = custo_de("gpt-4o", 1_000_000, 100_000)
    assert custo == Decimal("3.5000")
    assert preco == precos.preco_de("gpt-4o")


def test_o_historico_recalcula_se_pelos_precos_gravados(monkeypatch, tmp_path):
    """O ponto todo do exercício: uma consulta antiga tem de continuar a
    explicar-se pelos preços da altura, e não pelos de hoje."""
    from src.services.ia.consumo import custo_com_precos, custo_de

    custo_antigo, preco_antigo = custo_de("gpt-4o", 1_000_000, 0)

    # A OpenAI duplica o preço.
    f = tmp_path / "novos.json"
    f.write_text(
        json.dumps({"modelos": {"gpt-4o": {"entrada": "5.00", "saida": "20.00"}}}),
        encoding="utf-8",
    )
    _apontar_para(monkeypatch, f)

    custo_hoje, _ = custo_de("gpt-4o", 1_000_000, 0)
    assert custo_hoje == custo_antigo * 2

    # Mas com os preços gravados, o valor antigo reproduz-se ao cêntimo.
    assert custo_com_precos(1_000_000, 0, preco_antigo) == custo_antigo
