"""Lançamentos diferidos: ficam de fora até serem integrados.

A razão de ser da funcionalidade não é a marca no ecrã — é o efeito nos mapas.
Um movimento diferido não conta no balancete, no razão, no extracto nem nos
apuramentos; depois de integrado conta em todos. Se o balancete não mudar, a
integração não serviu para nada, e é isso que estes testes fixam.

Vem do Piloto (`contabilidade.js:415-489`), onde `lancamentos()` filtra os
diferidos por omissão e `integrarLancamento()` os passa a contar.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.db.models.contabilidade import Conta, Diario, DocumentoContabilistico
from src.db.models.tenancy import Empresa
from src.services import contabilidade as svc


@pytest.fixture
def base():
    """Base real, numa transacção que se desfaz no fim."""
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def cenario(base):
    """Empresa, duas contas de movimento, um diário e um documento."""
    empresa = base.scalar(select(Empresa).limit(1))
    assert empresa is not None, "a base de demonstração precisa de uma empresa"

    contas = list(
        base.scalars(
            select(Conta)
            .where(Conta.empresa_id == empresa.id, Conta.tipo == "M")
            .limit(2)
        )
    )
    assert len(contas) == 2, "faltam contas de movimento"
    diario = base.scalar(select(Diario).where(Diario.empresa_id == empresa.id))
    doc = base.scalar(
        select(DocumentoContabilistico).where(
            DocumentoContabilistico.empresa_id == empresa.id
        )
    )
    return {
        "empresa_id": empresa.id,
        "debito": contas[0].codigo,
        "credito": contas[1].codigo,
        "diario": diario.codigo,
        "doc": doc.codigo,
    }


def _postar(db, c, *, valor="12345.00", diferido=False):
    return svc.postar(
        db,
        empresa_id=c["empresa_id"],
        data=date.today(),
        diario_codigo=c["diario"],
        documento_codigo=c["doc"],
        descricao="Prova de diferido",
        linhas=[
            {"conta_codigo": c["debito"], "debito": valor, "credito": "0"},
            {"conta_codigo": c["credito"], "debito": "0", "credito": valor},
        ],
        diferido=diferido,
        criado_por="teste",
    )


def _total(db, empresa_id) -> Decimal:
    return Decimal(svc.balancete(db, empresa_id=empresa_id)["totais"]["debito"])


# ---------------------------------------------------------------------------
# Fica de fora
# ---------------------------------------------------------------------------
def test_um_diferido_nao_conta_no_balancete(base, cenario):
    """REGRESSÃO: é a única coisa que distingue um diferido de um lançamento
    normal. Se contasse, o estado seria decorativo."""
    antes = _total(base, cenario["empresa_id"])
    _postar(base, cenario, diferido=True)
    assert _total(base, cenario["empresa_id"]) == antes


def test_um_lancamento_normal_conta(base, cenario):
    """O contraste que dá sentido ao teste anterior."""
    antes = _total(base, cenario["empresa_id"])
    _postar(base, cenario, valor="500.00", diferido=False)
    assert _total(base, cenario["empresa_id"]) == antes + Decimal("500.00")


def test_o_balancete_so_conta_integrados_por_construcao():
    """A regra está no `where`, não numa filtragem posterior que alguém possa
    esquecer de repetir noutro relatório."""
    import inspect

    assert "diferido" in inspect.getsource(svc.balancete)


# ---------------------------------------------------------------------------
# Integrar
# ---------------------------------------------------------------------------
def test_integrar_passa_a_contar(base, cenario):
    antes = _total(base, cenario["empresa_id"])
    lanc = _postar(base, cenario, valor="777.00", diferido=True)
    assert _total(base, cenario["empresa_id"]) == antes

    svc.integrar(base, lanc, por="teste")

    assert lanc.diferido is False
    assert lanc.integrado_em is not None
    assert lanc.integrado_por == "teste"
    assert _total(base, cenario["empresa_id"]) == antes + Decimal("777.00")


def test_integrar_duas_vezes_nao_duplica(base, cenario):
    """REGRESSÃO: um duplo clique no botão não pode somar o movimento duas
    vezes ao balancete."""
    lanc = _postar(base, cenario, valor="333.00", diferido=True)
    svc.integrar(base, lanc, por="teste")
    depois = _total(base, cenario["empresa_id"])

    svc.integrar(base, lanc, por="outro")

    assert _total(base, cenario["empresa_id"]) == depois
    # E não reescreve quem integrou primeiro.
    assert lanc.integrado_por == "teste"


def test_integrar_um_ja_integrado_devolve_o_mesmo(base, cenario):
    lanc = _postar(base, cenario, diferido=False)
    assert svc.integrar(base, lanc) is lanc


# ---------------------------------------------------------------------------
# A rota
# ---------------------------------------------------------------------------
def test_a_rota_de_integrar_exige_a_capacidade_de_lancar():
    """Ver é uma coisa, mudar o que entra no balancete é outra."""
    import inspect

    from src.api.routers import contabilidade_router as r

    fonte = inspect.getsource(r.integrar_lancamento)
    assert "dependencies=[LANCAR]" in inspect.getsource(r).split(
        "def integrar_lancamento"
    )[0].rsplit("@router.post", 1)[-1]
    # E confina à empresa da sessão — um id de outra empresa não abre.
    assert "Lancamento.empresa_id == empresa.id" in fonte


def test_a_rota_de_eliminar_confina_a_empresa():
    """REGRESSÃO: sem o filtro por empresa, conhecer o id chegava para apagar
    o movimento de outra."""
    import inspect

    from src.api.routers import contabilidade_router as r

    assert "Lancamento.empresa_id == empresa.id" in inspect.getsource(
        r.remover_lancamento
    )


def test_a_interface_tem_como_integrar():
    """REGRESSÃO: o endpoint existia e não estava ligado a botão nenhum — um
    diferido criado na aplicação ficava preso para sempre."""
    from pathlib import Path

    pagina = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "app"
        / "(app)"
        / "contabilidade"
        / "movimentos"
        / "page.tsx"
    )
    fonte = pagina.read_text(encoding="utf-8")
    assert "/integrar" in fonte
    assert "api.delete(`/api/contabilidade/lancamentos/" in fonte
    # Só a quem pode lançar.
    assert 'pode("contab.lancar")' in fonte
