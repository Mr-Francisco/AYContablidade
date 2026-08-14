"""Tabelas mestras da contabilidade: criar, alterar e eliminar.

O Piloto deixava criar, editar e apagar diários, documentos, centros e contas.
A Produção só listava — daí estas rotas.

A regra que aqui mais importa é a única em que a Produção é MAIS RESTRITIVA do
que o Piloto, e tem justificação técnica: **o que tem movimentos não se apaga**.
Os lançamentos guardam o CÓDIGO do diário, do documento e da conta, não a chave
interna. No Piloto, apagar um deles deixava os movimentos antigos a apontar
para nada, e o balancete passava a ter linhas sem designação. Aqui recusa-se, e
oferece-se a desactivação, que tira das escolhas sem tocar no histórico.
"""

from datetime import date

import pytest
from sqlalchemy import select

from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    Diario,
    DocumentoContabilistico,
    LancamentoLinha,
)
from src.db.models.tenancy import Empresa
from src.services import contabilidade as svc


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def empresa_id(base):
    e = base.scalar(select(Empresa).limit(1))
    assert e is not None, "a base de demonstração precisa de uma empresa"
    return e.id


# ---------------------------------------------------------------------------
# As rotas existem e estão protegidas
# ---------------------------------------------------------------------------
def test_as_rotas_de_escrita_existem():
    """REGRESSÃO: só existia GET, e as páginas eram de leitura."""
    from src.api.main import app

    caminhos = app.openapi()["paths"]
    esperado = {
        "/api/contabilidade/diarios": {"get", "post"},
        "/api/contabilidade/diarios/{diario_id}": {"patch", "delete"},
        "/api/contabilidade/documentos": {"get", "post"},
        "/api/contabilidade/documentos/{documento_id}": {"patch", "delete"},
        "/api/contabilidade/centros": {"get", "post"},
        "/api/contabilidade/centros/{centro_id}": {"patch", "delete"},
        "/api/contabilidade/contas": {"get", "post"},
        "/api/contabilidade/contas/{conta_id}": {"patch", "delete"},
    }
    for rota, metodos in esperado.items():
        assert rota in caminhos, f"falta a rota {rota}"
        assert metodos <= set(caminhos[rota]), f"faltam métodos em {rota}"


@pytest.mark.parametrize(
    "funcao",
    [
        "criar_diario", "actualizar_diario", "remover_diario",
        "criar_documento", "actualizar_documento", "remover_documento",
        "criar_centro", "actualizar_centro", "remover_centro",
        "actualizar_conta", "remover_conta",
    ],
)
def test_todas_exigem_a_capacidade_do_plano(funcao):
    """`contab.plano` — quem só vê a contabilidade não redesenha as tabelas
    que a sustentam."""
    import inspect

    from src.api.routers import contabilidade_router as r

    fonte = inspect.getsource(r)
    decorador = fonte.split(f"def {funcao}(")[0].rsplit("@router.", 1)[-1]
    assert "dependencies=[PLANO]" in decorador, f"{funcao} sem PLANO"


@pytest.mark.parametrize(
    "funcao",
    [
        "actualizar_diario", "remover_diario",
        "actualizar_documento", "remover_documento",
        "actualizar_centro", "remover_centro",
        "actualizar_conta", "remover_conta",
    ],
)
def test_todas_confinam_a_empresa_da_sessao(funcao):
    """REGRESSÃO: sem o filtro, conhecer o id chegava para alterar a tabela
    mestra de outra empresa."""
    import inspect

    from src.api.routers import contabilidade_router as r

    fonte = inspect.getsource(getattr(r, funcao))
    assert "empresa_id == empresa.id" in fonte, f"{funcao} não confina"


# ---------------------------------------------------------------------------
# O código nunca se altera
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "esquema",
    ["ContaAtualizar", "DiarioAtualizar", "DocumentoAtualizar", "CentroAtualizar"],
)
def test_o_codigo_nao_esta_nos_campos_alteraveis(esquema):
    """REGRESSÃO: os movimentos guardam o CÓDIGO. Deixá-lo mudar aqui partia
    todo o histórico em silêncio — o balancete continuava a somar, mas a linha
    passava a não ter designação."""
    from src.api.routers import contabilidade_router as r

    assert "codigo" not in getattr(r, esquema).model_fields


# ---------------------------------------------------------------------------
# O que tem movimentos não se apaga
# ---------------------------------------------------------------------------
def _com_movimento(db, empresa_id):
    """Cria diário, documento, conta e um lançamento que os usa."""
    marca = "T9"
    diario = Diario(empresa_id=empresa_id, codigo=marca, nome="Teste",
                    categoria="outros", ativo=True)
    doc = DocumentoContabilistico(
        empresa_id=empresa_id, codigo="T98", descricao="Teste",
        diario_codigo=marca, ativo=True,
    )
    conta = Conta(empresa_id=empresa_id, codigo="T9991", nome="Conta de teste",
                  natureza="D", ativa=True)
    outra = Conta(empresa_id=empresa_id, codigo="T9992", nome="Contrapartida",
                  natureza="C", ativa=True)
    db.add_all([diario, doc, conta, outra])
    db.flush()

    lanc = svc.postar(
        db,
        empresa_id=empresa_id,
        data=date.today(),
        diario_codigo=marca,
        documento_codigo="T98",
        descricao="Movimento de teste",
        linhas=[
            {"conta_codigo": "T9991", "debito": "100", "credito": "0"},
            {"conta_codigo": "T9992", "debito": "0", "credito": "100"},
        ],
        criado_por="teste",
    )
    return diario, doc, conta, lanc


def test_uma_conta_com_movimentos_nao_se_apaga(base, empresa_id):
    _, _, conta, _ = _com_movimento(base, empresa_id)
    from src.api.routers.contabilidade_router import remover_conta
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        remover_conta(conta.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409
    assert "movimentos" in e.value.detail


def test_um_diario_com_movimentos_nao_se_apaga(base, empresa_id):
    diario, _, _, _ = _com_movimento(base, empresa_id)
    from fastapi import HTTPException

    from src.api.routers.contabilidade_router import remover_diario

    with pytest.raises(HTTPException) as e:
        remover_diario(diario.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409


def test_um_documento_com_movimentos_nao_se_apaga(base, empresa_id):
    _, doc, _, _ = _com_movimento(base, empresa_id)
    from fastapi import HTTPException

    from src.api.routers.contabilidade_router import remover_documento

    with pytest.raises(HTTPException) as e:
        remover_documento(doc.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409


def test_desactivar_e_sempre_possivel_e_o_historico_fica(base, empresa_id):
    """A alternativa que se oferece a quem não pode apagar tem de funcionar —
    e o movimento antigo tem de continuar a mostrar a conta."""
    _, _, conta, lanc = _com_movimento(base, empresa_id)

    conta.ativa = False
    base.flush()

    linhas = [x.conta_codigo for x in lanc.linhas]
    assert "T9991" in linhas
    # E o balancete continua a contá-la.
    b = svc.balancete(base, empresa_id=empresa_id)
    assert any(l["codigo"] == "T9991" for l in b["linhas"])


def test_um_centro_com_custos_imputados_nao_se_apaga(base, empresa_id):
    from fastapi import HTTPException

    from src.api.routers.contabilidade_router import remover_centro

    centro = CentroCusto(empresa_id=empresa_id, codigo="T9C", nome="Teste",
                         tipo="custo", estado="activo")
    conta = Conta(empresa_id=empresa_id, codigo="T9993", nome="C1",
                  natureza="D", ativa=True)
    conta2 = Conta(empresa_id=empresa_id, codigo="T9994", nome="C2",
                   natureza="C", ativa=True)
    diario = Diario(empresa_id=empresa_id, codigo="T8", nome="T",
                    categoria="outros", ativo=True)
    doc = DocumentoContabilistico(empresa_id=empresa_id, codigo="T88",
                                  descricao="T", diario_codigo="T8", ativo=True)
    base.add_all([centro, conta, conta2, diario, doc])
    base.flush()

    svc.postar(
        db=base, empresa_id=empresa_id, data=date.today(),
        diario_codigo="T8", documento_codigo="T88", descricao="Com centro",
        linhas=[
            {"conta_codigo": "T9993", "debito": "50", "credito": "0",
             "centro_codigo": "T9C"},
            {"conta_codigo": "T9994", "debito": "0", "credito": "50"},
        ],
        criado_por="teste",
    )

    with pytest.raises(HTTPException) as e:
        remover_centro(centro.id, _Empresa(empresa_id), base)
    assert e.value.status_code == 409


def test_sem_movimentos_apaga(base, empresa_id):
    """O contraste: a restrição é sobre o histórico, não sobre apagar."""
    from src.api.routers.contabilidade_router import remover_diario

    d = Diario(empresa_id=empresa_id, codigo="T7", nome="Sem uso",
               categoria="outros", ativo=True)
    base.add(d)
    base.flush()
    ident = d.id

    remover_diario(ident, _Empresa(empresa_id), base)

    assert base.get(Diario, ident) is None


# ---------------------------------------------------------------------------
# Um documento sem diário é inutilizável
# ---------------------------------------------------------------------------
def test_um_documento_exige_um_diario_que_exista(base, empresa_id):
    """Só se descobriria ao tentar lançar, e aí já é tarde."""
    from fastapi import HTTPException

    from src.api.routers.contabilidade_router import (
        DocumentoPedido,
        criar_documento,
    )

    with pytest.raises(HTTPException) as e:
        criar_documento(
            None,
            DocumentoPedido(codigo="T96", descricao="X", diario_codigo="NAO-HA"),
            _Empresa(empresa_id),
            base,
        )
    assert e.value.status_code == 422


class _Empresa:
    """O mínimo que as rotas usam da empresa da sessão."""

    def __init__(self, ident):
        self.id = ident


# ---------------------------------------------------------------------------
# A interface
# ---------------------------------------------------------------------------
def test_o_plano_de_contas_cria_altera_e_elimina():
    """O Plano de Contas passou a ser a ÁRVORE do Piloto: a página desenha e
    elimina, e a ficha de conta — o diálogo com os três separadores — é que
    cria e altera. As três operações continuam lá; mudaram de ficheiro."""
    from pathlib import Path

    base = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / "contabilidade" / "plano-contas"
    )
    pagina = (base / "page.tsx").read_text(encoding="utf-8")
    ficha = (base / "FichaConta.tsx").read_text(encoding="utf-8")

    assert "api.post" in ficha, "a ficha não cria"
    assert "api.patch" in ficha, "a ficha não altera"
    assert "api.delete" in pagina, "a página não elimina"
    assert 'pode("contab.plano")' in pagina


@pytest.mark.parametrize(
    "pagina,rota",
    [
        ("contabilidade/diarios", "/api/contabilidade/diarios"),
        ("contabilidade/documentos", "/api/contabilidade/documentos"),
        ("analitica/centros", "/api/contabilidade/centros"),
    ],
)
def test_as_paginas_deixaram_de_ser_so_de_leitura(pagina, rota):
    """REGRESSÃO: as quatro listavam e mais nada."""
    from pathlib import Path

    caminho = (
        Path(__file__).resolve().parents[2]
        / "frontend" / "src" / "app" / "(app)" / pagina / "page.tsx"
    )
    fonte = caminho.read_text(encoding="utf-8")
    assert "api.post" in fonte, f"{pagina} não cria"
    assert "api.patch" in fonte, f"{pagina} não altera"
    assert "api.delete" in fonte, f"{pagina} não elimina"
    # E só a quem tem a capacidade.
    assert 'pode("contab.plano")' in fonte


# ---------------------------------------------------------------------------
# Criar uma conta segue a regra do Piloto
# ---------------------------------------------------------------------------
def test_criar_subconta_transforma_a_mae_e_migra_os_movimentos(base, empresa_id):
    """REGRESSÃO: a rota inseria a linha e mais nada.

    No Piloto, criar `X001` a partir de uma conta de MOVIMENTO `X` que já tem
    lançamentos faz duas coisas: `X` passa a integradora e os movimentos dela
    MIGRAM para `X001`. A rota da Produção ignorava `svc.criar_conta`, e o que
    ficava era uma integradora COM movimentos — o estado que `postar` recusa, e
    que faz o balancete somar o valor duas vezes (na mãe e na agregação dos
    filhos).
    """
    from src.api.routers import contabilidade_router as r

    # A mãe é `ZZ1` e a contrapartida `ZZ2`: códigos que NÃO se estendem um ao
    # outro. Com a contrapartida a chamar-se `ZZ19`, o serviço via-a como filha
    # da mãe, dava a mãe por já-integradora e não migrava nada — o teste
    # falhava por defeito do teste, não do código.
    marca = "ZZ"
    # A rota faz `commit`, por isso o rollback do fixture não limpa o que ela
    # gravou. Limpa-se por prefixo, antes e depois.
    _limpar_marca(base, marca)

    mae = Conta(empresa_id=empresa_id, codigo="ZZ1", nome="Mãe de teste",
                tipo="M", natureza="D", ativa=True)
    contraparte = Conta(empresa_id=empresa_id, codigo="ZZ2", nome="Contrapartida",
                        tipo="M", natureza="C", ativa=True)
    diario = Diario(empresa_id=empresa_id, codigo="ZZD", nome="Teste",
                    categoria="outros", ativo=True)
    doc = DocumentoContabilistico(empresa_id=empresa_id, codigo="ZZO",
                                  descricao="Teste", diario_codigo="ZZD", ativo=True)
    base.add_all([mae, contraparte, diario, doc])
    base.flush()

    svc.postar(
        base, empresa_id=empresa_id, data=date(2026, 3, 1), mes="03",
        diario_codigo="ZZD", documento_codigo="ZZO", descricao="prova",
        linhas=[
            {"conta_codigo": "ZZ1", "debito": 100, "credito": 0},
            {"conta_codigo": "ZZ2", "debito": 0, "credito": 100},
        ],
    )
    base.flush()

    class _Empresa:
        id = empresa_id

    resposta = r.criar_conta(
        None, r.ContaCriar(codigo="ZZ1001", nome="Subconta"), _Empresa(), base
    )

    base.refresh(mae)
    assert mae.tipo == "I", "a mãe devia passar a integradora"
    assert resposta["tornou_integradora"] is True
    assert resposta["movidos"] == 1, "o movimento devia migrar para a subconta"

    restantes = base.scalars(
        select(LancamentoLinha).where(LancamentoLinha.conta_codigo == "ZZ1")
    ).all()
    assert restantes == [], "a integradora não pode ficar com movimentos"

    base.rollback()
    _limpar_marca(base, marca)


def _limpar_marca(db, marca: str) -> None:
    """Apaga tudo o que o teste cria, pela ordem que as chaves estrangeiras
    permitem: linhas, lançamentos, documento, diário e contas."""
    from src.db.models.contabilidade import Lancamento

    db.rollback()
    lancs = db.scalars(
        select(Lancamento).where(Lancamento.diario_codigo == "ZZD")
    ).all()
    for l in lancs:
        for linha in db.scalars(
            select(LancamentoLinha).where(LancamentoLinha.lancamento_id == l.id)
        ):
            db.delete(linha)
        db.delete(l)
    db.flush()
    for modelo, campo in (
        (DocumentoContabilistico, "codigo"),
        (Diario, "codigo"),
    ):
        for obj in db.scalars(
            select(modelo).where(getattr(modelo, campo).like(f"{marca}%"))
        ):
            db.delete(obj)
    for c in db.scalars(select(Conta).where(Conta.codigo.like(f"{marca}%"))):
        db.delete(c)
    db.commit()
