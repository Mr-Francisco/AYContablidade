"""A amortização só se escreve na ficha se o lançamento passar.

O defeito que estes testes prendem: `processar_periodo` escrevia
`a.amort_acumulada` ANTES de tentar o lançamento. Havia duas maneiras de o
activo ficar amortizado na ficha e não nas contas —

1. o `postar` falhava, e a amortização acumulada já estava escrita;
2. o activo não tinha contas de amortização definidas, e o lançamento nem era
   tentado: nem erro havia.

Nos dois casos o mapa de imobilizados passava a discordar do balanço, em
silêncio, até ao fecho do exercício. Um activo mal configurado numa empresa com
cem é exactamente a coisa que ninguém encontra.

A regra que fica: por activo, OU VAI AOS DOIS SÍTIOS OU NÃO VAI A NENHUM. Um
activo que falhe não impede os outros — bloquear o mês inteiro por causa de um
seria trocar uma inconsistência por uma paragem — mas fica na lista de erros e
não é amortizado.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.db.models.imobilizados import Ativo
from src.db.models.tenancy import Empresa, Exercicio
from src.services import imobilizados as svc


@pytest.fixture
def base():
    """Sessão que NÃO CONSEGUE escrever na base de desenvolvimento.

    Estes testes correm contra a base real — não há base de testes à parte — e
    criam activos. Um `db.rollback()` no fim só limpa enquanto ninguém fizer
    `commit` pelo caminho: hoje nenhum serviço o faz (quem faz `commit` são os
    routers), mas isso é uma garantia por hábito, não por construção. Bastava
    aparecer um `commit` dentro de `processar_periodo` — ou de `postar`, ou de
    `notificar` — para os activos de ensaio ficarem gravados, e só se dava por
    isso ao vê-los em /imobilizados/amortizacoes.

    Por isso a transacção é aberta AQUI, na ligação, e a sessão entra nela por
    SAVEPOINT (`join_transaction_mode="create_savepoint"`). Um `commit` lá
    dentro liberta o savepoint e não sai da ligação; o `rollback` de fora
    deita tudo abaixo na mesma. O teste passa a estar isolado por construção.
    """
    from src.db.base import SessionLocal, engine

    ligacao = engine.connect()
    transacao = ligacao.begin()
    db = SessionLocal(bind=ligacao, join_transaction_mode="create_savepoint")
    try:
        yield db
    finally:
        db.close()
        transacao.rollback()
        ligacao.close()


@pytest.fixture
def cenario(base):
    """Um exercício com activos próprios, sem tocar nos de demonstração."""
    # A empresa vem PELO ACTIVO e não pelo exercício: há mais do que uma
    # empresa na base, e a primeira com exercício aberto pode não ter
    # imobilizado nenhum. As contas do activo que já existe servem de modelo,
    # para o teste não ter de conhecer o plano de contas da demonstração.
    modelo = base.scalar(
        select(Ativo).where(
            Ativo.conta_custo_amort.is_not(None),
            Ativo.conta_amort_acum.is_not(None),
        )
    )
    assert modelo is not None, "a base precisa de um activo com contas definidas"
    empresa = base.get(Empresa, modelo.empresa_id)
    ex = base.scalar(
        select(Exercicio).where(
            Exercicio.empresa_id == empresa.id, Exercicio.estado == "aberto"
        )
    )
    assert ex is not None, "a empresa do activo precisa de um exercício aberto"
    return base, empresa.id, ex, modelo


def _ativo(db, empresa_id, codigo, *, custo=None, acum=None):
    a = Ativo(
        empresa_id=empresa_id, codigo=codigo, designacao=f"Ensaio {codigo}",
        conta_custo_amort=custo, conta_amort_acum=acum,
        data_aquisicao=date(2026, 1, 1), valor_aquisicao=Decimal("1200"),
        taxa=Decimal("25"), metodo="quotas", amort_acumulada=Decimal("0"),
        estado="activo",
    )
    db.add(a)
    db.flush()
    return a


def test_sem_contas_de_amortizacao_nao_amortiza_e_diz_porque(cenario):
    """O caso silencioso: nem lançamento, nem erro, e a ficha amortizada."""
    db, empresa_id, ex, _modelo = cenario
    a = _ativo(db, empresa_id, "TST-SEM-CONTAS")

    r = svc.processar_periodo(
        db, empresa_id=empresa_id, exercicio_id=ex.id, mes="07",
        data=date(2026, 7, 31),
    )

    assert a.amort_acumulada == Decimal("0"), "não podia ter sido amortizado"
    assert any("TST-SEM-CONTAS" in e for e in r["erros"]), r["erros"]
    # A mensagem tem de dizer o que fazer, não só que falhou.
    assert any("contas de amortização" in e for e in r["erros"]), r["erros"]


def test_lancamento_falhado_nao_deixa_a_ficha_amortizada(cenario):
    """Contas que não existem no plano: o `postar` recusa, a ficha não se mexe."""
    db, empresa_id, ex, _modelo = cenario
    a = _ativo(
        db, empresa_id, "TST-CONTA-MA",
        custo="ZZZZ9", acum="ZZZZ8",
    )

    r = svc.processar_periodo(
        db, empresa_id=empresa_id, exercicio_id=ex.id, mes="08",
        data=date(2026, 8, 31),
    )

    assert a.amort_acumulada == Decimal("0"), "não podia ter sido amortizado"
    assert any("TST-CONTA-MA" in e for e in r["erros"]), r["erros"]
    assert not any(i["codigo"] == "TST-CONTA-MA" for i in _itens(db, r))


def test_um_activo_mal_configurado_nao_trava_os_outros(cenario):
    """Bloquear o mês inteiro seria trocar uma inconsistência por uma paragem."""
    db, empresa_id, ex, modelo = cenario
    mau = _ativo(db, empresa_id, "TST-MAU")
    bom = _ativo(
        db, empresa_id, "TST-BOM",
        custo=modelo.conta_custo_amort, acum=modelo.conta_amort_acum,
    )

    r = svc.processar_periodo(
        db, empresa_id=empresa_id, exercicio_id=ex.id, mes="09",
        data=date(2026, 9, 30),
    )

    assert mau.amort_acumulada == Decimal("0")
    assert bom.amort_acumulada > Decimal("0"), "o activo bom tinha de ser amortizado"
    assert any("TST-MAU" in e for e in r["erros"])

    # E o que foi amortizado tem lançamento — é a outra metade da regra.
    linha = next(i for i in _itens(db, r) if i["codigo"] == "TST-BOM")
    assert linha.get("lancamento_id"), "amortizado sem lançamento é o defeito antigo"


def test_todos_os_itens_gravados_tem_lancamento(cenario):
    """O registo do processamento não guarda amortizações sem contrapartida."""
    db, empresa_id, ex, modelo = cenario
    _ativo(db, empresa_id, "TST-SEM-2")
    _ativo(
        db, empresa_id, "TST-BOM-2",
        custo=modelo.conta_custo_amort, acum=modelo.conta_amort_acum,
    )

    r = svc.processar_periodo(
        db, empresa_id=empresa_id, exercicio_id=ex.id, mes="10",
        data=date(2026, 10, 31),
    )

    itens = _itens(db, r)
    assert itens, "o período tinha de processar alguma coisa"
    assert all(i.get("lancamento_id") for i in itens), itens


def _itens(db, resultado):
    from src.db.models.imobilizados import ProcessoAmortizacao

    return db.get(ProcessoAmortizacao, resultado["processo_id"]).itens or []
