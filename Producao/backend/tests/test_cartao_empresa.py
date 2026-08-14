"""O cartão da empresa é legível por quem não é administrador.

Todo o mapa que se imprime leva o nome da empresa em cima e os valores na
moeda dela. A ficha da empresa (`GET /api/empresa`) está — bem — reservada ao
administrador, porque traz morada, contactos e configurações e porque se pode
editar no mesmo sítio. O efeito colateral é que um contabilista, que passa o
dia a tirar balancetes, não sabia o nome da própria empresa: os mapas saíam sem
cabeçalho e com «Kz» por omissão, mesmo numa empresa que trabalhe noutra moeda.

`GET /api/empresa/cartao` devolve os cinco campos de que um cabeçalho precisa.
O que estes testes fixam é que continua a ser assim: legível por qualquer
perfil, e sempre da empresa de quem pergunta.
"""

from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


class SessaoFalsa:
    def __init__(self, empresa, licenca):
        self._empresa, self._licenca = empresa, licenca

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa

        return self._empresa if modelo is Empresa and pk == self._empresa.id else None

    def scalar(self, stmt):
        return self._licenca if "licenca" in str(stmt).lower() else None

    def commit(self):
        pass


def _monta(perfil):
    from src.api.deps import get_db, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoLicenca, Perfil, RegimeIVA
    from src.db.base import agora
    from src.db.models.tenancy import Empresa, Licenca
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(), nome="Padaria do Bairro, Lda.", nif="5417000000",
        codigo="PB001", moeda="EUR", regime=RegimeIVA.GERAL, estado="activa",
        criado_em=agora(),
    )
    licenca = Licenca(
        id=uuid4(), empresa_id=empresa.id, estado=EstadoLicenca.ACTIVA,
        validade=date.today() + timedelta(days=365), modulos_incluidos=[],
        criado_em=agora(),
    )
    user = User(
        id=uuid4(), empresa_id=empresa.id, nome="Ana", email="ana@padaria.ao",
        password_hash="x", perfil=getattr(Perfil, perfil), ativo=True,
        aprovado=True, token_version=0, totp_ativo=False,
        totp_codigos_recuperacao=[], totp_falhas=0, password_provisoria=False,
        permissoes_extra=[], permissoes_accao={}, modulos_permitidos=None,
    )
    app.dependency_overrides[get_db] = lambda: SessaoFalsa(empresa, licenca)
    app.dependency_overrides[utilizador_atual] = lambda: user
    return app, empresa


@pytest.fixture
def limpar():
    yield
    from src.api.main import app

    app.dependency_overrides.clear()


@pytest.mark.parametrize("perfil", ["CONTABILISTA", "CONSULTA", "COMERCIAL", "RH"])
def test_qualquer_perfil_le_o_cartao(perfil, limpar):
    app, empresa = _monta(perfil)
    with TestClient(app) as cliente:
        r = cliente.get("/api/empresa/cartao")

    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["nome"] == empresa.nome
    # A moeda é a razão de ser da rota: sem ela os mapas saíam todos em «Kz».
    assert corpo["moeda"] == "EUR"


def test_o_cartao_nao_traz_a_ficha_toda(limpar):
    """Morada, contactos e configurações continuam do administrador."""
    app, _ = _monta("CONTABILISTA")
    with TestClient(app) as cliente:
        corpo = cliente.get("/api/empresa/cartao").json()

    assert set(corpo) == {"id", "nome", "nif", "codigo", "moeda", "regime"}


def test_a_ficha_completa_continua_a_recusar(limpar):
    """O cartão não abriu a porta do lado: `GET /api/empresa` mantém-se fechado."""
    app, _ = _monta("CONTABILISTA")
    with TestClient(app) as cliente:
        r = cliente.get("/api/empresa")

    assert r.status_code == 403, r.text
