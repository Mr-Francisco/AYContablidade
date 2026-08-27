"""A ficha da empresa não se grava sem logótipo.

O logótipo vai no topo de cada factura e de cada mapa impresso. Sem ele o
documento sai com um quadrado de iniciais no lugar da marca — o que serve para
trabalhar mas não para entregar a um cliente.

O QUE ESTES TESTES FIXAM é a parte que se esquece: a exigência olha ao valor
QUE FICA e não ao que vem no pedido. Mudar só o telefone de uma empresa que
nunca carregou o logótipo também tem de parar, senão a regra nunca chegava a
quem já cá estava — que são precisamente as empresas sem logótipo.
"""

import base64
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

#: Um PNG mínimo, para ter um `data:` que passa na validação.
PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class SessaoFalsa:
    def __init__(self, empresa, licenca):
        self._empresa, self._licenca = empresa, licenca

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa

        return self._empresa if modelo is Empresa and pk == self._empresa.id else None

    def scalar(self, stmt):
        return self._licenca if "licenca" in str(stmt).lower() else None

    def add(self, _obj):
        pass

    def flush(self):
        pass

    def refresh(self, _obj):
        pass

    def commit(self):
        pass


def _monta(logo=None):
    from src.api.deps import get_db, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoLicenca, Perfil, RegimeIVA
    from src.db.base import agora
    from src.db.models.tenancy import Empresa, Licenca
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(), nome="Padaria do Bairro, Lda.", nif="5417000000",
        codigo="PB001", moeda="Kz", regime=RegimeIVA.GERAL, estado="activa",
        logo=logo, criado_em=agora(),
    )
    licenca = Licenca(
        id=uuid4(), empresa_id=empresa.id, estado=EstadoLicenca.ACTIVA,
        validade=date.today() + timedelta(days=365), modulos_incluidos=[],
        criado_em=agora(),
    )
    user = User(
        id=uuid4(), empresa_id=empresa.id, nome="Ana", email="ana@padaria.ao",
        password_hash="x", perfil=Perfil.ADMIN, ativo=True,
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


def test_sem_logotipo_nao_se_grava(limpar):
    """Mexer noutro campo qualquer não escapa à exigência."""
    app, _ = _monta(logo=None)
    with TestClient(app) as cliente:
        r = cliente.patch("/api/empresa", json={"telefone": "923000000"})

    assert r.status_code == 422, r.text
    recado = r.json()["detail"]
    # A mensagem tem de dizer o que fazer, e não só que faltou.
    assert "logótipo" in recado
    assert "Carregue" in recado


def test_com_logotipo_ja_na_ficha_grava(limpar):
    """Quem já o tem não é incomodado por mudar o telefone."""
    app, _ = _monta(logo=PNG)
    with TestClient(app) as cliente:
        r = cliente.patch("/api/empresa", json={"telefone": "923000000"})

    assert r.status_code == 200, r.text


def test_formato_que_nao_e_imagem_recusado(limpar):
    app, _ = _monta(logo=None)
    corpo = base64.b64encode(b"%PDF-1.4 nao sou imagem").decode()
    with TestClient(app) as cliente:
        r = cliente.patch(
            "/api/empresa", json={"logo": f"data:application/pdf;base64,{corpo}"}
        )

    assert r.status_code == 422, r.text
    assert "PNG" in r.json()["detail"]


def test_logotipo_grande_demais_recusado(limpar):
    """O logótipo viaja em cada resposta que traga a empresa."""
    from src.api.routers.empresa_router import LOGO_MAX_BYTES

    app, _ = _monta(logo=None)
    corpo = base64.b64encode(b"\0" * (LOGO_MAX_BYTES + 1)).decode()
    with TestClient(app) as cliente:
        r = cliente.patch(
            "/api/empresa", json={"logo": f"data:image/png;base64,{corpo}"}
        )

    assert r.status_code == 422, r.text
    assert "KB" in r.json()["detail"]


def test_texto_que_nao_e_data_uri_recusado(limpar):
    app, _ = _monta(logo=None)
    with TestClient(app) as cliente:
        r = cliente.patch("/api/empresa", json={"logo": "https://exemplo.ao/l.png"})

    assert r.status_code == 422, r.text
