"""Emissão de documentos com série e cadeia — passos 2 e 3, ligados à emissão.

Não chega o motor da cadeia estar certo: o que conta é a emissão REAL passar
por ele. Estes testes emitem documentos como o ecrã emite e verificam o que
ficou gravado.

O que se garante:

1. O número tem a forma que a AGT quer — `FT FT2026S1/00001`.
2. A numeração é por tipo e por ano: uma factura e uma nota de crédito não
   partilham sequência.
3. A cadeia de resumos fica intacta entre documentos seguidos.
4. A pró-forma **não gasta** numeração fiscal.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.comercial import SerieDocumento, Venda, VendaLinha
from src.db.models.tenancy import Empresa
from src.services import comercial as svc
from src.services.facturacao import cadeia
from src.services.facturacao import series as svc_series

MARCA = "T5"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


def _limpar(db):
    db.rollback()
    ids = list(db.scalars(select(Venda.id).where(Venda.cliente_nome.like(f"{MARCA}%"))))
    if ids:
        db.execute(delete(VendaLinha).where(VendaLinha.venda_id.in_(ids)))
        db.execute(delete(Venda).where(Venda.id.in_(ids)))
    db.execute(delete(SerieDocumento).where(SerieDocumento.ano == 2099))
    db.commit()


@pytest.fixture
def empresa_id(base):
    e = base.scalar(select(Empresa.id).limit(1))
    assert e is not None
    return e


def _venda(db, empresa_id, tipo_doc="FT", total="1000", dia=1):
    v = Venda(
        empresa_id=empresa_id,
        tipo_doc=tipo_doc,
        tipo="servicos",
        data=date(2099, 1, dia),
        cliente_nome=f"{MARCA} Cliente",
        iva_perc=Decimal("14"),
        subtotal=Decimal(total),
        iva=Decimal("0"),
        total=Decimal(total),
        estado="rascunho",
    )
    db.add(v)
    db.flush()
    return v


# ---------------------------------------------------------------------------
# 1. A forma do número
# ---------------------------------------------------------------------------
def test_o_numero_tem_a_forma_que_a_agt_quer(base, empresa_id):
    """`FT FT2099S1/00001` — tipo, código da série, sequencial de cinco dígitos."""
    serie, seq, numero = svc_series.proximo_numero(
        base, empresa_id=empresa_id, tipo_doc="FT", ano=2099
    )
    assert serie.codigo == "FT2099S1"
    assert numero == "FT FT2099S1/00001"
    assert seq == 1


def test_a_sequencia_avanca_e_nao_recua(base, empresa_id):
    for esperado in (1, 2, 3):
        _, seq, _ = svc_series.proximo_numero(
            base, empresa_id=empresa_id, tipo_doc="FT", ano=2099
        )
        assert seq == esperado


# ---------------------------------------------------------------------------
# 2. Por tipo e por ano
# ---------------------------------------------------------------------------
def test_cada_tipo_tem_a_sua_sequencia(base, empresa_id):
    """DP 71/25 art. 10.º b): por tipo de documento. Uma nota de crédito não
    pode consumir numeração das facturas."""
    _, seq_ft, num_ft = svc_series.proximo_numero(
        base, empresa_id=empresa_id, tipo_doc="FT", ano=2099
    )
    _, seq_nc, num_nc = svc_series.proximo_numero(
        base, empresa_id=empresa_id, tipo_doc="NC", ano=2099
    )
    assert seq_ft == 1 and seq_nc == 1
    assert num_ft.startswith("FT ") and num_nc.startswith("NC ")


def test_cada_ano_recomeca(base, empresa_id):
    """«por ano fiscal» — a sequência de 2099 não continua a de 2098."""
    svc_series.proximo_numero(base, empresa_id=empresa_id, tipo_doc="FT", ano=2099)
    _, seq, _ = svc_series.proximo_numero(
        base, empresa_id=empresa_id, tipo_doc="FT", ano=2098
    )
    assert seq == 1
    base.execute(delete(SerieDocumento).where(SerieDocumento.ano == 2098))


def test_serie_encerrada_recusa_e_diz_porque(base, empresa_id):
    serie = svc_series.obter_ou_criar(
        base, empresa_id=empresa_id, tipo_doc="FT", ano=2099
    )
    svc_series.encerrar(base, serie)
    base.flush()

    with pytest.raises(svc_series.ErroSerie) as erro:
        svc_series.proximo_numero(base, empresa_id=empresa_id, tipo_doc="FT", ano=2099)
    assert "encerrada" in str(erro.value)
    assert "série nova" in str(erro.value)


# ---------------------------------------------------------------------------
# 3. A cadeia, na emissão a sério
# ---------------------------------------------------------------------------
def test_emitir_encadeia_os_documentos(base, empresa_id):
    """O teste que interessa: três facturas emitidas, cadeia intacta."""
    emitidos = []
    for i in (1, 2, 3):
        v = _venda(base, empresa_id, total=str(100 * i), dia=i)
        svc.emitir(base, empresa_id=empresa_id, venda=v)
        base.flush()
        emitidos.append(v)

    # A primeira não tem anterior; as outras apontam para a de trás.
    assert emitidos[0].hash_anterior is None
    for antes, depois in zip(emitidos, emitidos[1:], strict=False):
        assert depois.hash_anterior == antes.hash_doc

    intacta, onde = cadeia.cadeia_intacta([
        {
            "data_doc": v.data,
            "entrada_sistema": v.entrada_sistema,
            "numero": v.numero,
            "total": v.total,
            "hash_anterior": v.hash_anterior,
            "hash_doc": v.hash_doc,
        }
        for v in emitidos
    ])
    assert intacta is True, onde


def test_o_documento_emitido_leva_codigo_de_controlo(base, empresa_id):
    v = _venda(base, empresa_id)
    svc.emitir(base, empresa_id=empresa_id, venda=v)
    base.flush()
    assert v.hash_controlo and len(v.hash_controlo) == 4


def test_alterar_o_total_depois_de_emitir_e_detectavel(base, empresa_id):
    """É para isto que a cadeia existe."""
    v = _venda(base, empresa_id)
    svc.emitir(base, empresa_id=empresa_id, venda=v)
    base.flush()

    v.total = Decimal("999999")  # alteração à socapa
    intacta, onde = cadeia.cadeia_intacta([{
        "data_doc": v.data, "entrada_sistema": v.entrada_sistema,
        "numero": v.numero, "total": v.total,
        "hash_anterior": v.hash_anterior, "hash_doc": v.hash_doc,
    }])
    assert intacta is False
    assert "alterado" in onde


def test_a_serie_guarda_o_ultimo_resumo(base, empresa_id):
    """É o que permite encadear o documento seguinte sem percorrer a série."""
    v = _venda(base, empresa_id)
    svc.emitir(base, empresa_id=empresa_id, venda=v)
    base.flush()
    serie = base.get(SerieDocumento, v.serie_id)
    assert serie.ultimo_hash == v.hash_doc


# ---------------------------------------------------------------------------
# 4. A pró-forma não é documento fiscal
# ---------------------------------------------------------------------------
def test_a_proforma_nao_gasta_numeracao_fiscal(base, empresa_id):
    """Gastar números de série com pró-formas abria buracos na sequência que a
    AGT vê — e uma sequência com buracos é o que se tem de explicar."""
    assert svc_series.pode_emitir("PP") is False

    v = _venda(base, empresa_id, tipo_doc="PP")
    svc.emitir(base, empresa_id=empresa_id, venda=v)
    base.flush()

    assert v.serie_id is None
    assert v.estado_agt == "nao_aplicavel"


def test_o_documento_fiscal_fica_por_comunicar(base, empresa_id):
    v = _venda(base, empresa_id)
    svc.emitir(base, empresa_id=empresa_id, venda=v)
    base.flush()
    assert v.estado_agt == "por_comunicar"
    assert v.estado_saft == "N"
