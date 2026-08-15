"""Alterações mensais: faltas, abonos e descontos.

A página das alterações mostra o líquido enquanto se escreve. Esse número TEM
de ser o mesmo que o processamento vai calcular — se divergir, o utilizador
decide com base numa conta e paga outra.

No Piloto divergia por construção: a fórmula estava escrita duas vezes, uma no
recibo (`R.recibo`) e outra na janela das alterações (`reciboComAlt`). Aqui há
uma só, `recibo_com`, e é isso que estes testes fixam.

Os testes da aritmética (`test_rh_mes.py`) refazem as contas à mão em vez de
chamarem a função — o que é bom para provar a REGRA, e não chega para provar
que a função a aplica. Uma troca de nome dentro de `recibo_com` passou por
esses testes todos sem uma falha.
"""

from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from src.api.routers.rh_router import (
    AlteracaoEntrada,
    SimulacaoAlteracao,
    gravar_alteracao,
    simular_alteracao,
)
from src.db.models.rh import AlteracaoMensal, Colaborador
from src.db.models.tenancy import Empresa
from src.services import rh as svc

MARCA = "T5"


def _limpar(db):
    db.rollback()
    ids = db.scalars(
        select(Colaborador.id).where(Colaborador.nome.like(f"{MARCA}%"))
    ).all()
    if ids:
        db.execute(
            delete(AlteracaoMensal).where(AlteracaoMensal.colaborador_id.in_(ids))
        )
    db.execute(delete(Colaborador).where(Colaborador.nome.like(f"{MARCA}%")))
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
def colaborador(base, empresa):
    c = Colaborador(
        empresa_id=empresa.id,
        numero=f"{MARCA}1",
        nome=f"{MARCA} Colaborador de Prova",
        salario_base=Decimal("250000"),
        subsidios=Decimal("70000"),
        estado="activo",
    )
    base.add(c)
    base.commit()
    base.refresh(c)
    return c


class _Pedido:
    class client:  # noqa: N801
        host = "127.0.0.1"

    headers: dict = {}
    url = type("U", (), {"path": "/api/rh/alteracoes"})()
    method = "PUT"


# ---------------------------------------------------------------------------
# A fórmula, aplicada pela função e não refeita à mão
# ---------------------------------------------------------------------------
def test_recibo_sem_alteracoes(base, empresa, colaborador):
    r = svc.recibo_com(colaborador, cfg=svc.cfg_rh_default())

    assert r["base"] == Decimal("250000.00")
    assert r["bruto"] == Decimal("320000.00")
    # O INSS incide sobre a BASE, não sobre o bruto.
    assert r["inss"] == Decimal("7500.00")
    assert r["materia"] == Decimal("312500.00")
    assert r["irt"] == Decimal("51625.00")
    assert r["liquido"] == Decimal("260875.00")


def test_faltas_descontam_um_trinta_avos(colaborador):
    r = svc.recibo_com(
        colaborador, cfg=svc.cfg_rh_default(), faltas=Decimal("2")
    )

    assert r["desc_faltas"] == Decimal("16666.67")
    assert r["base"] == Decimal("233333.33")
    # E o INSS acompanha a base descontada — não a base do contrato.
    assert r["inss"] == Decimal("7000.00")


def test_abonos_acrescem_ao_bruto_e_descontos_ao_liquido(colaborador):
    cfg = svc.cfg_rh_default()
    limpo = svc.recibo_com(colaborador, cfg=cfg)
    com = svc.recibo_com(
        colaborador,
        cfg=cfg,
        abonos=[{"desc": "Prémio", "valor": "50000"}],
        descontos=[{"desc": "Adiantamento", "valor": "30000"}],
    )

    assert com["bruto"] == limpo["bruto"] + Decimal("50000")
    # O abono é tributado (sobe o IRT); o desconto sai depois, intacto.
    assert com["desc_extra"] == Decimal("30000.00")
    assert com["liquido"] == svc.r2(
        com["bruto"] - com["inss"] - com["irt"] - com["desc_extra"]
    )


def test_abono_nao_entra_na_base_do_inss(colaborador):
    """O INSS incide sobre o salário base — um prémio não o aumenta."""
    cfg = svc.cfg_rh_default()
    limpo = svc.recibo_com(colaborador, cfg=cfg)
    com = svc.recibo_com(
        colaborador, cfg=cfg, abonos=[{"desc": "Prémio", "valor": "50000"}]
    )
    assert com["inss"] == limpo["inss"]


# ---------------------------------------------------------------------------
# A pré-visualização é o processamento
# ---------------------------------------------------------------------------
def test_a_simulacao_da_o_mesmo_que_o_recibo_gravado(base, empresa, colaborador):
    """REGRESSÃO: no Piloto eram duas fórmulas — e bastava mexer numa."""
    valores = dict(
        faltas=Decimal("1"),
        abonos=[{"desc": "Prémio", "valor": "25000"}],
        descontos=[{"desc": "Adiantamento", "valor": "10000"}],
    )

    previsto = simular_alteracao(
        SimulacaoAlteracao(colaborador_id=colaborador.id, **valores),
        empresa,
        base,
    )

    gravar_alteracao(
        _Pedido(),
        colaborador.id,
        AlteracaoEntrada(mes="2026-07", **valores),
        empresa,
        base,
    )
    real = svc.recibo(
        base, empresa_id=empresa.id, colaborador=colaborador, mes="2026-07"
    )

    for campo in ("base", "bruto", "inss", "materia", "irt", "liquido"):
        assert previsto[campo] == real[campo], f"«{campo}» diverge"


def test_gravar_e_ler_conserva_as_rubricas(base, empresa, colaborador):
    gravar_alteracao(
        _Pedido(),
        colaborador.id,
        AlteracaoEntrada(
            mes="2026-07",
            faltas=Decimal("3"),
            abonos=[{"desc": "Horas extra", "valor": "40000"}],
            descontos=[{"desc": "Farmácia", "valor": "5000"}],
        ),
        empresa,
        base,
    )

    a = svc.alteracao_de(base, empresa.id, colaborador.id, "2026-07")
    assert a is not None
    assert a.faltas == Decimal("3")
    assert a.abonos == [{"desc": "Horas extra", "valor": "40000"}]
    assert a.descontos == [{"desc": "Farmácia", "valor": "5000"}]


# ---------------------------------------------------------------------------
# Mês pago é mês fechado
# ---------------------------------------------------------------------------
def test_mes_pago_recusa_alteracoes(base, empresa, colaborador, monkeypatch):
    """O Piloto só desactivava o botão. A regra passa a estar no servidor.

    Alterar as variáveis depois de o dinheiro sair deixava os recibos emitidos
    a dizer uma coisa e a ficha outra.
    """
    monkeypatch.setattr(svc, "mes_pago", lambda *a, **k: True)

    with pytest.raises(HTTPException) as erro:
        gravar_alteracao(
            _Pedido(),
            colaborador.id,
            AlteracaoEntrada(mes="2026-07", faltas=Decimal("1")),
            empresa,
            base,
        )

    assert erro.value.status_code == 409
    assert "paga" in erro.value.detail


def test_a_rota_de_simular_existe_e_nao_grava(base, empresa, colaborador):
    simular_alteracao(
        SimulacaoAlteracao(colaborador_id=colaborador.id, faltas=Decimal("5")),
        empresa,
        base,
    )
    assert svc.alteracao_de(base, empresa.id, colaborador.id, "2026-07") is None


def test_simular_confina_a_empresa(base, empresa, colaborador):
    """Um id de outra empresa não devolve recibo nenhum."""

    class _Outra:
        id = colaborador.empresa_id

    outra_id = base.scalar(
        select(Empresa.id).where(Empresa.id != empresa.id).limit(1)
    )
    if outra_id is None:
        pytest.skip("só há uma empresa na base")
    _Outra.id = outra_id

    with pytest.raises(HTTPException) as erro:
        simular_alteracao(
            SimulacaoAlteracao(colaborador_id=colaborador.id),
            _Outra(),
            base,
        )
    assert erro.value.status_code == 404
