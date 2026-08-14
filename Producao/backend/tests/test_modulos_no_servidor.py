"""Os módulos permitidos são aplicados no SERVIDOR, não só no menu.

Encontrado numa revisão: `exigir_cap` só consultava a matriz CAPS, que é
indexada por perfil. Um perfil de consulta inclui `rh.ver`, por isso um
administrador que restringisse um utilizador ao módulo de contabilidade via a
restrição aplicada no menu do browser — e mais nada. Um pedido directo a
`/api/rh/colaboradores` devolvia salário, NIF e número de segurança social de
toda a gente.

Confirmado a correr antes de corrigir. O que estes testes impedem é que volte.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


class SessaoFalsa:
    def __init__(self, empresa, config, licenca):
        self._empresa, self._config, self._licenca = empresa, config, licenca

    def get(self, modelo, pk):
        from src.db.models.tenancy import Empresa

        return self._empresa if modelo is Empresa and pk == self._empresa.id else None

    def scalar(self, stmt):
        texto = str(stmt).lower()
        if "config" in texto:
            return self._config
        if "licenca" in texto:
            return self._licenca
        return None

    def scalars(self, _stmt):
        return _Vazio()

    def execute(self, _stmt):
        """Agregados (somas e contagens) de uma empresa sem dados.

        Estes testes são sobre QUEM PODE CHEGAR à rota, não sobre o que ela
        devolve — daí a linha de zeros. Sem isto, uma rota que passasse a somar
        totais fazia falhar testes de permissões, que é onde ninguém iria
        procurar."""
        return _UmaLinha()

    def commit(self):
        pass


class _Vazio:
    def all(self):
        return []


class _UmaLinha:
    def one(self):
        return (0, 0, 0)


@pytest.fixture
def ambiente():
    from src.api.deps import utilizador_atual
    from src.api.main import app
    from src.core.constants import EstadoEmpresa, Perfil, RegimeIVA
    from src.db.base import agora, get_db
    from src.db.models.tenancy import ConfigEmpresa, Empresa
    from src.db.models.user import User

    empresa = Empresa(
        id=uuid4(), nome="Cliente, Lda.", nif="5000000000", codigo="CL001",
        estado=EstadoEmpresa.ACTIVA, moeda="Kz", regime=RegimeIVA.GERAL,
        criado_em=agora(),
    )
    config = ConfigEmpresa(id=uuid4(), empresa_id=empresa.id, modulos={})
    user = User(
        id=uuid4(), empresa_id=empresa.id, nome="Paulo", email="paulo@cliente.ao",
        password_hash="x", perfil=Perfil.CONSULTA, ativo=True, aprovado=True,
        token_version=0, totp_ativo=False, totp_codigos_recuperacao=[],
        totp_falhas=0, password_provisoria=False, permissoes_extra=[],
        permissoes_accao={}, modulos_permitidos=None,
    )
    # Licença válida por omissão: sem ela o `empresa_atual` recusa com 402 e os
    # testes nunca chegavam à camada dos módulos, que é o que aqui se mede.
    from datetime import date, timedelta

    from src.core.constants import EstadoLicenca
    from src.db.models.tenancy import Licenca

    licenca = Licenca(
        id=uuid4(), empresa_id=empresa.id, estado=EstadoLicenca.ACTIVA,
        validade=date.today() + timedelta(days=365), modulos_incluidos=[],
        criado_em=agora(),
    )
    db = SessaoFalsa(empresa, config, licenca)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[utilizador_atual] = lambda: user

    with TestClient(app) as cliente:
        yield cliente, user, config

    app.dependency_overrides.clear()


#: Rota de leitura de cada módulo e a capacidade que o perfil `consulta` tem.
ROTAS = {
    "rh": "/api/rh/colaboradores",
    "comercial": "/api/comercial/vendas",
    "logistica": "/api/logistica/artigos",
    "imobilizados": "/api/imobilizados/ativos",
}


@pytest.mark.parametrize("modulo,rota", ROTAS.items())
def test_a_lista_pessoal_e_aplicada_no_servidor(ambiente, modulo, rota):
    """REGRESSÃO: sem isto, restringir um utilizador escondia o menu e mais nada.
    O perfil de consulta tem `rh.ver` na matriz CAPS, por isso o pedido directo
    passava e devolvia salários, NIF e número de segurança social."""
    cliente, user, _ = ambiente
    user.modulos_permitidos = ["contabilidade"]
    assert cliente.get(rota).status_code == 403


def test_sem_lista_pessoal_nada_muda(ambiente):
    """NULL significa «sem restrição». Tratá-lo como lista vazia trancaria toda
    a gente fora de tudo."""
    cliente, user, _ = ambiente
    user.modulos_permitidos = None
    assert cliente.get(ROTAS["rh"]).status_code == 200


def test_lista_vazia_bloqueia_tudo(ambiente):
    """Lista vazia é diferente de NULL: é «nenhum módulo», e tem de o ser —
    senão retirar todos os módulos a alguém não retirava nada."""
    cliente, user, _ = ambiente
    user.modulos_permitidos = []
    for rota in ROTAS.values():
        assert cliente.get(rota).status_code == 403


def test_o_modulo_permitido_continua_acessivel(ambiente):
    cliente, user, _ = ambiente
    user.modulos_permitidos = ["rh"]
    assert cliente.get(ROTAS["rh"]).status_code == 200


def test_a_desactivacao_global_na_empresa_e_aplicada(ambiente):
    """Camada 2: o administrador desliga um módulo para a empresa inteira."""
    cliente, user, config = ambiente
    user.modulos_permitidos = None
    config.modulos = {"rh": False}
    assert cliente.get(ROTAS["rh"]).status_code == 403
    # Só `False` explícito desactiva — uma chave ausente não é desactivação.
    assert cliente.get(ROTAS["comercial"]).status_code == 200


def test_o_plano_da_licenca_e_aplicado(ambiente):
    """Camada 1: uma empresa num plano só de contabilidade não usa RH."""
    cliente, user, _ = ambiente
    from src.api.deps import get_db
    from src.api.main import app

    db = app.dependency_overrides[get_db]()
    # Mesma licença, mas com o plano limitado a contabilidade.
    db._licenca.modulos_incluidos = ["contabilidade"]
    assert cliente.get(ROTAS["rh"]).status_code == 403


def test_o_superadmin_nao_e_limitado_por_modulos(ambiente):
    """Não tem empresa: os módulos de uma empresa não se lhe aplicam."""
    from src.core.constants import Perfil

    cliente, user, _ = ambiente
    user.perfil = Perfil.SUPERADMIN
    user.modulos_permitidos = []
    # Passa a verificação de módulo; para nas rotas de negócio por não ter
    # empresa, que é outra fronteira e não esta.
    assert cliente.get(ROTAS["rh"]).status_code != 403


def test_cada_capacidade_conhece_o_seu_modulo():
    """REGRESSÃO: uma capacidade que caia fora do mapa deixa de ser filtrada
    por módulo, silenciosamente. Se alguém acrescentar um módulo novo, este
    teste obriga a acrescentar também o mapeamento."""
    from src.auth.permissions import modulo_da_capacidade

    usadas = [
        "contab.ver", "contab.lancar", "contab.plano", "contab.fechar",
        "comercial.ver", "comercial.gerir", "logistica.ver", "logistica.gerir",
        "imob.ver", "imob.gerir", "rh.ver", "rh.gerir",
        "financeiro.ver", "analitica.ver",
    ]
    for cap in usadas:
        assert modulo_da_capacidade(cap) is not None, cap
    # As transversais não pertencem a módulo nenhum e não devem ser filtradas.
    assert modulo_da_capacidade("empresa.ver") is None


# ---------------------------------------------------------------------------
# permissoes_accao aplicada no servidor
# ---------------------------------------------------------------------------
def test_so_ver_bloqueia_a_escrita(ambiente):
    """REGRESSÃO: `permissoes_accao` era gravada, devolvida pela API e editável
    na interface sem que nada a lesse. Dar `{"comercial": ["ver"]}` a alguém
    para o tornar só de leitura não impedia nada — a matriz CAPS é indexada por
    perfil e nunca subtrai."""
    cliente, user, _ = ambiente
    from src.core.constants import Perfil

    user.perfil = Perfil.COMERCIAL
    user.permissoes_accao = {"comercial": ["ver"]}

    assert cliente.get("/api/comercial/vendas").status_code == 200
    r = cliente.post("/api/comercial/vendas", json={"data": "2026-08-01", "linhas": []})
    assert r.status_code == 403


def test_com_escrita_explicita_volta_a_poder(ambiente):
    """Verificado na própria decisão e não pela rota: com a autorização
    concedida, a rota entra no corpo e falha noutro sítio por causa do duplo de
    sessão — o que se quer medir aqui é a decisão, não o resto do caminho."""
    from src.auth.permissions import pode_capacidade
    from src.core.constants import Perfil

    _, user, _ = ambiente
    user.perfil = Perfil.COMERCIAL

    user.permissoes_accao = {"comercial": ["ver"]}
    assert pode_capacidade(user, "comercial.gerir") is False

    user.permissoes_accao = {"comercial": ["ver", "criar"]}
    assert pode_capacidade(user, "comercial.gerir") is True
    assert pode_capacidade(user, "comercial.ver") is True


def test_sem_permissoes_accao_nada_muda(ambiente):
    """Um mapa vazio não é restrição nenhuma — deriva-se da matriz por perfil,
    como sempre. Tratá-lo como «nenhuma acção» trancaria toda a gente."""
    cliente, user, _ = ambiente
    from src.core.constants import Perfil

    user.perfil = Perfil.COMERCIAL
    user.permissoes_accao = {}
    assert cliente.get("/api/comercial/vendas").status_code == 200


def test_a_restricao_e_por_modulo(ambiente):
    """Restringir um módulo não pode restringir os outros."""
    cliente, user, _ = ambiente
    from src.core.constants import Perfil

    user.perfil = Perfil.ADMIN
    user.permissoes_accao = {"comercial": ["ver"]}
    # O admin passa em tudo por `eh_admin`; o que aqui se fixa é que a leitura
    # de outro módulo não é afectada pela restrição declarada no comercial.
    assert cliente.get("/api/rh/colaboradores").status_code == 200
