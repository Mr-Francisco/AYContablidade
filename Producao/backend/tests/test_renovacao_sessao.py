"""Renovação da sessão — renova enquanto se trabalha, sem prolongar o limite.

O desenho sempre foi este e o servidor sempre o teve; o que faltava era o
cliente chamar a rota. Estes testes fixam as três propriedades de que a
interface passa a depender, para que uma alteração futura no servidor não as
parta em silêncio:

1. **Renova**: um token perto do fim dá um token novo, com validade nova.
2. **Não prolonga**: a expiração ABSOLUTA é a do token antigo, não uma nova.
   Renovar de dez em dez minutos durante um dia não mantém a sessão viva.
3. **Não contorna um corte deliberado**: se a `token_version` subiu — mudança
   de palavra-passe, de perfil, conta bloqueada, empresa suspensa — a renovação
   é recusada como qualquer outro pedido.
"""

from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from src.api.routers.auth_router import refresh
from src.auth.security import criar_access_token, descodificar_token
from src.db.base import agora
from src.db.models.user import User


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def utilizador(base):
    u = base.scalar(select(User).where(User.email == "contab@demo.ao"))
    assert u is not None, "a base de desenvolvimento precisa da conta de demonstração"
    return u


class _Pedido:
    """O mínimo que a rota usa: o token vem daqui."""

    def __init__(self, token: str):
        self.headers = {"authorization": f"Bearer {token}"}
        self.cookies = {}

    class client:  # noqa: N801
        host = "127.0.0.1"

    method = "POST"
    url = type("U", (), {"path": "/api/auth/refresh"})()


def _token(u: User, *, absoluto_em_horas: float) -> str:
    token, _ = criar_access_token(
        user_id=u.id,
        empresa_id=u.empresa_id,
        perfil=str(u.perfil),
        token_version=u.token_version,
        expira_absoluto=agora() + timedelta(hours=absoluto_em_horas),
    )
    return token


# ---------------------------------------------------------------------------
def test_renova_e_o_token_novo_serve(base, utilizador):
    """O que interessa é o token que vem: válido, do mesmo utilizador, com
    validade no futuro.

    Não se compara a string com a antiga: emitidos no mesmo segundo, os dois
    são iguais byte a byte — o `iat` e o `exp` são contados em segundos. Isso
    não é defeito nenhum, é o que acontece quando se renova depressa de mais, e
    fixá-lo num teste era fixar o relógio.
    """
    antigo = _token(utilizador, absoluto_em_horas=8)

    r = refresh(_Pedido(antigo), utilizador, base)

    novo = descodificar_token(r.access_token)
    assert novo["sub"] == str(utilizador.id)
    assert novo["exp"] > int(agora().timestamp()), "o token novo tem de valer"
    assert int(novo["tv"]) == utilizador.token_version


def test_nao_prolonga_o_limite_absoluto(base, utilizador):
    """A propriedade que faz isto ser seguro: renovar não estica a sessão."""
    antigo = _token(utilizador, absoluto_em_horas=2)
    absoluto_antes = descodificar_token(antigo)["sa"]

    r = refresh(_Pedido(antigo), utilizador, base)

    assert descodificar_token(r.access_token)["sa"] == absoluto_antes


def test_depois_do_limite_absoluto_recusa(base, utilizador):
    """Passado o limite, a sessão acabou — e nada a renova.

    O token é emitido com `exp = min(agora + 30 min, limite absoluto)`, por isso
    um limite no passado traz também o `exp` no passado: quem barra é a própria
    validação do token, antes de a rota chegar a correr. A verificação dentro
    da rota é uma segunda tranca, para o dia em que os relógios não concordem.
    """
    from src.api.deps import utilizador_atual

    expirado = _token(utilizador, absoluto_em_horas=-1)

    with pytest.raises(HTTPException) as erro:
        utilizador_atual(token=expirado, db=base)

    assert erro.value.status_code == 401


def test_nao_contorna_um_corte_deliberado(base, utilizador):
    """REGRESSÃO A EVITAR: renovar não pode ressuscitar uma sessão cortada.

    Mudar a palavra-passe, alterar um perfil, bloquear a conta ou suspender a
    empresa sobem a `token_version` — e é isso que expulsa quem já está dentro.
    Se a renovação passasse por cima disso, «desactivar» deixava de significar
    alguma coisa até ao fim da sessão.
    """
    from src.api.deps import utilizador_atual

    token = _token(utilizador, absoluto_em_horas=8)
    utilizador.token_version += 1  # o corte, seja qual for a sua origem
    base.flush()

    with pytest.raises(HTTPException) as erro:
        utilizador_atual(token=token, db=base)

    assert erro.value.status_code == 401
