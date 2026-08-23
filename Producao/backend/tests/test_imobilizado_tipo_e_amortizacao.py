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
