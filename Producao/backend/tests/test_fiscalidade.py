"""Regras fiscais: obrigações por enquadramento e cálculos de IVA.

O módulo foi transposto de `Piloto/assets/js/fiscalidade.js`, e os dados de
referência foram extraídos para JSON por script em vez de reescritos à mão —
copiar dez fichas de imposto à mão é a forma mais certa de trocar uma taxa sem
ninguém dar por isso. Estes testes travam as regras que operam sobre eles.
"""

from decimal import Decimal

import pytest

from src.core import fiscalidade as fisc


def _siglas(cfg: dict) -> set[str]:
    return {o["imposto"] for o in fisc.obrigacoes(cfg)}


def test_dados_carregam_com_acentos():
    """O JSON é lido como UTF-8. Um erro de codificação aqui só apareceria na
    interface, com "Ã§" onde devia estar "ç"."""
    assert len(fisc.IMPOSTOS) == 10
    assert len(fisc.REGIMES_IVA) == 3
    assert len(fisc.FORMAS) == 7
    iva = fisc.imposto("IVA")
    assert iva is not None
    assert "restauração" in iva["taxa"]
    assert "Transmissão de bens" in iva["incidencia"]


def test_regime_petrolifero_substitui_o_imposto_industrial():
    """Lei 13/04: o regime petrolífero SUBSTITUI o Imposto Industrial.

    Se as duas obrigações aparecessem juntas, a empresa seria informada de que
    tem de entregar uma Modelo 1 que na verdade não lhe compete.
    """
    normal = _siglas({"forma": "lda"})
    petro = _siglas({"forma": "petrolifero"})
    assert "II" in normal and "PETRO" not in normal
    assert "PETRO" in petro and "II" not in petro


def test_sem_empregados_nao_ha_irt_nem_inss():
    com = _siglas({"forma": "lda", "tem_empregados": True})
    sem = _siglas({"forma": "lda", "tem_empregados": False})
    assert {"IRT", "INSS"} <= com
    assert not ({"IRT", "INSS"} & sem)


def test_ausencia_da_chave_conta_como_ter_empregados():
    """Fidelidade ao Piloto: `cfg.temEmpregados !== false`.

    Uma empresa sem pessoal é a excepção. Se a ausência da chave valesse
    "não tem", quem não preenchesse o campo deixaria de ver as obrigações de
    IRT e de Segurança Social — que são as mais frequentes de todas.
    """
    assert {"IRT", "INSS"} <= _siglas({"forma": "lda"})


def test_obrigacoes_opcionais_so_aparecem_quando_pedidas():
    base = _siglas({"forma": "lda"})
    assert "IAC" not in base
    assert "IP" not in base
    assert "IAC" in _siglas({"forma": "lda", "paga_capitais": True})
    assert "IP" in _siglas({"forma": "lda", "tem_imoveis_arrend": True})


def test_regimes_de_iva_geram_obrigacoes_diferentes():
    def obrigacoes_iva(regime: str) -> list[str]:
        return [
            o["obrigacao"]
            for o in fisc.obrigacoes({"forma": "lda", "regime_iva": regime})
            if o["imposto"] == "IVA"
        ]

    # A não sujeição não declara nem paga: só tem de mencionar o regime na factura.
    exclusao = obrigacoes_iva("exclusao")
    assert len(exclusao) == 1
    assert "não sujeição" in exclusao[0]

    assert any("Simplificado" in o for o in obrigacoes_iva("simplificado"))
    assert any("Periódica" in o for o in obrigacoes_iva("geral"))


def test_regime_desconhecido_cai_no_mais_restritivo():
    """Sem correspondência, `regime_iva` devolve o primeiro — a não sujeição.

    É o comportamento do Piloto e o mais seguro: presume-se o enquadramento que
    não permite deduzir, e não o que permite.
    """
    assert fisc.regime_iva("inexistente")["id"] == "exclusao"
    assert fisc.regime_iva(None)["id"] == "exclusao"


def test_iva_simplificado_deduz_apenas_10_por_cento():
    """7% dos recebimentos menos 10% do IVA suportado — não o suportado todo.

    É a diferença que define o regime. Deduzir os 500 000 inteiros daria
    200 000 em vez dos 650 000 correctos.
    """
    assert fisc.calc_iva_simplificado("10000000", "500000") == Decimal("650000.00")
    # A dedução é 10% de 500 000 = 50 000, e não 500 000.
    assert fisc.calc_iva_simplificado("10000000", "500000") != Decimal("200000.00")


def test_iva_geral_deduz_integralmente():
    assert fisc.calc_iva_geral("10000000", "14", "500000") == Decimal("900000.00")
    # Sem taxa indicada usa 14%.
    assert fisc.calc_iva_geral("10000000", None, "500000") == Decimal("900000.00")


def test_iva_a_recuperar_quando_a_deducao_excede():
    """Mais IVA dedutível do que liquidado dá negativo — é crédito a favor do
    sujeito passivo, não um erro a esconder."""
    assert fisc.calc_iva_geral("1000000", "14", "500000") == Decimal("-360000.00")


@pytest.mark.parametrize(
    ("lucro", "taxa", "esperado"),
    [
        ("10000000", None, "2500000.00"),  # 25% geral
        ("10000000", "10", "1000000.00"),  # 10% agro-pecuária/pesca
        ("0", None, "0.00"),
    ],
)
def test_imposto_industrial(lucro, taxa, esperado):
    assert fisc.calc_ii(lucro, taxa) == Decimal(esperado)


def test_liquidacao_provisoria_e_2_por_cento_das_vendas():
    """2% sobre as VENDAS do semestre, não sobre o lucro — é um pagamento por
    conta, e é por isso que se calcula sobre a facturação."""
    assert fisc.calc_provisorio_ii("50000000") == Decimal("1000000.00")


def test_toda_a_obrigacao_tem_os_campos_que_a_interface_mostra():
    for cfg in (
        {"forma": "lda"},
        {"forma": "petrolifero"},
        {"forma": "sa", "paga_capitais": True, "tem_imoveis_arrend": True},
        {"forma": "eni", "regime_iva": "exclusao", "tem_empregados": False},
    ):
        for o in fisc.obrigacoes(cfg):
            assert set(o) == {
                "imposto",
                "obrigacao",
                "periodicidade",
                "prazo",
                "cor",
            }, cfg
            assert o["cor"].startswith("#")
            assert o["obrigacao"] and o["prazo"]
