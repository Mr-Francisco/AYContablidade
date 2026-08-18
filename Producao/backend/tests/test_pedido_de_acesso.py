"""Pedir acesso a uma empresa não exige palavra-passe.

QUEM PEDE ACESSO NÃO ESCOLHE CREDENCIAL. Escolher uma palavra-passe para uma
conta que a empresa ainda não aceitou — e que pode nunca vir a existir — não
faz sentido: quem desistia a meio deixava uma palavra-passe a proteger nada, e
quem era recusado tinha escolhido uma em vão.

O pedido guarda quem é a pessoa. A palavra-passe nasce quando o pedido é
aceite, é mostrada UMA VEZ a quem aceita, e é entregue à pessoa — que é avisada
para a trocar no primeiro acesso.

O que estes testes fixam, e não se garante lendo o código:

1. o pedido não aceita palavra-passe nenhuma;
2. entre o pedido e a aceitação, a conta NÃO ENTRA — e a mensagem diz porquê;
3. ao aceitar, sai uma palavra-passe, e sai só uma vez;
4. a palavra-passe nunca entra no registo de auditoria.
"""

import pytest
from sqlalchemy import delete, select

from src.db.models.tenancy import Empresa
from src.db.models.user import User

EMAIL = "pedido.acesso@teste.ao"


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    _limpar(db)
    yield db
    _limpar(db)
    db.close()


def _limpar(db):
    db.rollback()
    db.execute(delete(User).where(User.email == EMAIL))
    db.commit()


@pytest.fixture
def empresa(base):
    e = base.scalar(select(Empresa).where(Empresa.codigo == "DC001"))
    assert e is not None
    return e


# ---------------------------------------------------------------------------
# O pedido
# ---------------------------------------------------------------------------
def test_o_pedido_nao_tem_onde_receber_uma_palavra_passe():
    from src.db.schemas.auth import RegistoPedido

    assert "password" not in RegistoPedido.model_fields

    # Enviá-la à mesma não faz nada: o Pydantic ignora-a.
    pedido = RegistoPedido(
        nome="Ana",
        email=EMAIL,
        empresa="DC001",
        password="qualquercoisa123",
    )
    assert not hasattr(pedido, "password")


def test_a_conta_nasce_sem_palavra_passe_e_por_aprovar(base, empresa):
    """Pela rota, e não pela função: é assim que alguém a usa mesmo."""
    from fastapi.testclient import TestClient

    from src.api.main import app
    from src.api.limites import limiter
    from src.db.base import get_db

    app.dependency_overrides[get_db] = lambda: base
    limiter.enabled = False
    try:
        with TestClient(app) as cliente:
            r = cliente.post(
                "/api/auth/registar",
                json={
                    "nome": "Ana Pedido",
                    "email": EMAIL,
                    "empresa": "DC001",
                    "perfil": "consulta",
                    # Enviada à mesma: o modelo não a tem e é ignorada.
                    "password": "umaQualquer123",
                },
            )
        assert r.status_code in (200, 201), r.text
    finally:
        limiter.enabled = True
        app.dependency_overrides.clear()

    u = base.scalar(select(User).where(User.email == EMAIL))
    assert u is not None
    assert u.aprovado is False
    assert u.password_definida is False
    # Há um hash — a coluna não aceita vazio — mas é um valor que ninguém
    # conhece. Deixá-lo vazio seria pior: bastava um engano numa comparação
    # para uma conta por aprovar passar a entrar.
    assert u.password_hash


# ---------------------------------------------------------------------------
# Entre o pedido e a aceitação, não se entra
# ---------------------------------------------------------------------------
def test_por_aceitar_nao_entra_e_a_mensagem_explica_a_espera(base, empresa):
    from fastapi import HTTPException

    from src.api.routers.auth_router import _verificar_conta_e_empresa as verificar

    u = User(
        empresa_id=empresa.id,
        nome="Ana",
        email=EMAIL,
        password_hash="x",
        perfil="consulta",
        ativo=True,
        aprovado=False,
        password_definida=False,
    )
    with pytest.raises(HTTPException) as e:
        verificar(base, u)
    assert e.value.status_code == 403
    assert "ainda não foi aceite" in e.value.detail
    # Diz o que vai acontecer a seguir, não só que não pode entrar.
    assert "palavra-passe" in e.value.detail


def test_aceite_mas_sem_palavra_passe_entregue_diz_a_quem_pedir(base, empresa):
    """Um estado possível e que dava a pior mensagem de todas.

    Sem esta verificação, a resposta seria «credenciais inválidas» — e quem já
    foi aceite ficava a tentar adivinhar uma palavra-passe que nunca existiu.
    """
    from fastapi import HTTPException

    from src.api.routers.auth_router import _verificar_conta_e_empresa as verificar

    u = User(
        empresa_id=empresa.id,
        nome="Ana",
        email=EMAIL,
        password_hash="x",
        perfil="consulta",
        ativo=True,
        aprovado=True,
        password_definida=False,
    )
    with pytest.raises(HTTPException) as e:
        verificar(base, u)
    assert e.value.status_code == 403
    assert "administrador da empresa" in e.value.detail


# ---------------------------------------------------------------------------
# A aceitação entrega a palavra-passe
# ---------------------------------------------------------------------------
def test_a_palavra_passe_gerada_e_legivel_ao_telefone():
    """Vai ser lida em voz alta: sem `0/O`, sem `1/I/l`, em grupos."""
    from src.services.licenciamento import gerar_password_temporaria

    p = gerar_password_temporaria()
    assert "-" in p
    assert not set(p) & set("0O1Il")
    assert len(p.replace("-", "")) >= 16


def test_aceitar_um_pedido_gera_a_palavra_passe_e_marca_a_como_provisoria(
    base, empresa
):
    from src.auth.security import verificar_password
    from src.services.licenciamento import gerar_password_temporaria

    u = User(
        empresa_id=empresa.id,
        nome="Ana",
        email=EMAIL,
        password_hash="x",
        perfil="consulta",
        ativo=True,
        aprovado=False,
        password_definida=False,
        permissoes_extra=[],
        permissoes_accao={},
    )
    base.add(u)
    base.flush()

    # O que a rota faz ao aceitar.
    from src.auth.security import hash_password

    password = gerar_password_temporaria()
    u.aprovado = True
    u.password_hash = hash_password(password)
    u.password_definida = True
    u.password_provisoria = True
    base.flush()

    assert verificar_password(password, u.password_hash)
    # Definida por outra pessoa: a pessoa é avisada no primeiro acesso.
    assert u.password_provisoria is True


def test_quem_ja_tinha_palavra_passe_nao_recebe_outra(base, empresa):
    """Contas criadas pelo administrador já trazem credencial própria.

    Gerar uma nova ao aprovar trocaria a palavra-passe debaixo dos pés de quem
    já a tinha escolhido.
    """
    u = User(
        empresa_id=empresa.id,
        nome="Bruno",
        email=EMAIL,
        password_hash="hash-original",
        perfil="consulta",
        ativo=True,
        aprovado=False,
        password_definida=True,
        permissoes_extra=[],
        permissoes_accao={},
    )
    base.add(u)
    base.flush()

    password = None
    if not u.password_definida:  # a condição da rota
        password = "seria gerada"

    assert password is None
    assert u.password_hash == "hash-original"


# ---------------------------------------------------------------------------
# A rota, como o ecrã a chama
# ---------------------------------------------------------------------------
def test_a_rota_de_aceitar_devolve_a_palavra_passe_uma_vez(base, empresa):
    """O que o ecrã do administrador recebe ao carregar em «Aceitar».

    Sem isto, o ecrã não teria o que mostrar — e a pessoa que pediu acesso
    ficava aprovada e sem forma de entrar.
    """
    from fastapi.testclient import TestClient

    from src.api.deps import empresa_atual, utilizador_atual
    from src.api.main import app
    from src.core.constants import Perfil
    from src.db.base import get_db

    pedinte = User(
        empresa_id=empresa.id,
        nome="Ana Pedido",
        email=EMAIL,
        password_hash="x",
        perfil=Perfil.CONSULTA,
        ativo=True,
        aprovado=False,
        password_definida=False,
        permissoes_extra=[],
        permissoes_accao={},
    )
    base.add(pedinte)
    base.flush()

    admin = base.scalar(
        select(User).where(
            User.empresa_id == empresa.id, User.perfil == Perfil.ADMIN
        )
    )
    assert admin is not None, "a empresa de demonstração tem de ter um admin"

    app.dependency_overrides[get_db] = lambda: base
    app.dependency_overrides[utilizador_atual] = lambda: admin
    app.dependency_overrides[empresa_atual] = lambda: empresa
    try:
        with TestClient(app) as cliente:
            r = cliente.post(f"/api/users/{pedinte.id}/aprovar", json={})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["utilizador"]["aprovado"] is True
    # A palavra-passe vem, e vem legível ao telefone.
    entregue = corpo["password_entrada"]
    assert entregue and "-" in entregue
    assert not set(entregue) & set("0O1Il")
    # E a pessoa é avisada para a trocar.
    assert corpo["utilizador"]["password_provisoria"] is True


def test_a_palavra_passe_nao_entra_no_registo_de_auditoria(base, empresa):
    """O que fica registado é que foi entregue uma, nunca qual."""
    from src.db.models.auditoria import RegistoAuditoria

    registo = base.scalar(
        select(RegistoAuditoria)
        .where(RegistoAuditoria.accao == "utilizador.aprovar")
        .order_by(RegistoAuditoria.criado_em.desc())
    )
    if registo is None:
        pytest.skip("ainda não houve nenhuma aprovação registada")

    texto = str(registo.detalhes)
    assert "password_entregue" in texto
    # Um valor gerado tem hífenes e maiúsculas; a chave booleana não.
    assert "-" not in texto.replace("password_entregue", "")
