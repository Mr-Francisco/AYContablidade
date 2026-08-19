"""A conta corrente de um cliente depende de ele ser nacional ou estrangeiro.

O QUE O PILOTO TEM, e foi verificado antes de escrever isto:

- o plano PGC-AR traz o par `31121 Clientes não grupo · Nacionais` e
  `31122 · Estrangeiros` — as duas contas existem desde sempre;
- a ficha do terceiro tem o campo `país`, com «Angola» por omissão;
- `contaCorrenteCliente()` cria a próxima subconta sequencial da conta-mãe
  (`31121001`, `31121002`…) e grava-a na ficha.

O QUE O PILOTO NÃO TEM: a escolha entre as duas contas. Usa sempre
`cfg().contaCliente`, que é a dos nacionais, fosse o cliente de onde fosse. É a
peça que faltava, e é a que estes testes fixam.

PORQUE É QUE ISTO IMPORTA: um cliente estrangeiro lançado na conta dos
nacionais não dá erro nenhum. Dá um balancete que diz que a empresa não tem
clientes estrangeiros, e um SAF-T que declara o mesmo — e nada assinala a
diferença.
"""

import pytest
from sqlalchemy import delete, select

from src.db.models.tenancy import Empresa
from src.db.models.terceiros import Terceiro
from src.services import comercial as svc

MARCA = "NACEST"


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
    db.execute(delete(Terceiro).where(Terceiro.nome.like(f"{MARCA}%")))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


def _cliente(base, empresa, *, pais: str, nome="Cliente"):
    c = Terceiro(
        empresa_id=empresa.id,
        tipo="cliente",
        tipo_terceiro="Cliente",
        numero=f"{MARCA}{abs(hash(nome)) % 900 + 100}",
        nome=f"{MARCA} {nome}",
        pais=pais,
    )
    base.add(c)
    base.flush()
    return c


# ---------------------------------------------------------------------------
# Quem é nacional
# ---------------------------------------------------------------------------
def test_angola_em_varias_formas_conta_como_nacional():
    """A ficha é preenchida à mão e nem toda a gente escreve igual."""
    for escrito in ("Angola", "angola", " ANGOLA ", "AO", "República de Angola"):
        assert svc.eh_nacional(type("C", (), {"pais": escrito})()) is True


def test_qualquer_outro_pais_e_estrangeiro():
    for escrito in ("Portugal", "Brasil", "África do Sul", "China"):
        assert svc.eh_nacional(type("C", (), {"pais": escrito})()) is False


def test_sem_ficha_conta_como_nacional():
    """Consumidor final ao balcão: é o caso normal, e é o que o Piloto faz."""
    assert svc.eh_nacional(None) is True


def test_ficha_sem_pais_preenchido_conta_como_nacional():
    """Registos antigos não têm o campo. Tratá-los como estrangeiros mudava a
    conta de clientes que já estão lançados na dos nacionais."""
    assert svc.eh_nacional(type("C", (), {"pais": None})()) is True


# ---------------------------------------------------------------------------
# Que conta-mãe sai de cada um
# ---------------------------------------------------------------------------
def test_a_conta_mae_muda_com_a_nacionalidade():
    cfg = svc.cfg_com_default()
    nacional = type("C", (), {"pais": "Angola"})()
    estrangeiro = type("C", (), {"pais": "Portugal"})()

    assert svc.conta_base_do_cliente(nacional, cfg) == "31121"
    assert svc.conta_base_do_cliente(estrangeiro, cfg) == "31122"


def test_as_duas_contas_existem_no_plano_pgc_ar(base, empresa):
    """São as do plano, não inventadas: `31121 Nacionais`, `31122 Estrangeiros`.

    Se uma delas não existisse no plano da empresa, lançar lá dava erro na
    emissão — que é o pior sítio para descobrir isto.
    """
    from src.db.models.contabilidade import Conta

    for codigo in ("31121", "31122"):
        c = base.scalar(
            select(Conta).where(Conta.empresa_id == empresa.id, Conta.codigo == codigo)
        )
        assert c is not None, f"a conta {codigo} tem de existir no plano"


def test_sem_conta_de_estrangeiros_parametrizada_usa_a_dos_nacionais():
    """Melhor do que lançar numa conta que a empresa pode não ter no plano.

    É também o comportamento de antes — quem não parametrizar nada não vê nada
    mudar.
    """
    cfg = {**svc.cfg_com_default(), "conta_cliente_estrangeiro": ""}
    estrangeiro = type("C", (), {"pais": "Portugal"})()
    assert svc.conta_base_do_cliente(estrangeiro, cfg) == cfg["conta_cliente"]


# ---------------------------------------------------------------------------
# A subconta sequencial, como no Piloto
# ---------------------------------------------------------------------------
def test_um_cliente_nacional_recebe_subconta_da_conta_dos_nacionais(base, empresa):
    c = _cliente(base, empresa, pais="Angola", nome="Nacional")
    conta = svc.conta_corrente_cliente(base, empresa.id, c, svc.cfg_com(base, empresa.id))

    assert conta.startswith("31121"), conta
    assert conta != "31121", "tem de ser uma SUBCONTA, não a conta-mãe"
    # E fica gravada na ficha, para os documentos seguintes a reutilizarem.
    assert c.conta == conta


def test_um_cliente_estrangeiro_recebe_subconta_da_conta_dos_estrangeiros(
    base, empresa
):
    """A peça que faltava. Sem isto ia para `31121…` como os nacionais."""
    c = _cliente(base, empresa, pais="Portugal", nome="Estrangeiro")
    conta = svc.conta_corrente_cliente(base, empresa.id, c, svc.cfg_com(base, empresa.id))

    assert conta.startswith("31122"), conta
    assert c.conta == conta


def test_a_numeracao_das_subcontas_e_sequencial(base, empresa):
    """`31121001`, `31121002`… — a mesma regra do Piloto (`proximaSubconta`)."""
    cfg = svc.cfg_com(base, empresa.id)
    a = svc.conta_corrente_cliente(
        base, empresa.id, _cliente(base, empresa, pais="Angola", nome="Um"), cfg
    )
    b = svc.conta_corrente_cliente(
        base, empresa.id, _cliente(base, empresa, pais="Angola", nome="Dois"), cfg
    )
    assert a != b
    assert len(a) == len(b)
    assert int(b[len("31121"):]) > int(a[len("31121"):])


def test_o_cliente_que_ja_tem_conta_nao_recebe_outra(base, empresa):
    """Dar-lhe outra deixava os movimentos repartidos por duas contas."""
    cfg = svc.cfg_com(base, empresa.id)
    c = _cliente(base, empresa, pais="Angola", nome="Repetido")
    primeira = svc.conta_corrente_cliente(base, empresa.id, c, cfg)
    segunda = svc.conta_corrente_cliente(base, empresa.id, c, cfg)
    assert primeira == segunda


# ---------------------------------------------------------------------------
# A criação rápida, a partir da facturação
# ---------------------------------------------------------------------------
def test_a_criacao_rapida_atribui_numero_e_conta(base, empresa):
    """Não é só um registo comercial.

    O Piloto criava a conta no acto da FACTURAÇÃO, e o resultado era um cliente
    que existia no comercial e não existia na contabilidade até alguém lhe
    facturar alguma coisa. Aqui nasce com as duas coisas.
    """
    c = _cliente(base, empresa, pais="Angola", nome="Rapido")
    assert c.numero, "o número é sequencial e obrigatório"

    conta = svc.conta_corrente_cliente(base, empresa.id, c, svc.cfg_com(base, empresa.id))
    assert conta and conta != "31121"
    assert c.conta == conta


def test_o_numero_do_cliente_e_sequencial_por_empresa(base, empresa):
    """Como na Contabilidade: 001, 002… e nunca partilhado entre empresas."""
    from src.api.routers.comercial_router import _proximo_numero_terceiro

    n1 = _proximo_numero_terceiro(base, empresa.id, "cliente")
    _cliente(base, empresa, pais="Angola", nome=f"Seq{n1}")
    base.flush()
    assert n1.isdigit()
    assert len(n1) >= 3
