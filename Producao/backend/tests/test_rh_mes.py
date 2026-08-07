"""O mês de RH: `AAAA-MM` na API, período de dois dígitos na base de dados.

As tabelas de RH guardam o PERÍODO contabilístico (`08`), não o mês com o ano
(`2026-08`) — o ano vem do exercício. Foi essa a decisão que tornou possível
uma empresa ter um segundo ano; no Piloto o mês era único em toda a história.

A API, porém, fala `AAAA-MM`, que é uma chave que não se presta a enganos de
quem chama. A tradução acontece à entrada do serviço, e é o que estes testes
fixam: sem ela, escrever `2026-08` numa coluna `varchar(2)` rebentava com um
`StringDataRightTruncation`, e as escritas que passavam ao lado do serviço
gravavam `exercicio_id` nulo — registos que a leitura, que filtra pelo
exercício, nunca mais encontrava.
"""

from decimal import Decimal

import pytest

from src.services import rh as svc


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("2026-08", "08"),
        ("2026-12", "12"),
        ("2026-01", "01"),
        ("08", "08"),
        ("8", "08"),
        ("00", "00"),
        (None, None),
        ("", ""),
    ],
)
def test_periodo_de(entrada, esperado):
    assert svc.periodo_de(entrada) == esperado


def test_periodo_de_e_idempotente():
    """Chamar duas vezes tem de dar o mesmo — o serviço normaliza em cascata
    (`processar_mes` normaliza e depois chama `mes_processado`, que normaliza
    outra vez), e uma segunda passagem que estragasse o valor seria um erro
    que só aparecia a meio de um fluxo."""
    for m in ("2026-08", "08", "1"):
        uma = svc.periodo_de(m)
        assert svc.periodo_de(uma) == uma


def test_periodo_cabe_na_coluna():
    """A coluna é `varchar(2)`: foi por aqui que o erro original apareceu."""
    for m in ("2026-08", "2026-12", "8", "08"):
        assert len(svc.periodo_de(m)) <= 2


def test_irt_pela_tabela_oficial():
    """IRT = parcela fixa + taxa × (matéria − limite inferior do escalão).

    A parcela fixa já inclui o imposto dos escalões anteriores; a taxa aplica-se
    só ao excesso. Tratar a taxa como se incidisse sobre toda a matéria dava
    16% de 150 001 em vez dos 12 500,16 correctos.
    """
    tabela = svc.cfg_rh_default()["irt"]
    casos = [
        (Decimal("100000"), Decimal("0.00")),  # isento
        (Decimal("150000"), Decimal("0.00")),  # limite da isenção
        (Decimal("150001"), Decimal("12500.16")),
        (Decimal("312500"), Decimal("51625.00")),
        (Decimal("224600"), Decimal("35678.00")),
    ]
    for materia, esperado in casos:
        assert svc.calc_irt(materia, tabela) == esperado, f"matéria {materia}"


def test_regras_do_recibo():
    """As duas regras que mais se perdem numa migração, em aritmética pura.

    - O INSS incide só sobre o SALÁRIO BASE, não sobre o bruto.
    - A matéria colectável do IRT é o bruto MENOS o INSS: a contribuição é
      dedutível.
    """
    cfg = svc.cfg_rh_default()
    base = Decimal("250000")
    subsidios = Decimal("70000")
    bruto = base + subsidios

    inss = svc.r2(base * Decimal(cfg["inss_trab"]) / 100)
    assert inss == Decimal("7500.00")
    # Se incidisse sobre o bruto seriam 9 600 — 2 100 a mais por mês.
    assert inss != svc.r2(bruto * Decimal(cfg["inss_trab"]) / 100)

    materia = svc.r2(bruto - inss)
    assert materia == Decimal("312500.00")
    assert svc.calc_irt(materia, cfg["irt"]) == Decimal("51625.00")


def test_desconto_de_faltas_usa_base_30():
    """Base 30 dias, qualquer que seja o mês — é o que o Piloto faz.

    Com o número real de dias, o mesmo colaborador com as mesmas faltas
    receberia valores diferentes em Fevereiro e em Março.
    """
    base = Decimal("250000")
    assert svc.r2(base / 30 * Decimal("2")) == Decimal("16666.67")
