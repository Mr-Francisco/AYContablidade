"""Estado das empresas: suspender, reactivar e cancelar.

O campo `estado` existia desde o início e o login já o verificava, mas nenhuma
rota lhe escrevia — uma porta trancada sem ninguém que lhe pudesse mexer na
chave. Suspender uma empresa obrigava a mexer à mão na base de dados.

O que aqui se fixa é sobretudo UMA coisa: suspender tem de expulsar quem já
está dentro. Sem isso, suspender só travava logins novos e quem estivesse com o
sistema aberto continuava a trabalhar até o token expirar — o contrário do que
se quer ao cortar o acesso a uma empresa.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.auth.security import ESCOPO_PLATAFORMA


class SessaoFalsa:
    """Sessão mínima com uma empresa e os seus utilizadores."""

    def __init__(self, empresa, utilizadores):
        self._empresa, self._users = empresa, utilizadores
        self.adicionados, self.commits = [], 0

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa
        from src.db.models.user import User

        if modelo is Empresa:
            return self._empresa if pk == self._empresa.id else None
        if modelo is User:
            return next((u for u in self._users if u.id == pk), None)
        return None

    def scalars(self, _stmt):
        # A única consulta desta rota procura os utilizadores da empresa.
        return _Resultado(self._users)

    def add(self, obj):
        self.adicionados.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def accoes_auditadas(self):
        return [getattr(o, "accao", None) for o in self.adicionados]

    def registo(self, accao):
        return next(
            (o for o in self.adicionados if getattr(o, "accao", None) == accao), None
        )


class _Resultado:
    def __init__(self, itens):
        self._itens = itens

    def all(self):
        return self._itens


@pytest.fixture
def ambiente():
    from src.api.deps import escopo_do_token, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoEmpresa, Perfil
    from src.db.base import get_db
    from src.db.models.tenancy import Empresa
    from src.db.models.user import User

    from src.core.constants import RegimeIVA
    from src.db.base import agora

    empresa = Empresa(
        id=uuid4(),
        nome="Cliente, Lda.",
        nif="5000000000",
        codigo="CL001",
        estado=EstadoEmpresa.ACTIVA,
        # Têm `server_default`; um objecto construído em memória fica com None
        # e o `EmpresaPublica` da resposta recusa-o.
        moeda="Kz",
        regime=RegimeIVA.GERAL,
        criado_em=agora(),
    )

    def _membro(nome):
        return User(
            id=uuid4(),
            empresa_id=empresa.id,
            nome=nome,
            email=f"{nome.lower()}@cliente.ao",
            password_hash="x",
            perfil=Perfil.CONTABILISTA,
            ativo=True,
            aprovado=True,
            token_version=0,
            totp_ativo=False,
            totp_codigos_recuperacao=[],
            totp_falhas=0,
            password_provisoria=False,
        permissoes_extra=[],
            permissoes_accao={},
        )

    membros = [_membro("Ana"), _membro("Bruno")]
    superadmin = User(
        id=uuid4(),
        empresa_id=None,
        nome="Operador",
        email="op@plataforma.ao",
        password_hash="x",
        perfil=Perfil.SUPERADMIN,
        ativo=True,
        aprovado=True,
        token_version=0,
        # A administração da plataforma exige 2FA (etapa 6).
        totp_ativo=True,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        password_provisoria=False,
        permissoes_extra=[],
        permissoes_accao={},
    )

    db = SessaoFalsa(empresa, membros)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[utilizador_atual] = lambda: superadmin
    # A sessão de administração da plataforma leva um escopo próprio; sem ele
    # as rotas recusam, e é isso que se está a simular aqui.
    app.dependency_overrides[escopo_do_token] = lambda: ESCOPO_PLATAFORMA

    with TestClient(app) as cliente:
        yield cliente, empresa, membros, superadmin, db

    app.dependency_overrides.clear()


def _mudar(cliente, empresa, estado, motivo=None):
    return cliente.patch(
        f"/api/licencas/empresas/{empresa.id}/estado",
        json={"estado": estado, "motivo": motivo},
    )


# ---------------------------------------------------------------------------
def test_suspender_grava_o_estado(ambiente):
    cliente, empresa, _, _, _ = ambiente
    r = _mudar(cliente, empresa, "suspensa", "Falta de pagamento")
    assert r.status_code == 200
    assert r.json()["estado"] == "suspensa"
    assert str(empresa.estado) == "suspensa"


def test_suspender_expulsa_quem_ja_esta_dentro(ambiente):
    """REGRESSÃO: sem subir a `token_version`, suspender só travava logins
    novos e quem tivesse o sistema aberto continuava a trabalhar até o token
    expirar — o contrário do que se quer ao cortar o acesso a uma empresa."""
    cliente, empresa, membros, _, _ = ambiente
    antes = [u.token_version for u in membros]

    _mudar(cliente, empresa, "suspensa")

    assert all(u.token_version == v + 1 for u, v in zip(membros, antes, strict=True))


def test_cancelar_tambem_expulsa(ambiente):
    cliente, empresa, membros, _, _ = ambiente
    antes = [u.token_version for u in membros]
    _mudar(cliente, empresa, "cancelada")
    assert all(u.token_version == v + 1 for u, v in zip(membros, antes, strict=True))


def test_reactivar_nao_mexe_nas_sessoes(ambiente):
    """Quem foi expulso já está fora; subir outra vez a versão não protege
    ninguém e só obrigaria a um login extra a quem entrasse no intervalo."""
    cliente, empresa, membros, _, _ = ambiente
    _mudar(cliente, empresa, "suspensa")
    antes = [u.token_version for u in membros]
    _mudar(cliente, empresa, "activa")
    assert [u.token_version for u in membros] == antes


def test_a_mudanca_fica_auditada_com_motivo_e_autor(ambiente):
    cliente, empresa, membros, superadmin, db = ambiente
    _mudar(cliente, empresa, "suspensa", "Falta de pagamento de Julho")

    reg = db.registo("empresa.estado")
    assert reg is not None
    assert reg.actor_id == superadmin.id
    assert reg.detalhes["antes"] == "activa"
    assert reg.detalhes["depois"] == "suspensa"
    assert reg.detalhes["motivo"] == "Falta de pagamento de Julho"
    # Quantas sessões foram cortadas é o que se quer saber a seguir a um corte.
    assert reg.detalhes["sessoes_terminadas"] == len(membros)


def test_motivo_em_branco_fica_nulo_e_nao_vazio(ambiente):
    cliente, empresa, _, _, db = ambiente
    _mudar(cliente, empresa, "suspensa", "   ")
    assert db.registo("empresa.estado").detalhes["motivo"] is None


def test_mudar_para_o_mesmo_estado_e_recusado(ambiente):
    cliente, empresa, membros, _, _ = ambiente
    antes = [u.token_version for u in membros]
    r = _mudar(cliente, empresa, "activa")
    assert r.status_code == 409
    # E não pode ter efeitos colaterais nenhuns.
    assert [u.token_version for u in membros] == antes


def test_desfazer_um_cancelamento_e_possivel(ambiente):
    """Tornar um estado terminal só empurrava o problema de volta para o SQL à
    mão, que é o que esta rota existe para acabar."""
    cliente, empresa, _, _, _ = ambiente
    _mudar(cliente, empresa, "cancelada")
    assert _mudar(cliente, empresa, "activa").status_code == 200
    assert str(empresa.estado) == "activa"


def test_estado_inventado_e_recusado(ambiente):
    cliente, empresa, _, _, _ = ambiente
    assert _mudar(cliente, empresa, "ferias").status_code == 422


def test_empresa_inexistente(ambiente):
    cliente, _, _, _, _ = ambiente
    r = cliente.patch(
        f"/api/licencas/empresas/{uuid4()}/estado", json={"estado": "suspensa"}
    )
    assert r.status_code == 404


def test_um_admin_de_empresa_nao_muda_estados(ambiente):
    """A rota vive atrás de `exigir_superadmin` — se algum dia deixar de viver,
    um administrador podia reactivar a própria empresa suspensa."""
    from src.api.deps import utilizador_atual
    from src.api.main import app
    from src.core.constants import Perfil

    cliente, empresa, membros, _, _ = ambiente
    intruso = membros[0]
    intruso.perfil = Perfil.ADMIN
    app.dependency_overrides[utilizador_atual] = lambda: intruso

    assert _mudar(cliente, empresa, "suspensa").status_code == 403
    assert str(empresa.estado) == "activa"


def test_um_superadmin_sem_2fa_nao_muda_estados(ambiente):
    """Herdado da etapa 6, e vale a pena fixar aqui: esta rota mexe no acesso
    de uma empresa inteira."""
    from src.api.deps import utilizador_atual
    from src.api.main import app

    cliente, empresa, _, superadmin, _ = ambiente
    superadmin.totp_ativo = False
    app.dependency_overrides[utilizador_atual] = lambda: superadmin

    assert _mudar(cliente, empresa, "suspensa").status_code in (403, 503)
    assert str(empresa.estado) == "activa"
