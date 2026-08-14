"""Anular um movimento de stock: por estorno, nunca por eliminação.

O Piloto apaga a linha e avisa, num `confirm()`, que «não reverte o lançamento
contabilístico». Numa demonstração em `localStorage` isso passa. Aqui não: o
movimento gerou um lançamento a sério, e apagar um sem o outro deixa a
existência fora do mapa e o custo na classe 6 — uma discordância que ninguém
encontra até ao fecho do exercício.

O que estes testes fixam é a regra que ficou no lugar dela: o original fica
intacto e marcado, nasce um movimento contrário que o referencia, e o
lançamento é revertido com as mesmas linhas de débito e crédito trocadas.

São testes contra a base a sério, e não contra uma sessão falsa: o que aqui
interessa é justamente que o stock e o balancete voltem ao sítio, e isso só se
mede somando o que ficou gravado.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import select

from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.db.models.tenancy import Empresa
from src.services import logistica as svc
from src.services.contabilidade import ErroContabilistico


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def cenario(base):
    """Um artigo e um armazém próprios, para não mexer nos dados de demonstração."""
    # A empresa vem PELO ARMAZÉM e não ao contrário: há mais do que uma
    # empresa na base, e a primeira pode não ter logística montada.
    armazem = base.scalar(select(Armazem).limit(1))
    assert armazem is not None, "a base de demonstração precisa de um armazém"
    empresa = base.get(Empresa, armazem.empresa_id)

    artigo = Artigo(
        empresa_id=empresa.id, codigo="TST-ANUL", descricao="Artigo de ensaio",
        tipo_artigo="Mercadoria", unidade="Un", preco_venda=Decimal("100"),
        preco_compra=Decimal("50"), taxa_iva=Decimal("14"),
        stock_min=Decimal("0"), estado="activo",
    )
    base.add(artigo)
    base.flush()
    return base, empresa.id, artigo.id, armazem.id


def _stock(db, empresa_id, artigo_id, armazem_id):
    return svc.stock(
        db, empresa_id=empresa_id, artigo_id=artigo_id, armazem_id=armazem_id
    )


def test_anular_uma_recepcao_devolve_o_stock_ao_que_era(cenario):
    db, empresa_id, artigo_id, armazem_id = cenario
    antes = _stock(db, empresa_id, artigo_id, armazem_id)

    mov = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("10"), custo_unit=Decimal("50"),
        data=date.today(),
    )
    assert _stock(db, empresa_id, artigo_id, armazem_id) == antes + 10

    original, inverso = svc.anular_movimento(
        db, empresa_id=empresa_id, movimento_id=mov.id
    )

    assert _stock(db, empresa_id, artigo_id, armazem_id) == antes
    # O original NÃO desaparece — é isso que distingue estorno de eliminação.
    assert db.get(MovimentoStock, mov.id) is not None
    assert original.estornado_em is not None
    assert inverso.estorna_id == mov.id
    assert inverso.tipo == "saida"


def test_o_lancamento_e_revertido_com_as_mesmas_contas(cenario):
    """As linhas do estorno são as do original com D e C trocados.

    Reconstruir o estorno a partir da configuração seria frágil: se as contas
    de existências ou de contrapartida mudaram entretanto, o estorno lançava
    noutro sítio e nunca fechava com o movimento que diz anular.
    """
    db, empresa_id, artigo_id, armazem_id = cenario
    mov = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("4"), custo_unit=Decimal("25"),
        data=date.today(),
    )
    assert mov.lancamento_id is not None, "a recepção tinha de gerar lançamento"

    from src.db.models.contabilidade import Lancamento

    lanc_original = db.get(Lancamento, mov.lancamento_id)
    original_por_conta = {
        l.conta_codigo: (l.debito or 0, l.credito or 0) for l in lanc_original.linhas
    }

    _, inverso = svc.anular_movimento(
        db, empresa_id=empresa_id, movimento_id=mov.id
    )
    assert inverso.lancamento_id is not None
    estorno = db.get(Lancamento, inverso.lancamento_id)

    estorno_por_conta = {
        l.conta_codigo: (l.debito or 0, l.credito or 0) for l in estorno.linhas
    }
    assert set(estorno_por_conta) == set(original_por_conta)
    for conta, (deb, cred) in original_por_conta.items():
        assert estorno_por_conta[conta] == (cred, deb), conta


def test_nao_se_anula_duas_vezes(cenario):
    db, empresa_id, artigo_id, armazem_id = cenario
    mov = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("3"), custo_unit=Decimal("10"),
        data=date.today(),
    )
    svc.anular_movimento(db, empresa_id=empresa_id, movimento_id=mov.id)

    with pytest.raises(ErroContabilistico, match="já foi anulado"):
        svc.anular_movimento(db, empresa_id=empresa_id, movimento_id=mov.id)


def test_nao_se_anula_a_propria_anulacao(cenario):
    db, empresa_id, artigo_id, armazem_id = cenario
    mov = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("3"), custo_unit=Decimal("10"),
        data=date.today(),
    )
    _, inverso = svc.anular_movimento(
        db, empresa_id=empresa_id, movimento_id=mov.id
    )

    with pytest.raises(ErroContabilistico, match="É a anulação de outro"):
        svc.anular_movimento(db, empresa_id=empresa_id, movimento_id=inverso.id)


def test_recusa_quando_o_que_entrou_ja_saiu(cenario):
    """Reverter uma entrada tira stock. Se já saiu, não há o que devolver."""
    db, empresa_id, artigo_id, armazem_id = cenario
    entrada = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("5"), custo_unit=Decimal("10"),
        data=date.today(),
    )
    svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="saida", artigo_id=artigo_id,
        armazem_id=armazem_id, qtd=Decimal("5"), data=date.today(),
    )

    with pytest.raises(ErroContabilistico, match="Não há stock para reverter"):
        svc.anular_movimento(db, empresa_id=empresa_id, movimento_id=entrada.id)


def test_a_transferencia_volta_por_onde_veio(cenario):
    db, empresa_id, artigo_id, armazem_id = cenario
    outro = db.scalar(
        select(Armazem).where(
            Armazem.empresa_id == empresa_id, Armazem.id != armazem_id
        )
    )
    if outro is None:
        pytest.skip("a base de demonstração só tem um armazém")

    svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("8"), custo_unit=Decimal("10"),
        data=date.today(),
    )
    origem_antes = _stock(db, empresa_id, artigo_id, armazem_id)
    destino_antes = _stock(db, empresa_id, artigo_id, outro.id)

    trf = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="transferencia", artigo_id=artigo_id,
        armazem_id=armazem_id, armazem_destino_id=outro.id,
        qtd=Decimal("3"), data=date.today(),
    )
    assert _stock(db, empresa_id, artigo_id, outro.id) == destino_antes + 3

    _, inverso = svc.anular_movimento(
        db, empresa_id=empresa_id, movimento_id=trf.id
    )

    assert _stock(db, empresa_id, artigo_id, armazem_id) == origem_antes
    assert _stock(db, empresa_id, artigo_id, outro.id) == destino_antes
    # A mercadoria volta por onde veio: origem e destino trocados.
    assert inverso.armazem_id == outro.id
    assert inverso.armazem_destino_id == armazem_id


def test_um_movimento_de_outra_empresa_nao_se_alcanca(cenario):
    db, empresa_id, artigo_id, armazem_id = cenario
    mov = svc.registar_movimento(
        db, empresa_id=empresa_id, tipo="entrada", artigo_id=artigo_id,
        armazem_id=armazem_id, entidade="Fornecedor de Ensaio", qtd=Decimal("2"), custo_unit=Decimal("10"),
        data=date.today(),
    )
    outra = UUID("00000000-0000-0000-0000-0000000000ff")

    with pytest.raises(ErroContabilistico, match="não encontrado"):
        svc.anular_movimento(db, empresa_id=outra, movimento_id=mov.id)
