"""Subclasses de documento, e o sistema de inventariação.

O QUE O CLIENTE PEDIU, pelas palavras dele: «o 211 é a classe principal, o
211.1 é a subclasse. Essas subclasses devem estar dentro de uma classe. Mas já
a conta de débito, na subclasse, já especificar uma conta.» E, sobre o
inventário: «no sistema permanente o custo é reconhecido no momento em que ele
ocorre — vai passar a crédito na segunda caixa, e a débito vai ter a conta de
destino, que é uma conta 26 ou 22.»

O QUE ESTES ENSAIOS GUARDAM são as regras que impedem a estrutura de ficar
impossível de desenhar: um só nível de subclasse, e uma reflexão que não fica
ligada sem ter para onde reflectir.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from src.api.routers import contabilidade_router as r
from src.db.base import SessionLocal
from src.db.models.contabilidade import DocumentoContabilistico
from src.db.models.tenancy import Empresa

MARCA = "ZZD"


@pytest.fixture
def base():
    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


def _limpar(db):
    db.execute(
        delete(DocumentoContabilistico).where(
            DocumentoContabilistico.codigo.like(f"{MARCA}%")
        )
    )
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


def _doc(base, empresa, codigo, *, pai=None, sistema=None, reflexao=None):
    d = DocumentoContabilistico(
        empresa_id=empresa.id,
        codigo=f"{MARCA}{codigo}",
        descricao=f"Ensaio {codigo}",
        diario_codigo="21",
        pai_codigo=f"{MARCA}{pai}" if pai else None,
        sistema_inventario=sistema,
        conta_reflexao=reflexao,
    )
    base.add(d)
    base.flush()
    return d


# ---------------------------------------------------------------------------
# A família: uma classe e as suas subclasses
# ---------------------------------------------------------------------------
def test_uma_subclasse_de_uma_classe_e_aceite(base, empresa):
    """O caso do cliente: o 211 é a classe, o 211.1 é a subclasse."""
    _doc(base, empresa, "211")
    r._validar_familia(base, empresa.id, codigo=f"{MARCA}211.1", pai=f"{MARCA}211")


def test_uma_subclasse_de_uma_subclasse_e_recusada(base, empresa):
    """UM SÓ NÍVEL. Sem isto, o `211.1.1` era aceite e a listagem passava a ter
    de desenhar uma árvore de profundidade desconhecida para mostrar três
    documentos."""
    _doc(base, empresa, "211")
    _doc(base, empresa, "211.1", pai="211")
    with pytest.raises(HTTPException) as erro:
        r._validar_familia(
            base, empresa.id, codigo=f"{MARCA}211.1.1", pai=f"{MARCA}211.1"
        )
    assert erro.value.status_code == 422
    assert "subclasse" in erro.value.detail


def test_uma_classe_com_filhas_nao_pode_virar_subclasse(base, empresa):
    """Se pudesse, as filhas ficavam a um nível que não existe — e
    desapareciam da listagem sem ninguém as ter apagado."""
    _doc(base, empresa, "211")
    _doc(base, empresa, "211.1", pai="211")
    _doc(base, empresa, "212")
    with pytest.raises(HTTPException) as erro:
        r._validar_familia(base, empresa.id, codigo=f"{MARCA}211", pai=f"{MARCA}212")
    assert erro.value.status_code == 422
    assert "subclasses próprias" in erro.value.detail.replace("proprias", "próprias")


def test_uma_classe_que_nao_existe_e_recusada(base, empresa):
    """Um documento que aponta para uma classe inexistente fica órfão, e só se
    descobre ao abrir a listagem e não o ver em lado nenhum."""
    with pytest.raises(HTTPException) as erro:
        r._validar_familia(
            base, empresa.id, codigo=f"{MARCA}999.1", pai=f"{MARCA}NAOEXISTE"
        )
    assert erro.value.status_code == 422


def test_um_documento_nao_e_subclasse_de_si_proprio(base, empresa):
    with pytest.raises(HTTPException) as erro:
        r._validar_familia(base, empresa.id, codigo=f"{MARCA}211", pai=f"{MARCA}211")
    assert erro.value.status_code == 422


def test_sem_classe_principal_nao_ha_nada_a_verificar(base, empresa):
    """Uma classe principal é o caso normal e não passa por regra nenhuma."""
    r._validar_familia(base, empresa.id, codigo=f"{MARCA}211", pai=None)
    r._validar_familia(base, empresa.id, codigo=f"{MARCA}211", pai="")


# ---------------------------------------------------------------------------
# O sistema de inventariação
# ---------------------------------------------------------------------------
def test_o_permanente_exige_a_conta_de_destino():
    """Sem ela não há para onde reflectir, e o documento ficava com um sistema
    ligado que não fazia nada — o pior dos dois mundos, porque quem o
    configurou fica a pensar que reflecte."""
    with pytest.raises(HTTPException) as erro:
        r._validar_inventario("permanente", None)
    assert erro.value.status_code == 422
    assert "reflecte" in erro.value.detail

    with pytest.raises(HTTPException):
        r._validar_inventario("permanente", "   ")


def test_o_permanente_com_conta_passa():
    r._validar_inventario("permanente", "2611")


def test_o_periodico_nao_precisa_de_conta():
    """No periódico não há reflexão: o custo só se apura no fim do período."""
    r._validar_inventario("periodico", None)


def test_sem_sistema_e_o_comportamento_de_sempre():
    """É onde ficam todos os documentos que já existem. Nenhum lançamento já
    feito muda por causa desta funcionalidade."""
    r._validar_inventario(None, None)
    r._validar_inventario("", None)


def test_um_sistema_inventado_e_recusado():
    with pytest.raises(HTTPException) as erro:
        r._validar_inventario("continuo", "2611")
    assert erro.value.status_code == 422
