"""Tipo de imobilizado, não amortizável e condições especiais de amortização.

O QUE ESTES TESTES FIXAM, e porquê cada um:

- **as contas de compra saem do plano**, não da lista que veio no pedido. A
  lista trocava os códigos entre si — `371122` estava dada como investimento
  financeiro e é Corpóreo/Estrangeiros — e omitia as duas do Incorpóreo. O
  plano organiza-as em 3 × 2 (tipo × nacionalidade do fornecedor) e é isso que
  se implementa;

- **não amortizável ganha à taxa**. Pôr a taxa a zero resolvia o número e não
  resolvia a leitura: um terreno com taxa preenchida por engano voltava a
  amortizar, e ninguém liga uma amortização inesperada a um campo que ficou
  preenchido;

- **as condições especiais mudam a BASE**, e a parte não sujeita nunca entra —
  nem no cálculo, nem no que falta amortizar, nem na percentagem;

- **em curso não amortiza**, que é o que distingue um activo em construção de
  um activo.
"""

from decimal import Decimal

from src.db.models.imobilizados import Ativo
from src.services import imobilizados as svc


def _ativo(**kwargs) -> Ativo:
    """Um activo em memória. Os valores por omissão do modelo só se aplicam ao
    gravar, por isso passam-se aqui à mão — ver docs/LESSONS.md."""
    base = dict(
        codigo="T001",
        designacao="Ensaio",
        valor_aquisicao=Decimal("10000.00"),
        taxa=Decimal("25.00"),
        metodo="quotas",
        amort_acumulada=Decimal("0.00"),
        estado="activo",
        nao_amortizavel=False,
        condicoes_especiais=False,
        valor_sujeito_amortizacao=None,
        em_curso=False,
    )
    base.update(kwargs)
    return Ativo(**base)


# ---------------------------------------------------------------------------
# As contas de compra — 371 + tipo + 2 + nacionalidade
# ---------------------------------------------------------------------------
def test_a_conta_de_compra_cruza_tipo_com_nacionalidade():
    """A matriz 3 × 2 que o plano tem, e que o pedido baralhava."""
    assert svc.conta_compra_imobilizado("corporeo", "nacional") == "371121"
    assert svc.conta_compra_imobilizado("corporeo", "estrangeiro") == "371122"
    assert svc.conta_compra_imobilizado("incorporeo", "nacional") == "371221"
    assert svc.conta_compra_imobilizado("incorporeo", "estrangeiro") == "371222"
    assert svc.conta_compra_imobilizado("financeiro", "nacional") == "371321"
    assert svc.conta_compra_imobilizado("financeiro", "estrangeiro") == "371322"


def test_as_contas_do_incorporeo_existem_e_nao_foram_esquecidas():
    """Não vinham no pedido. Sem elas, uma compra de imobilizado incorpóreo não
    tinha conta nenhuma e ia parar ao ramo do corpóreo ou do financeiro."""
    assert svc.conta_compra_imobilizado("incorporeo", "nacional") == "371221"
    assert svc.conta_compra_imobilizado("incorporeo", "estrangeiro") == "371222"


def test_sem_tipo_ou_sem_categoria_nao_se_escolhe_conta_nenhuma():
    """Escolher por omissão seria escolher por quem não escolheu — e a conta
    errada de compra de imobilizado não dá erro, dá um balancete errado."""
    assert svc.conta_compra_imobilizado("", "nacional") is None
    assert svc.conta_compra_imobilizado("corporeo", "") is None
    assert svc.conta_compra_imobilizado("corporeo", "outros") is None
    assert svc.conta_compra_imobilizado("xpto", "nacional") is None


def test_a_conta_de_imobilizado_em_curso_sai_do_tipo():
    cfg = svc.cfg_imob_default()
    assert svc.conta_em_curso("corporeo", cfg) == "141"
    assert svc.conta_em_curso("incorporeo", cfg) == "142"
    assert svc.conta_em_curso("financeiro", cfg) == "143"
    assert svc.conta_em_curso("", cfg) is None


def test_as_contas_em_curso_sao_parametrizaveis():
    """Uma empresa cujo plano difira aponta-as a outro sítio sem tocar no
    programa — é o que permite resolver a falta da 143 sem mexer em código."""
    cfg = {**svc.cfg_imob_default(), "conta_curso_financeiro": "1439"}
    assert svc.conta_em_curso("financeiro", cfg) == "1439"


def test_a_classe_de_destino_de_cada_tipo():
    assert svc.CLASSE_DE_DESTINO["corporeo"] == "11"
    assert svc.CLASSE_DE_DESTINO["incorporeo"] == "12"
    assert svc.CLASSE_DE_DESTINO["financeiro"] == "13"


# ---------------------------------------------------------------------------
# Não amortizável
# ---------------------------------------------------------------------------
def test_um_activo_nao_amortizavel_nao_amortiza():
    terreno = _ativo(nao_amortizavel=True)
    assert svc.amort_anual(terreno) == Decimal("0.00")
    assert svc.amort_mensal(terreno) == Decimal("0.00")
    assert svc.amort_exercicio(terreno) == Decimal("0.00")
    assert svc.amort_do_periodo(terreno, "01") == Decimal("0.00")


def test_nao_amortizavel_ganha_a_taxa_preenchida():
    """Um terreno com 25% preenchido por engano continua a não amortizar.

    Se a taxa ganhasse, o campo «não amortizável» era decoração — e a
    amortização inesperada só apareceria no fecho do exercício, longe do
    engano que a causou.
    """
    terreno = _ativo(nao_amortizavel=True, taxa=Decimal("25.00"))
    assert svc.amort_anual(terreno) == Decimal("0.00")


def test_sem_a_marca_o_calculo_e_o_de_sempre():
    """Nenhum activo existente muda de comportamento."""
    normal = _ativo()
    assert svc.amort_anual(normal) == Decimal("2500.00")


# ---------------------------------------------------------------------------
# Em curso
# ---------------------------------------------------------------------------
def test_um_imobilizado_em_curso_nao_amortiza():
    """É o que o distingue de um activo: ainda não existe como património."""
    obra = _ativo(em_curso=True)
    assert svc.amort_anual(obra) == Decimal("0.00")
    assert svc.amort_do_periodo(obra, "06") == Decimal("0.00")


# ---------------------------------------------------------------------------
# Condições especiais
# ---------------------------------------------------------------------------
def test_com_condicoes_especiais_a_base_e_o_valor_indicado():
    a = _ativo(
        valor_aquisicao=Decimal("10000.00"),
        condicoes_especiais=True,
        valor_sujeito_amortizacao=Decimal("4000.00"),
        taxa=Decimal("25.00"),
    )
    assert svc.base_amortizavel(a) == Decimal("4000.00")
    assert svc.amort_anual(a) == Decimal("1000.00")


def test_a_parte_nao_sujeita_nunca_entra_no_que_falta_amortizar():
    """Se entrasse, o activo continuava a amortizar depois de a parte sujeita
    estar esgotada — e acabava por amortizar mais do que devia."""
    a = _ativo(
        valor_aquisicao=Decimal("10000.00"),
        condicoes_especiais=True,
        valor_sujeito_amortizacao=Decimal("4000.00"),
        amort_acumulada=Decimal("4000.00"),
        taxa=Decimal("25.00"),
    )
    assert svc.valor_liquido(a) == Decimal("0.00")
    assert svc.amort_exercicio(a) == Decimal("0.00")
    assert svc.percent_amortizado(a) == 100


def test_condicoes_especiais_sem_valor_indicado_usam_a_aquisicao():
    """Assumir zero calaria a amortização por um campo que ficou por preencher,
    e isso não se nota até ao fecho do exercício."""
    a = _ativo(condicoes_especiais=True, valor_sujeito_amortizacao=None)
    assert svc.base_amortizavel(a) == Decimal("10000.00")
    assert svc.amort_anual(a) == Decimal("2500.00")


def test_sem_condicoes_especiais_o_valor_indicado_e_ignorado():
    """Desligar as condições especiais tem de repor a base, senão ficava um
    valor esquecido a mandar no cálculo sem aparecer em lado nenhum."""
    a = _ativo(
        condicoes_especiais=False,
        valor_sujeito_amortizacao=Decimal("4000.00"),
    )
    assert svc.base_amortizavel(a) == Decimal("10000.00")


# ---------------------------------------------------------------------------
# Cada ficha é uma conta
#
# `141` agrupa; quem recebe movimentos é a subconta de cada ficha. Comprar um
# computador cria `141001 Computador X`; o seguinte cria `141002`. Sem isso,
# todos os imobilizados em curso somavam no mesmo saldo e, ao fechar um deles,
# era preciso adivinhar que parte lhe pertencia.
# ---------------------------------------------------------------------------
import pytest
from sqlalchemy import delete, select

from src.db.models.contabilidade import Conta
from src.db.models.tenancy import Empresa
from src.services.contabilidade import ErroContabilistico

MARCA_IMOB = "ZZIMOB"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar_imob(db)
    yield db
    _limpar_imob(db)
    db.close()


def _limpar_imob(db):
    db.execute(delete(Ativo).where(Ativo.designacao.like(f"{MARCA_IMOB}%")))
    db.execute(delete(Conta).where(Conta.nome.like(f"{MARCA_IMOB}%")))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None, "a base de demonstração precisa da empresa DC001"
    return e


def _em_curso(base, empresa, *, tipo, nome):
    a = Ativo(
        empresa_id=empresa.id,
        codigo=f"{MARCA_IMOB}{abs(hash(nome)) % 9000 + 1000}",
        designacao=f"{MARCA_IMOB} {nome}",
        valor_aquisicao=Decimal("0.00"),
        taxa=Decimal("0.00"),
        metodo="quotas",
        amort_acumulada=Decimal("0.00"),
        estado="activo",
        tipo_imobilizado=tipo,
        em_curso=True,
        nao_amortizavel=False,
        condicoes_especiais=False,
    )
    base.add(a)
    base.flush()
    return a


def test_cada_ficha_recebe_a_sua_propria_conta(base, empresa):
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="corporeo", nome="Computador X")
    conta = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)

    assert conta.startswith("141"), conta
    assert conta != "141", "a conta principal AGRUPA, não recebe movimentos"
    assert a.conta_imob == conta, "e fica gravada na ficha"


def test_as_contas_sao_sequenciais_debaixo_da_principal(base, empresa):
    """`141001`, `141002`… — o segundo computador não vai para a conta do
    primeiro."""
    cfg = svc.cfg_imob_default()
    um = svc.conta_em_curso_do_ativo(
        base, empresa.id, _em_curso(base, empresa, tipo="corporeo", nome="Um"), cfg
    )
    dois = svc.conta_em_curso_do_ativo(
        base, empresa.id, _em_curso(base, empresa, tipo="corporeo", nome="Dois"), cfg
    )
    assert um != dois
    assert um.startswith("141") and dois.startswith("141")
    assert int(dois[3:]) == int(um[3:]) + 1, (um, dois)


def test_a_conta_tem_o_nome_do_imobilizado(base, empresa):
    """Quem abre o plano de contas tem de saber o que é a 141001."""
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="corporeo", nome="Retroescavadora")
    conta = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)

    nome = base.scalar(
        select(Conta.nome).where(
            Conta.empresa_id == empresa.id, Conta.codigo == conta
        )
    )
    assert nome == a.designacao


def test_o_incorporeo_agrupa_noutra_conta(base, empresa):
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="incorporeo", nome="Programa")
    conta = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    assert conta.startswith("142"), conta


def test_a_mesma_ficha_nao_recebe_duas_contas(base, empresa):
    """Gravar a ficha duas vezes não pode criar duas contas para o mesmo bem."""
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="corporeo", nome="Repetido")
    primeira = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    segunda = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    assert primeira == segunda


def test_sem_tipo_indicado_recusa_e_diz_porque(base, empresa):
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo=None, nome="SemTipo")
    with pytest.raises(ErroContabilistico) as e:
        svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    assert "tipo de imobilizado" in str(e.value).lower()


def test_a_conta_principal_em_falta_diz_qual_e_o_que_fazer(base, empresa):
    """O caso da `143`: não existe no plano, e a mensagem tem de dizer isso e
    o que fazer — não rebentar com um erro que ninguém liga a uma conta."""
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="financeiro", nome="Participacao")
    with pytest.raises(ErroContabilistico) as e:
        svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    texto = str(e.value)
    assert "143" in texto
    assert "Plano de Contas" in texto or "parametriza" in texto.lower()
