"""Quando é que anular obriga a nota de crédito, e quando é que não.

A REGRA PEDIDA: no mesmo período, anula-se e pronto; em período diferente, é
com nota de crédito. Faz sentido contabilístico — um período já declarado não se
reescreve — e é o que estes testes fixam.

UMA COISA FOI AJUSTADA em relação ao pedido, e está aqui explicada porque é a
parte que alguém vai querer voltar a discutir: pediu-se «eliminar» e faz-se
«anular mantendo o número». Um documento emitido não se apaga —

  1. o número vem de uma série e a lei exige numeração sequencial SEM FALHAS;
  2. cada documento leva o resumo do anterior, e apagar um pelo meio parte a
     cadeia — que é o que essa cadeia existe para tornar detectável.

O efeito para quem trabalha é o mesmo que se pediu: desfazer sem papelada e sem
nota de crédito. O que muda é que fica prova de que se desfez.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.db.models.comercial import Venda, VendaLinha
from src.db.models.contabilidade import Lancamento, LancamentoLinha
from src.db.models.tenancy import Empresa
from src.services import comercial_anulacao as anulacao
from src.services.contabilidade import ErroContabilistico

MARCA = "ANUL"


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
    lids = list(
        db.scalars(select(Lancamento.id).where(Lancamento.descricao.like(f"%{MARCA}%")))
    )
    if lids:
        db.execute(delete(LancamentoLinha).where(LancamentoLinha.lancamento_id.in_(lids)))
        db.execute(delete(Lancamento).where(Lancamento.id.in_(lids)))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


def _venda(base, empresa, *, quando: date, estado="emitida", com_lancamento=False):
    v = Venda(
        empresa_id=empresa.id,
        numero=f"FT FT{quando.year}S1/{quando.month:02d}999",
        tipo_doc="FT",
        tipo="servicos",
        data=quando,
        cliente_nome=f"{MARCA} Cliente",
        iva_perc=Decimal("14"),
        subtotal=Decimal("1000"),
        iva=Decimal("140"),
        total=Decimal("1140"),
        estado=estado,
        estado_saft="N",
    )
    base.add(v)
    base.flush()

    if com_lancamento:
        lanc = Lancamento(
            empresa_id=empresa.id,
            numero=999_000 + quando.month,
            data=quando,
            mes=f"{quando.month:02d}",
            diario_codigo="61",
            documento_codigo="611",
            descricao=f"{MARCA} venda {v.numero}",
            origem="comercial",
        )
        base.add(lanc)
        base.flush()
        base.add_all(
            [
                LancamentoLinha(
                    lancamento_id=lanc.id, ordem=0, conta_codigo="4311",
                    debito=Decimal("1140"), credito=Decimal("0"),
                ),
                LancamentoLinha(
                    lancamento_id=lanc.id, ordem=1, conta_codigo="6111",
                    debito=Decimal("0"), credito=Decimal("1140"),
                ),
            ]
        )
        v.lancamento_id = lanc.id
        base.flush()
    return v


# ---------------------------------------------------------------------------
# Mesmo período: anula-se, sem nota de crédito
# ---------------------------------------------------------------------------
def test_no_mesmo_periodo_anula_se_sem_nota_de_credito(base, empresa):
    hoje = date.today()
    v = _venda(base, empresa, quando=hoje)

    pode, motivo = anulacao.pode_anular_sem_nota_de_credito(
        base, empresa_id=empresa.id, venda=v
    )
    assert pode is True, motivo

    r = anulacao.anular(base, empresa_id=empresa.id, venda=v, motivo="Erro no valor")
    assert v.estado == "anulada"
    assert r["numero"] == v.numero
    assert v.motivo_anulacao == "Erro no valor"


def test_o_numero_mantem_se_e_o_documento_continua_a_existir(base, empresa):
    """A parte ajustada em relação ao pedido, e a razão de ser assim.

    Apagar deixava um salto na sequência que a AGT vê, e partia a cadeia de
    resumos. Anular mantém a sequência inteira e a cadeia intacta.
    """
    hoje = date.today()
    v = _venda(base, empresa, quando=hoje)
    numero = v.numero

    anulacao.anular(base, empresa_id=empresa.id, venda=v)

    ainda_la = base.scalar(select(Venda).where(Venda.id == v.id))
    assert ainda_la is not None
    assert ainda_la.numero == numero


def test_a_anulacao_vai_para_o_saft_como_a_norma_manda(base, empresa):
    """`InvoiceStatus = A`.

    Sem isto o documento seguia no SAF-T como normal e a anulação existia só
    aqui dentro — a AGT continuaria a contar com aquele valor.
    """
    v = _venda(base, empresa, quando=date.today())
    anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert v.estado_saft == "A"
    assert v.anulado_em is not None


# ---------------------------------------------------------------------------
# Período diferente: nota de crédito
# ---------------------------------------------------------------------------
def test_de_mes_anterior_exige_nota_de_credito(base, empresa):
    hoje = date.today()
    mes_passado = date(hoje.year, hoje.month - 1, 15) if hoje.month > 1 else date(
        hoje.year - 1, 12, 15
    )
    v = _venda(base, empresa, quando=mes_passado)

    pode, motivo = anulacao.pode_anular_sem_nota_de_credito(
        base, empresa_id=empresa.id, venda=v
    )
    assert pode is False
    assert "nota de crédito" in motivo
    # A mensagem diz PORQUÊ, não só que não pode.
    assert "IVA" in motivo or "exercícios anteriores" in motivo

    with pytest.raises(ErroContabilistico) as e:
        anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert "nota de crédito" in str(e.value)
    assert v.estado == "emitida", "não pode ter mudado nada"


def test_de_exercicio_anterior_exige_nota_de_credito(base, empresa):
    hoje = date.today()
    v = _venda(base, empresa, quando=date(hoje.year - 1, 6, 10))

    pode, motivo = anulacao.pode_anular_sem_nota_de_credito(
        base, empresa_id=empresa.id, venda=v
    )
    assert pode is False
    assert str(hoje.year - 1) in motivo


# ---------------------------------------------------------------------------
# O que acontece à contabilidade
# ---------------------------------------------------------------------------
def test_o_lancamento_e_revertido_e_nao_apagado(base, empresa):
    """A diferença entre corrigir e esconder.

    Apagar o lançamento deixava o balancete certo e o histórico a mentir. Um
    lançamento de sentido contrário deixa os dois certos e deixa rasto.
    """
    hoje = date.today()
    v = _venda(base, empresa, quando=hoje, com_lancamento=True)
    original_id = v.lancamento_id

    r = anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert r["lancamento_revertido"] is True

    # O original continua lá.
    assert base.get(Lancamento, original_id) is not None

    # E existe um de sentido contrário.
    contrario = base.scalar(
        select(Lancamento).where(
            Lancamento.empresa_id == empresa.id,
            Lancamento.documento_ref == v.numero,
            Lancamento.descricao.like("Anulação de%"),
        )
    )
    assert contrario is not None

    # Os sentidos estão trocados, e as somas batem.
    por_conta = {l.conta_codigo: l for l in contrario.linhas}
    assert por_conta["4311"].credito == Decimal("1140")
    assert por_conta["4311"].debito == Decimal("0")
    assert por_conta["6111"].debito == Decimal("1140")

    d = sum(l.debito for l in contrario.linhas)
    c = sum(l.credito for l in contrario.linhas)
    assert d == c, "um lançamento tem de continuar equilibrado"


# ---------------------------------------------------------------------------
# Os estados que não se anulam
# ---------------------------------------------------------------------------
def test_um_rascunho_nao_se_anula_elimina_se(base, empresa):
    v = _venda(base, empresa, quando=date.today(), estado="rascunho")
    with pytest.raises(ErroContabilistico) as e:
        anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert "rascunho" in str(e.value)


def test_anular_duas_vezes_nao_duplica_a_reversao(base, empresa):
    """Sem isto, anular duas vezes escrevia dois lançamentos contrários — e o
    segundo desfazia a anulação sem que nada o dissesse."""
    v = _venda(base, empresa, quando=date.today(), com_lancamento=True)
    anulacao.anular(base, empresa_id=empresa.id, venda=v)

    with pytest.raises(ErroContabilistico) as e:
        anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert "já está anulado" in str(e.value)

    quantos = len(
        list(
            base.scalars(
                select(Lancamento).where(
                    Lancamento.documento_ref == v.numero,
                    Lancamento.descricao.like("Anulação de%"),
                )
            )
        )
    )
    assert quantos == 1


def test_um_documento_anulado_nao_se_elimina(base, empresa):
    """Tem de continuar a existir: é o que prova que o número não foi usado
    para outra coisa. Verificado na rota — aqui fixa-se o estado."""
    v = _venda(base, empresa, quando=date.today())
    anulacao.anular(base, empresa_id=empresa.id, venda=v)
    assert v.estado == "anulada"
