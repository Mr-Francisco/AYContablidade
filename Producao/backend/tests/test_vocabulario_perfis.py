"""Os rótulos dos perfis são legíveis por qualquer utilizador.

`GET /api/users/metadados` devolve os NOMES e as CORES dos perfis, módulos e
acções — que o perfil `contabilista` se escreve «Contabilista» e é azul-escuro.
Não diz nada sobre ninguém.

Estava trancado atrás do perfil de administrador porque a primeira página a
precisar dele foi a gestão de utilizadores. O efeito colateral era o ecrã «O
Meu Perfil» de toda a gente: quem não é administrador via o seu próprio perfil
escrito `contabilista`, em minúsculas e a cinzento.

O segundo teste é o que custou a encontrar: a rota vive num router sem guarda,
mas o router de administração tem `GET /api/users/{user_id}`, que casa com
`/api/users/metadados` e o mandava na mesma para o 403. A ordem de registo é
que resolve, e é isso que aqui fica preso.
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


def _monta(perfil: str):
    from src.api.deps import get_db, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoLicenca, Perfil, RegimeIVA
    from src.db.base import agora
    from src.db.models.tenancy import Empresa, Licenca
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(), nome="Oficina Central, Lda.", nif="5417000002", codigo="OC001",
        moeda="Kz", regime=RegimeIVA.GERAL, estado="activa", criado_em=agora(),
    )
    licenca = Licenca(
        id=uuid4(), empresa_id=empresa.id, estado=EstadoLicenca.ACTIVA,
        validade=date.today() + timedelta(days=365), modulos_incluidos=[],
        criado_em=agora(),
    )
    user = User(
        id=uuid4(), empresa_id=empresa.id, nome="Nuno", email="nuno@oficina.ao",
        password_hash="x", perfil=getattr(Perfil, perfil), ativo=True, aprovado=True,
        token_version=0, totp_ativo=False, totp_codigos_recuperacao=[],
        totp_falhas=0, password_provisoria=False, permissoes_extra=[],
        permissoes_accao={}, modulos_permitidos=None,
    )
    app.dependency_overrides[get_db] = lambda: SessaoFalsa(empresa, licenca)
    app.dependency_overrides[utilizador_atual] = lambda: user
    return app


@pytest.fixture
def limpar():
    yield
    from src.api.main import app

    app.dependency_overrides.clear()


@pytest.mark.parametrize("perfil", ["CONTABILISTA", "CONSULTA", "RH", "LOGISTICA"])
def test_qualquer_perfil_le_o_vocabulario(perfil, limpar):
    app = _monta(perfil)
    with TestClient(app) as cliente:
        r = cliente.get("/api/users/metadados")

    assert r.status_code == 200, r.text
    perfis = {p["id"]: p for p in r.json()["perfis"]}
    # É isto que o ecrã de perfil precisa: o nome escrito e a cor.
    assert perfis["contabilista"]["nome"] == "Contabilista"
    assert perfis["contabilista"]["cor"].startswith("#")


def test_a_gestao_de_utilizadores_continua_fechada(limpar):
    """Abrir o vocabulário não abriu a lista de contas."""
    app = _monta("CONTABILISTA")
    with TestClient(app) as cliente:
        assert cliente.get("/api/users").status_code == 403
        assert cliente.get(f"/api/users/{uuid4()}").status_code == 403
