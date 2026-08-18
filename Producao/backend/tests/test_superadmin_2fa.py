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

from src.auth.security import ESCOPO_PLATAFORMA
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
        password_provisoria=False,
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
    assert exigir_superadmin(user, ESCOPO_PLATAFORMA) is user


def test_superadmin_sem_2fa_nao_administra_a_plataforma():
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.SUPERADMIN, com_2fa=False), ESCOPO_PLATAFORMA)
    assert e.value.status_code == 403
    # A mensagem tem de dizer o que fazer: é o único caminho de saída.
    assert "dois passos" in e.value.detail


def test_sem_chave_de_cifra_falha_fechado(caplog):
    """REGRESSÃO: deixar passar por faltar configuração seria desligar a
    protecção exactamente quando a instalação está mal configurada.

    E DUAS AUDIÊNCIAS, DUAS MENSAGENS. Este teste já exigiu o contrário —
    que a mensagem nomeasse a variável de ambiente. Estava errado: quem
    administra a plataforma não é necessariamente quem instalou o servidor,
    e mandá-lo definir uma variável a que não tem acesso não o ajuda a sair
    dali. O que ele lê diz a quem se dirigir; o nome da variável fica no
    registo, que é onde quem instalou o vai procurar.
    """
    import logging

    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    os.environ["TOTP_CHAVE_CIFRA"] = ""
    get_settings.cache_clear()
    with caplog.at_level(logging.ERROR):
        with pytest.raises(HTTPException) as e:
            exigir_superadmin(
                _conta(Perfil.SUPERADMIN, com_2fa=False), ESCOPO_PLATAFORMA
            )

    assert e.value.status_code == 503
    # O que a pessoa lê: sem jargão, e com o passo seguinte.
    assert "TOTP_CHAVE_CIFRA" not in e.value.detail
    assert "dois passos" in e.value.detail
    assert "fornecedor da plataforma" in e.value.detail
    # O que fica registado: a causa exacta, para quem a pode resolver.
    assert "TOTP_CHAVE_CIFRA" in caplog.text


def test_o_perfil_continua_a_ser_verificado_primeiro():
    """Um admin de empresa com 2FA não passa a administrar a plataforma."""
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.ADMIN, com_2fa=True), ESCOPO_PLATAFORMA)
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


# ---------------------------------------------------------------------------
# Escopo da sessão (sessão própria do superadministrador)
# ---------------------------------------------------------------------------
def test_uma_sessao_sem_escopo_nao_administra():
    """REGRESSÃO: o perfil diz quem a pessoa é hoje; o escopo diz o que aquela
    SESSÃO foi emitida para fazer. Sem esta verificação, promover alguém a
    superadministrador transformava retroactivamente as sessões abertas dessa
    pessoa em sessões de administração da plataforma."""
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.SUPERADMIN, com_2fa=True), None)
    assert e.value.status_code == 401


def test_um_escopo_de_outra_coisa_tambem_nao():
    from src.api.deps import exigir_superadmin
    from src.core.constants import Perfil

    with pytest.raises(HTTPException) as e:
        exigir_superadmin(_conta(Perfil.SUPERADMIN, com_2fa=True), "outro")
    assert e.value.status_code == 401


def test_a_sessao_da_plataforma_e_mais_curta():
    """A conta que administra a plataforma vale todas as empresas juntas, e o
    que mais a expõe é um portátil deixado aberto com a sessão viva o dia
    inteiro."""
    import jwt

    from src.auth.security import criar_access_token
    from src.core.config import get_settings
    from src.core.constants import Perfil

    s = get_settings()
    assert s.SESSAO_SUPERADMIN_HORAS < s.SESSAO_ABSOLUTA_HORAS
    assert s.ACCESS_TOKEN_SUPERADMIN_MINUTOS < s.ACCESS_TOKEN_MINUTOS

    def _emitir(perfil):
        token, absoluto = criar_access_token(
            user_id=uuid4(), empresa_id=None, perfil=perfil, token_version=1
        )
        return jwt.decode(token, options={"verify_signature": False}), absoluto

    sa, sa_abs = _emitir(Perfil.SUPERADMIN)
    normal, normal_abs = _emitir(Perfil.ADMIN)

    assert sa["exp"] < normal["exp"]
    assert sa_abs < normal_abs
    # E só a da plataforma leva o escopo.
    assert sa["escopo"] == ESCOPO_PLATAFORMA
    assert "escopo" not in normal
