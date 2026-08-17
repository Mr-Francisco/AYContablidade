"""A cadeia de resumos dos documentos — passo 3 do plano de facturação.

É a peça que faz a diferença entre um sistema de facturação e um sistema que
emite papéis com números. O que se exige dela:

1. **Determinista.** O mesmo documento dá sempre o mesmo resumo — senão a
   cadeia não se pode verificar.
2. **Sensível a tudo o que importa.** Mudar a data, o número, o total ou a
   ordem tem de mudar o resumo.
3. **Detecta apagar e alterar.** É para isto que existe.
"""

from datetime import date, datetime
from decimal import Decimal

import pytest

from src.services.facturacao import cadeia


def doc(numero, total, *, dia=1, hora=9, anterior=None):
    return {
        "data_doc": date(2026, 8, dia),
        "entrada_sistema": datetime(2026, 8, dia, hora, 0, 0),
        "numero": numero,
        "total": Decimal(str(total)),
        "hash_anterior": anterior,
    }


def com_hash(d):
    d = dict(d)
    d["hash_doc"] = cadeia.resumir(**{k: d[k] for k in (
        "data_doc", "entrada_sistema", "numero", "total", "hash_anterior")})
    return d


def encadear(*docs):
    """Constrói uma cadeia correcta a partir de documentos soltos."""
    anterior, saida = None, []
    for d in docs:
        d = dict(d, hash_anterior=anterior)
        d = com_hash(d)
        anterior = d["hash_doc"]
        saida.append(d)
    return saida


# ---------------------------------------------------------------------------
# 1. Determinista
# ---------------------------------------------------------------------------
def test_o_mesmo_documento_da_sempre_o_mesmo_resumo():
    a = cadeia.resumir(**doc("FT FT2026S1/00001", 1000))
    b = cadeia.resumir(**doc("FT FT2026S1/00001", 1000))
    assert a == b


def test_o_valor_e_normalizado_a_duas_casas():
    """`1000` e `1000.00` são o mesmo dinheiro."""
    a = cadeia.resumir(**{**doc("FT 1", 0), "total": Decimal("1000")})
    b = cadeia.resumir(**{**doc("FT 1", 0), "total": Decimal("1000.00")})
    assert a == b


def test_os_microssegundos_nao_contam():
    """Senão o mesmo documento gravado duas vezes daria resumos diferentes."""
    base = doc("FT 1", 500)
    a = cadeia.resumir(**base)
    b = cadeia.resumir(**{**base, "entrada_sistema": base["entrada_sistema"].replace(microsecond=987654)})
    assert a == b


# ---------------------------------------------------------------------------
# 2. Sensível ao que importa
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("campo,valor", [
    ("numero", "FT FT2026S1/00002"),
    ("total", Decimal("1000.01")),
    ("data_doc", date(2026, 8, 2)),
    ("entrada_sistema", datetime(2026, 8, 1, 9, 0, 1)),
    ("hash_anterior", "outro"),
])
def test_mudar_qualquer_campo_muda_o_resumo(campo, valor):
    base = doc("FT FT2026S1/00001", 1000)
    assert cadeia.resumir(**base) != cadeia.resumir(**{**base, campo: valor})


def test_o_separador_nao_deixa_confundir_campos():
    """`numero=«A;B»` e `total` não podem produzir o mesmo texto que outro par.

    É a razão de o separador ser `;` — não aparece em datas, números de
    documento nem totais.
    """
    t = cadeia.texto_a_resumir(**doc("FT 1", 1000))
    assert t.count(cadeia.SEPARADOR) == 4


# ---------------------------------------------------------------------------
# 3. Detecta o que tem de detectar
# ---------------------------------------------------------------------------
def test_cadeia_correcta_passa():
    docs = encadear(doc("FT 1", 100, dia=1), doc("FT 2", 200, dia=2), doc("FT 3", 300, dia=3))
    intacta, onde = cadeia.cadeia_intacta(docs)
    assert intacta is True and onde is None


def test_alterar_um_documento_parte_a_cadeia():
    """O caso que isto existe para apanhar: alguém muda o total depois de emitir."""
    docs = encadear(doc("FT 1", 100), doc("FT 2", 200, dia=2), doc("FT 3", 300, dia=3))
    docs[1]["total"] = Decimal("999")  # alteração silenciosa

    intacta, onde = cadeia.cadeia_intacta(docs)
    assert intacta is False
    assert "FT 2" in onde
    assert "alterado" in onde


def test_apagar_um_documento_do_meio_parte_a_cadeia():
    docs = encadear(doc("FT 1", 100), doc("FT 2", 200, dia=2), doc("FT 3", 300, dia=3))
    sem_o_meio = [docs[0], docs[2]]

    intacta, onde = cadeia.cadeia_intacta(sem_o_meio)
    assert intacta is False
    assert "FT 3" in onde


def test_trocar_a_ordem_parte_a_cadeia():
    docs = encadear(doc("FT 1", 100), doc("FT 2", 200, dia=2))
    intacta, _ = cadeia.cadeia_intacta([docs[1], docs[0]])
    assert intacta is False


def test_uma_serie_vazia_esta_intacta():
    """Não há nada partido numa série sem documentos."""
    assert cadeia.cadeia_intacta([]) == (True, None)


# ---------------------------------------------------------------------------
# Código de controlo impresso
# ---------------------------------------------------------------------------
def test_codigo_de_controlo_sao_quatro_caracteres():
    h = cadeia.resumir(**doc("FT 1", 1000))
    c = cadeia.codigo_de_controlo(h)
    assert len(c) == 4
    assert c == c.upper()


def test_codigo_de_controlo_de_documento_sem_hash():
    assert cadeia.codigo_de_controlo(None) == ""


def test_documentos_diferentes_dao_codigos_diferentes():
    """Não é garantia criptográfica — são quatro caracteres — mas dois
    documentos seguidos não podem sair iguais, ou não serviria para conferir."""
    a = cadeia.codigo_de_controlo(cadeia.resumir(**doc("FT 1", 100)))
    b = cadeia.codigo_de_controlo(cadeia.resumir(**doc("FT 2", 200, dia=2)))
    assert a != b
