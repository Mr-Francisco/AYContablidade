"""Mestres de negócio: alterar e eliminar artigos, armazéns, clientes,
fornecedores e vendedores.

O Piloto permitia editar e apagar; a Produção só criava.

A regra em que a Produção é MAIS RESTRITIVA, com justificação: **o que já foi
usado não se apaga**. No Piloto, apagar um artigo com movimentos de stock
deixava existências atribuídas a uma ficha que já não existia, e apagar um
cliente deixava facturas emitidas sem titular. Aqui recusa-se com 409 e a
mensagem diz que a alternativa é desactivar.
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from src.db.models.comercial import Venda, Vendedor
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.db.models.tenancy import Empresa
from src.db.models.terceiros import Terceiro


#: Prefixo dos registos criados por estes testes. As rotas fazem `commit`, por
#: isso o `rollback` da sessão não chega — o que elas gravaram fica na base e
#: colidiria com a corrida seguinte na restrição de unicidade.
MARCA = "T9"


def _limpar(db):
    from sqlalchemy import delete

    db.rollback()
    db.execute(delete(MovimentoStock).where(MovimentoStock.numero.like(f"{MARCA}%")))
    db.execute(delete(MovimentoStock).where(MovimentoStock.numero.like("T8%")))
    db.execute(delete(Venda).where(Venda.cliente_nome.like(f"{MARCA}%")))
    db.execute(
        delete(Venda).where(
            Venda.vendedor_id.in_(
                select(Vendedor.id).where(Vendedor.nome.like(f"{MARCA}%"))
            )
        )
    )
    db.execute(delete(Vendedor).where(Vendedor.nome.like(f"{MARCA}%")))
    db.execute(delete(Terceiro).where(Terceiro.numero.like(f"{MARCA}%")))
    db.execute(delete(Artigo).where(Artigo.codigo.like(f"{MARCA}%")))
    db.execute(delete(Artigo).where(Artigo.codigo.like("T8%")))
    db.execute(delete(Artigo).where(Artigo.codigo.like("T7%")))
    db.execute(delete(Armazem).where(Armazem.codigo.like(f"{MARCA}%")))
    db.execute(delete(Armazem).where(Armazem.codigo.like("T8%")))
    db.commit()


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


@pytest.fixture
def empresa_id(base):
    e = base.scalar(select(Empresa).limit(1))
    assert e is not None
    return e.id


class _Empresa:
    """O mínimo que as rotas usam da empresa da sessão."""

    def __init__(self, ident):
        self.id = ident


# ---------------------------------------------------------------------------
# As rotas existem, exigem capacidade e confinam à empresa
# ---------------------------------------------------------------------------
def test_as_rotas_de_alterar_e_eliminar_existem():
    """REGRESSÃO: os mestres só tinham GET e POST — criava-se e nunca mais se
    corrigia um nome mal escrito."""
    from src.api.main import app

    caminhos = app.openapi()["paths"]
    for rota in [
        "/api/logistica/artigos/{artigo_id}",
        "/api/logistica/armazens/{armazem_id}",
        "/api/comercial/clientes/{cliente_id}",
        "/api/comercial/vendedores/{vendedor_id}",
        "/api/compras/fornecedores/{fornecedor_id}",
        "/api/rh/colaboradores/{colaborador_id}",
    ]:
        assert rota in caminhos, f"falta {rota}"
        assert {"patch", "delete"} <= set(caminhos[rota]), f"faltam métodos em {rota}"


@pytest.mark.parametrize(
    "modulo,funcoes",
    [
        ("logistica_router", ["actualizar_artigo", "remover_artigo",
                              "actualizar_armazem", "remover_armazem"]),
        ("comercial_router", ["actualizar_cliente", "remover_cliente",
                              "actualizar_vendedor", "remover_vendedor"]),
        ("compras_router", ["actualizar_fornecedor", "remover_fornecedor"]),
    ],
)
def test_todas_exigem_a_capacidade_de_gerir(modulo, funcoes):
    import importlib
    import inspect

    r = importlib.import_module(f"src.api.routers.{modulo}")
    fonte = inspect.getsource(r)
    for f in funcoes:
        decorador = fonte.split(f"def {f}(")[0].rsplit("@router.", 1)[-1]
        assert "dependencies=[GERIR]" in decorador, f"{f} sem GERIR"


def test_o_helper_confina_sempre_a_empresa():
    """REGRESSÃO: é o `obter_da_empresa` que impede que conhecer um id chegue
    para alterar a ficha de outra empresa. Devolve 404 e não 403 de propósito —
    quem não é dono não deve distinguir «não existe» de «não é seu»."""
    import inspect

    from src.api import mestres

    fonte = inspect.getsource(mestres.obter_da_empresa)
    assert "empresa_id == empresa_id" in fonte
    assert "HTTP_404_NOT_FOUND" in fonte


# ---------------------------------------------------------------------------
# Alterar
# ---------------------------------------------------------------------------
def test_alterar_escreve_so_o_que_veio(base, empresa_id):
    """`exclude_unset`: um campo que não veio fica como estava. Sem isto, um
    formulário que só envia o nome apagava todos os outros campos."""
    from src.api.routers.comercial_router import (
        TerceiroAtualizar,
        actualizar_cliente,
    )

    c = Terceiro(empresa_id=empresa_id, tipo="cliente", tipo_terceiro="Cliente",
                 numero="T99", nome="T9 Antes", telefone="900000000",
                 email="antes@exemplo.ao")
    base.add(c)
    base.flush()

    actualizar_cliente(None, c.id, TerceiroAtualizar(nome="Depois"),
                       _Empresa(empresa_id), base)

    assert c.nome == "Depois"
    assert c.telefone == "900000000", "o telefone não podia ter sido apagado"
    assert c.email == "antes@exemplo.ao"


def test_um_pedido_vazio_e_recusado(base, empresa_id):
    from src.api.routers.comercial_router import (
        TerceiroAtualizar,
        actualizar_cliente,
    )

    c = Terceiro(empresa_id=empresa_id, tipo="cliente", tipo_terceiro="Cliente",
                 numero="T98", nome="T9 X")
    base.add(c)
    base.flush()

    with pytest.raises(HTTPException) as e:
        actualizar_cliente(None, c.id, TerceiroAtualizar(),
                           _Empresa(empresa_id), base)
    assert e.value.status_code == 422


def test_um_cliente_nao_se_altera_pela_rota_dos_fornecedores(base, empresa_id):
    """REGRESSÃO: clientes e fornecedores partilham a tabela `terceiros`. Sem a
    verificação do tipo, a rota dos fornecedores mexia em clientes."""
    from src.api.routers.compras_router import (
        FornecedorAtualizar,
        actualizar_fornecedor,
    )

    c = Terceiro(empresa_id=empresa_id, tipo="cliente", tipo_terceiro="Cliente",
                 numero="T97", nome="T9 Cliente")
    base.add(c)
    base.flush()

    with pytest.raises(HTTPException) as e:
        actualizar_fornecedor(None, c.id, FornecedorAtualizar(nome="Invadido"),
                              _Empresa(empresa_id), base)
    assert e.value.status_code == 404
    assert c.nome == "T9 Cliente"


# ---------------------------------------------------------------------------
# O que já foi usado não se apaga
# ---------------------------------------------------------------------------
def test_um_artigo_com_movimentos_de_stock_nao_se_apaga(base, empresa_id):
    from src.api.routers.logistica_router import remover_artigo

    armazem = Armazem(empresa_id=empresa_id, codigo="T9W1", nome="Teste")
    artigo = Artigo(empresa_id=empresa_id, codigo="T9900", descricao="Teste")
    base.add_all([armazem, artigo])
    base.flush()
    base.add(
        MovimentoStock(
            empresa_id=empresa_id, numero="T9-1", tipo="entrada",
            artigo_id=artigo.id, armazem_id=armazem.id, qtd=Decimal("10"),
            custo_unit=Decimal("100"), data=date.today(),
        )
    )
    base.flush()

    with pytest.raises(HTTPException) as e:
        remover_artigo(artigo.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409
    assert "movimentos de stock" in e.value.detail


def test_um_armazem_com_movimentos_nao_se_apaga(base, empresa_id):
    from src.api.routers.logistica_router import remover_armazem

    armazem = Armazem(empresa_id=empresa_id, codigo="T8W", nome="Teste")
    artigo = Artigo(empresa_id=empresa_id, codigo="T800", descricao="Teste")
    base.add_all([armazem, artigo])
    base.flush()
    base.add(
        MovimentoStock(
            empresa_id=empresa_id, numero="T8-1", tipo="entrada",
            artigo_id=artigo.id, armazem_id=armazem.id, qtd=Decimal("5"),
            custo_unit=Decimal("50"), data=date.today(),
        )
    )
    base.flush()

    with pytest.raises(HTTPException) as e:
        remover_armazem(armazem.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409


def test_um_cliente_com_documentos_nao_se_apaga(base, empresa_id):
    """Apagar a ficha deixava facturas emitidas sem titular."""
    from src.api.routers.comercial_router import remover_cliente

    c = Terceiro(empresa_id=empresa_id, tipo="cliente", tipo_terceiro="Cliente",
                 numero="T96", nome="T9 Com facturas")
    base.add(c)
    base.flush()
    base.add(
        Venda(empresa_id=empresa_id, tipo_doc="FT", data=date.today(),
              cliente_id=c.id, cliente_nome=c.nome, estado="rascunho")
    )
    base.flush()

    with pytest.raises(HTTPException) as e:
        remover_cliente(c.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409
    assert "documentos de venda" in e.value.detail


def test_um_vendedor_com_vendas_nao_se_apaga(base, empresa_id):
    from src.api.routers.comercial_router import remover_vendedor

    v = Vendedor(empresa_id=empresa_id, nome="T9 Com vendas")
    base.add(v)
    base.flush()
    base.add(
        Venda(empresa_id=empresa_id, tipo_doc="FT", data=date.today(),
              vendedor_id=v.id, estado="rascunho")
    )
    base.flush()

    with pytest.raises(HTTPException) as e:
        remover_vendedor(v.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409


def test_sem_uso_apaga(base, empresa_id):
    """O contraste: a restrição é sobre o histórico, não sobre apagar."""
    from src.api.routers.comercial_router import remover_vendedor

    v = Vendedor(empresa_id=empresa_id, nome="T9 Sem vendas")
    base.add(v)
    base.flush()
    ident = v.id

    remover_vendedor(ident, _Empresa(empresa_id), base)

    assert base.get(Vendedor, ident) is None


def test_desactivar_e_sempre_possivel(base, empresa_id):
    """A alternativa que a mensagem de erro oferece tem de funcionar."""
    from src.api.routers.logistica_router import (
        ArtigoAtualizar,
        actualizar_artigo,
    )

    artigo = Artigo(empresa_id=empresa_id, codigo="T700", descricao="Teste",
                    estado="activo")
    base.add(artigo)
    base.flush()

    actualizar_artigo(None, artigo.id, ArtigoAtualizar(estado="inactivo"),
                      _Empresa(empresa_id), base)

    assert artigo.estado == "inactivo"
    # E continua a existir, para o histórico o poder nomear.
    assert base.get(Artigo, artigo.id) is not None


# ---------------------------------------------------------------------------
# O código/número nunca se altera
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "modulo,esquema,campo",
    [
        ("logistica_router", "ArtigoAtualizar", "codigo"),
        ("comercial_router", "TerceiroAtualizar", "numero"),
        ("compras_router", "FornecedorAtualizar", "numero"),
    ],
)
def test_o_identificador_visivel_nao_esta_nos_campos_alteraveis(
    modulo, esquema, campo
):
    """REGRESSÃO: é o que aparece nos documentos já emitidos e o que forma a
    conta corrente. Mudá-lo tornava ilegível o que já saiu impresso."""
    import importlib

    r = importlib.import_module(f"src.api.routers.{modulo}")
    assert campo not in getattr(r, esquema).model_fields


# ---------------------------------------------------------------------------
# A interface
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "pagina,rota,cap",
    [
        ("logistica/artigos", "/api/logistica/artigos", "logistica.gerir"),
        ("logistica/armazens", "/api/logistica/armazens", "logistica.gerir"),
        ("logistica/fornecedores", "/api/compras/fornecedores", "logistica.gerir"),
        ("comercial/clientes", "/api/comercial/clientes", "comercial.gerir"),
        ("comercial/vendedores", "/api/comercial/vendedores", "comercial.gerir"),
        ("rh/funcionarios", "/api/rh/colaboradores", "rh.gerir"),
    ],
)
def test_as_paginas_deixaram_de_ser_so_de_criar(pagina, rota, cap):
    """REGRESSÃO: as seis só tinham «Novo». Criava-se um cliente com o nome
    mal escrito e não havia como o corrigir."""
    from pathlib import Path

    caminho = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    )
    fonte = caminho.read_text(encoding="utf-8")
    assert "api.patch" in fonte, f"{pagina} não altera"
    # `api.delete` com o caminho literal ou por constante — as duas formas
    # existem nas páginas e as duas servem.
    assert "api.delete(" in fonte, f"{pagina} não elimina"
    assert rota in fonte, f"{pagina} não fala com {rota}"
    assert f'pode("{cap}")' in fonte, f"{pagina} não verifica a capacidade"
    # E a confirmação antes de apagar.
    assert "ConfirmarEliminar" in fonte, f"{pagina} apaga sem confirmar"
