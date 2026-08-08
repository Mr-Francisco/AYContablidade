"""O segundo factor é obrigatório para administrar a plataforma (etapa 6).

A conta de superadmin vale todas as empresas juntas: gera licenças, altera
contratos e lê a auditoria de toda a gente. Uma palavra-passe descoberta
chegava para tudo isso.

O que aqui se fixa é o EQUILÍBRIO entre exigir e não trancar: a exigência está
nas rotas da plataforma e não no login, para que um superadmin sem 2FA ainda
consiga entrar e configurá-lo. Recusar-lhe a entrada deixava uma instalação
nova sem operador possível.
"""

import os
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.core.config import get_settings

CHAVE = "chave-de-teste-do-2fa-nao-usar-em-producao"


def _conta(perfil, com_2fa: bool):
    from src.db.models.user import User

    return User(
        id=uuid4(),
        empresa_id=None,
        nome="Operador",
        email="op@plataforma.ao",
        password_hash="x",
        perfil=perfil,
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=com_2fa,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        permissoes_extra=[],
        permissoes_accao={},
    )


@pytest.fixture(autouse=True)
def _com_chave():
    antes = os.environ.get("TOTP_CHAVE_CIFRA")
    os.environ["TOTP_CHAVE_CIFRA"] = CHAVE
    get_settings.cache_clear()
    yield
    if antes is None:
        os.environ.pop("TOTP_CHAVE_CIFRA", None)
    else:
        os.environ["TOTP_CHAVE_CIFRA"] = antes
    get_settings.cache_clear()


def test_superadmin_com_2fa_passa():
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    user = _conta(Perfil.SUPERADMIN, com_2fa=True)
    assert exigir_superadmin(user) is user


def test_superadmin_sem_2fa_nao_administra_a_plataforma():
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.SUPERADMIN, com_2fa=False))
    assert e.value.status_code == 403
    # A mensagem tem de dizer o que fazer: é o único caminho de saída.
    assert "dois passos" in e.value.detail


def test_sem_chave_de_cifra_falha_fechado():
    """REGRESSÃO: deixar passar por faltar uma variável seria desligar a
    protecção exactamente quando o servidor está mal configurado. A mensagem
    tem de nomear a variável, senão ninguém percebe como sair disto."""
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    os.environ["TOTP_CHAVE_CIFRA"] = ""
    get_settings.cache_clear()
    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.SUPERADMIN, com_2fa=False))
    assert e.value.status_code == 503
    assert "TOTP_CHAVE_CIFRA" in e.value.detail


def test_o_perfil_continua_a_ser_verificado_primeiro():
    """Um admin de empresa com 2FA não passa a administrar a plataforma."""
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.ADMIN, com_2fa=True))
    assert e.value.status_code == 403
    assert "superadministrador" in e.value.detail


def test_a_exigencia_nao_esta_no_login():
    """REGRESSÃO: se estivesse, um superadmin sem 2FA ficava fora sem forma de
    o configurar — e uma instalação nova ficava sem operador possível."""
    import inspect

    from src.api.routers import auth_router

    fonte = inspect.getsource(auth_router.login) + inspect.getsource(
        auth_router.login_2fa
    )
    assert "exigir_superadmin" not in fonte
    assert "totp_ativo" in fonte  # continua a decidir o segundo passo
