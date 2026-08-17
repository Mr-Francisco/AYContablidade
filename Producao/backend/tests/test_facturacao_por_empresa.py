"""As facturas de uma empresa NUNCA se misturam com as de outra.

É a propriedade que não pode falhar nem uma vez. Duas empresas no mesmo SGD
são dois contribuintes diferentes perante a AGT: uma numeração partilhada, uma
cadeia de resumos cruzada ou um SAF-T com um documento alheio não é um defeito
de apresentação — é uma declaração fiscal errada, entregue em nome de quem não
a fez.

O que se prova aqui, empresa a empresa:

1. **Séries separadas.** Cada empresa tem a sua, com o mesmo código e sem se
   verem.
2. **Numeração independente.** As duas começam em 1 e não se atropelam.
3. **Cadeias independentes.** O resumo de um documento nunca aponta para um
   documento de outra empresa.
4. **SAF-T fechado.** O ficheiro de uma empresa não contém nada da outra —
   nem facturas, nem clientes, nem artigos.

Estes testes criam DUAS empresas de propósito. Testar isolamento com uma só é
não testar nada.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.core.constants import EstadoEmpresa
from src.db.models.comercial import SerieDocumento, Venda, VendaLinha
from src.db.models.tenancy import Empresa
from src.db.models.terceiros import Terceiro
from src.services import comercial as svc
from src.services.seed import seed_empresa
from src.services.facturacao import saft
from src.services.facturacao import series as svc_series

MARCA = "T3"
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
    empresas = list(db.scalars(select(Empresa.id).where(Empresa.codigo.like(f"{MARCA}%"))))
    if empresas:
        vendas = list(db.scalars(select(Venda.id).where(Venda.empresa_id.in_(empresas))))
        if vendas:
            db.execute(delete(VendaLinha).where(VendaLinha.venda_id.in_(vendas)))
            db.execute(delete(Venda).where(Venda.id.in_(vendas)))
        db.execute(delete(SerieDocumento).where(SerieDocumento.empresa_id.in_(empresas)))
        db.execute(delete(Terceiro).where(Terceiro.empresa_id.in_(empresas)))
        db.execute(delete(Empresa).where(Empresa.id.in_(empresas)))
    db.commit()


def _empresa(db, sufixo: str) -> Empresa:
    e = Empresa(
        nome=f"{MARCA} Empresa {sufixo}",
        nif=f"500000{sufixo}999",
        codigo=f"{MARCA}{sufixo}",
        morada="Rua de Teste, 1",
        localizacao="Luanda",
        estado=EstadoEmpresa.ACTIVA,
    )
    db.add(e)
    db.flush()
    # UMA EMPRESA SEM PLANO DE CONTAS NÃO FACTURA. O seed é o mesmo que corre
    # na activação de uma licença: sem ele, emitir rebenta na contabilidade — o
    # que este teste descobriu à primeira, e é bom que assim seja.
    seed_empresa(db, e, ano=2097)
    db.flush()
    return e


def _emitir(db, empresa, *, total="1000", dia=5, cliente=None):
    v = Venda(
        empresa_id=empresa.id,
        tipo_doc="FT",
        tipo="servicos",
        data=date(2097, 5, dia),
        cliente_id=cliente.id if cliente else None,
        cliente_nome=(cliente.nome if cliente else f"{MARCA} Consumidor"),
        iva_perc=Decimal("14"),
        subtotal=Decimal(total),
        iva=Decimal(total) * Decimal("0.14"),
        total=Decimal(total) * Decimal("1.14"),
        estado="rascunho",
    )
    db.add(v)
    db.flush()
    db.add(VendaLinha(
        venda_id=v.id, ordem=0, descricao=f"Serviço da {empresa.codigo}",
        unidade="UN", qtd=Decimal("1"), preco=Decimal(total),
        total=Decimal(total), taxa_codigo="NOR",
    ))
    db.flush()
    db.refresh(v)
    svc.emitir(db, empresa_id=empresa.id, venda=v)
    db.flush()
    return v


# ---------------------------------------------------------------------------
# 1. Séries separadas
# ---------------------------------------------------------------------------
def test_cada_empresa_tem_a_sua_serie(base):
    a, b = _empresa(base, "A"), _empresa(base, "B")

    sa = svc_series.obter_ou_criar(base, empresa_id=a.id, tipo_doc="FT", ano=2097)
    sb = svc_series.obter_ou_criar(base, empresa_id=b.id, tipo_doc="FT", ano=2097)

    assert sa.id != sb.id
    assert sa.empresa_id == a.id and sb.empresa_id == b.id
    # O código é o mesmo — e pode ser, porque a unicidade é por empresa.
    assert sa.codigo == sb.codigo == "FT2097S1"


# ---------------------------------------------------------------------------
# 2. Numeração independente
# ---------------------------------------------------------------------------
def test_a_numeracao_de_uma_nao_avanca_a_da_outra(base):
    """Se se atropelassem, a segunda empresa saltava números — e uma sequência
    com buracos é coisa que se tem de explicar à AGT."""
    a, b = _empresa(base, "A"), _empresa(base, "B")

    for _ in range(3):
        svc_series.proximo_numero(base, empresa_id=a.id, tipo_doc="FT", ano=2097)

    _, seq_b, numero_b = svc_series.proximo_numero(
        base, empresa_id=b.id, tipo_doc="FT", ano=2097
    )
    assert seq_b == 1, "a segunda empresa tem de começar do princípio"
    assert numero_b == "FT FT2097S1/00001"


def test_as_duas_podem_ter_o_mesmo_numero_de_factura(base):
    """E devem: são dois contribuintes diferentes, cada um com a sua numeração."""
    a, b = _empresa(base, "A"), _empresa(base, "B")
    va = _emitir(base, a)
    vb = _emitir(base, b)

    assert va.numero == vb.numero
    assert va.empresa_id != vb.empresa_id


# ---------------------------------------------------------------------------
# 3. Cadeias independentes
# ---------------------------------------------------------------------------
def test_a_cadeia_de_uma_empresa_nao_toca_na_da_outra(base):
    """O caso que mais preocupa: um documento a apontar para o resumo de um
    documento de outra empresa. Ficariam duas cadeias entrelaçadas, e a
    verificação de qualquer uma delas passaria a depender da outra."""
    a, b = _empresa(base, "A"), _empresa(base, "B")

    a1 = _emitir(base, a, total="100", dia=1)
    b1 = _emitir(base, b, total="200", dia=2)
    a2 = _emitir(base, a, total="300", dia=3)
    b2 = _emitir(base, b, total="400", dia=4)

    # Cada primeira factura não tem anterior.
    assert a1.hash_anterior is None
    assert b1.hash_anterior is None
    # E cada segunda aponta para a primeira DA SUA empresa.
    assert a2.hash_anterior == a1.hash_doc
    assert b2.hash_anterior == b1.hash_doc
    # Nunca para a outra.
    assert a2.hash_anterior != b1.hash_doc
    assert b2.hash_anterior != a1.hash_doc


def test_o_ultimo_resumo_fica_na_serie_certa(base):
    a, b = _empresa(base, "A"), _empresa(base, "B")
    va = _emitir(base, a, total="100")
    vb = _emitir(base, b, total="900")

    serie_a = base.get(SerieDocumento, va.serie_id)
    serie_b = base.get(SerieDocumento, vb.serie_id)
    assert serie_a.ultimo_hash == va.hash_doc
    assert serie_b.ultimo_hash == vb.hash_doc
    assert serie_a.ultimo_hash != serie_b.ultimo_hash


# ---------------------------------------------------------------------------
# 4. O SAF-T de uma empresa é só dela
# ---------------------------------------------------------------------------
def test_o_saft_de_uma_empresa_nao_leva_nada_da_outra(base):
    """O teste que resume tudo: o ficheiro que se entrega à AGT em nome de uma
    empresa não pode conter uma linha da outra."""
    a, b = _empresa(base, "A"), _empresa(base, "B")

    cliente_b = Terceiro(
        empresa_id=b.id, tipo="cliente", numero=f"{MARCA}CB",
        nome=f"{MARCA} Cliente exclusivo da B", nif="5417044907",
        morada="Rua da B, 2", localidade="Benguela",
    )
    base.add(cliente_b)
    base.flush()

    _emitir(base, a, total="111", dia=6)
    _emitir(base, b, total="222", dia=7, cliente=cliente_b)

    xml_a = saft.gerar(
        base, empresa=a, de=date(2097, 5, 1), ate=date(2097, 5, 31),
        numero_validacao=VALIDACAO,
    ).decode()

    valido, erros = saft.validar(xml_a.encode())
    assert valido, chr(10).join(erros[:5])

    # O que É da empresa A está lá.
    assert "111.00" in xml_a
    assert a.nif in xml_a
    # O que é da B NÃO está — nem o valor, nem o cliente, nem o NIF.
    assert "222.00" not in xml_a
    assert "Cliente exclusivo da B" not in xml_a
    assert b.nif not in xml_a
    assert "Serviço da T3B" not in xml_a


def test_o_saft_da_outra_empresa_tambem_e_so_dela(base):
    """A simetria interessa: um isolamento que só funciona num sentido não é
    isolamento."""
    a, b = _empresa(base, "A"), _empresa(base, "B")
    _emitir(base, a, total="111", dia=6)
    _emitir(base, b, total="222", dia=7)

    xml_b = saft.gerar(
        base, empresa=b, de=date(2097, 5, 1), ate=date(2097, 5, 31),
        numero_validacao=VALIDACAO,
    ).decode()

    assert "222.00" in xml_b
    assert "111.00" not in xml_b
    assert a.nif not in xml_b


def test_o_cabecalho_identifica_a_empresa_certa(base):
    """O SAF-T é entregue EM NOME de um contribuinte. O NIF no cabeçalho é
    quem responde pelo ficheiro."""
    a, b = _empresa(base, "A"), _empresa(base, "B")
    _emitir(base, a)
    _emitir(base, b)

    for empresa in (a, b):
        xml = saft.gerar(
            base, empresa=empresa, de=date(2097, 5, 1), ate=date(2097, 5, 31),
            numero_validacao=VALIDACAO,
        ).decode()
        assert f"<TaxRegistrationNumber>{empresa.nif}</TaxRegistrationNumber>" in xml
        assert f"<CompanyName>{empresa.nome}</CompanyName>" in xml
