"""Movimentos automáticos à espera do fluxo de caixa.

A Demonstração de Fluxos de Caixa é construída a partir do `fluxo_codigo` de
cada linha que passa por caixa ou por banco. Uma linha sem esse código **não
desaparece do balancete** — o dinheiro está lá — mas **desaparece da
demonstração**: o mapa fecha com um total que não bate com a tesouraria real, e
quem o lê não tem como saber o que ficou de fora.

O documento comercial não classifica isto sozinho e não deve adivinhar: o mesmo
recebimento pode ser operacional ou de financiamento conforme o que está por
trás. O que o sistema garante é que não se esquece.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.contabilidade import Fluxo, Lancamento, LancamentoLinha
from src.db.models.tenancy import Empresa
from src.services import diferidos

MARCA = "DIF"


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
        db.scalars(select(Lancamento.id).where(Lancamento.descricao.like(f"{MARCA}%")))
    )
    if ids:
        db.execute(delete(LancamentoLinha).where(LancamentoLinha.lancamento_id.in_(ids)))
        db.execute(delete(Lancamento).where(Lancamento.id.in_(ids)))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


def _lancamento(base, empresa, *, origem="comercial", conta="4511", fluxo=None, n=1):
    x = Lancamento(
        empresa_id=empresa.id,
        numero=880_000 + n,
        numero_op=f"08/1.{n:03d}",
        data=date(2026, 8, 10),
        mes="08",
        diario_codigo="61",
        documento_codigo="611",
        descricao=f"{MARCA} recebimento {n}",
        origem=origem,
    )
    base.add(x)
    base.flush()
    base.add_all(
        [
            LancamentoLinha(
                lancamento_id=x.id, ordem=0, conta_codigo=conta,
                conta_nome="Caixa", debito=Decimal("500"), credito=Decimal("0"),
                fluxo_codigo=fluxo,
            ),
            LancamentoLinha(
                lancamento_id=x.id, ordem=1, conta_codigo="31121",
                conta_nome="Clientes", debito=Decimal("0"), credito=Decimal("500"),
            ),
        ]
    )
    base.flush()
    return x


# ---------------------------------------------------------------------------
# O que conta como pendente
# ---------------------------------------------------------------------------
def test_uma_linha_de_caixa_sem_rubrica_fica_pendente(base, empresa):
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, n=1)
    assert diferidos.contar(base, empresa.id) == antes + 1


def test_a_linha_do_cliente_nao_conta(base, empresa):
    """Só as contas de disponibilidades entram na Demonstração de Fluxos.

    O lançamento tem duas linhas e só UMA passa por caixa — contar as duas
    fazia o aviso dizer o dobro e mandava a pessoa procurar o que não existe.
    """
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, n=2)
    assert diferidos.contar(base, empresa.id) == antes + 1


def test_um_lancamento_manual_nao_entra(base, empresa):
    """Quem o escreveu já decidiu. Avisá-lo do que decidiu é ruído."""
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, origem="manual", n=3)
    assert diferidos.contar(base, empresa.id) == antes


def test_uma_linha_ja_classificada_sai_da_lista(base, empresa):
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, fluxo="RO1", n=4)
    assert diferidos.contar(base, empresa.id) == antes


def test_o_campo_em_branco_conta_como_por_indicar(base, empresa):
    """Vazio e nulo são a mesma coisa aqui: nenhum classifica nada.

    Verificar só o nulo deixava passar as linhas gravadas com o campo em
    branco — e essas somem da demonstração exactamente na mesma.
    """
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, fluxo="", n=5)
    assert diferidos.contar(base, empresa.id) == antes + 1


def test_conta_de_banco_tambem_conta(base, empresa):
    antes = diferidos.contar(base, empresa.id)
    _lancamento(base, empresa, conta="43101", n=6)
    assert diferidos.contar(base, empresa.id) == antes + 1


# ---------------------------------------------------------------------------
# A listagem
# ---------------------------------------------------------------------------
def test_a_listagem_e_paginada_e_diz_o_total(base, empresa):
    """Isto cresce com cada recebimento: nenhum histórico é infinito no ecrã."""
    for i in range(4):
        _lancamento(base, empresa, n=10 + i)

    r = diferidos.listar(base, empresa.id, offset=0, limite=2)
    assert len(r["linhas"]) <= 2
    assert r["total"] >= 4
    # A barra de paginação lê estes dois para dizer «1–2 de 40».
    assert r["offset"] == 0
    assert r["limite"] == 2


def test_a_linha_traz_o_que_e_preciso_para_decidir(base, empresa):
    """Quem classifica precisa de saber de que documento veio e de quanto é."""
    _lancamento(base, empresa, n=20)
    linha = diferidos.listar(base, empresa.id)["linhas"][0]
    for campo in ("data", "origem", "conta_codigo", "debito", "credito", "numero_op"):
        assert campo in linha


# ---------------------------------------------------------------------------
# Classificar
# ---------------------------------------------------------------------------
def test_indicar_a_rubrica_tira_a_linha_da_lista(base, empresa):
    fluxo = base.scalar(
        select(Fluxo).where(Fluxo.empresa_id == empresa.id, Fluxo.tipo == "M")
    )
    if fluxo is None:
        pytest.skip("a empresa de teste não tem plano de fluxos")

    _lancamento(base, empresa, n=30)
    antes = diferidos.contar(base, empresa.id)
    linha = diferidos.listar(base, empresa.id)["linhas"][0]

    diferidos.indicar_fluxo(
        base, empresa.id, linha_id=linha["linha_id"], fluxo_codigo=fluxo.codigo
    )
    assert diferidos.contar(base, empresa.id) == antes - 1


def test_uma_rubrica_que_agrega_outras_e_recusada(base, empresa):
    """Imputar um movimento a uma rubrica de agregação fazia o mapa somar duas
    vezes o mesmo valor."""
    agregadora = base.scalar(
        select(Fluxo).where(Fluxo.empresa_id == empresa.id, Fluxo.tipo != "M")
    )
    if agregadora is None:
        pytest.skip("a empresa de teste não tem rubricas de agregação")

    _lancamento(base, empresa, n=31)
    linha = diferidos.listar(base, empresa.id)["linhas"][0]

    with pytest.raises(ValueError) as e:
        diferidos.indicar_fluxo(
            base, empresa.id, linha_id=linha["linha_id"], fluxo_codigo=agregadora.codigo
        )
    assert "agrupar" in str(e.value)


def test_uma_rubrica_inexistente_e_recusada(base, empresa):
    _lancamento(base, empresa, n=32)
    linha = diferidos.listar(base, empresa.id)["linhas"][0]
    with pytest.raises(ValueError) as e:
        diferidos.indicar_fluxo(
            base, empresa.id, linha_id=linha["linha_id"], fluxo_codigo="ZZZ9"
        )
    assert "não existe" in str(e.value)


def test_uma_linha_de_outra_empresa_nao_se_classifica(base, empresa):
    """A mesma regra de sempre: nunca se mexe nos dados de outra empresa."""
    outra = base.scalar(select(Empresa).where(Empresa.id != empresa.id).limit(1))
    if outra is None:
        pytest.skip("só há uma empresa na base")

    x = _lancamento(base, empresa, n=40)
    x.empresa_id = outra.id
    base.flush()
    linha_id = x.linhas[0].id

    with pytest.raises(ValueError) as e:
        diferidos.indicar_fluxo(
            base, empresa.id, linha_id=linha_id, fluxo_codigo="RO1"
        )
    assert "empresa" in str(e.value) or "não existe" in str(e.value)


# ---------------------------------------------------------------------------
# O aviso
# ---------------------------------------------------------------------------
def test_o_aviso_e_um_so_e_nao_um_por_documento(base, empresa):
    """Dez facturas com o mesmo problema são um problema, não dez avisos."""
    from src.db.models.notificacoes import Notificacao

    for i in range(3):
        _lancamento(base, empresa, n=50 + i)
    diferidos.avisar_se_houver(base, empresa.id)
    diferidos.avisar_se_houver(base, empresa.id)

    quantos = len(
        list(
            base.scalars(
                select(Notificacao).where(
                    Notificacao.empresa_id == empresa.id,
                    Notificacao.chave == diferidos.CHAVE_NOTIFICACAO,
                    Notificacao.resolvida_em.is_(None),
                )
            )
        )
    )
    assert quantos == 1


def test_o_aviso_diz_quantos_e_para_onde_ir(base, empresa):
    from src.db.models.notificacoes import Notificacao

    _lancamento(base, empresa, n=60)
    diferidos.avisar_se_houver(base, empresa.id)

    n = base.scalar(
        select(Notificacao).where(
            Notificacao.empresa_id == empresa.id,
            Notificacao.chave == diferidos.CHAVE_NOTIFICACAO,
            Notificacao.resolvida_em.is_(None),
        )
    )
    assert n is not None
    # Diz o impacto e o passo seguinte, não só que há pendentes.
    assert "Fluxos de Caixa" in n.texto
    assert n.ligacao == "/contabilidade/diferidos"
    # E é para quem faz a contabilidade, não para quem factura.
    assert n.capacidade == "contab.lancar"
