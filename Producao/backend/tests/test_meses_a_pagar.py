"""A lista de pagamentos mostra o que FALTA pagar.

O ecrã de pagamentos listava os pagamentos já feitos — o contrário do que quem
lá entra quer saber. O Piloto lista os meses processados, com o líquido, o
estado e o lançamento, e um botão de pagar em cada linha que ainda não foi
paga; sem isso, a única forma de descobrir o que estava por pagar era
experimentar mês a mês no selector.

O cruzamento é por (exercício, mês) e não só pelo mês: o período tem dois
dígitos e Agosto de 2026 e de 2027 são ambos "08". Foi por isso que o modelo
guarda o exercício — e é a parte que um `dict` indexado só pelo mês estragava
em silêncio, marcando como pago um mês de outro ano.
"""

from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.api.routers.rh_router import meses_a_pagar
from src.db.models.rh import PagamentoSalarial, ProcessamentoSalarial
from src.db.models.tenancy import Empresa, Exercicio

#: Períodos que não existem no calendário — para não colidir com dados reais.
MES_A = "97"
MES_B = "98"


def _limpar(db):
    db.rollback()
    for modelo in (PagamentoSalarial, ProcessamentoSalarial):
        db.execute(delete(modelo).where(modelo.mes.in_([MES_A, MES_B])))
    db.commit()


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


@pytest.fixture
def empresa(base):
    class _E:
        pass

    e = _E()
    e.id = base.scalar(select(Empresa.id).limit(1))
    assert e.id is not None
    return e


@pytest.fixture
def exercicio(base, empresa):
    return base.scalar(
        select(Exercicio).where(Exercicio.empresa_id == empresa.id).limit(1)
    )


def _processar(db, empresa, exercicio, mes, liquido="100000.00"):
    p = ProcessamentoSalarial(
        empresa_id=empresa.id,
        exercicio_id=exercicio.id if exercicio else None,
        mes=mes,
        totais={"bruto": "130000.00", "liquido": liquido},
        lancado=True,
    )
    db.add(p)
    db.commit()
    return p


def _pagar(db, empresa, exercicio, mes, valor="100000.00"):
    p = PagamentoSalarial(
        empresa_id=empresa.id,
        exercicio_id=exercicio.id if exercicio else None,
        mes=mes,
        valor=Decimal(valor),
        conta="431",
        lancado=True,
        numero_op="OP-9001",
    )
    db.add(p)
    db.commit()
    return p


def _linha(resposta, mes):
    return next(l for l in resposta["linhas"] if l["mes"] == mes)


def test_lista_os_meses_processados_e_nao_os_pagos(base, empresa, exercicio):
    _processar(base, empresa, exercicio, MES_A)

    r = meses_a_pagar(empresa, base, limite=200)
    linha = _linha(r, MES_A)

    assert linha["estado"] == "processado"
    assert linha["liquido"] == "100000.00"
    assert linha["valor_pago"] is None
    assert linha["exercicio"] == (exercicio.nome if exercicio else None)


def test_o_mes_pago_aparece_com_o_valor_e_a_operacao(base, empresa, exercicio):
    _processar(base, empresa, exercicio, MES_A)
    _pagar(base, empresa, exercicio, MES_A, valor="99000.00")

    linha = _linha(meses_a_pagar(empresa, base, limite=200), MES_A)

    assert linha["estado"] == "pago"
    assert linha["valor_pago"] == Decimal("99000.00")
    assert linha["conta"] == "431"
    assert linha["numero_op"] == "OP-9001"


def test_pagar_um_mes_nao_marca_o_outro(base, empresa, exercicio):
    """REGRESSÃO: o cruzamento é por (exercício, mês)."""
    _processar(base, empresa, exercicio, MES_A)
    _processar(base, empresa, exercicio, MES_B)
    _pagar(base, empresa, exercicio, MES_A)

    r = meses_a_pagar(empresa, base, limite=200)

    assert _linha(r, MES_A)["estado"] == "pago"
    assert _linha(r, MES_B)["estado"] == "processado"


def test_a_lista_e_paginada(base, empresa, exercicio):
    """Regra do projecto: nenhum histórico é infinito."""
    _processar(base, empresa, exercicio, MES_A)
    _processar(base, empresa, exercicio, MES_B)

    r = meses_a_pagar(empresa, base, offset=0, limite=1)

    assert len(r["linhas"]) == 1
    assert r["total"] >= 2
    assert r["limite"] == 1
