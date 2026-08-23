"""Retenção na fonte, e a regularização proporcional do recibo.

OS NÚMEROS SÃO DE DOIS RECIBOS REAIS do cliente, não inventados — é a única
forma de saber que a regra é a certa e não uma que apenas parece.

O QUE A RETENÇÃO É: um imposto que o CLIENTE retém e entrega ao Estado por
conta do fornecedor. O fornecedor factura 100 000, recebe 93 500, e os 6 500
restantes ficam retidos — mas a dívida fica saldada na mesma, porque foram
entregues ao Estado em nome do cliente.

É POR ISSO QUE O RECIBO TEM TRÊS BLOCOS: o que se paga não é o que se
regulariza.
"""

from decimal import Decimal

from src.services import comercial as svc


def d(v: str) -> Decimal:
    return Decimal(v)


# ---------------------------------------------------------------------------
# RC AYF2026/80 — o recibo do ecrã
#
#   Factura FT4026S24331N/197
#   Ilíquido 100 000,00 · Retenção 6,50% = 6 500,00 · Líquido 93 500,00
#   Pago 50 000,00 · Retido 3 475,94 · Regularizado 53 475,94
#   Por regularizar 46 524,06 (dinheiro 43 500,00 + retenção 3 024,06)
# ---------------------------------------------------------------------------
def test_a_retencao_da_factura():
    r = svc.calc_retencao(d("100000.00"), d("6.50"))
    assert r["retencao"] == d("6500.00")
    assert svc.liquido_a_receber(d("100000.00"), r["retencao"]) == d("93500.00")


def test_o_retido_e_proporcional_ao_que_se_paga():
    """50 000 ÷ 93 500 × 6 500 = 3 475,94. O número do recibo."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("100000.00"),
        retencao_factura=d("6500.00"),
        valor_pago=d("50000.00"),
    )
    assert r["retido"] == d("3475.94")
    assert r["regularizado"] == d("53475.94")


def test_o_que_fica_por_regularizar_separa_dinheiro_de_retencao():
    """46 524,06 = 43 500,00 por receber + 3 024,06 de retenção por amortizar.

    São coisas diferentes e o recibo mostra-as em separado: uma é dinheiro que
    ainda vai entrar, a outra é imposto que o cliente ainda vai entregar ao
    Estado.
    """
    r = svc.regularizacao_do_recibo(
        total_factura=d("100000.00"),
        retencao_factura=d("6500.00"),
        valor_pago=d("50000.00"),
    )
    por_regularizar = d("100000.00") - r["regularizado"]
    dinheiro_pendente = d("93500.00") - r["pago"]
    retencao_por_amortizar = d("6500.00") - r["retido"]

    assert por_regularizar == d("46524.06")
    assert dinheiro_pendente == d("43500.00")
    assert retencao_por_amortizar == d("3024.06")
    # E as duas partes somam o todo — se não somassem, o recibo mentia.
    assert dinheiro_pendente + retencao_por_amortizar == por_regularizar


# ---------------------------------------------------------------------------
# RC AYF2026/82 — o segundo recibo, com duas facturas
# ---------------------------------------------------------------------------
def test_uma_factura_sem_retencao_regulariza_o_que_se_paga():
    """FT AYF2025/146: 25 000 ilíquido, sem retenção, pago 25 000."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("25000.00"),
        retencao_factura=d("0.00"),
        valor_pago=d("25000.00"),
    )
    assert r["retido"] == d("0.00")
    assert r["regularizado"] == d("25000.00")


def test_o_segundo_recibo_bate_certo():
    """FT AYF2026/124: 230 000 ilíquido, 9 750 retidos, líquido 220 250.
    Pago 120 250 → retido 5 323,21 → regularizado 125 573,21."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("230000.00"),
        retencao_factura=d("9750.00"),
        valor_pago=d("120250.00"),
    )
    assert r["liquido_factura"] == d("220250.00")
    assert r["retido"] == d("5323.21")
    assert r["regularizado"] == d("125573.21")


# ---------------------------------------------------------------------------
# A base da retenção — o achado que obrigou a um campo
# ---------------------------------------------------------------------------
def test_a_base_pode_nao_ser_o_subtotal():
    """230 000 de ilíquido com 9 750 de retenção são 6,5% de 150 000.

    Foi o que o documento do cliente mostrou, e é a razão de a base ser um
    campo e não o subtotal. Uma factura pode misturar o que está sujeito a
    retenção com o que não está.
    """
    r = svc.calc_retencao(d("230000.00"), d("6.50"), base=d("150000.00"))
    assert r["retencao"] == d("9750.00")
    assert r["base"] == d("150000.00")


def test_sem_base_indicada_incide_sobre_o_subtotal():
    """O caso simples continua simples."""
    r = svc.calc_retencao(d("100000.00"), d("6.50"))
    assert r["base"] == d("100000.00")
    assert r["retencao"] == d("6500.00")


def test_a_base_nunca_excede_o_subtotal():
    """Reter sobre valor que não foi facturado não é reter, é inventar."""
    r = svc.calc_retencao(d("100000.00"), d("6.50"), base=d("500000.00"))
    assert r["base"] == d("100000.00")


def test_sem_taxa_nao_ha_retencao():
    """Nenhum documento já emitido muda de valor por a coluna passar a existir."""
    r = svc.calc_retencao(d("100000.00"), d("0"))
    assert r["retencao"] == d("0")
    assert svc.liquido_a_receber(d("100000.00"), r["retencao"]) == d("100000.00")


# ---------------------------------------------------------------------------
# Os cantos
# ---------------------------------------------------------------------------
def test_pagar_tudo_amortiza_toda_a_retencao():
    """Sem isto, sobravam cêntimos por regularizar numa factura paga por
    inteiro — e uma factura paga que aparece por regularizar manda alguém
    procurar um pagamento que já foi feito."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("100000.00"),
        retencao_factura=d("6500.00"),
        valor_pago=d("93500.00"),
    )
    assert r["retido"] == d("6500.00")
    assert r["regularizado"] == d("100000.00")


def test_pagar_a_mais_nao_regulariza_mais_do_que_a_retencao():
    """Um pagamento a maior é um adiantamento; não amortiza retenção que não
    existe."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("100000.00"),
        retencao_factura=d("6500.00"),
        valor_pago=d("120000.00"),
    )
    assert r["retido"] == d("6500.00")


def test_uma_factura_totalmente_retida_nao_rebenta():
    """Retenção igual ao total deixa o líquido a zero — dividir por ele seria
    um erro que só aparecia com esse documento."""
    r = svc.regularizacao_do_recibo(
        total_factura=d("1000.00"),
        retencao_factura=d("1000.00"),
        valor_pago=d("0.00"),
    )
    assert r["liquido_factura"] == d("0.00")
    assert r["regularizado"] == d("0.00")


# ---------------------------------------------------------------------------
# O extracto do recibo — os três blocos, com a base de dados
#
# Reproduz o RC AYF2026/80 do ecrã: uma factura de 100 000 com 6,5% de
# retenção, e um recibo que paga 50 000 do líquido.
# ---------------------------------------------------------------------------
from datetime import date as _D

import pytest
from sqlalchemy import delete, select

from src.db.base import agora
from src.db.models.comercial import Venda
from src.db.models.tenancy import Empresa

MARCA_RC = "ZZRC"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


def _limpar(db):
    db.execute(delete(Venda).where(Venda.numero.like(f"{MARCA_RC}%")))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


def _factura(base, empresa, *, numero, total, retencao, perc="6.50"):
    v = Venda(
        empresa_id=empresa.id, numero=f"{MARCA_RC}{numero}", tipo_doc="FT",
        data=_D(2026, 8, 1), subtotal=d(total), iva=d("0"), total=d(total),
        retencao_perc=d(perc), retencao=d(retencao), estado="emitida",
        emitido_em=agora(), cliente_nome="Cliente de ensaio",
    )
    base.add(v)
    base.flush()
    return v


def _recibo(base, empresa, *, numero, total, retencao, ref, dia=19):
    v = Venda(
        empresa_id=empresa.id, numero=f"{MARCA_RC}{numero}", tipo_doc="RC",
        data=_D(2026, 8, dia), subtotal=d(total), iva=d("0"), total=d(total),
        retencao_perc=d("6.50"), retencao=d(retencao), estado="emitida",
        emitido_em=agora(), doc_origem_num=f"{MARCA_RC}{ref}",
        cliente_nome="Cliente de ensaio",
    )
    base.add(v)
    base.flush()
    return v


def test_o_extracto_reproduz_o_recibo_do_ecra(base, empresa):
    """RC AYF2026/80, linha a linha."""
    _factura(base, empresa, numero="F197", total="100000.00", retencao="6500.00")
    # O recibo move 53 475,94: 50 000 pagos + 3 475,94 retidos.
    rc = _recibo(base, empresa, numero="R80", total="53475.94",
                 retencao="3475.94", ref="F197")

    r = svc.extracto_do_recibo(base, empresa.id, rc)
    l = r["linhas"][0]

    assert l["iliquido"] == d("100000.00")
    assert l["retencao_total"] == d("6500.00")
    assert l["liquido"] == d("93500.00")
    assert l["pago"] == d("50000.00")
    assert l["retido"] == d("3475.94")
    assert l["regularizado"] == d("53475.94")
    assert l["regularizado_acum"] == d("53475.94")
    assert l["por_regularizar"] == d("46524.06")
    assert l["dinheiro_pendente"] == d("43500.00")
    assert l["retencao_por_amortizar"] == d("3024.06")


def test_um_segundo_recibo_conta_o_que_o_primeiro_ja_regularizou(base, empresa):
    """Um recibo que ignorasse os anteriores dizia que a factura está por
    regularizar quando já foi paga em prestações — e mandava alguém cobrar o
    que já recebeu."""
    _factura(base, empresa, numero="F200", total="100000.00", retencao="6500.00")
    _recibo(base, empresa, numero="R1", total="53475.94",
            retencao="3475.94", ref="F200", dia=10)
    segundo = _recibo(base, empresa, numero="R2", total="46524.06",
                      retencao="3024.06", ref="F200", dia=20)

    r = svc.extracto_do_recibo(base, empresa.id, segundo)
    l = r["linhas"][0]

    # O segundo paga o resto: a factura fica saldada.
    assert l["regularizado_acum"] == d("100000.00")
    assert l["por_regularizar"] == d("0.00")
    assert l["dinheiro_pendente"] == d("0.00")
    assert l["retencao_por_amortizar"] == d("0.00")


def test_um_recibo_sem_factura_referida_nao_rebenta(base, empresa):
    """Um recibo antigo, ou mal preenchido, dá um extracto vazio — não um
    erro que impeça de o imprimir."""
    rc = Venda(
        empresa_id=empresa.id, numero=f"{MARCA_RC}RSEM", tipo_doc="RC",
        data=_D(2026, 8, 19), subtotal=d("100.00"), iva=d("0"),
        total=d("100.00"), estado="emitida", doc_origem_num=None,
    )
    base.add(rc)
    base.flush()
    r = svc.extracto_do_recibo(base, empresa.id, rc)
    assert r["linhas"] == []
