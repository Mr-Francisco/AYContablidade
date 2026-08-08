"""Custo estimado e limites de consumo de IA.

A plataforma paga a OpenAI e revende o acesso. O que estes testes fixam é a
aritmética do custo e a direcção do arredondamento — sem isso, a estimativa
diverge da factura sem que ninguém dê por isso.
"""

from decimal import Decimal

import pytest

from src.services.ia.consumo import custo_de as _custo_e_preco
from src.services.ia.precos import tabela


def custo_de(modelo, entrada, saida):
    """Só o custo. O `custo_de` do serviço devolve também os preços aplicados,
    porque quem grava a consulta tem de os guardar."""
    return _custo_e_preco(modelo, entrada, saida)[0]


def test_custo_de_um_modelo_conhecido():
    """gpt-4o: 2,50 USD por milhão de entrada, 10,00 por milhão de saída."""
    # 1 000 000 de entrada = 2,50; 100 000 de saída = 1,00.
    assert custo_de("gpt-4o", 1_000_000, 100_000) == Decimal("3.5000")


def test_custo_de_uma_consulta_tipica():
    """Uma consulta com contexto de 8 000 tokens e resposta de 500."""
    esperado = (
        Decimal(8000) * Decimal("2.50") + Decimal(500) * Decimal("10.00")
    ) / Decimal("1000000")
    assert custo_de("gpt-4o", 8000, 500) == esperado.quantize(Decimal("0.0001"))


def test_modelo_desconhecido_sobrestima():
    """Um modelo fora da tabela usa o preço mais caro dos conhecidos.

    A direcção importa: subestimar deixa passar consumo a mais, e é esse o erro
    que custa dinheiro. Sobrestimar apenas trava mais cedo.
    """
    desconhecido = custo_de("modelo-que-nao-existe", 1_000_000, 1_000_000)
    t = tabela()
    mais_caro = max(custo_de(m, 1_000_000, 1_000_000) for m in t.modelos)
    assert desconhecido >= mais_caro
    assert t.por_omissao == max(
        t.modelos.values(), key=lambda p: p.entrada + p.saida
    )


def test_modelos_mini_sao_mais_baratos():
    """Sanidade da tabela: se um «mini» aparecesse mais caro do que o modelo
    completo, seria erro de transcrição."""
    assert custo_de("gpt-4o-mini", 1_000_000, 1_000_000) < custo_de(
        "gpt-4o", 1_000_000, 1_000_000
    )
    assert custo_de("gpt-4.1-mini", 1_000_000, 1_000_000) < custo_de(
        "gpt-4.1", 1_000_000, 1_000_000
    )


@pytest.mark.parametrize("modelo", [None, "", "gpt-4o"])
def test_consulta_sem_tokens_nao_custa(modelo):
    """Uma consulta que falhou antes de chegar à API não tem tokens e não pode
    somar nada ao consumo."""
    assert custo_de(modelo, None, None) == Decimal("0.0000")
    assert custo_de(modelo, 0, 0) == Decimal("0.0000")


def test_custo_tem_quatro_casas():
    """Uma consulta barata custa fracções de cêntimo. Arredondar a duas casas
    dava zero, e mil consultas a zero continuariam a dar zero."""
    c = custo_de("gpt-4o-mini", 1000, 100)
    assert c > 0, "uma consulta real não pode custar zero"
    assert c.as_tuple().exponent == -4


def test_precos_sao_por_milhao_e_nao_por_mil():
    """Confusão fácil e cara: se a tabela fosse lida como preço por MIL, o
    custo vinha mil vezes maior e o travão disparava logo na primeira
    consulta."""
    # 1000 tokens de entrada em gpt-4o custam 2,50/1000 = 0,0025 USD.
    assert custo_de("gpt-4o", 1000, 0) == Decimal("0.0025")
