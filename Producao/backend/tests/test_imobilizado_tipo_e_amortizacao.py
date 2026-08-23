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
from sqlalchemy import delete, select, text

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
    """A ORDEM IMPORTA: as contas criadas pelos testes ficam referidas pelos
    lançamentos do fecho, e o plano de contas recusa apagar uma conta com
    movimentos — que é exactamente a protecção que se quer em produção.

    Por isso apagam-se primeiro os lançamentos, depois as linhas, e só no fim
    as contas."""
    from src.db.models.contabilidade import Lancamento, LancamentoLinha

    contas = [
        c for (c,) in db.execute(
            select(Conta.codigo).where(Conta.nome.like(f"{MARCA_IMOB}%"))
        )
    ]
    if contas:
        ids = [
            i for (i,) in db.execute(
                select(LancamentoLinha.lancamento_id).where(
                    LancamentoLinha.conta_codigo.in_(contas)
                )
            )
        ]
        if ids:
            db.execute(
                delete(LancamentoLinha).where(
                    LancamentoLinha.lancamento_id.in_(ids)
                )
            )
            db.execute(delete(Lancamento).where(Lancamento.id.in_(ids)))

    db.execute(delete(Ativo).where(Ativo.designacao.like(f"{MARCA_IMOB}%")))
    db.execute(delete(Conta).where(Conta.nome.like(f"{MARCA_IMOB}%")))

    # E REPOR AS MAES. Criar a primeira subconta converte a mae em integradora
    # — é o que `criar_subconta` faz, e faz bem. Apagar a subconta não a
    # desconverte, e a mae ficava integradora SEM FILHAS: uma conta que não
    # recebe lançamentos e não agrega nada. Os testes deixavam o plano da base
    # de demonstração nesse estado, e o teste seguinte herdava-o.
    db.execute(
        text(
            """
            UPDATE contas c SET tipo='M'
            WHERE c.codigo IN ('141','142','143') AND c.tipo='I'
            AND NOT EXISTS (
                SELECT 1 FROM contas f
                WHERE f.empresa_id = c.empresa_id
                AND f.codigo LIKE c.codigo || '%' AND f.codigo <> c.codigo
            )
            """
        )
    )
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


def test_a_conta_143_existe_e_o_financeiro_agrupa_nela(base, empresa):
    """A `143` não existia no plano do Primavera e foi acrescentada.

    Este teste substitui o que verificava a sua FALTA: enquanto ela não
    existiu, um investimento financeiro em curso não tinha onde acumular. O que
    se fixa agora é o contrário — que existe, e que é lá que agrupa.
    """
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="financeiro", nome="Participacao")
    conta = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)

    assert conta.startswith("143"), conta
    assert conta != "143", "a conta principal AGRUPA, não recebe movimentos"


def test_uma_conta_principal_que_nao_exista_diz_qual_e_o_que_fazer(base, empresa):
    """A mensagem tem de nomear a conta e dizer o que fazer.

    Uma empresa pode ter um plano diferente, ou apontar a parametrização a uma
    conta que não criou. Rebentar com um erro que ninguém liga a uma conta
    deixava a pessoa a olhar para o ecrã sem saber o que corrigir.
    """
    cfg = {**svc.cfg_imob_default(), "conta_curso_financeiro": "1439999"}
    a = _em_curso(base, empresa, tipo="financeiro", nome="SemConta")
    with pytest.raises(ErroContabilistico) as e:
        svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    texto = str(e.value)
    assert "1439999" in texto
    assert "Plano de Contas" in texto or "parametriza" in texto.lower()


# ---------------------------------------------------------------------------
# Itens, fecho e transferência
#
# Uma obra não se compra de uma vez: acumula custos até estar pronta, e só aí
# passa a património. O lançamento da transferência nasce DIFERIDO — existe e
# vê-se, mas só conta no balancete quando a contabilidade o integrar.
# ---------------------------------------------------------------------------
from datetime import date as _Date

from src.db.models.imobilizados import ItemImobilizado


def _item(base, empresa, ativo, valor, descricao="Custo"):
    i = ItemImobilizado(
        empresa_id=empresa.id,
        ativo_id=ativo.id,
        data=_Date(2026, 3, 10),
        descricao=f"{MARCA_IMOB} {descricao}",
        valor=Decimal(valor),
    )
    base.add(i)
    base.flush()
    return i


def test_o_acumulado_e_a_soma_dos_itens(base, empresa):
    a = _em_curso(base, empresa, tipo="corporeo", nome="Obra")
    assert svc.valor_acumulado(base, a) == Decimal("0.00")

    _item(base, empresa, a, "1500.00", "Terreno")
    _item(base, empresa, a, "2500.50", "Empreitada")
    assert svc.valor_acumulado(base, a) == Decimal("4000.50")


def test_uma_obra_sem_custos_nao_se_fecha(base, empresa):
    """Não há valor nenhum a transferir, e um lançamento de zero não diz nada."""
    a = _em_curso(base, empresa, tipo="corporeo", nome="Vazia")
    svc.conta_em_curso_do_ativo(base, empresa.id, a, svc.cfg_imob_default())
    with pytest.raises(ErroContabilistico) as e:
        svc.fechar_e_transferir(
            base, empresa_id=empresa.id, ativo=a,
            conta_destino="1121", data=_Date(2026, 6, 30),
        )
    assert "custos registados" in str(e.value)


def test_a_classe_de_destino_tem_de_bater_com_o_tipo(base, empresa):
    """Um edifício transferido para investimentos financeiros não dá erro
    nenhum: dá um balanço que diz que a empresa tem participações que não tem."""
    a = _em_curso(base, empresa, tipo="corporeo", nome="Edificio")
    svc.conta_em_curso_do_ativo(base, empresa.id, a, svc.cfg_imob_default())
    _item(base, empresa, a, "1000.00")

    with pytest.raises(ErroContabilistico) as e:
        svc.fechar_e_transferir(
            base, empresa_id=empresa.id, ativo=a,
            # `131` é investimento financeiro; o activo é corpóreo.
            conta_destino="131", data=_Date(2026, 6, 30),
        )
    texto = str(e.value)
    assert "11" in texto, texto


def test_uma_obra_ja_fechada_nao_se_fecha_outra_vez(base, empresa):
    a = _em_curso(base, empresa, tipo="corporeo", nome="Fechada")
    a.em_curso = False
    base.flush()
    with pytest.raises(ErroContabilistico) as e:
        svc.fechar_e_transferir(
            base, empresa_id=empresa.id, ativo=a,
            conta_destino="1121", data=_Date(2026, 6, 30),
        )
    assert "não está em curso" in str(e.value)


def test_o_fecho_gera_um_lancamento_diferido_com_as_duas_pontas(base, empresa):
    """O caminho inteiro: obra → itens → fecho → lançamento.

    O QUE ISTO PROVA, e é o que interessa:

    - o lançamento existe e nasce DIFERIDO — não conta no balancete até a
      contabilidade o integrar, que foi o que se pediu;
    - CREDITA a conta própria da obra (`141001`) e não a mãe `141`;
    - DEBITA a conta de destino indicada;
    - o valor é o acumulado dos itens, não um número escrito à mão;
    - e a ficha deixa de estar em curso, passando a valer o que custou.
    """
    from src.db.models.contabilidade import Lancamento, LancamentoLinha

    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="corporeo", nome="ObraCompleta")
    conta_obra = svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)

    _item(base, empresa, a, "3000.00", "Terreno")
    _item(base, empresa, a, "5000.00", "Empreitada")

    r = svc.fechar_e_transferir(
        base,
        empresa_id=empresa.id,
        ativo=a,
        # `11211` — uma conta de MOVIMENTO da classe 11. As filhas directas
        # de 11/12/13 são todas integradoras: a conta que recebe o lançamento
        # está um nível abaixo, e é por isso que o destino tem de ser escolhido
        # e não deduzido do tipo.
        conta_destino="11211",
        data=_Date(2026, 6, 30),
    )

    assert r["valor_transferido"] == Decimal("8000.00")
    assert r["conta_origem"] == conta_obra
    assert r["conta_destino"] == "11211"

    lanc = base.scalar(
        select(Lancamento).where(Lancamento.id == r["lancamento_id"])
    )
    assert lanc is not None
    assert lanc.diferido is True, "tem de ficar à espera da contabilidade"

    linhas = base.scalars(
        select(LancamentoLinha).where(
            LancamentoLinha.lancamento_id == lanc.id
        )
    ).all()
    porconta = {l.conta_codigo: l for l in linhas}

    assert porconta["11211"].debito == Decimal("8000.00")
    assert porconta[conta_obra].credito == Decimal("8000.00")
    assert conta_obra != "141", "credita a conta da OBRA, não a conta-mãe"

    # E a ficha passou a património.
    assert a.em_curso is False
    assert a.fechado_em == _Date(2026, 6, 30)
    assert a.valor_aquisicao == Decimal("8000.00")
    assert a.conta_imob == "11211"


def test_depois_de_fechada_a_obra_volta_a_amortizar(base, empresa):
    """Enquanto em curso não amortizava; fechada, amortiza sobre o acumulado."""
    cfg = svc.cfg_imob_default()
    a = _em_curso(base, empresa, tipo="corporeo", nome="ObraAmortiza")
    svc.conta_em_curso_do_ativo(base, empresa.id, a, cfg)
    _item(base, empresa, a, "10000.00", "Custo")
    a.taxa = Decimal("25.00")
    base.flush()

    assert svc.amort_anual(a) == Decimal("0.00"), "em curso não amortiza"

    svc.fechar_e_transferir(
        base, empresa_id=empresa.id, ativo=a,
        conta_destino="11211", data=_Date(2026, 6, 30),
    )

    # 25% de 10 000 — o que a obra custou.
    assert svc.amort_anual(a) == Decimal("2500.00")
