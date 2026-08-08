"""Rotas de activação e desactivação do segundo factor (etapa 2).

Não tocam na base: a sessão e o utilizador são substituídos por duplos, e o que
se verifica é o comportamento das rotas. O que aqui se fixa são as regras que,
se quebrarem, ou trancam contas fora do sistema ou tiram valor ao 2FA:

- `totp_ativo` só fica verdadeiro DEPOIS de o utilizador provar um código;
- o segredo nunca volta a sair depois de a configuração estar confirmada;
- desligar o 2FA exige a palavra-passe;
- o superadmin não o pode desligar.
"""

import os
from uuid import uuid4

import pyotp
import pytest
from fastapi.testclient import TestClient

from src.core.config import get_settings

CHAVE = "chave-de-teste-do-2fa-nao-usar-em-producao"
PASSWORD = "uma-palavra-passe-de-teste-123"


class SessaoFalsa:
    """Faz de sessão: aceita o que lá se põe e conta os commits."""

    def __init__(self):
        self.adicionados, self.commits = [], 0

    def add(self, obj):
        self.adicionados.append(obj)

    def commit(self):
        self.commits += 1

    def accoes_auditadas(self):
        return [getattr(o, "accao", None) for o in self.adicionados]


@pytest.fixture
def ambiente():
    """Cliente HTTP com a sessão e o utilizador substituídos."""
    antes = os.environ.get("TOTP_CHAVE_CIFRA")
    os.environ["TOTP_CHAVE_CIFRA"] = CHAVE
    get_settings.cache_clear()

    from src.api.deps import utilizador_atual
    from src.api.main import app
    from src.auth.security import hash_password
    from src.core.constants import Perfil
    from src.db.base import get_db
    from src.db.models.user import User

    user = User(
        id=uuid4(),
        empresa_id=uuid4(),
        nome="Ana Teste",
        email="ana@teste.ao",
        password_hash=hash_password(PASSWORD),
        perfil=Perfil.ADMIN,
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=False,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        # Estes têm `server_default` e são preenchidos pela base; um objecto
        # construído em memória fica com None e o `UtilizadorPublico` recusa.
        permissoes_extra=[],
        permissoes_accao={},
    )
    db = SessaoFalsa()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[utilizador_atual] = lambda: user

    # O limitador conta por IP e os testes partilham o mesmo; sem isto, a
    # ordem dos testes passava a decidir quais é que falhavam por excesso.
    from src.api.limites import limiter

    limiter.enabled = False

    with TestClient(app) as cliente:
        yield cliente, user, db

    limiter.enabled = True
    app.dependency_overrides.clear()
    if antes is None:
        os.environ.pop("TOTP_CHAVE_CIFRA", None)
    else:
        os.environ["TOTP_CHAVE_CIFRA"] = antes
    get_settings.cache_clear()


def _configurar(cliente) -> str:
    return cliente.post("/api/auth/2fa/iniciar").json()["segredo"]


def _activar(cliente) -> tuple[str, list[str]]:
    segredo = _configurar(cliente)
    r = cliente.post("/api/auth/2fa/confirmar", json={"codigo": pyotp.TOTP(segredo).now()})
    return segredo, r.json()["codigos_recuperacao"]


# ---------------------------------------------------------------------------
# Estado
# ---------------------------------------------------------------------------
def test_comeca_desligado(ambiente):
    cliente, _, _ = ambiente
    d = cliente.get("/api/auth/2fa").json()
    assert d["ativo"] is False
    assert d["codigos_por_usar"] == 0


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
def test_iniciar_da_qr_e_segredo(ambiente):
    cliente, _, _ = ambiente
    d = cliente.post("/api/auth/2fa/iniciar").json()
    assert d["qr_svg"].lstrip().startswith("<svg")
    assert d["uri"].startswith("otpauth://totp/")
    # O segredo vai em texto de propósito, para introdução manual — mas não
    # legível dentro do SVG.
    assert d["segredo"] not in d["qr_svg"]


def test_iniciar_nao_activa_o_2fa(ambiente):
    """REGRESSÃO: se `totp_ativo` ficasse verdadeiro aqui, quem começasse a
    configuração e fechasse a janela — ou lesse mal o QR — ficava fora da conta
    no login seguinte, sem nunca ter tido um código que funcionasse."""
    cliente, user, _ = ambiente
    cliente.post("/api/auth/2fa/iniciar")
    assert user.totp_ativo is False
    assert cliente.get("/api/auth/2fa").json()["ativo"] is False


def test_recomecar_a_configuracao_invalida_o_segredo_anterior(ambiente):
    """Quem trocou de telemóvel a meio espera começar do zero."""
    cliente, _, _ = ambiente
    primeiro = _configurar(cliente)
    segundo = _configurar(cliente)
    assert primeiro != segundo
    r = cliente.post("/api/auth/2fa/confirmar", json={"codigo": pyotp.TOTP(primeiro).now()})
    assert r.status_code == 400


def test_confirmar_sem_ter_iniciado(ambiente):
    cliente, _, _ = ambiente
    assert cliente.post("/api/auth/2fa/confirmar", json={"codigo": "123456"}).status_code == 409


# ---------------------------------------------------------------------------
# Activação
# ---------------------------------------------------------------------------
def test_codigo_errado_nao_activa(ambiente):
    cliente, user, _ = ambiente
    _configurar(cliente)
    assert cliente.post("/api/auth/2fa/confirmar", json={"codigo": "000000"}).status_code == 400
    assert user.totp_ativo is False


def test_codigo_certo_activa_e_da_os_codigos_uma_vez(ambiente):
    cliente, user, db = ambiente
    _, codigos = _activar(cliente)

    assert user.totp_ativo is True
    assert user.totp_ativado_em is not None
    # O contador do código usado fica gravado: sem isto, o mesmo código servia
    # outra vez dentro da janela de um minuto.
    assert user.totp_ultimo_contador is not None
    assert len(codigos) == len(set(codigos)) == 8
    assert "2fa.activar" in db.accoes_auditadas()


def test_os_codigos_de_recuperacao_ficam_em_hash(ambiente):
    cliente, user, _ = ambiente
    _, codigos = _activar(cliente)
    guardados = str(user.totp_codigos_recuperacao)
    for c in codigos:
        assert c not in guardados
        assert c.replace("-", "") not in guardados


def test_o_segredo_fica_cifrado(ambiente):
    cliente, user, _ = ambiente
    segredo, _ = _activar(cliente)
    assert segredo not in (user.totp_segredo or "")


def test_com_2fa_activo_o_segredo_nao_volta_a_sair(ambiente):
    """REGRESSÃO: sem isto, quem apanhasse uma sessão aberta gerava um segredo
    novo e passava a ter o segundo factor da conta."""
    cliente, _, _ = ambiente
    _activar(cliente)
    assert cliente.post("/api/auth/2fa/iniciar").status_code == 409


def test_o_estado_nunca_devolve_o_segredo(ambiente):
    cliente, _, _ = ambiente
    segredo, _ = _activar(cliente)
    assert segredo not in cliente.get("/api/auth/2fa").text
    assert segredo not in cliente.get("/api/auth/me").text


# ---------------------------------------------------------------------------
# Códigos de recuperação
# ---------------------------------------------------------------------------
def test_regenerar_substitui_os_antigos(ambiente):
    cliente, _, _ = ambiente
    _, antigos = _activar(cliente)
    novos = cliente.post("/api/auth/2fa/codigos", json={"password": PASSWORD}).json()
    assert not set(novos["codigos_recuperacao"]) & set(antigos)


def test_regenerar_exige_a_palavra_passe(ambiente):
    cliente, _, _ = ambiente
    _activar(cliente)
    assert cliente.post("/api/auth/2fa/codigos", json={"password": "errada"}).status_code == 403


# ---------------------------------------------------------------------------
# Desactivação
# ---------------------------------------------------------------------------
def test_desactivar_exige_a_palavra_passe(ambiente):
    """REGRESSÃO: sem isto, um ecrã deixado aberto bastava para retirar o
    segundo factor — o cenário exacto contra o qual ele existe."""
    cliente, user, _ = ambiente
    _activar(cliente)
    assert cliente.post("/api/auth/2fa/desactivar", json={"password": "errada"}).status_code == 403
    assert user.totp_ativo is True


def test_desactivar_limpa_tudo(ambiente):
    cliente, user, db = ambiente
    _activar(cliente)
    assert cliente.post("/api/auth/2fa/desactivar", json={"password": PASSWORD}).status_code == 204
    assert user.totp_ativo is False
    # O segredo é apagado: voltar a ligar obriga a configuração nova, para que
    # um segredo que possa ter sido copiado não continue a valer.
    assert user.totp_segredo is None
    assert user.totp_codigos_recuperacao == []
    assert user.totp_ultimo_contador is None
    assert "2fa.desactivar" in db.accoes_auditadas()


def test_desactivar_sem_estar_activo(ambiente):
    cliente, _, _ = ambiente
    r = cliente.post("/api/auth/2fa/desactivar", json={"password": PASSWORD})
    assert r.status_code == 409


def test_o_superadmin_nao_pode_desligar_o_2fa(ambiente):
    cliente, user, _ = ambiente
    from src.core.constants import Perfil

    _activar(cliente)
    user.perfil = Perfil.SUPERADMIN
    assert cliente.get("/api/auth/2fa").json()["obrigatorio"] is True
    r = cliente.post("/api/auth/2fa/desactivar", json={"password": PASSWORD})
    assert r.status_code == 403
    assert user.totp_ativo is True


# ---------------------------------------------------------------------------
# Configuração em falta
# ---------------------------------------------------------------------------
def test_sem_chave_de_cifra_recusa_em_vez_de_guardar_em_claro(ambiente):
    cliente, _, _ = ambiente
    os.environ["TOTP_CHAVE_CIFRA"] = ""
    get_settings.cache_clear()
    r = cliente.post("/api/auth/2fa/iniciar")
    assert r.status_code == 503
    assert "TOTP_CHAVE_CIFRA" in r.json()["detail"]
