"""As barras do painel têm de somar o KPI que está ao lado delas.

O gráfico mensal e os cartões de Proveitos/Custos/Resultado saem de duas
funções diferentes — `evolucao_mensal` e `resumo_resultado`. Se os filtros
divergirem (diferidos, apuramento, exercício), o painel contradiz-se a si
próprio no mesmo ecrã: doze barras que somam um valor por baixo de um cartão
que diz outro. Quem olha não sabe qual acreditar, e com razão.

Estes testes prendem essa igualdade e a forma do gráfico.
"""

from decimal import Decimal

import pytest
from sqlalchemy import select

from src.db.models.tenancy import Empresa
from src.services import demonstracoes as dem

ZERO = Decimal("0")


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def empresa_com_movimento(base):
    """Uma empresa que tenha lançamentos — sem eles não se prova nada."""
    for e in base.scalars(select(Empresa)).all():
        r = dem.resumo_resultado(base, empresa_id=e.id)
        if r["proveitos"] or r["custos"]:
            return base, e.id
    pytest.skip("a base não tem nenhuma empresa com proveitos ou custos")


def test_a_soma_dos_meses_e_o_total_do_exercicio(empresa_com_movimento):
    """A garantia que interessa: as barras somam o cartão."""
    db, empresa_id = empresa_com_movimento

    meses = dem.evolucao_mensal(db, empresa_id=empresa_id)
    resumo = dem.resumo_resultado(db, empresa_id=empresa_id)

    assert sum((m["proveitos"] for m in meses), ZERO) == resumo["proveitos"]
    assert sum((m["custos"] for m in meses), ZERO) == resumo["custos"]
    assert sum((m["resultado"] for m in meses), ZERO) == resumo["resultado"]


def test_vem_sempre_o_ano_inteiro(empresa_com_movimento):
    """Doze meses, mesmo os vazios.

    Um gráfico que salta de Março para Julho porque Abril não teve movimento
    mente sobre a forma do ano — parece actividade contínua onde houve uma
    paragem.
    """
    db, empresa_id = empresa_com_movimento

    meses = dem.evolucao_mensal(db, empresa_id=empresa_id)

    assert len(meses) == 12
    assert [m["mes"] for m in meses] == [f"{n:02d}" for n in range(1, 13)]
    assert meses[0]["nome"] == "Jan" and meses[-1]["nome"] == "Dez"


def test_os_periodos_que_nao_sao_meses_ficam_de_fora(empresa_com_movimento):
    """O plano tem dezasseis períodos: 00 abertura, 13 regularizações, 14 e 15
    apuramentos. Nenhum deles é um mês, e nenhum pode aparecer no gráfico.

    Prova-se pelo resultado: o `resumo_resultado` exclui o apuramento, e a
    igualdade do primeiro teste só se mantém se este também o excluir.
    """
    db, empresa_id = empresa_com_movimento

    assert dem.MESES == tuple(f"{n:02d}" for n in range(1, 13))
    assert "00" not in dem.MESES
    assert "13" not in dem.MESES and "14" not in dem.MESES


def test_o_resultado_de_cada_mes_e_a_diferenca_do_proprio_mes(
    empresa_com_movimento,
):
    """Por linha, e não só no total: um mês pode dar prejuízo dentro de um ano
    com lucro, e é isso que o gráfico tem de mostrar."""
    db, empresa_id = empresa_com_movimento

    for m in dem.evolucao_mensal(db, empresa_id=empresa_id):
        assert m["resultado"] == m["proveitos"] - m["custos"], m["nome"]
