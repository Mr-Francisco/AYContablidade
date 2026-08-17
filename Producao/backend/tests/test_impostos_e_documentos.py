"""Tabela de impostos e tipos de documento — as duas tabelas que a lei fixa.

Passo 1 do plano de facturação (`docs/facturacao/02-SAFT-AO.md`). Nada disto é
configuração nossa: são as taxas em vigor em Angola e os códigos que a AGT
aceita. Os testes existem para que uma alteração distraída não mude uma taxa
ou invente um código que a AGT rejeita — e uma rejeição descobre-se no dia da
entrega, não no dia da alteração.
"""

import pytest

from src.core import documentos_fiscais as docs
from src.core import impostos as imp
from src.db.models.comercial import TIPOS_DOC


# ---------------------------------------------------------------------------
# Taxas
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("codigo,perc", [
    ("NOR", 14),   # regra geral
    ("INT", 7),    # hotelaria e restauração
    ("RED", 5),    # cesta básica e insumos agrícolas
    ("CAB", 1),    # regime especial de Cabinda
    ("ISE", 0),
    ("NS", 0),
])
def test_taxas_em_vigor(codigo, perc):
    assert int(imp.percentagem(codigo)) == perc


def test_codigo_desconhecido_nao_rebenta():
    """Uma venda antiga tem de continuar a poder ser lida."""
    assert imp.taxa("XPTO")["codigo"] == "NOR"
    assert imp.taxa(None)["codigo"] == "NOR"


def test_taxa_zero_exige_motivo():
    """Art. 10.º f) do DP 71/25: sem fundamento, a factura é irregular."""
    assert imp.exige_motivo("ISE") is True
    assert imp.exige_motivo("NS") is True
    assert imp.exige_motivo("NOR") is False


def test_toda_a_taxa_a_zero_traz_um_motivo_escrito():
    for t in imp.TAXAS:
        if t["percentagem"] == 0:
            assert t["motivo"], f"{t['codigo']} está a zero e não diz porquê"


def test_ler_uma_venda_antiga_pela_percentagem():
    """As vendas anteriores guardaram só `iva_perc`. É a única pista."""
    assert imp.por_percentagem(14)["codigo"] == "NOR"
    assert imp.por_percentagem(7)["codigo"] == "INT"
    assert imp.por_percentagem(0)["codigo"] == "ISE"


def test_o_tipo_de_imposto_e_um_dos_que_o_saft_conhece():
    """`TaxType` no SAFTAO1.01_01.xsd só tem estes três."""
    for t in imp.TAXAS:
        assert t["tipo"] in {"IVA", "IS", "NS"}


# ---------------------------------------------------------------------------
# Tipos de documento
# ---------------------------------------------------------------------------
def test_todos_os_tipos_internos_estao_mapeados():
    """REGRESSÃO A EVITAR: acrescentar um tipo e esquecer como se diz à AGT.

    Sem isto, o tipo novo passava a existir no ecrã e desaparecia na
    exportação — ou pior, ia com um código que a AGT não conhece.
    """
    for t in TIPOS_DOC:
        assert t["cod"] in docs.MAPA, f"{t['cod']} não tem correspondência oficial"


def test_o_codigo_oficial_e_sempre_aceite_pela_agt():
    """Cada tipo tem de existir na tabela oficial DO SEU BLOCO.

    São tabelas diferentes e não se misturam: uma factura diz-se com um
    `documentType`, um movimento de mercadorias com um `MovementType`. Este
    teste já apanhou o engano uma vez — a guia de remessa estava a ser
    validada contra a lista das facturas, onde nunca poderia estar.
    """
    for interno, c in docs.MAPA.items():
        if c["oficial"] is None:
            continue
        if c["bloco"] == "MovementOfGoods":
            assert c["oficial"] in docs.TIPOS_MOVIMENTO, (
                f"{interno} traduz para {c['oficial']}, que não é um tipo de movimento"
            )
        else:
            assert c["oficial"] in docs.TIPOS_AGT, (
                f"{interno} traduz para {c['oficial']}, que a AGT não aceita"
            )


@pytest.mark.parametrize("interno,oficial", [
    ("FT", "FT"),
    ("FR", "FR"),
    ("NC", "NC"),
    ("ND", "ND"),
    # A AGT não tem «factura simplificada» nem «venda a dinheiro».
    ("FS", "TV"),
    ("VD", "TV"),
])
def test_traducao_dos_tipos(interno, oficial):
    assert docs.tipo_oficial(interno) == oficial


def test_a_proforma_nao_e_documento_fiscal():
    """Não se comunica, não entra no SAF-T de facturação, não tem código."""
    assert docs.tipo_oficial("PP") is None
    assert docs.comunicavel("PP") is False
    assert docs.bloco_saft("PP") is None


def test_a_guia_de_remessa_nao_e_uma_factura():
    assert docs.bloco_saft("GR") == "MovementOfGoods"
    assert docs.comunicavel("GR") is False


def test_o_recibo_vai_para_pagamentos():
    assert docs.bloco_saft("RC") == "Payments"


def test_anular_uma_factura_e_com_nota_de_credito():
    """Não existe «NE» em tabela nenhuma — nem na AGT, nem no SAF-T, nem no
    Piloto. Um documento fiscal emitido não se apaga: estorna-se com uma NC,
    ou marca-se como anulado (`InvoiceStatus = "A"`).
    """
    assert docs.anula_documento("NC") is True
    assert docs.anula_documento("FT") is False
    assert "NE" not in docs.TIPOS_AGT
    assert "A" in docs.ESTADOS_SAFT


def test_os_estados_sao_os_da_norma():
    assert set(docs.ESTADOS_SAFT) == {"N", "S", "A", "R"}
    assert set(docs.ESTADOS_AGT) == {"N", "C"}
