"""Preços no registo, e preços gravados por consulta.

Duas coisas que respondem à mesma pergunta — «de onde veio este custo?»:

  - os preços vivem no registo e não no código, porque mudam sem aviso e
    mudá-los não deve obrigar a um deploy nem a mexer no repositório;
  - cada consulta guarda os preços que lhe foram APLICADOS, senão corrigir um
    preço tornava a facturação histórica inexplicável.
"""

from decimal import Decimal

import pytest

from src.services.ia import precos


@pytest.fixture
def base():
    """Base real, numa transacção que se desfaz no fim."""
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


def _novo(db, modelo_id, entrada, saida, cache=None):
    from src.db.models.ia import ModeloIA

    m = ModeloIA(
        nome=modelo_id,
        modelo_id=modelo_id,
        preco_entrada=Decimal(entrada),
        preco_saida=Decimal(saida),
        preco_entrada_cache=Decimal(cache) if cache else None,
    )
    db.add(m)
    db.flush()
    return m


# ---------------------------------------------------------------------------
# Leitura do registo
# ---------------------------------------------------------------------------
def test_le_do_registo(base):
    t = precos.tabela(base)
    assert t.origem == "configuração"
    assert t.modelos, "o registo não pode vir vazio"


def test_os_precos_sao_decimais_exactos(base):
    """REGRESSÃO: `0.075` em vírgula flutuante não é setenta e cinco milésimos,
    e estes números multiplicam-se por milhões de tokens."""
    for p in precos.tabela(base).modelos.values():
        assert isinstance(p.entrada, Decimal)
        assert isinstance(p.saida, Decimal)
    assert precos.preco_de(base, "gpt-4o-mini").entrada == Decimal("0.15")


def test_o_preco_de_cache_vem_junto(base):
    """É preciso para não sobrestimar perguntas repetidas."""
    p = precos.preco_de(base, "gpt-4.1-mini")
    assert p.entrada_cache == Decimal("0.1")
    assert p.entrada_cache < p.entrada


def test_um_preco_alterado_vale_a_seguir(base):
    """SEM CACHE, de propósito: guardar a tabela em memória fazia cada processo
    servir um valor diferente até reiniciar — o problema que tirar isto do
    ficheiro veio resolver."""
    from src.db.models.ia import ModeloIA
    from sqlalchemy import select

    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4o-mini"))
    m.preco_entrada = Decimal("9.99")
    base.flush()

    assert precos.preco_de(base, "gpt-4o-mini").entrada == Decimal("9.99")


def test_modelo_desconhecido_usa_o_de_omissao(base):
    t = precos.tabela(base)
    assert precos.preco_de(base, "modelo-inventado") == t.por_omissao


def test_o_de_omissao_e_o_mais_caro(base):
    """A direcção importa: um modelo fora do registo deve SOBRESTIMAR.
    Subestimar é que deixa passar consumo a mais sem ninguém dar por isso."""
    t = precos.tabela(base)
    assert t.por_omissao.saida == max(p.saida for p in t.modelos.values())


def test_o_de_omissao_nao_desconta_cache(base):
    """Não se sabendo o preço, a entrada em cache paga como entrada normal —
    o valor mais alto. Descontar às cegas subestimava."""
    assert precos.tabela(base).por_omissao.entrada_cache is None


def test_um_modelo_desactivado_continua_a_explicar_o_historico(base):
    """Desactivar tira-o das escolhas, não do passado: pode ter atendido
    consultas ontem, e sem o preço o custo dessas linhas ficava por explicar."""
    from src.db.models.ia import ModeloIA
    from sqlalchemy import select

    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4o-mini"))
    m.ativo = False
    base.flush()

    assert "gpt-4o-mini" in precos.tabela(base).modelos


# ---------------------------------------------------------------------------
# Falha aberta
# ---------------------------------------------------------------------------
def test_registo_vazio_cai_no_embutido(base):
    """REGRESSÃO: um registo vazio não pode desligar a IA. O que ele afecta é a
    ESTIMATIVA — os tokens vêm da resposta da API e são exactos."""
    from src.db.models.ia import ModeloIA
    from sqlalchemy import delete

    base.execute(delete(ModeloIA))
    base.flush()

    t = precos.tabela(base)
    assert t.origem == "embutida"
    assert t.modelos == precos.EMBUTIDOS
    assert precos.preco_de(base, "gpt-4o").entrada == Decimal("2.50")


def test_uma_base_inacessivel_cai_no_embutido():
    """Nem uma falha da base pode derrubar a estimativa."""

    class Partida:
        def execute(self, *a, **k):
            raise RuntimeError("sem ligação")

    t = precos.tabela(Partida())
    assert t.origem == "embutida"


# ---------------------------------------------------------------------------
# O custo e os preços aplicados
# ---------------------------------------------------------------------------
def test_o_custo_vem_acompanhado_dos_precos_aplicados(base):
    """REGRESSÃO: sem devolver os preços, quem grava a consulta não tinha o que
    guardar — e o custo ficava um número impossível de reconstruir."""
    from src.services.ia.consumo import custo_de

    custo, preco = custo_de(base, "gpt-4.1", 1_000_000, 100_000)
    # 1 M de entrada a 2,00 + 100 k de saída a 8,00 = 2,00 + 0,80
    assert custo == Decimal("2.8000")
    assert preco == precos.preco_de(base, "gpt-4.1")


def test_o_historico_recalcula_se_pelos_precos_gravados(base):
    """O ponto todo do exercício: uma consulta antiga tem de continuar a
    explicar-se pelos preços da altura, e não pelos de hoje."""
    from sqlalchemy import select

    from src.db.models.ia import ModeloIA
    from src.services.ia.consumo import custo_com_precos, custo_de

    custo_antigo, preco_antigo = custo_de(base, "gpt-4.1", 1_000_000, 0)

    # O superadministrador corrige o preço para o dobro.
    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4.1"))
    m.preco_entrada = m.preco_entrada * 2
    base.flush()

    custo_hoje, _ = custo_de(base, "gpt-4.1", 1_000_000, 0)
    assert custo_hoje == custo_antigo * 2

    # Mas com os preços gravados, o valor antigo reproduz-se ao cêntimo.
    assert custo_com_precos(1_000_000, 0, preco_antigo) == custo_antigo


# ---------------------------------------------------------------------------
# Entrada em cache
# ---------------------------------------------------------------------------
def test_a_cache_desconta_e_nao_soma(base):
    """REGRESSÃO: os tokens de cache vêm INCLUÍDOS em `prompt_tokens`. Somá-los
    à parte cobrava a mesma entrada duas vezes."""
    from src.services.ia.consumo import custo_de

    sem_cache, _ = custo_de(base, "gpt-4.1", 1_000_000, 0, 0)
    com_cache, _ = custo_de(base, "gpt-4.1", 1_000_000, 0, 1_000_000)

    assert com_cache < sem_cache
    # Tudo em cache: 1 M a 0,50 = 0,50.
    assert com_cache == Decimal("0.5000")


def test_sem_preco_de_cache_paga_como_entrada_normal(base):
    """Sobrestimar é seguro; subestimar deixa passar consumo sem se dar por
    isso."""
    from src.services.ia.consumo import custo_com_precos

    p = precos.Preco(Decimal("2.00"), Decimal("8.00"), None)
    assert custo_com_precos(1_000_000, 0, p, 1_000_000) == Decimal("2.0000")


def test_mais_cache_do_que_entrada_nao_da_credito(base):
    """Uma API que reportasse mais cache do que entrada não pode gerar um custo
    negativo a descontar do total do mês."""
    from src.services.ia.consumo import custo_com_precos

    p = precos.Preco(Decimal("2.00"), Decimal("8.00"), Decimal("0.50"))
    assert custo_com_precos(1000, 0, p, 999_999) >= 0


# ---------------------------------------------------------------------------
# Snapshots datados
# ---------------------------------------------------------------------------
def test_um_snapshot_datado_usa_o_preco_do_modelo_base(base):
    """REGRESSÃO encontrada com a API real: a OpenAI não devolve `gpt-4.1` —
    devolve `gpt-4.1-2025-04-14`, a versão concreta que atendeu o pedido. Uma
    correspondência exacta falhava sempre e mandava tudo para o preço de
    omissão."""
    assert precos.preco_de(base, "gpt-4.1-2025-04-14") == precos.preco_de(
        base, "gpt-4.1"
    )


def test_o_prefixo_mais_longo_ganha(base):
    """REGRESSÃO: `gpt-4.1` também é prefixo de `gpt-4.1-mini-2025-04-14`. Se
    ganhasse o primeiro que casasse, um modelo barato era cobrado ao preço do
    caro — cinco vezes mais — e as quotas travavam cedo demais."""
    mini = precos.preco_de(base, "gpt-4.1-mini")
    assert precos.preco_de(base, "gpt-4.1-mini-2025-04-14") == mini
    assert mini != precos.preco_de(base, "gpt-4.1")


def test_um_modelo_de_outra_familia_continua_no_de_omissao(base):
    """O prefixo não pode ser tão permissivo que passe a apanhar tudo."""
    t = precos.tabela(base)
    assert precos.preco_de(base, "claude-qualquer-coisa") == t.por_omissao
    assert precos.preco_de(base, "gpt") == t.por_omissao
