"""SAF-T de «Aquisição de bens e serviços» — o segundo ficheiro mensal.

Mesmo prazo do de facturação (dia 20 do mês seguinte) e o mesmo `AuditFile`,
com `TaxAccountingBasis = "A"` e os blocos das compras: `Supplier` em vez de
`Customer`, `PurchaseInvoices` em vez de `SalesInvoices`.

A diferença de fundo, e está no código: **uma compra não leva cadeia de
resumos**. O documento não foi emitido por nós — quem responde pela sua
integridade é quem o emitiu. O que declaramos é o que recebemos.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.comercial import Compra, CompraLinha
from src.db.models.tenancy import Empresa
from src.db.models.terceiros import Terceiro
from src.services.facturacao import saft

MARCA = "T2"
VALIDACAO = "0"


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
    ids = list(
        db.scalars(select(Compra.id).where(Compra.fornecedor_nome.like(f"{MARCA}%")))
    )
    if ids:
        db.execute(delete(CompraLinha).where(CompraLinha.compra_id.in_(ids)))
        db.execute(delete(Compra).where(Compra.id.in_(ids)))
    db.execute(delete(Terceiro).where(Terceiro.numero.like(f"{MARCA}%")))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001")) or base.scalar(
        select(Empresa).order_by(Empresa.criado_em).limit(1)
    )
    assert e is not None
    if not e.morada:
        e.morada, e.localizacao = "Rua de Teste, 1", "Luanda"
        base.flush()
    return e


def _compra(db, empresa, *, total="5000", dia=8, fornecedor=None):
    c = Compra(
        empresa_id=empresa.id,
        numero=f"CP 2096/{dia:04d}",
        documento_codigo="611",
        documento_nome="Factura de fornecedor",
        data=date(2096, 4, dia),
        fornecedor_id=fornecedor.id if fornecedor else None,
        fornecedor_nome=(fornecedor.nome if fornecedor else f"{MARCA} Fornecedor"),
        iva_perc=Decimal("14"),
        subtotal=Decimal(total),
        iva=Decimal(total) * Decimal("0.14"),
        total=Decimal(total) * Decimal("1.14"),
        estado="emitida",
    )
    db.add(c)
    db.flush()
    db.add(
        CompraLinha(
            compra_id=c.id,
            ordem=0,
            descricao="Material de escritório",
            unidade="UN",
            qtd=Decimal("10"),
            preco=Decimal(total) / 10,
            total=Decimal(total),
        )
    )
    db.flush()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
def test_o_ficheiro_de_compras_valida_contra_o_xsd(base, empresa):
    fornecedor = Terceiro(
        empresa_id=empresa.id,
        tipo="fornecedor",
        numero=f"{MARCA}F1",
        nome=f"{MARCA} Papelaria Central, Lda.",
        nif="5402132186",
        morada="Rua do Comércio, 40",
        localidade="Luanda",
    )
    base.add(fornecedor)
    base.flush()

    _compra(base, empresa, fornecedor=fornecedor)
    _compra(base, empresa, total="2500", dia=12)

    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    )
    valido, erros = saft.validar(xml)
    assert valido, chr(10).join(erros[:6])
    assert xml.count(b"<Invoice>") == 2


def test_o_tipo_de_ficheiro_e_aquisicao(base, empresa):
    """`A` e não `F`: é o campo que diz à AGT que ficheiro está a receber."""
    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<TaxAccountingBasis>A</TaxAccountingBasis>" in xml


def test_o_de_facturacao_continua_a_ser_facturacao(base, empresa):
    """REGRESSÃO A EVITAR: ao acrescentar o tipo de ficheiro, trocar o do
    outro. Os dois seguem para a AGT e o campo distingue-os."""
    xml = saft.gerar(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<TaxAccountingBasis>F</TaxAccountingBasis>" in xml


def test_o_fornecedor_entra_nos_mestres(base, empresa):
    fornecedor = Terceiro(
        empresa_id=empresa.id, tipo="fornecedor", numero=f"{MARCA}F2",
        nome=f"{MARCA} Distribuidora do Sul", nif="5410000064",
        morada="Av. 4 de Fevereiro", localidade="Benguela",
    )
    base.add(fornecedor)
    base.flush()
    _compra(base, empresa, fornecedor=fornecedor, dia=15)

    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<Supplier>" in xml
    assert "Distribuidora do Sul" in xml
    assert "5410000064" in xml
    # E não há clientes num ficheiro de compras.
    assert "<Customer>" not in xml


def test_a_compra_declara_totais_e_nao_linhas(base, empresa):
    """O que se declara numa aquisição são os TOTAIS, não a discriminação.

    Escrevi este teste à espera de encontrar `DebitAmount` nas linhas, como no
    ficheiro de facturação. O validador corrigiu-me: uma factura de compra no
    SAF-T angolano é cabeçalho e `DocumentTotals` — sem `Line` nenhuma.

    E faz sentido. O que a empresa declara ao comprar é o que pagou e o imposto
    que suportou; a discriminação do que foi vendido é a declaração do
    fornecedor, não a nossa.
    """
    _compra(base, empresa, total="777", dia=20)
    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<NetTotal>777.00</NetTotal>" in xml
    assert "<TaxPayable>108.78</TaxPayable>" in xml
    assert "<Line>" not in xml


def test_a_compra_nao_leva_cadeia_de_resumos(base, empresa):
    """O documento não foi emitido por nós.

    Pôr ali um resumo calculado por nós seria assinar a integridade de um
    documento de outra pessoa.
    """
    _compra(base, empresa, dia=22)
    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<Hash>0</Hash>" in xml


def test_um_mes_sem_compras_gera_ficheiro_valido(base, empresa):
    """Entrega-se na mesma: a obrigação é mensal, haja ou não movimento."""
    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    )
    valido, erros = saft.validar(xml)
    assert valido, chr(10).join(erros[:5])


def test_as_compras_de_outra_empresa_nao_entram(base, empresa):
    """A mesma regra do outro ficheiro: nunca se misturam empresas."""
    outra = base.scalar(
        select(Empresa).where(Empresa.id != empresa.id).limit(1)
    )
    if outra is None:
        pytest.skip("só há uma empresa na base")

    _compra(base, empresa, total="111", dia=25)
    c = _compra(base, outra, total="999", dia=26)
    c.empresa_id = outra.id
    base.flush()

    xml = saft.gerar_compras(
        base, empresa=empresa, de=date(2096, 4, 1), ate=date(2096, 4, 30),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "111.00" in xml
    assert "999.00" not in xml
