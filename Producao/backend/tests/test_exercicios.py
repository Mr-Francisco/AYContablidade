"""Exercícios económicos: abrir, fechar e reabrir.

O Piloto geria exercícios em `empresa.html`. A Produção só os LIA — havia
`GET /exercicios` e mais nada, e um exercício fechado só se reabria mexendo na
base de dados. Daí as rotas de escrita.

O QUE ESTES TESTES NÃO FAZEM: reimplementar a regra. Quem recusa lançamentos
num exercício fechado é `svc.gravar_lancamento`, e essa regra já existia — o
que aqui se prova é que continua a valer depois de o estado passar a mexer-se
pela interface, e que ninguém a contorna pelas rotas novas.
"""

from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from src.db.models.tenancy import Empresa, Exercicio
from src.services import contabilidade as svc

MARCA = "ZZ-teste-exercicio"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.rollback()
    db.close()


def _limpar(db) -> None:
    """As rotas fazem `commit`, por isso o rollback do fixture não chega."""
    for e in db.scalars(select(Exercicio).where(Exercicio.nome.like(f"{MARCA}%"))):
        db.delete(e)
    db.commit()


@pytest.fixture
def empresa_id(base):
    e = base.scalar(select(Empresa).limit(1))
    assert e is not None, "a base de demonstração precisa de uma empresa"
    return e.id


# ---------------------------------------------------------------------------
# As rotas existem e estão protegidas
# ---------------------------------------------------------------------------
def test_as_rotas_de_escrita_existem():
    """REGRESSÃO: só existia GET. Sem estas, criar o exercício do ano seguinte
    ou reabrir um fechado por engano exigia ir à base de dados."""
    from src.api.main import app

    caminhos = app.openapi()["paths"]
    assert {"get", "post"} <= set(caminhos["/api/contabilidade/exercicios"])
    assert "patch" in caminhos["/api/contabilidade/exercicios/{exercicio_id}"]


@pytest.mark.parametrize("funcao", ["criar_exercicio", "actualizar_exercicio"])
def test_exigem_a_capacidade_de_fechar(funcao):
    """`contab.fechar` — a mesma dos fechos de período, porque é o mesmo poder:
    decidir o que ainda aceita lançamentos."""
    import inspect

    from src.api.routers import contabilidade_router as r

    fonte = inspect.getsource(r)
    decorador = fonte.split(f"def {funcao}(")[0].rsplit("@router.", 1)[-1]
    assert "dependencies=[FECHAR]" in decorador, f"{funcao} sem FECHAR"


def test_alterar_confina_a_empresa_da_sessao():
    """REGRESSÃO: sem o filtro, conhecer o id chegava para fechar o exercício
    de outra empresa — e parar-lhe a contabilidade."""
    import inspect

    from src.api.routers import contabilidade_router as r

    fonte = inspect.getsource(r.actualizar_exercicio)
    assert "obter_da_empresa" in fonte


def test_o_nome_e_as_datas_nao_se_alteram():
    """REGRESSÃO: os lançamentos guardam o ID do exercício, não as datas. Mover
    as datas por baixo deles mudava o período a que pertencem sem lhes tocar."""
    from src.api.routers import contabilidade_router as r

    campos = set(r.ExercicioAtualizar.model_fields)
    assert campos == {"estado", "ativo"}, f"campos a mais: {campos}"


# ---------------------------------------------------------------------------
# Criar
# ---------------------------------------------------------------------------
def test_nasce_sempre_aberto(base, empresa_id):
    """`estado` não é um campo do pedido: criar um exercício já fechado seria
    uma forma silenciosa de bloquear lançamentos."""
    from src.api.routers import contabilidade_router as r

    assert "estado" not in r.ExercicioPedido.model_fields

    empresa = base.get(Empresa, empresa_id)
    novo = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} A", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
        ),
        empresa,
        base,
    )
    assert novo["estado"] == "aberto"


def test_datas_invertidas_recusadas(base, empresa_id):
    from src.api.routers import contabilidade_router as r

    with pytest.raises(HTTPException) as e:
        r.criar_exercicio(
            r.ExercicioPedido(
                nome=f"{MARCA} B", inicio=date(2099, 12, 31), fim=date(2099, 1, 1)
            ),
            base.get(Empresa, empresa_id),
            base,
        )
    assert e.value.status_code == 422


def test_nome_repetido_na_mesma_empresa_recusado(base, empresa_id):
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    pedido = r.ExercicioPedido(
        nome=f"{MARCA} C", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
    )
    r.criar_exercicio(pedido, empresa, base)
    with pytest.raises(HTTPException) as e:
        r.criar_exercicio(pedido, empresa, base)
    assert e.value.status_code == 409


# ---------------------------------------------------------------------------
# Fechar e reabrir
# ---------------------------------------------------------------------------
def test_fechar_e_reabrir(base, empresa_id):
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    ex = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} D", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
        ),
        empresa,
        base,
    )

    fechado = r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="fechado"), empresa, base
    )
    assert fechado["estado"] == "fechado"

    aberto = r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="aberto"), empresa, base
    )
    assert aberto["estado"] == "aberto"


def test_activo_e_independente_do_estado(base, empresa_id):
    """No Piloto vários exercícios podem estar activos ao mesmo tempo, e
    «activo» não quer dizer «aberto». São dois interruptores."""
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    ex = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} E",
            inicio=date(2099, 1, 1),
            fim=date(2099, 12, 31),
            ativo=True,
        ),
        empresa,
        base,
    )
    fechado = r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="fechado"), empresa, base
    )
    assert fechado["estado"] == "fechado"
    assert fechado["ativo"] is True, "fechar não devia desactivar"


def test_estado_invalido_recusado():
    """Só «aberto» e «fechado». Um terceiro valor passava pela verificação de
    `gravar_lancamento`, que só compara com «fechado», e o exercício ficava
    aberto sem ninguém perceber porquê."""
    import pydantic

    from src.api.routers import contabilidade_router as r

    with pytest.raises(pydantic.ValidationError):
        r.ExercicioAtualizar(estado="meio-fechado")


def test_pedido_vazio_recusado(base, empresa_id):
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    ex = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} F", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
        ),
        empresa,
        base,
    )
    with pytest.raises(HTTPException) as e:
        r.actualizar_exercicio(ex["id"], r.ExercicioAtualizar(), empresa, base)
    assert e.value.status_code == 422


# ---------------------------------------------------------------------------
# A regra continua a valer — é o que interessa
# ---------------------------------------------------------------------------
def test_exercicio_fechado_continua_a_recusar_lancamentos(base, empresa_id):
    """REGRESSÃO: a razão de ser de tudo isto. Se fechar pela interface não
    travasse o lançamento, o botão era decoração."""
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    ex = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} G", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
        ),
        empresa,
        base,
    )
    r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="fechado"), empresa, base
    )

    codigos = _duas_contas_de_movimento(base, empresa_id)

    with pytest.raises(svc.ErroContabilistico) as e:
        svc.postar(
            base,
            empresa_id=empresa_id,
            data=date(2099, 3, 15),
            mes="03",
            diario_codigo="90",
            documento_codigo="901",
            descricao="não devia passar",
            exercicio_id=ex["id"],
            linhas=[
                {"conta_codigo": codigos[0], "debito": 100, "credito": 0},
                {"conta_codigo": codigos[1], "debito": 0, "credito": 100},
            ],
        )
    assert "fechado" in str(e.value)


def test_depois_de_reabrir_volta_a_aceitar(base, empresa_id):
    from src.api.routers import contabilidade_router as r

    empresa = base.get(Empresa, empresa_id)
    ex = r.criar_exercicio(
        r.ExercicioPedido(
            nome=f"{MARCA} H", inicio=date(2099, 1, 1), fim=date(2099, 12, 31)
        ),
        empresa,
        base,
    )
    r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="fechado"), empresa, base
    )
    r.actualizar_exercicio(
        ex["id"], r.ExercicioAtualizar(estado="aberto"), empresa, base
    )

    codigos = _duas_contas_de_movimento(base, empresa_id)
    lanc = svc.postar(
        base,
        empresa_id=empresa_id,
        data=date(2099, 3, 15),
        mes="03",
        diario_codigo="90",
        documento_codigo="901",
        descricao="agora passa",
        exercicio_id=ex["id"],
        linhas=[
            {"conta_codigo": codigos[0], "debito": 100, "credito": 0},
            {"conta_codigo": codigos[1], "debito": 0, "credito": 100},
        ],
    )
    assert lanc is not None
    base.rollback()


def _duas_contas_de_movimento(db, empresa_id) -> tuple[str, str]:
    """Só contas de movimento recebem lançamentos — usa-se o mesmo `eh_movimento`
    do serviço, para o teste não ter a sua própria ideia do que é uma folha."""
    from src.db.models.contabilidade import Conta

    todas = list(
        db.scalars(
            select(Conta)
            .where(Conta.empresa_id == empresa_id, Conta.ativa.is_(True))
            .order_by(Conta.codigo)
        )
    )
    movimento = [c.codigo for c in todas if svc.eh_movimento(c, todas)]
    assert len(movimento) >= 2, "a base de demonstração precisa de contas de movimento"
    return movimento[0], movimento[1]
