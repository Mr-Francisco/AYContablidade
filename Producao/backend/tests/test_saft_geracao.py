"""Geração do SAF-T (AO) — passo 5, validado contra o esquema oficial.

**A validação contra o XSD é o teste.** Um SAF-T que não passa no esquema é uma
entrega falhada, e o prazo — dia 20 do mês seguinte — não pára. Por isso o
esquema oficial vem versionado com o código (`core/data/saft/`) e cada ficheiro
gerado é validado aqui, não só no fim.

Também se garante o que a validação NÃO apanha: um ficheiro pode ser válido e
estar errado. Um campo obrigatório em falta tem de dar erro com o nome do que
falta — nunca um valor inventado que passe no esquema e minta ao fisco.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.comercial import SerieDocumento, Venda, VendaLinha
from src.db.models.tenancy import Empresa
from src.services import comercial as svc
from src.services.facturacao import saft

MARCA = "T4"
#: O formato que o esquema exige:  ou . Foi o validador
#: que o revelou — a documentação diz só «número de validação atribuído ao
#: software».
VALIDACAO = "141/AGT/2026"


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
    db.execute(delete(SerieDocumento).where(SerieDocumento.ano == 2098))
    from src.db.models.terceiros import Terceiro

    db.execute(delete(Terceiro).where(Terceiro.numero.like(f"{MARCA}%")))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).limit(1))
    assert e is not None
    # O ficheiro precisa destes; a empresa de demonstração pode não os ter.
    if not e.morada:
        e.morada = "Rua de Teste, 1"
    if not e.localizacao:
        e.localizacao = "Luanda"
    base.flush()
    return e


def _emitir(db, empresa, *, tipo_doc="FT", total="1000", dia=5, taxa="NOR", motivo=None):
    v = Venda(
        empresa_id=empresa.id,
        tipo_doc=tipo_doc,
        tipo="servicos",
        data=date(2098, 3, dia),
        cliente_nome=f"{MARCA} Cliente",
        iva_perc=Decimal("14"),
        subtotal=Decimal(total),
        iva=Decimal(total) * Decimal("0.14"),
        total=Decimal(total) * Decimal("1.14"),
        estado="rascunho",
    )
    db.add(v)
    db.flush()
    db.add(VendaLinha(
        venda_id=v.id, ordem=0, descricao="Serviço prestado", unidade="UN",
        qtd=Decimal("1"), preco=Decimal(total), total=Decimal(total),
        taxa_codigo=taxa, taxa_perc=None, motivo_isencao=motivo,
    ))
    db.flush()
    db.refresh(v)
    svc.emitir(db, empresa_id=empresa.id, venda=v)
    db.flush()
    return v


# ---------------------------------------------------------------------------
# O teste que conta: valida contra o esquema oficial
# ---------------------------------------------------------------------------
def test_o_ficheiro_gerado_valida_contra_o_xsd_oficial(base, empresa):
    _emitir(base, empresa)
    _emitir(base, empresa, total="2500", dia=7)

    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    )
    valido, erros = saft.validar(xml)
    assert valido, "\n".join(erros[:8])


def test_um_ficheiro_de_periodo_vazio_tambem_valida(base, empresa):
    """Um mês sem facturas entrega-se na mesma — vazio, mas válido."""
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    )
    valido, erros = saft.validar(xml)
    assert valido, "\n".join(erros[:8])


def test_o_espaco_de_nomes_e_o_da_norma(base, empresa):
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    )
    assert b"urn:OECD:StandardAuditFile-Tax:AO_1.01_01" in xml


# ---------------------------------------------------------------------------
# O conteúdo
# ---------------------------------------------------------------------------
def test_a_factura_leva_o_resumo_encadeado(base, empresa):
    """O `Hash` do SAF-T é o que torna o ficheiro auditável."""
    v = _emitir(base, empresa)
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert v.hash_doc in xml
    assert f"<HashControl>{v.hash_controlo}</HashControl>" in xml


def test_o_numero_do_documento_vai_inteiro(base, empresa):
    v = _emitir(base, empresa)
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert f"<InvoiceNo>{v.numero}</InvoiceNo>" in xml


def test_a_nota_de_credito_debita_em_vez_de_creditar(base, empresa):
    """O sinal contabilístico do documento — o SAF-T lê-o da linha."""
    _emitir(base, empresa, tipo_doc="NC", total="300", dia=9)
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<DebitAmount>300.00</DebitAmount>" in xml


def test_a_proforma_nao_entra_no_ficheiro(base, empresa):
    """Não é documento fiscal: não se comunica nem se declara."""
    _emitir(base, empresa)
    v = _emitir(base, empresa, tipo_doc="PP", total="777", dia=11)

    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "777" not in xml
    assert (v.numero or "") not in xml


def test_a_tabela_de_impostos_traz_as_taxas_usadas(base, empresa):
    _emitir(base, empresa, taxa="NOR")
    _emitir(base, empresa, taxa="RED", total="500", dia=12)

    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "<TaxCode>NOR</TaxCode>" in xml
    assert "<TaxCode>RED</TaxCode>" in xml
    # E não traz as que não se usaram.
    assert "<TaxCode>CAB</TaxCode>" not in xml


def test_linha_isenta_leva_o_motivo(base, empresa):
    """DP 71/25, art. 10.º f) — sem fundamento, a factura é irregular."""
    _emitir(
        base, empresa, taxa="ISE", total="800", dia=14,
        motivo="Isento nos termos do artigo 12.º do CIVA",
    )
    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    ).decode()
    assert "artigo 12.º do CIVA" in xml


# ---------------------------------------------------------------------------
# Não se inventa o que falta
# ---------------------------------------------------------------------------
def test_sem_numero_de_validacao_do_software_recusa_e_diz_onde(base, empresa):
    """Um SAF-T que valida e está errado é pior do que um que não valida."""
    with pytest.raises(saft.DadosEmFalta) as erro:
        saft.gerar(
            base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
            numero_validacao=None,
        )
    m = str(erro.value)
    assert "número de validação do software" in m
    assert "Configurações" in m


def test_sem_morada_da_empresa_recusa(base, empresa):
    empresa.morada = None
    base.flush()
    with pytest.raises(saft.DadosEmFalta) as erro:
        saft.gerar(
            base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
            numero_validacao=VALIDACAO,
        )
    assert "morada" in str(erro.value)


def test_datas_ao_contrario_recusa(base, empresa):
    with pytest.raises(saft.ErroSaft):
        saft.gerar(
            base, empresa=empresa, de=date(2098, 3, 31), ate=date(2098, 3, 1),
            numero_validacao=VALIDACAO,
        )


def test_um_xml_estragado_e_apanhado_pela_validacao():
    valido, erros = saft.validar(b"<AuditFile>isto nao presta")
    assert valido is False
    assert erros


# ---------------------------------------------------------------------------
# Com ficha de cliente — o caso que os testes sintéticos não cobriam
# ---------------------------------------------------------------------------
def test_factura_a_cliente_com_ficha_valida(base, empresa):
    """REGRESSÃO REAL: o primeiro ficheiro gerado a partir da base de
    demonstração foi recusado pelo esquema.

    O `CustomerID` caía no UUID do cliente — 36 caracteres — e o esquema
    limita-o a 30. Os testes com `cliente_nome` e sem `cliente_id` nunca lá
    chegavam, porque tomavam o caminho do consumidor final.

    E o identificador tem de ser O MESMO nos `MasterFiles` e na factura: o
    esquema liga-os por restrição de chave.
    """
    from src.db.models.terceiros import Terceiro

    # Cria-se aqui em vez de procurar um: um teste que salta quando a base não
    # tem clientes é um teste que não corre no dia em que é preciso.
    cliente = Terceiro(
        empresa_id=empresa.id,
        tipo="cliente",
        numero=f"{MARCA}C1",
        nome=f"{MARCA} Cliente com ficha",
        nif="5417044907",
        morada="Rua do Teste, 10",
        localidade="Luanda",
    )
    base.add(cliente)
    base.flush()

    v = _emitir(base, empresa, dia=18)
    v.cliente_id = cliente.id
    base.flush()

    xml = saft.gerar(
        base, empresa=empresa, de=date(2098, 3, 1), ate=date(2098, 3, 31),
        numero_validacao=VALIDACAO,
    )
    valido, erros = saft.validar(xml)
    assert valido, chr(10).join(erros[:6])

    texto = xml.decode()
    # O mesmo identificador nos dois sítios, e dentro do limite.
    import re as _re
    ids = set(_re.findall(r"<CustomerID>([^<]+)</CustomerID>", texto))
    assert ids, "a factura tem de identificar o cliente"
    for i in ids:
        assert len(i) <= 30, f"«{i}» excede o limite de 30 do esquema"
