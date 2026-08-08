"""Registo de modelos: quem escolhe, o que se pode escolher e a que custo.

Três regras que aqui se provam:

1. O MODELO É DO SERVIDOR. Nenhum campo do pedido de pergunta o escolhe — quem
   o define é o registo da plataforma, na linha marcada como padrão.
2. UM SÓ PADRÃO, e é o servidor a garanti-lo. Uma verificação em Python perdia
   a corrida entre dois pedidos; um índice único parcial não perde.
3. MEXER NOS PREÇOS NÃO REESCREVE O PASSADO. Cada consulta guarda os preços que
   lhe foram aplicados, e é por isso que corrigir um preço é seguro.
"""

import inspect
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.db.models.ia import ModeloIA
from src.services.ia import config as cfg
from src.services.ia import modelos as svc
from src.services.ia import qa


@pytest.fixture
def base():
    from src.db.base import SessionLocal

    db = SessionLocal()
    yield db
    db.rollback()
    db.close()


def _sem_verificar(monkeypatch):
    """A criação confirma o identificador junto da OpenAI. Nos testes isso
    seria uma chamada de rede por caso — e uma falha de rede a dar-nos um
    vermelho que não é nosso."""
    monkeypatch.setattr(svc, "verificar_na_api", lambda _: None)


# ---------------------------------------------------------------------------
# A lista
# ---------------------------------------------------------------------------
def test_a_semente_traz_os_modelos_com_capacidade(base):
    ids = {m.modelo_id for m in svc.listar(base)}
    assert {"gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini"} <= ids


def test_a_lista_de_escolha_sao_os_activos(base):
    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4o-mini"))
    m.ativo = False
    base.flush()

    assert "gpt-4o-mini" not in cfg.modelos_suportados(base)
    # Mas continua no registo, para explicar o histórico.
    assert "gpt-4o-mini" in {x.modelo_id for x in svc.listar(base)}


def test_um_modelo_de_fora_do_registo_e_recusado(base):
    with pytest.raises(ValueError):
        cfg.validar_modelo(base, "gpt-3.5-turbo")
    with pytest.raises(ValueError):
        cfg.validar_modelo(base, "")


# ---------------------------------------------------------------------------
# Quem manda no modelo
# ---------------------------------------------------------------------------
def test_o_padrao_e_o_modelo_em_uso(base):
    outro = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4.1"))
    svc.definir_padrao(base, outro.id)
    assert cfg.modelo(base) == "gpt-4.1"


def test_so_existe_um_padrao(base):
    """A regra é do servidor, não do código: um índice único parcial."""
    for alvo in ("gpt-4.1", "gpt-4o-mini"):
        m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == alvo))
        svc.definir_padrao(base, m.id)

    quantos = len(list(base.scalars(select(ModeloIA).where(ModeloIA.padrao.is_(True)))))
    assert quantos == 1


def test_o_indice_impede_dois_padroes(base):
    """REGRESSÃO: sem o índice, bastava uma escrita que não passasse pelo
    serviço para a plataforma ficar com dois modelos padrão e usar o primeiro
    que a consulta devolvesse."""
    from sqlalchemy.exc import IntegrityError

    m = base.scalar(select(ModeloIA).where(ModeloIA.padrao.is_(False)))
    m.padrao = True
    with pytest.raises(IntegrityError):
        base.flush()
    base.rollback()


def test_sem_padrao_activo_cai_no_ambiente(base):
    """Uma configuração incompleta não pode calar o assistente."""
    from sqlalchemy import update

    from src.core.config import get_settings

    base.execute(update(ModeloIA).values(padrao=False))
    base.flush()
    assert cfg.modelo(base) == get_settings().OPENAI_MODELO


def test_o_padrao_tem_de_estar_activo(base):
    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4.1"))
    m.ativo = False
    base.flush()
    with pytest.raises(ValueError):
        svc.definir_padrao(base, m.id)


def test_nao_se_desactiva_nem_se_apaga_o_padrao(base):
    """Desactivar o padrão deixava a plataforma a usar o valor do ambiente sem
    ninguém pedir — uma mudança de modelo, e de custo, por omissão."""
    padrao = base.scalar(select(ModeloIA).where(ModeloIA.padrao.is_(True)))
    with pytest.raises(ValueError):
        svc.actualizar(base, padrao.id, {"ativo": False})
    with pytest.raises(ValueError):
        svc.eliminar(base, padrao.id)


def test_o_pedido_do_cliente_nao_escolhe_o_modelo():
    """REGRESSÃO: o modelo entra em `_chamar_openai` vindo da configuração, e
    a rota de perguntas não tem por onde o receber."""
    from src.api.routers.ia_router import PerguntaPedido

    campos = set(PerguntaPedido.model_fields)
    assert "modelo" not in campos and "model" not in campos

    fonte = inspect.getsource(qa.perguntar)
    assert "config_ia.modelo(db)" in fonte
    assert "_chamar_openai(pacote, pergunta_limpa, max_saida, modelo)" in fonte


def test_o_modelo_vai_no_corpo_do_pedido_a_api():
    fonte = inspect.getsource(qa._chamar_openai)
    assert '"model": modelo' in fonte
    # E não o do ambiente, que era o que lá estava antes.
    assert "s.OPENAI_MODELO" not in fonte


# ---------------------------------------------------------------------------
# Criar e corrigir
# ---------------------------------------------------------------------------
def test_criar_um_modelo_a_mao(base, monkeypatch):
    _sem_verificar(monkeypatch)
    m, aviso = svc.criar(
        base, nome="Novo", modelo_id="gpt-5-qualquer",
        preco_entrada="1.00", preco_saida="4.00", preco_entrada_cache="0.25",
    )
    assert aviso is None
    assert m.preco_entrada == Decimal("1.00")
    # Entra na escolha, e com preço — as duas coisas ao mesmo tempo.
    assert "gpt-5-qualquer" in cfg.modelos_suportados(base)

    from src.services.ia import precos

    assert precos.preco_de(base, "gpt-5-qualquer").saida == Decimal("4.00")


def test_nao_entra_duas_vezes(base, monkeypatch):
    _sem_verificar(monkeypatch)
    with pytest.raises(ValueError):
        svc.criar(base, nome="Repetido", modelo_id="gpt-4.1",
                  preco_entrada="1", preco_saida="2")


def test_a_api_recusa_um_identificador_que_nao_conhece(base, monkeypatch):
    """«desde que o ID do modelo seja compatível com a API configurada»."""
    from src.services.ia import qa as qa_mod

    monkeypatch.setattr(qa_mod, "listar_modelos", lambda: ["gpt-4.1", "gpt-4o"])
    with pytest.raises(ValueError, match="não reconhece"):
        svc.criar(base, nome="Inventado", modelo_id="gpt-inexistente",
                  preco_entrada="1", preco_saida="2")


def test_nao_poder_verificar_nao_impede_de_configurar(base, monkeypatch):
    """Falha aberta: a alternativa era deixar a plataforma por configurar
    sempre que a OpenAI estivesse inacessível ou a chave em rotação."""
    from src.services.ia import qa as qa_mod

    def rebenta():
        raise qa_mod.ErroIA("sem rede")

    monkeypatch.setattr(qa_mod, "listar_modelos", rebenta)
    m, aviso = svc.criar(base, nome="Às cegas", modelo_id="gpt-4.1-nano",
                         preco_entrada="1", preco_saida="2")
    assert m.id is not None
    assert aviso and "confirme" in aviso.lower()


# ---------------------------------------------------------------------------
# Os preços
# ---------------------------------------------------------------------------
def test_precos_impossiveis_sao_recusados(base, monkeypatch):
    _sem_verificar(monkeypatch)
    for entrada, saida in [("-1", "2"), ("1", "-2"), ("abc", "2"), ("99999", "2")]:
        with pytest.raises(ValueError):
            svc.criar(base, nome="Mau", modelo_id=f"x-{entrada}-{saida}",
                      preco_entrada=entrada, preco_saida=saida)


def test_a_cache_nao_pode_custar_mais_do_que_a_entrada(base, monkeypatch):
    """REGRESSÃO: se vier maior, os dois campos foram trocados — e o custo
    passava a ser calculado ao contrário sem ninguém dar por isso."""
    _sem_verificar(monkeypatch)
    with pytest.raises(ValueError, match="trocados"):
        svc.criar(base, nome="Trocado", modelo_id="x-trocado",
                  preco_entrada="1.00", preco_saida="4.00",
                  preco_entrada_cache="2.00")


def test_corrigir_um_preco_nao_reescreve_o_historico(base):
    """O ponto todo do registo: os preços aplicados ficam na consulta."""
    from src.db.models.ia import ConsultaIA
    from src.db.models.tenancy import Empresa

    empresa = base.scalar(select(Empresa).limit(1))
    c = ConsultaIA(
        empresa_id=empresa.id, pergunta="p", resposta="r", contexto={},
        modelo="gpt-4.1", tokens_entrada=1_000_000, tokens_saida=0,
        preco_entrada=Decimal("2.00"), preco_saida=Decimal("8.00"),
        custo=Decimal("2.0000"),
    )
    base.add(c)
    base.flush()

    m = base.scalar(select(ModeloIA).where(ModeloIA.modelo_id == "gpt-4.1"))
    svc.actualizar(base, m.id, {"preco_entrada": "10.00"})

    base.refresh(c)
    assert c.custo == Decimal("2.0000")
    assert c.preco_entrada == Decimal("2.00")


def test_os_precos_saem_como_texto_na_api():
    """Como todo o dinheiro nesta API: em vírgula flutuante, `0.075` não é
    setenta e cinco milésimos."""
    from src.db.schemas.licenca import ModeloIaPublico

    assert ModeloIaPublico.model_fields["preco_entrada"].annotation is str
    assert ModeloIaPublico.model_fields["preco_saida"].annotation is str


# ---------------------------------------------------------------------------
# O interruptor
# ---------------------------------------------------------------------------
def test_desligado_ninguem_pergunta(base):
    """O travão para quando algo corre mal: nem as empresas com quota passam."""
    linha = cfg.obter(base)
    linha.ia_ativa = False
    base.flush()
    base.expire_all()

    assert cfg.ia_ativa(base) is False
    fonte = inspect.getsource(qa.perguntar)
    i = fonte.find("config_ia.ia_ativa(db)")
    assert i > 0, "o interruptor tem de ser consultado em perguntar()"
    # E antes de qualquer chamada paga.
    assert i < fonte.find("_chamar_openai")
