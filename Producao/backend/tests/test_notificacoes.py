"""Notificações: as regras que o utilizador pediu, presas em testes.

As cinco aprovadas dizem respeito a operações que deixam trabalho por fazer
noutro módulo. O que aqui se fixa é o COMPORTAMENTO do mecanismo, que é onde
um sistema de notificações costuma falhar:

- não repete a mesma situação — senão o sino enche-se de cópias;
- não apaga nada, nunca — resolver e ler são estados, não remoções;
- resolver não é o mesmo que ler;
- só vê quem tem a capacidade;
- e a criação NÃO faz cair a operação que a originou.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from src.core.constants import Perfil
from src.db.base import agora
from src.db.models.notificacoes import Notificacao
from src.db.models.tenancy import Empresa
from src.db.models.user import User
from src.services import notificacoes as svc


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


@pytest.fixture
def empresa_id(base):
    e = base.scalar(select(Empresa).limit(1))
    assert e is not None, "a base de demonstração precisa de uma empresa"
    return e.id


def _user(empresa_id, perfil=Perfil.CONTABILISTA, extras=None):
    return User(
        id=uuid4(), empresa_id=empresa_id, nome="Ensaio",
        email=f"{uuid4().hex[:8]}@ensaio.ao", password_hash="x", perfil=perfil,
        ativo=True, aprovado=True, token_version=0, totp_ativo=False,
        totp_codigos_recuperacao=[], totp_falhas=0, password_provisoria=False,
        permissoes_extra=extras or [], permissoes_accao={}, modulos_permitidos=None,
    )


def _notificar(db, empresa_id, chave="ensaio", texto="Primeiro texto"):
    return svc.notificar(
        db, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="comercial", chave=chave, titulo="Ensaio", texto=texto,
    )


def test_a_mesma_situacao_nao_gera_duas(base, empresa_id):
    """«Não há armazém» é uma situação: uma notificação, não uma por factura."""
    a = _notificar(base, empresa_id, chave="sit-unica", texto="Primeiro")
    b = _notificar(base, empresa_id, chave="sit-unica", texto="Segundo")

    assert a is not None and b is not None
    assert a.id == b.id
    # O texto acompanha — o motivo pode ter mudado — mas não nasce outra.
    assert b.texto == "Segundo"
    quantas = base.scalars(
        select(Notificacao).where(
            Notificacao.empresa_id == empresa_id, Notificacao.chave == "sit-unica"
        )
    ).all()
    assert len(quantas) == 1


def test_resolvida_a_situacao_uma_nova_volta_a_nascer(base, empresa_id):
    """Se o problema voltar, volta a avisar — a anterior fica no histórico."""
    primeira = _notificar(base, empresa_id, chave="sit-repete")
    svc.resolver(base, empresa_id=empresa_id, chave="sit-repete")
    segunda = _notificar(base, empresa_id, chave="sit-repete")

    assert primeira.id != segunda.id
    assert primeira.resolvida_em is not None
    assert segunda.resolvida_em is None


def test_resolver_nao_apaga(base, empresa_id):
    """A regra que o utilizador pediu: depois de resolvida, fica no histórico."""
    n = _notificar(base, empresa_id, chave="sit-historico")
    svc.resolver(base, empresa_id=empresa_id, chave="sit-historico")

    ainda = base.get(Notificacao, n.id)
    assert ainda is not None
    assert ainda.resolvida_em is not None


def test_ler_nao_e_resolver(base, empresa_id):
    """Lida quer dizer que alguém a viu; resolvida, que o problema acabou."""
    n = _notificar(base, empresa_id, chave="sit-ler")
    u = _user(empresa_id)
    base.add(u)
    base.flush()

    assert svc.marcar_lida(
        base, empresa_id=empresa_id, utilizador=u, notificacao_id=n.id
    )
    assert base.get(Notificacao, n.id).resolvida_em is None

    lista = svc.listar(base, empresa_id=empresa_id, utilizador=u)["linhas"]
    linha = next(x for x in lista if x["id"] == n.id)
    assert linha["lida"] is True
    assert linha["resolvida_em"] is None


def test_marcar_nao_lida_desfaz(base, empresa_id):
    n = _notificar(base, empresa_id, chave="sit-desfaz")
    u = _user(empresa_id)
    base.add(u)
    base.flush()

    svc.marcar_lida(base, empresa_id=empresa_id, utilizador=u, notificacao_id=n.id)
    svc.marcar_nao_lida(base, empresa_id=empresa_id, utilizador=u, notificacao_id=n.id)

    linha = next(
        x for x in svc.listar(base, empresa_id=empresa_id, utilizador=u)["linhas"]
        if x["id"] == n.id
    )
    assert linha["lida"] is False


def test_so_ve_quem_tem_a_capacidade(base, empresa_id):
    """Uma notificação da contabilidade não aparece a quem faz logística."""
    n = _notificar(base, empresa_id, chave="sit-cap")
    contabilista = _user(empresa_id, Perfil.CONTABILISTA)
    logistico = _user(empresa_id, Perfil.LOGISTICA)
    base.add_all([contabilista, logistico])
    base.flush()

    ids_contab = {x["id"] for x in svc.listar(base, empresa_id=empresa_id, utilizador=contabilista)["linhas"]}
    ids_log = {x["id"] for x in svc.listar(base, empresa_id=empresa_id, utilizador=logistico)["linhas"]}
    assert n.id in ids_contab
    assert n.id not in ids_log


def test_uma_permissao_extra_tambem_conta(base, empresa_id):
    """A capacidade pode vir do perfil ou de uma permissão dada à pessoa."""
    n = _notificar(base, empresa_id, chave="sit-extra")
    u = _user(empresa_id, Perfil.LOGISTICA, extras=["contab.lancar"])
    base.add(u)
    base.flush()

    ids = {x["id"] for x in svc.listar(base, empresa_id=empresa_id, utilizador=u)["linhas"]}
    assert n.id in ids


def test_o_sino_nao_conta_as_resolvidas(base, empresa_id):
    """Uma notificação resolvida não deve puxar ninguém para um problema que já
    não existe — mas continua no histórico."""
    u = _user(empresa_id)
    base.add(u)
    base.flush()
    antes = svc.contar_por_ler(base, empresa_id=empresa_id, utilizador=u)

    _notificar(base, empresa_id, chave="sit-sino")
    assert svc.contar_por_ler(base, empresa_id=empresa_id, utilizador=u) == antes + 1

    svc.resolver(base, empresa_id=empresa_id, chave="sit-sino")
    assert svc.contar_por_ler(base, empresa_id=empresa_id, utilizador=u) == antes


def test_uma_notificacao_de_outra_empresa_nao_se_alcanca(base, empresa_id):
    n = _notificar(base, empresa_id, chave="sit-tenant")
    u = _user(uuid4())

    assert not svc.marcar_lida(
        base, empresa_id=u.empresa_id, utilizador=u, notificacao_id=n.id
    )


def test_notificar_nunca_levanta(base, empresa_id):
    """O contrato: a operação é que manda.

    Não vale desfazer uma factura porque não se conseguiu avisar ninguém — por
    isso `notificar` devolve `None` em vez de levantar.
    """
    r = svc.notificar(
        db=base, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="comercial", chave="x" * 500,  # estoura o limite da coluna
        titulo="Ensaio", texto="Ensaio",
    )
    assert r is None
    base.rollback()


def test_o_administrador_ve_tudo(base, empresa_id):
    """Quem tem `*` via NADA — o filtro comparava `contab.lancar` com `{"*"}`.

    Apanhado a testar com a conta de administração: o sino ficava a zero e a
    notificação estava na base. É justamente o administrador da empresa quem
    tem de saber que ficou trabalho por fazer em qualquer módulo.
    """
    n = svc.notificar(
        base, empresa_id=empresa_id, capacidade="logistica.gerir",
        origem="comercial", chave="sit-admin", titulo="Ensaio", texto="Ensaio",
    )
    admin = _user(empresa_id, Perfil.ADMIN)
    base.add(admin)
    base.flush()

    ids = {x["id"] for x in svc.listar(base, empresa_id=empresa_id, utilizador=admin)["linhas"]}
    assert n.id in ids
    assert svc.contar_por_ler(base, empresa_id=empresa_id, utilizador=admin) > 0
    assert svc.marcar_lida(
        base, empresa_id=empresa_id, utilizador=admin, notificacao_id=n.id
    )


def test_a_lista_e_paginada(base, empresa_id):
    """Nenhum histórico é infinito — regra do projecto, em `CLAUDE.md`.

    O histórico de notificações não se apaga nunca, por isso cresce para
    sempre: é o candidato mais óbvio a encher um ecrã até parar.
    """
    for i in range(7):
        _notificar(base, empresa_id, chave=f"sit-pag-{i}", texto=f"n{i}")
    u = _user(empresa_id)
    base.add(u)
    base.flush()

    p1 = svc.listar(base, empresa_id=empresa_id, utilizador=u, limite=3)
    assert len(p1["linhas"]) == 3
    assert p1["total"] >= 7, "o total conta o conjunto todo, não a página"

    p2 = svc.listar(base, empresa_id=empresa_id, utilizador=u, offset=3, limite=3)
    assert len(p2["linhas"]) == 3
    assert p1["total"] == p2["total"]
    # Páginas diferentes trazem linhas diferentes.
    assert not ({x["id"] for x in p1["linhas"]} & {x["id"] for x in p2["linhas"]})


# ---------------------------------------------------------------------------
# Filtrar por MÓDULO
#
# A origem já era guardada e já aparecia no ecrã; o que faltava era filtrar por
# ela. E tem de ser no servidor: o histórico é paginado, por isso filtrar no
# cliente devolvia só as que estivessem na página carregada.
# ---------------------------------------------------------------------------
def test_o_filtro_por_modulo_e_do_servidor(base, empresa_id):
    quem = _user(empresa_id, perfil=Perfil.ADMIN)

    svc.notificar(
        base, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="comercial", chave="mod-com", titulo="Do comercial", texto="x",
    )
    svc.notificar(
        base, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="rh", chave="mod-rh", titulo="Do RH", texto="y",
    )

    so_rh = svc.listar(base, empresa_id=empresa_id, utilizador=quem, origem="rh")
    origens = {l["origem"] for l in so_rh["linhas"]}
    assert origens == {"rh"}, origens
    # E o total acompanha o filtro: senão a paginação contava o conjunto todo e
    # oferecia páginas que não existem.
    assert so_rh["total"] == len(
        [l for l in svc.listar(
            base, empresa_id=empresa_id, utilizador=quem, limite=500
        )["linhas"] if l["origem"] == "rh"]
    )


def test_sem_modulo_indicado_vem_tudo(base, empresa_id):
    quem = _user(empresa_id, perfil=Perfil.ADMIN)
    svc.notificar(
        base, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="logistica", chave="mod-log", titulo="Da logística", texto="z",
    )
    todas = svc.listar(base, empresa_id=empresa_id, utilizador=quem, limite=500)
    assert any(l["origem"] == "logistica" for l in todas["linhas"])


def test_a_contagem_por_modulo_e_sobre_todas_e_nao_sobre_a_pagina(base, empresa_id):
    """«Comercial (3)» quando há trinta é pior do que não dizer número nenhum."""
    quem = _user(empresa_id, perfil=Perfil.ADMIN)
    for i in range(4):
        svc.notificar(
            base, empresa_id=empresa_id, capacidade="contab.lancar",
            origem="apuramento", chave=f"cont-{i}", titulo=f"N{i}", texto="t",
        )

    # Uma página pequena de propósito: a contagem não pode depender dela.
    svc.listar(base, empresa_id=empresa_id, utilizador=quem, limite=1)
    contagens = svc.contar_por_origem(base, empresa_id=empresa_id, utilizador=quem)
    apur = next((c for c in contagens if c["origem"] == "apuramento"), None)

    assert apur is not None
    assert apur["total"] >= 4, apur


def test_quem_nao_ve_uma_notificacao_tambem_nao_a_conta(base, empresa_id):
    """A contagem respeita as capacidades, como a listagem.

    Sem isto, o filtro anunciava «Contabilidade (7)» a quem, ao escolher, via
    uma lista vazia — e ficava a pensar que o sistema tinha perdido as sete.
    """
    svc.notificar(
        base, empresa_id=empresa_id, capacidade="contab.lancar",
        origem="contabilidade", chave="so-contab", titulo="Só contab", texto="t",
    )
    # Um perfil comercial não tem `contab.lancar`.
    de_fora = _user(empresa_id, perfil=Perfil.COMERCIAL)
    contagens = svc.contar_por_origem(base, empresa_id=empresa_id, utilizador=de_fora)
    assert all(c["origem"] != "contabilidade" for c in contagens), contagens
