"""O desconto de linha, e a identidade que o documento imprime.

O documento mostra quatro números por baixo das linhas: ilíquido, desconto,
imposto e total. Quem os lê faz a conta de cabeça, e se ela não fechar ao
cêntimo o documento perde a credibilidade toda — não há explicação que se dê
a um cliente para «ilíquido menos desconto mais IVA» dar outra coisa.

O QUE ESTES TESTES FIXAM:

1. Sem desconto, os totais são exactamente os de antes. É a garantia de que
   nenhum documento já emitido passa a dizer outro número.
2. O `subtotal` continua a ser o ILÍQUIDO. Foi a decisão que permitiu não
   tocar em nada do que já existe: o desconto vive num campo à parte.
3. O IVA incide sobre o que sobra depois do desconto. Liquidar imposto sobre
   valor descontado seria cobrar imposto sobre o que não foi facturado.
4. A identidade fecha sempre, incluindo quando o arredondamento a quereria
   partir.
"""

from decimal import Decimal

import pytest


def totais(linhas, iva="0"):
    from src.services.comercial import calc_totais

    return calc_totais(linhas, Decimal(iva))


def linha(qtd, preco, desconto=None):
    l = {"qtd": qtd, "preco": preco}
    if desconto is not None:
        l["desconto_perc"] = desconto
    return l


def test_sem_desconto_os_totais_sao_os_de_sempre():
    """A garantia de que nada do que já foi emitido muda de número."""
    t = totais([linha("2", "100"), linha("1", "50")], iva="14")

    assert t["subtotal"] == Decimal("250.00")
    assert t["desconto"] == Decimal("0.00")
    assert t["iva"] == Decimal("35.00")
    assert t["total"] == Decimal("285.00")


def test_o_subtotal_continua_a_ser_o_iliquido():
    """Descontar não encolhe o ilíquido — encolhe o que se paga."""
    t = totais([linha("1", "1000", "10")])

    assert t["subtotal"] == Decimal("1000.00")
    assert t["desconto"] == Decimal("100.00")
    assert t["total"] == Decimal("900.00")


def test_o_iva_incide_depois_do_desconto():
    """1000 com 10% de desconto são 900; 14% de 900 são 126."""
    t = totais([linha("1", "1000", "10")], iva="14")

    assert t["desconto"] == Decimal("100.00")
    assert t["iva"] == Decimal("126.00")
    assert t["total"] == Decimal("1026.00")


def test_desconta_se_uma_linha_e_nao_a_outra():
    """O caso que um desconto de cabeçalho não sabe representar."""
    t = totais([linha("1", "1000", "10"), linha("1", "500")], iva="14")

    assert t["subtotal"] == Decimal("1500.00")
    assert t["desconto"] == Decimal("100.00")
    # 1400 tributáveis
    assert t["iva"] == Decimal("196.00")
    assert t["total"] == Decimal("1596.00")


@pytest.mark.parametrize(
    "linhas",
    [
        [linha("3", "33.33", "7.5")],
        [linha("1", "0.01", "50")],
        [linha("7", "142.85", "33.33"), linha("2", "9.99", "15")],
        [linha("1", "999999.99", "0.01")],
        [linha(q, p, d) for q, p, d in [("1", "10.05", "5"), ("2", "20.01", "12.5"), ("3", "7.77", "0")]],
    ],
)
def test_a_identidade_fecha_sempre(linhas):
    """`ilíquido - desconto + IVA == total`, ao cêntimo, sempre.

    São os quatro números que o documento imprime lado a lado. É aqui que o
    arredondamento estraga contas, e é por isso que o líquido é que se
    arredonda: o desconto passa a ser, por construção, a diferença exacta.
    """
    t = totais(linhas, iva="14")

    assert t["subtotal"] - t["desconto"] + t["iva"] == t["total"]


def test_desconto_total_deixa_o_documento_a_zero():
    t = totais([linha("1", "500", "100")], iva="14")

    assert t["subtotal"] == Decimal("500.00")
    assert t["desconto"] == Decimal("500.00")
    assert t["iva"] == Decimal("0.00")
    assert t["total"] == Decimal("0.00")


def test_desconto_acima_de_cem_nao_paga_ao_cliente():
    """Mais de 100% seria pagar ao cliente para levar a mercadoria."""
    t = totais([linha("1", "500", "150")])

    assert t["desconto"] == Decimal("500.00")
    assert t["total"] == Decimal("0.00")


def test_desconto_negativo_e_ignorado():
    """Um desconto negativo é um agravamento, e não se agrava por engano."""
    t = totais([linha("1", "500", "-10")])

    assert t["desconto"] == Decimal("0.00")
    assert t["total"] == Decimal("500.00")


def test_linha_sem_desconto_declarado_comporta_se_como_zero():
    """As linhas que já existem não têm a chave — não podem rebentar."""
    t = totais([{"qtd": "2", "preco": "100"}])

    assert t["desconto"] == Decimal("0.00")
    assert t["total"] == Decimal("200.00")
