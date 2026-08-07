"""Valorização das existências: o CUMP e a quantidade têm de contar o mesmo.

Estes testes não tocam na base de dados. Constroem movimentos em memória com
objectos simples e chamam `stock()` e `custo_medio()` com a leitura de
movimentos substituída — o que se quer verificar é a aritmética, e montar uma
empresa inteira só para isso tornaria o teste lento e frágil.

O caso que motivou o ficheiro: uma transferência cujo destino era a própria
origem. O `stock()` somava e subtraía (ficava neutra), mas o `custo_medio()`
usava `if/elif` e só descontava. A quantidade mantinha-se e o valor
desaparecia, pelo que `stock × custo_medio` passava a inventar dinheiro.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from src.services import logistica as svc

EMPRESA = uuid4()
ARTIGO = uuid4()
A1 = uuid4()
A2 = uuid4()


@dataclass
class MovFalso:
    tipo: str
    qtd: Decimal
    armazem_id: UUID
    custo_unit: Decimal = Decimal("0")
    armazem_destino_id: UUID | None = None


@dataclass
class ArtigoFalso:
    preco_compra: Decimal = Decimal("6000")
    id: UUID = field(default=ARTIGO)


class DbFalso:
    """Só precisa de responder ao `get(Artigo, ...)` do fallback sem stock."""

    def get(self, _modelo, _id):
        return ArtigoFalso()


@pytest.fixture
def com_movimentos(monkeypatch):
    def instalar(movimentos):
        monkeypatch.setattr(
            svc, "_movimentos_do_artigo", lambda *a, **k: list(movimentos)
        )
        return DbFalso()

    return instalar


def _medir(db, armazem):
    return (
        svc.stock(db, empresa_id=EMPRESA, artigo_id=ARTIGO, armazem_id=armazem),
        svc.custo_medio(db, empresa_id=EMPRESA, artigo_id=ARTIGO, armazem_id=armazem),
    )


def test_entradas_fazem_media_ponderada(com_movimentos):
    db = com_movimentos(
        [
            MovFalso("entrada", Decimal("55"), A1, Decimal("6000")),
            MovFalso("entrada", Decimal("20"), A1, Decimal("9000")),
        ]
    )
    qtd, cump = _medir(db, A1)
    assert qtd == Decimal("75.0000")
    # (55 × 6000 + 20 × 9000) / 75
    assert cump == Decimal("6800.00")


def test_saida_nao_altera_o_custo_medio(com_movimentos):
    """É isto que distingue o CUMP de um FIFO."""
    db = com_movimentos(
        [
            MovFalso("entrada", Decimal("55"), A1, Decimal("6000")),
            MovFalso("entrada", Decimal("20"), A1, Decimal("9000")),
            MovFalso("saida", Decimal("30"), A1, Decimal("6800")),
        ]
    )
    qtd, cump = _medir(db, A1)
    assert qtd == Decimal("45.0000")
    assert cump == Decimal("6800.00")


def test_transferencia_move_o_valor_para_o_destino(com_movimentos):
    movs = [
        MovFalso("entrada", Decimal("75"), A1, Decimal("6800")),
        MovFalso("transferencia", Decimal("10"), A1, Decimal("6800"), A2),
    ]
    db = com_movimentos(movs)
    assert _medir(db, A1) == (Decimal("65.0000"), Decimal("6800.00"))
    db = com_movimentos(movs)
    assert _medir(db, A2) == (Decimal("10.0000"), Decimal("6800.00"))
    # Vista global: a transferência não cria nem destrói existências.
    db = com_movimentos(movs)
    assert svc.stock(db, empresa_id=EMPRESA, artigo_id=ARTIGO) == Decimal("75.0000")


def test_transferencia_para_a_propria_origem_e_neutra(com_movimentos):
    """Regressão: com `elif`, o valor saía e não voltava a entrar.

    Já não é possível gravar um movimento destes — `registar_movimento`
    recusa-o —, mas o cálculo tem de continuar a tratá-lo bem por causa de
    registos criados antes da guarda existir.

    Tem de haver uma entrada A SEGUIR, e a outro preço. Sem ela o teste passa
    com o defeito e sem ele: tirar unidades exactamente ao custo médio não
    altera o custo médio, e o erro fica escondido. O que a transferência
    degenerada estraga é a BASE da média — o `custo_medio()` passa a contar 74
    unidades onde o `stock()` conta 75 —, e isso só se vê quando a entrada
    seguinte é repartida por essa base.
    """
    limpo = [
        MovFalso("entrada", Decimal("65"), A1, Decimal("6800")),
        MovFalso("entrada", Decimal("10"), A1, Decimal("7000")),
    ]
    degenerado = [
        limpo[0],
        MovFalso("transferencia", Decimal("1"), A1, Decimal("6800"), A1),
        limpo[1],
    ]

    db = com_movimentos(limpo)
    qtd_esperada, cump_esperado = _medir(db, A1)
    # (65 × 6800 + 10 × 7000) / 75
    assert (qtd_esperada, cump_esperado) == (Decimal("75.0000"), Decimal("6826.67"))

    db = com_movimentos(degenerado)
    assert _medir(db, A1) == (qtd_esperada, cump_esperado), (
        "a transferência para o próprio armazém alterou a valorização"
    )


def test_acerto_negativo_reduz_sem_mexer_no_custo(com_movimentos):
    db = com_movimentos(
        [
            MovFalso("entrada", Decimal("75"), A1, Decimal("6800")),
            MovFalso("ajuste", Decimal("-5"), A1, Decimal("6800")),
        ]
    )
    qtd, cump = _medir(db, A1)
    assert qtd == Decimal("70.0000")
    assert cump == Decimal("6800.00")


def test_acerto_positivo_entra_na_media(com_movimentos):
    db = com_movimentos(
        [
            MovFalso("entrada", Decimal("50"), A1, Decimal("6000")),
            MovFalso("ajuste", Decimal("10"), A1, Decimal("9000")),
        ]
    )
    qtd, cump = _medir(db, A1)
    assert qtd == Decimal("60.0000")
    # (50 × 6000 + 10 × 9000) / 60
    assert cump == Decimal("6500.00")


def test_sem_stock_cai_no_preco_de_compra(com_movimentos):
    """Uma primeira saída não pode ser valorizada a zero."""
    db = com_movimentos([])
    assert svc.custo_medio(
        db, empresa_id=EMPRESA, artigo_id=ARTIGO, armazem_id=A1
    ) == Decimal("6000.00")


def test_movimentos_de_outro_armazem_nao_contam(com_movimentos):
    db = com_movimentos(
        [
            MovFalso("entrada", Decimal("10"), A1, Decimal("6000")),
            MovFalso("entrada", Decimal("90"), A2, Decimal("1000")),
        ]
    )
    qtd, cump = _medir(db, A1)
    assert qtd == Decimal("10.0000")
    assert cump == Decimal("6000.00")
