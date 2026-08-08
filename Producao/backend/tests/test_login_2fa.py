"""Login em dois passos (etapa 3).

O que aqui se fixa não é o caminho feliz — esse vê-se a usar o sistema. É o que
sustenta o segundo factor e que se parte sem dar por isso:

- um token de DESAFIO não abre sessão nenhuma. Sem esta separação, bastava
  ignorar o segundo pedido e usar o que o primeiro devolveu;
- uma palavra-passe errada numa conta com 2FA não é distinguível de um código
  errado — senão o formulário confirma palavras-passe a quem as anda a testar;
- um código usado não serve outra vez.
"""

import os
from uuid import uuid4

import pyotp
import pytest
from fastapi.testclient import TestClient

from src.core.config import get_settings

CHAVE = "chave-de-teste-do-2fa-nao-usar-em-producao"
PASSWORD = "uma-palavra-passe-de-teste-123"
EMAIL = "ana@teste.ao"
CODIGO_EMPRESA = "TS001"


class SessaoFalsa:
    """Sessão mínima: devolve sempre os mesmos objectos e conta os commits."""

    def __init__(self, user, empresa):
        self._user, self._empresa = user, empresa
        self.adicionados, self.commits = [], 0

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa
        from src.db.models.user import User

        if modelo is User:
            return self._user if pk == self._user.id else None
        if modelo is Empresa:
            return self._empresa if pk == self._empresa.id else None
        return None

    def scalar(self, _stmt):
        # A única consulta do login é a procura do utilizador por e-mail; o
        # duplo não interpreta SQL, devolve o único que existe.
        return self._user

    def add(self, obj):
        self.adicionados.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def accoes_auditadas(self):
        return [getattr(o, "accao", None) for o in self.adicionados]


@pytest.fixture
def ambiente():
    antes = os.environ.get("TOTP_CHAVE_CIFRA")
    os.environ["TOTP_CHAVE_CIFRA"] = CHAVE
    get_settings.cache_clear()

    from src.api.limites import limiter
    from src.api.main import app
    from src.auth import totp
    from src.auth.security import hash_password
    from src.core.constants import EstadoEmpresa, Perfil
    from src.db.base import get_db
    from src.db.models.tenancy import Empresa
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(),
        nome="Teste, Lda.",
        nif="5000000000",
        codigo=CODIGO_EMPRESA,
        estado=EstadoEmpresa.ACTIVA,
    )
    segredo = totp.gerar_segredo()
    codigos = totp.gerar_codigos_recuperacao()
    user = User(
        id=uuid4(),
        empresa_id=empresa.id,
        nome="Ana Teste",
        email=EMAIL,
        password_hash=hash_password(PASSWORD),
        perfil=Perfil.ADMIN,
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=True,
        totp_segredo=totp.cifrar_segredo(segredo),
        totp_codigos_recuperacao=[totp.hash_codigo(c) for c in codigos],
        totp_falhas=0,
        permissoes_extra=[],
        permissoes_accao={},
    )

    db = SessaoFalsa(user, empresa)
    app.dependency_overrides[get_db] = lambda: db
    # A licença é validada por uma função à parte; aqui interessa o 2FA.
    import src.api.routers.auth_router as ar

    licenca_original = ar.licenca_valida
    ar.licenca_valida = lambda _l: True
    limiter.enabled = False

    with TestClient(app) as cliente:
        yield cliente, user, db, segredo, codigos

    ar.licenca_valida = licenca_original
    limiter.enabled = True
    app.dependency_overrides.clear()
    if antes is None:
        os.environ.pop("TOTP_CHAVE_CIFRA", None)
    else:
        os.environ["TOTP_CHAVE_CIFRA"] = antes
    get_settings.cache_clear()


def _passo1(cliente, password=PASSWORD, empresa=CODIGO_EMPRESA):
    return cliente.post(
        "/api/auth/login",
        json={"email": EMAIL, "password": password, "empresa": empresa},
    )


def _passo2(cliente, desafio, codigo):
    return cliente.post(
        "/api/auth/login/2fa", json={"desafio": desafio, "codigo": codigo}
    )


# ---------------------------------------------------------------------------
# Primeiro passo
# ---------------------------------------------------------------------------
def test_com_2fa_o_primeiro_passo_nao_da_sessao(ambiente):
    cliente, _, _, _, _ = ambiente
    d = _passo1(cliente).json()
    assert d["requer_2fa"] is True
    assert "access_token" not in d
    assert d["desafio"]


def test_sem_2fa_o_login_continua_de_um_so_passo(ambiente):
    """A etapa não pode mudar nada para quem não activou o segundo factor."""
    cliente, user, _, _, _ = ambiente
    user.totp_ativo = False
    d = _passo1(cliente).json()
    assert "access_token" in d
    assert "requer_2fa" not in d


# ---------------------------------------------------------------------------
# O desafio não é uma sessão
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("rota", ["/api/auth/me", "/api/auth/2fa"])
def test_o_desafio_nao_abre_sessao(ambiente, rota):
    """REGRESSÃO CRÍTICA: se o desafio fosse aceite como token de acesso,
    bastava não fazer o segundo pedido e o segundo factor não existia."""
    cliente, _, _, _, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    r = cliente.get(rota, headers={"Authorization": f"Bearer {desafio}"})
    assert r.status_code == 401


def test_o_desafio_nao_renova_sessao(ambiente):
    cliente, _, _, _, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    r = cliente.post(
        "/api/auth/refresh", headers={"Authorization": f"Bearer {desafio}"}
    )
    assert r.status_code == 401


def test_o_desafio_nao_leva_perfil_nem_empresa(ambiente):
    """O conteúdo de um JWT lê-se sem chave. O desafio não é sessão e não tem
    de dizer quem é nem o que pode."""
    import jwt

    cliente, _, _, _, _ = ambiente
    payload = jwt.decode(
        _passo1(cliente).json()["desafio"], options={"verify_signature": False}
    )
    assert "perfil" not in payload
    assert "emp" not in payload
    assert payload["tipo"] == "desafio"


def test_um_token_de_acesso_nao_serve_como_desafio(ambiente):
    cliente, user, _, segredo, _ = ambiente
    user.totp_ativo = False
    token = _passo1(cliente).json()["access_token"]
    user.totp_ativo = True
    assert _passo2(cliente, token, pyotp.TOTP(segredo).now()).status_code == 401


# ---------------------------------------------------------------------------
# Segundo passo
# ---------------------------------------------------------------------------
def test_o_codigo_certo_abre_a_sessao(ambiente):
    cliente, _, _, segredo, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    r = _passo2(cliente, desafio, pyotp.TOTP(segredo).now())
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_o_codigo_errado_e_recusado(ambiente):
    cliente, _, _, _, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    assert _passo2(cliente, desafio, "000000").status_code == 401


def test_o_mesmo_codigo_nao_serve_duas_vezes(ambiente):
    """REGRESSÃO: um código vale cerca de um minuto. Sem guardar o passo de
    tempo, quem o intercepte tem uma janela para o repetir."""
    cliente, _, _, segredo, _ = ambiente
    codigo = pyotp.TOTP(segredo).now()
    assert _passo2(cliente, _passo1(cliente).json()["desafio"], codigo).status_code == 200
    assert _passo2(cliente, _passo1(cliente).json()["desafio"], codigo).status_code == 401


def test_desafio_adulterado(ambiente):
    cliente, _, _, segredo, _ = ambiente
    d = _passo1(cliente).json()["desafio"].split(".")
    falso = f"{d[0]}.{d[1][:-4]}AAAA.{d[2]}"
    assert _passo2(cliente, falso, pyotp.TOTP(segredo).now()).status_code == 401


def test_mudar_a_palavra_passe_revoga_o_desafio_em_curso(ambiente):
    cliente, user, _, segredo, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    user.token_version += 1
    assert _passo2(cliente, desafio, pyotp.TOTP(segredo).now()).status_code == 401


def test_uma_conta_desactivada_nao_completa_o_login(ambiente):
    """As validações de conta correm nos DOIS passos: entre eles passam
    minutos, e o desafio não pode ser uma porta aberta nesse intervalo."""
    cliente, user, _, segredo, _ = ambiente
    desafio = _passo1(cliente).json()["desafio"]
    user.ativo = False
    assert _passo2(cliente, desafio, pyotp.TOTP(segredo).now()).status_code == 403


# ---------------------------------------------------------------------------
# Não revelar qual dos factores falhou
# ---------------------------------------------------------------------------
def test_palavra_passe_errada_da_um_desafio_indistinguivel(ambiente):
    """REGRESSÃO: sem o isco, chegar ao segundo passo confirmava que a
    palavra-passe estava certa — e as pessoas reutilizam palavras-passe entre
    serviços, por isso essa confirmação vale por si mesmo sem o código."""
    import jwt

    cliente, _, _, _, _ = ambiente
    bom = _passo1(cliente).json()
    mau = _passo1(cliente, password="completamente-errada").json()

    assert mau["requer_2fa"] == bom["requer_2fa"] is True
    p_bom = jwt.decode(bom["desafio"], options={"verify_signature": False})
    p_mau = jwt.decode(mau["desafio"], options={"verify_signature": False})
    assert set(p_bom) == set(p_mau)


def test_o_isco_nunca_valida_nem_com_o_codigo_certo(ambiente):
    cliente, _, _, segredo, _ = ambiente
    isco = _passo1(cliente, password="errada").json()["desafio"]
    assert _passo2(cliente, isco, pyotp.TOTP(segredo).now()).status_code == 401


def test_o_isco_falha_com_a_mesma_mensagem_de_um_codigo_errado(ambiente):
    cliente, _, _, segredo, _ = ambiente
    msg_isco = _passo2(
        cliente,
        _passo1(cliente, password="errada").json()["desafio"],
        pyotp.TOTP(segredo).now(),
    ).json()["detail"]
    msg_codigo = _passo2(cliente, _passo1(cliente).json()["desafio"], "000000").json()[
        "detail"
    ]
    assert msg_isco == msg_codigo


def test_empresa_errada_tambem_da_isco(ambiente):
    cliente, _, _, segredo, _ = ambiente
    r = _passo1(cliente, empresa="XX999")
    assert r.json().get("requer_2fa") is True
    assert _passo2(cliente, r.json()["desafio"], pyotp.TOTP(segredo).now()).status_code == 401


# ---------------------------------------------------------------------------
# Códigos de recuperação
# ---------------------------------------------------------------------------
def test_entra_com_codigo_de_recuperacao(ambiente):
    cliente, user, db, _, codigos = ambiente
    r = _passo2(cliente, _passo1(cliente).json()["desafio"], codigos[0])
    assert r.status_code == 200
    assert len(user.totp_codigos_recuperacao) == 7
    assert "2fa.recuperacao_usada" in db.accoes_auditadas()


def test_o_codigo_de_recuperacao_e_de_uso_unico(ambiente):
    cliente, _, _, _, codigos = ambiente
    assert _passo2(cliente, _passo1(cliente).json()["desafio"], codigos[0]).status_code == 200
    assert _passo2(cliente, _passo1(cliente).json()["desafio"], codigos[0]).status_code == 401


def test_codigo_de_recuperacao_inventado(ambiente):
    cliente, _, _, _, _ = ambiente
    assert _passo2(cliente, _passo1(cliente).json()["desafio"], "AAAA-BBBB").status_code == 401
