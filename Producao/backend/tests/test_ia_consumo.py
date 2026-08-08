"""Custo estimado e limites de consumo de IA.

A plataforma paga a OpenAI e revende o acesso. O que estes testes fixam é a
aritmética do custo e a direcção do arredondamento — sem isso, a estimativa
diverge da factura sem que ninguém dê por isso.

Os preços vêm do registo `ia_modelos`, que é onde o superadministrador os
mantém. Por isso estes testes precisam de uma sessão: o custo já não se calcula
a partir de uma constante do código.
"""

from decimal import Decimal

import pytest

from src.services.ia.consumo import custo_de as _custo_e_preco
from src.services.ia.precos import tabela


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def custo_de(base):
    """Só o custo. O `custo_de` do serviço devolve também os preços aplicados,
    porque quem grava a consulta tem de os guardar."""

    def _c(modelo, entrada, saida, cache=0):
        return _custo_e_preco(base, modelo, entrada, saida, cache)[0]

    return _c


def test_custo_de_um_modelo_conhecido(custo_de):
    """gpt-4.1: 2,00 USD por milhão de entrada, 8,00 por milhão de saída."""
    # 1 000 000 de entrada = 2,00; 100 000 de saída = 0,80.
    assert custo_de("gpt-4.1", 1_000_000, 100_000) == Decimal("2.8000")


def test_custo_de_uma_consulta_tipica(custo_de):
    """Uma consulta com contexto de 8 000 tokens e resposta de 500."""
    esperado = (
        Decimal(8000) * Decimal("2.00") + Decimal(500) * Decimal("8.00")
    ) / Decimal("1000000")
    assert custo_de("gpt-4.1", 8000, 500) == esperado.quantize(Decimal("0.0001"))


def test_modelo_desconhecido_sobrestima(custo_de, base):
    """Um modelo fora do registo usa o preço mais caro dos conhecidos.

    A direcção importa: subestimar deixa passar consumo a mais, e é esse o erro
    que custa dinheiro. Sobrestimar apenas trava mais cedo.
    """
    desconhecido = custo_de("modelo-que-nao-existe", 1_000_000, 1_000_000)
    t = tabela(base)
    mais_caro = max(custo_de(m, 1_000_000, 1_000_000) for m in t.modelos)
    assert desconhecido >= mais_caro


def test_modelos_mini_sao_mais_baratos(custo_de):
    """Sanidade do registo: se um «mini» aparecesse mais caro do que o modelo
    completo, seria erro de transcrição."""
    assert custo_de("gpt-4.1-mini", 1_000_000, 1_000_000) < custo_de(
        "gpt-4.1", 1_000_000, 1_000_000
    )
    assert custo_de("gpt-4o-mini", 1_000_000, 1_000_000) < custo_de(
        "gpt-4.1-mini", 1_000_000, 1_000_000
    )


@pytest.mark.parametrize("modelo", [None, "", "gpt-4.1"])
def test_consulta_sem_tokens_nao_custa(custo_de, modelo):
    """Uma consulta que falhou antes de chegar à API não tem tokens e não pode
    somar nada ao consumo."""
    assert custo_de(modelo, None, None) == Decimal("0.0000")
    assert custo_de(modelo, 0, 0) == Decimal("0.0000")


def test_custo_tem_quatro_casas(custo_de):
    """Uma consulta barata custa fracções de cêntimo. Arredondar a duas casas
    dava zero, e mil consultas a zero continuariam a dar zero."""
    c = custo_de("gpt-4o-mini", 1000, 100)
    assert c > 0, "uma consulta real não pode custar zero"
    assert c.as_tuple().exponent == -4


def test_precos_sao_por_milhao_e_nao_por_mil(custo_de):
    """Confusão fácil e cara: se os preços fossem lidos como preço por MIL, o
    custo vinha mil vezes maior e o travão disparava logo na primeira
    consulta."""
    # 1000 tokens de entrada em gpt-4.1 custam 2,00/1000 = 0,0020 USD.
    assert custo_de("gpt-4.1", 1000, 0) == Decimal("0.0020")
