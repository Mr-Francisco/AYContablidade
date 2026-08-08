"""Retenção do histórico de IA.

O pacote enviado é o que ocupa espaço — cerca de 3 kB por consulta, contra
escassas centenas de bytes do resto — e a sua utilidade tem vida curta. A
consulta em si é o REGISTO DE CONSUMO, e é a partir dela que se somam os
totais do mês que travam quem passa da quota.

Daí dois prazos e não um. E daí a regra que aqui mais interessa: apagar nunca
pode tocar no mês corrente, ou o contador recuava e uma empresa que esgotou o
plano voltava a consumir.
"""

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from src.db.base import agora
from src.db.models.ia import ConsultaIA
from src.services.ia import config as cfg


@pytest.fixture
def base():
    """Base real, numa transacção que se desfaz no fim."""
    from src.db.base import SessionLocal
    from src.db.models.tenancy import Empresa

    db = SessionLocal()
    empresa = db.scalar(select(Empresa).limit(1))
    assert empresa is not None, "a base de demonstração precisa de uma empresa"
    yield db, empresa.id
    db.rollback()
    db.close()


def _consulta(db, empresa_id, dias_atras: int, com_pacote=True):
    c = ConsultaIA(
        empresa_id=empresa_id,
        pergunta=f"pergunta de há {dias_atras} dias",
        resposta="resposta",
        contexto={"ambitos": ["contabilidade"]},
        dados_enviados={"muito": "conteudo"} if com_pacote else None,
        entidades_pseudonimizadas=0,
        tokens_entrada=1000,
        tokens_saida=100,
    )
    db.add(c)
    db.flush()
    # `criado_em` tem server_default; para simular idade escreve-se depois.
    c.criado_em = agora() - timedelta(days=dias_atras)
    db.flush()
    return c


# ---------------------------------------------------------------------------
# Validação dos prazos
# ---------------------------------------------------------------------------
def test_prazos_validos_passam():
    assert cfg.validar_retencao(30, 365) == (30, 365)


def test_o_historico_tem_um_minimo_largo():
    """REGRESSÃO: os totais do mês somam-se destas linhas. Um prazo curto
    apagaria consumo ainda por contar."""
    assert cfg.MIN_DIAS_HISTORICO >= 90
    with pytest.raises(ValueError):
        cfg.validar_retencao(30, cfg.MIN_DIAS_HISTORICO - 1)


def test_o_pacote_nao_pode_durar_mais_do_que_a_consulta():
    """Descartar o pacote depois de a consulta já ter sido apagada não
    significa nada — a configuração ficava a dizer uma coisa impossível."""
    with pytest.raises(ValueError):
        cfg.validar_retencao(400, 365)


# ---------------------------------------------------------------------------
# A limpeza
# ---------------------------------------------------------------------------
def test_o_pacote_antigo_e_descartado_e_a_consulta_fica(base):
    db, empresa_id = base
    velha = _consulta(db, empresa_id, dias_atras=60)
    nova = _consulta(db, empresa_id, dias_atras=1)

    r = cfg.limpar_historico(db, empresa_id=empresa_id)

    assert r["pacotes_descartados"] >= 1
    assert velha.dados_enviados is None
    # A consulta fica: é o registo de consumo, e a pergunta e a resposta
    # continuam legíveis.
    assert velha.id is not None
    assert velha.pergunta and velha.resposta
    assert velha.tokens_entrada == 1000
    # E a recente não é tocada.
    assert nova.dados_enviados is not None


def test_uma_consulta_muito_antiga_e_apagada(base):
    db, empresa_id = base
    antiga = _consulta(db, empresa_id, dias_atras=400)
    id_antiga = antiga.id

    cfg.limpar_historico(db, empresa_id=empresa_id)

    assert db.get(ConsultaIA, id_antiga) is None


def test_NUNCA_apaga_do_mes_corrente(base):
    """REGRESSÃO CRÍTICA: os totais do mês vêm destas linhas e são eles que
    travam quem passa da quota. Apagá-las fazia o contador recuar, e uma
    empresa que tivesse esgotado o plano voltava a consumir.

    O mínimo de 90 dias já o impediria; isto prova a rede por baixo dele, para
    o dia em que alguém baixar o mínimo sem reparar na consequência.
    """
    db, empresa_id = base
    deste_mes = _consulta(db, empresa_id, dias_atras=0)
    id_deste_mes = deste_mes.id

    # Configuração absurda, que só o código impede de ter efeito.
    from src.db.models.tenancy import ConfigPlataforma

    linha = db.scalar(select(ConfigPlataforma).limit(1))
    original = linha.ia_dias_historico
    linha.ia_dias_historico = 1
    db.flush()

    cfg.limpar_historico(db, empresa_id=empresa_id)
    assert db.get(ConsultaIA, id_deste_mes) is not None

    linha.ia_dias_historico = original
    db.flush()


def test_a_limpeza_e_por_empresa(base):
    """Uma empresa não pode limpar o histórico de outra."""
    db, empresa_id = base
    outra = uuid4()
    minha = _consulta(db, empresa_id, dias_atras=400)

    r = cfg.limpar_historico(db, empresa_id=outra)
    assert r["apagadas"] == 0
    assert db.get(ConsultaIA, minha.id) is not None


def test_correr_duas_vezes_nao_reescreve_o_que_ja_esta_limpo(base):
    """O `isnot(None)` evita tocar em linhas já tratadas — sem ele, cada
    consulta nova reescrevia todo o histórico antigo da empresa."""
    db, empresa_id = base
    _consulta(db, empresa_id, dias_atras=60)

    primeira = cfg.limpar_historico(db, empresa_id=empresa_id)
    segunda = cfg.limpar_historico(db, empresa_id=empresa_id)

    assert primeira["pacotes_descartados"] >= 1
    assert segunda["pacotes_descartados"] == 0


def test_a_limpeza_corre_depois_de_cada_consulta():
    """REGRESSÃO: sem isto não há agendador nenhum a fazê-lo, e a tabela
    crescia para sempre."""
    import inspect

    from src.services.ia import qa

    assert "config_ia.limpar_historico" in inspect.getsource(qa.perguntar)


def test_falhar_a_limpeza_nao_custa_a_resposta():
    """A resposta já foi paga à OpenAI quando isto corre. Deixar uma falha de
    arrumação derrubar o pedido seria pagar e não entregar."""
    import inspect

    fonte = inspect.getsource(
        __import__("src.services.ia.qa", fromlist=["perguntar"]).perguntar
    )
    i = fonte.find("limpar_historico")
    assert "try:" in fonte[max(0, i - 200) : i]
    assert "except" in fonte[i : i + 300]
