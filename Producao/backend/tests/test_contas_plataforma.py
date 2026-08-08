"""Gestão de contas pelo superadministrador.

Duas coisas que respondem ao mesmo risco: uma conta perdida deixa alguém de
fora sem caminho de volta.

  - o administrador de uma empresa não tem ninguém acima dele lá dentro. Se
    perder a palavra-passe ou o telemóvel do 2FA, sem estas rotas a única saída
    era mexer à mão na base de dados;
  - a plataforma tinha UMA conta de administração. Perder-lhe a palavra-passe
    deixava o sistema sem operador, e usá-la todos os dias aumentava a
    probabilidade de a expor.

O que aqui se fixa são as fronteiras: o que estas rotas NÃO podem fazer.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.auth.security import ESCOPO_PLATAFORMA


class SessaoFalsa:
    def __init__(self, empresa, utilizadores):
        self._empresa = empresa
        self._users = list(utilizadores)
        self.adicionados, self.removidos, self.commits = [], [], 0

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa
        from src.db.models.user import User

        if modelo is Empresa:
            return self._empresa if pk == self._empresa.id else None
        if modelo is User:
            return next((u for u in self._users if u.id == pk), None)
        return None

    def scalar(self, stmt):
        # Procura de e-mail: o duplo não interpreta SQL, compara o texto do
        # WHERE compilado com os e-mails que conhece.
        alvo = str(stmt).lower()
        for u in self._users:
            if u.email.lower() in alvo:
                return u
        for p in getattr(stmt, "_where_criteria", []):
            valor = getattr(getattr(p, "right", None), "value", None)
            if isinstance(valor, str):
                for u in self._users:
                    if u.email.lower() == valor.lower():
                        return u
        return None

    def scalars(self, stmt):
        from src.core.constants import Perfil

        texto = str(stmt)
        if "perfil" in texto:
            itens = [u for u in self._users if str(u.perfil) == Perfil.SUPERADMIN]
        else:
            itens = [u for u in self._users if u.empresa_id == self._empresa.id]
        return _Resultado(itens)

    def add(self, obj):
        self.adicionados.append(obj)
        if hasattr(obj, "perfil"):
            obj.id = obj.id or uuid4()
            self._users.append(obj)

    def delete(self, obj):
        self.removidos.append(obj)
        if obj in self._users:
            self._users.remove(obj)

    def flush(self):
        """Imita o que a base faz ao inserir: chave e carimbo de criação.

        Sem isto, o objecto recém-criado sai daqui com `criado_em` a None e a
        resposta não valida — um artefacto do duplo, não do código.
        """
        from src.db.base import agora

        for o in self.adicionados:
            if getattr(o, "id", None) is None:
                o.id = uuid4()
            if hasattr(o, "criado_em") and o.criado_em is None:
                o.criado_em = agora()

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        pass

    def accoes(self):
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


PASSWORD = "uma-palavra-passe-de-teste-123"


def _user(**kw):
    from src.auth.security import hash_password
    from src.db.base import agora
    from src.db.models.user import User

    base = dict(
        id=uuid4(),
        password_hash=hash_password(PASSWORD),
        ativo=True,
        aprovado=True,
        token_version=0,
        totp_ativo=True,
        totp_codigos_recuperacao=[],
        totp_falhas=0,
        password_provisoria=False,
        permissoes_extra=[],
        permissoes_accao={},
        criado_em=agora(),
    )
    base.update(kw)
    return User(**base)


@pytest.fixture
def ambiente():
    from src.api.deps import escopo_do_token, utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoEmpresa, Perfil, RegimeIVA
    from src.db.base import agora, get_db
    from src.db.models.tenancy import Empresa

    empresa = Empresa(
        id=uuid4(),
        nome="Cliente, Lda.",
        nif="5000000000",
        codigo="CL001",
        estado=EstadoEmpresa.ACTIVA,
        moeda="Kz",
        regime=RegimeIVA.GERAL,
        criado_em=agora(),
    )
    operador = _user(
        empresa_id=None, nome="Operador", email="op@plataforma.ao",
        perfil=Perfil.SUPERADMIN,
    )
    membro = _user(
        empresa_id=empresa.id, nome="Ana", email="ana@cliente.ao",
        perfil=Perfil.CONTABILISTA,
    )
    db = SessaoFalsa(empresa, [operador, membro])
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[utilizador_atual] = lambda: operador
    # A sessão de administração da plataforma leva um escopo próprio; sem ele
    # as rotas recusam, e é isso que se está a simular aqui.
    app.dependency_overrides[escopo_do_token] = lambda: ESCOPO_PLATAFORMA

    with TestClient(app) as cliente:
        yield cliente, empresa, membro, operador, db

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Utilizadores das empresas
# ---------------------------------------------------------------------------
def test_lista_sem_expor_segredos(ambiente):
    cliente, empresa, _, _, _ = ambiente
    r = cliente.get(f"/api/licencas/empresas/{empresa.id}/utilizadores")
    assert r.status_code == 200
    for u in r.json():
        assert "password_hash" not in u
        assert "totp_segredo" not in u
        assert "totp_codigos_recuperacao" not in u


def test_promover_a_administrador(ambiente):
    cliente, empresa, membro, _, db = ambiente
    r = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/perfil",
        json={"perfil": "admin"},
    )
    assert r.status_code == 200
    assert str(membro.perfil) == "admin"
    assert "utilizador.perfil" in db.accoes()


def test_promover_sobe_a_versao_do_token(ambiente):
    """O perfil viaja DENTRO do token: sem subir a versão, a sessão aberta
    continuava com as permissões antigas até expirar."""
    cliente, empresa, membro, _, _ = ambiente
    antes = membro.token_version
    cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/perfil",
        json={"perfil": "admin"},
    )
    assert membro.token_version == antes + 1


def test_nao_promove_a_superadmin(ambiente):
    """REGRESSÃO: deixar esta transição aqui abria uma porta lateral para a
    administração da plataforma através de uma conta de empresa, contornando o
    limite de contas e o registo próprio que essas contas têm."""
    cliente, empresa, membro, _, _ = ambiente
    r = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/perfil",
        json={"perfil": "superadmin"},
    )
    assert r.status_code == 422
    assert str(membro.perfil) == "contabilista"


def test_password_temporaria_muda_o_hash_e_corta_sessoes(ambiente):
    cliente, empresa, membro, _, db = ambiente
    hash_antigo, versao = membro.password_hash, membro.token_version

    r = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/password"
    )
    assert r.status_code == 200
    nova = r.json()["password_temporaria"]

    assert membro.password_hash != hash_antigo
    assert membro.token_version == versao + 1
    from src.auth.security import verificar_password

    assert verificar_password(nova, membro.password_hash)
    assert "utilizador.password_temporaria" in db.accoes()


def test_a_password_temporaria_nao_entra_na_auditoria(ambiente):
    """Uma palavra-passe no registo de auditoria fica lá para sempre, legível
    por quem consulte a auditoria — que é toda a gente com acesso à plataforma."""
    cliente, empresa, membro, _, db = ambiente
    nova = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/password"
    ).json()["password_temporaria"]
    reg = db.registo("utilizador.password_temporaria")
    assert nova not in str(reg.detalhes)


def test_a_password_temporaria_e_legivel_ao_telefone(ambiente):
    """Quem a gera vai transmiti-la a outra pessoa, muitas vezes a ler em voz
    alta. `0/O` e `1/I/l` confundem-se e geram chamadas de suporte."""
    cliente, empresa, membro, _, _ = ambiente
    nova = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/password"
    ).json()["password_temporaria"]
    assert not any(c in nova for c in "0O1Il")
    assert nova.count("-") == 3


def test_repor_2fa_de_um_membro(ambiente):
    cliente, empresa, membro, _, db = ambiente
    membro.totp_segredo = "cifrado"
    r = cliente.request(
        "DELETE", f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/2fa"
    )
    assert r.status_code == 204
    assert membro.totp_ativo is False
    assert membro.totp_segredo is None
    assert "utilizador.2fa_reposto" in db.accoes()


def test_repor_2fa_sem_2fa_activo(ambiente):
    cliente, empresa, membro, _, _ = ambiente
    membro.totp_ativo = False
    r = cliente.request(
        "DELETE", f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/2fa"
    )
    assert r.status_code == 409


def test_nao_atravessa_a_fronteira_da_empresa(ambiente):
    """REGRESSÃO: sem esta verificação, um id de outra empresa — ou de um
    superadministrador — passava por aqui, e as rotas de recuperação tornavam-se
    uma porta lateral para mexer em qualquer conta do sistema."""
    cliente, empresa, _, operador, _ = ambiente
    r = cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{operador.id}/password"
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Contas de administração da plataforma
# ---------------------------------------------------------------------------
def _criar(cliente, nome="Maria", email="maria@plataforma.ao", password=PASSWORD):
    return cliente.post(
        "/api/licencas/superadmins",
        json={"nome": nome, "email": email, "password_actual": password},
    )


def test_criar_exige_a_password_de_quem_cria(ambiente):
    """REGRESSÃO: criar outra conta de administração da plataforma é das acções
    mais poderosas do sistema. Um ecrã deixado aberto não pode bastar."""
    cliente, _, _, _, db = ambiente
    r = _criar(cliente, password="errada")
    assert r.status_code == 403
    assert "superadmin.criar" not in db.accoes()


def test_criar_devolve_a_password_uma_vez(ambiente):
    cliente, _, _, _, db = ambiente
    r = _criar(cliente)
    assert r.status_code == 201
    assert r.json()["password_inicial"]
    assert "superadmin.criar" in db.accoes()
    # A palavra-passe não pode ficar no registo permanente.
    assert r.json()["password_inicial"] not in str(db.registo("superadmin.criar").detalhes)


def test_a_conta_nova_nasce_sem_empresa_e_aprovada(ambiente):
    from src.core.constants import Perfil

    cliente, _, _, _, db = ambiente
    _criar(cliente)
    novo = next(o for o in db.adicionados if getattr(o, "email", None) == "maria@plataforma.ao")
    assert novo.empresa_id is None
    assert str(novo.perfil) == Perfil.SUPERADMIN
    # Não há ninguém acima para aprovar uma conta destas.
    assert novo.aprovado is True
    # E nasce sem 2FA: activa-o ela própria, e até lá não administra nada.
    assert novo.totp_ativo is False


def test_email_repetido(ambiente):
    cliente, _, membro, _, _ = ambiente
    assert _criar(cliente, email=membro.email).status_code == 409
    assert _criar(cliente, email=membro.email.upper()).status_code == 409


def test_o_limite_de_contas_e_respeitado(ambiente):
    from src.core.config import get_settings

    cliente, _, _, _, _ = ambiente
    limite = get_settings().MAX_SUPERADMINS
    # Já existe o operador; cria até ao limite.
    for i in range(limite - 1):
        assert _criar(cliente, email=f"op{i}@plataforma.ao").status_code == 201
    r = _criar(cliente, email="amais@plataforma.ao")
    assert r.status_code == 409
    assert "máximo" in r.json()["detail"]


def test_ninguem_mexe_na_propria_conta(ambiente):
    """REGRESSÃO: é ESTA regra que impede a plataforma de ficar sem operador.
    Como quem executa está sempre activo e nunca pode ser o alvo, sobra sempre
    pelo menos ele.

    O teste cria PRIMEIRO outra conta, e não é detalhe: com uma só, tirar a
    regra do próprio ainda dava 409 — mas vindo da rede de segurança, não
    dela. O teste passava sem provar nada. Com duas contas, a rede não dispara
    e só esta regra sustenta o resultado.
    """
    cliente, _, _, operador, _ = ambiente
    assert _criar(cliente).status_code == 201

    assert cliente.patch(
        f"/api/licencas/superadmins/{operador.id}", json={"ativo": False}
    ).status_code == 409
    assert cliente.delete(f"/api/licencas/superadmins/{operador.id}").status_code == 409
    assert operador.ativo is True


def test_desactivar_outra_conta_corta_lhe_as_sessoes(ambiente):
    cliente, _, _, _, db = ambiente
    _criar(cliente)
    outra = next(u for u in db._users if u.email == "maria@plataforma.ao")
    versao = outra.token_version

    r = cliente.patch(f"/api/licencas/superadmins/{outra.id}", json={"ativo": False})
    assert r.status_code == 200
    assert outra.ativo is False
    # Sem isto a conta desactivada trabalhava até o token expirar.
    assert outra.token_version == versao + 1
    assert "superadmin.desactivar" in db.accoes()


def test_remover_outra_conta(ambiente):
    cliente, _, _, _, db = ambiente
    _criar(cliente)
    outra = next(u for u in db._users if u.email == "maria@plataforma.ao")
    assert cliente.delete(f"/api/licencas/superadmins/{outra.id}").status_code == 204
    assert outra in db.removidos
    assert "superadmin.remover" in db.accoes()


def test_nao_mexe_em_quem_nao_e_superadmin(ambiente):
    """Um membro de empresa não é gerido por estas rotas — tem as suas."""
    cliente, _, membro, _, _ = ambiente
    assert cliente.patch(
        f"/api/licencas/superadmins/{membro.id}", json={"ativo": False}
    ).status_code == 404
    assert cliente.delete(f"/api/licencas/superadmins/{membro.id}").status_code == 404


def test_devolver_o_acesso_a_outra_conta_de_plataforma(ambiente):
    cliente, _, _, _, db = ambiente
    _criar(cliente)
    outra = next(u for u in db._users if u.email == "maria@plataforma.ao")
    hash_antigo = outra.password_hash

    r = cliente.post(f"/api/licencas/superadmins/{outra.id}/password")
    assert r.status_code == 200
    assert outra.password_hash != hash_antigo
    from src.auth.security import verificar_password

    assert verificar_password(r.json()["password_temporaria"], outra.password_hash)
    assert "superadmin.password_temporaria" in db.accoes()


# ---------------------------------------------------------------------------
# Aviso de palavra-passe provisória
# ---------------------------------------------------------------------------
def test_a_password_temporaria_marca_a_conta_como_provisoria(ambiente):
    """A marca não tranca nada: serve para AVISAR no primeiro acesso que há
    outra pessoa a saber aquela palavra-passe. Forçar a mudança punha um
    obstáculo em frente a quem acabou de recuperar o acesso."""
    cliente, empresa, membro, _, _ = ambiente
    assert membro.password_provisoria is False
    cliente.post(
        f"/api/licencas/empresas/{empresa.id}/utilizadores/{membro.id}/password"
    )
    assert membro.password_provisoria is True


def test_a_conta_de_plataforma_nasce_marcada(ambiente):
    """Quem a cria fica a saber a palavra-passe inicial."""
    cliente, _, _, _, db = ambiente
    _criar(cliente)
    nova = next(u for u in db._users if u.email == "maria@plataforma.ao")
    assert nova.password_provisoria is True


def test_devolver_o_acesso_a_uma_conta_de_plataforma_tambem_marca(ambiente):
    cliente, _, _, _, db = ambiente
    _criar(cliente)
    outra = next(u for u in db._users if u.email == "maria@plataforma.ao")
    outra.password_provisoria = False
    cliente.post(f"/api/licencas/superadmins/{outra.id}/password")
    assert outra.password_provisoria is True
