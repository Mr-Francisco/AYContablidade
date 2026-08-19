"""Os planos passam a decidir alguma coisa.

O campo `plano` era uma ETIQUETA. Três nomes escritos à mão na lista do ecrã —
«Base», «Profissional», «Enterprise» — que o servidor guardava, devolvia e
mostrava, sem nunca os ler para decidir nada.

E havia uma consequência a sério, não só cosmética: o formulário de gerar
licenças não tinha campo para os módulos, lista vazia significa «todos», e por
isso TODA a licença criada pela interface incluía TODOS os módulos — escolhesse
quem a criava «Base» ou «Enterprise».

O que estes testes fixam:

1. um plano preenche os módulos e os limites;
2. o que for indicado à mão ganha ao plano — senão não se podia ajustar um
   cliente sem inventar um plano para ele;
3. os limites ficam GRAVADOS na licença, não são lidos do plano a cada vez;
4. as licenças com os nomes antigos continuam a funcionar.
"""

import pytest
from sqlalchemy import delete, select

from src.core import planos
from src.core.constants import Modulo
from src.db.models.tenancy import Empresa, Licenca
from src.services import licenciamento as lic_svc

NIF = "5099000111"


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
    db.execute(delete(Licenca).where(Licenca.nif_previsto == NIF))
    db.commit()


def _gerar(db, **extra):
    lic, _chave = lic_svc.gerar_licenca(
        db,
        nif=NIF,
        nome_empresa="Empresa de Teste, Lda.",
        titular="Ana",
        plano=extra.pop("plano", "gestao"),
        **extra,
    )
    db.flush()
    return lic


# ---------------------------------------------------------------------------
# O catálogo
# ---------------------------------------------------------------------------
def test_ha_planos_e_cada_um_diz_a_quem_se_destina():
    assert len(planos.PLANOS) >= 2
    for p in planos.PLANOS:
        assert p.codigo and p.nome
        # «Para quem» é o que permite escolher sem adivinhar.
        assert len(p.para_quem) > 20


def test_o_plano_mais_pequeno_inclui_fiscalidade():
    """E não é generosidade.

    Sem Fiscalidade não há apuramento de IVA nem SAF-T, e uma empresa angolana
    sem isso não cumpre a lei. Vender um plano que não permite cumprir a lei não
    é vender um plano pequeno — é vender um problema.
    """
    assert Modulo.FISCALIDADE in planos.ESSENCIAL.modulos
    assert Modulo.CONTABILIDADE in planos.ESSENCIAL.modulos


def test_o_plano_completo_usa_lista_vazia_e_nao_os_oito_nomes():
    """Lista vazia = todos, incluindo os módulos que vierem a existir.

    Listar os oito à mão obrigaria a lembrar-se deste ficheiro ao acrescentar um
    módulo novo, e ninguém se lembra.
    """
    assert planos.COMPLETO.modulos == ()
    assert planos.COMPLETO.todos_os_modulos is True


def test_um_plano_inventado_e_recusado_a_entrada():
    from pydantic import ValidationError

    from src.db.schemas.licenca import LicencaCriar

    with pytest.raises(ValidationError):
        LicencaCriar(nif=NIF, nome_empresa="X", plano="Ultra Premium")


# ---------------------------------------------------------------------------
# O plano preenche
# ---------------------------------------------------------------------------
def test_o_plano_preenche_os_modulos(base):
    """A FALHA QUE ISTO CORRIGE: sem campo de módulos no formulário e com lista
    vazia a significar «todos», toda a licença incluía tudo."""
    lic = _gerar(base, plano="essencial")

    assert lic.modulos_incluidos, "não pode ficar vazio — vazio quer dizer todos"
    assert Modulo.CONTABILIDADE in lic.modulos_incluidos
    assert Modulo.RH not in lic.modulos_incluidos
    assert Modulo.COMERCIAL not in lic.modulos_incluidos


def test_o_plano_preenche_os_limites(base):
    lic = _gerar(base, plano="essencial")
    assert lic.limite_utilizadores == planos.ESSENCIAL.utilizadores
    assert lic.limite_tokens_mes == planos.ESSENCIAL.tokens_mes


def test_o_plano_completo_deixa_os_modulos_vazios_de_propositio(base):
    """Aqui a lista vazia é o valor CERTO: quer dizer «todos»."""
    lic = _gerar(base, plano="completo")
    assert lic.modulos_incluidos == []
    assert lic.limite_utilizadores is None
    assert lic.limite_tokens_mes is None


# ---------------------------------------------------------------------------
# O que se indica à mão ganha ao plano
# ---------------------------------------------------------------------------
def test_um_modulo_a_mais_para_um_cliente_nao_obriga_a_um_plano_novo(base):
    lic = _gerar(
        base,
        plano="essencial",
        modulos_incluidos=[Modulo.CONTABILIDADE, Modulo.FISCALIDADE, Modulo.RH],
    )
    assert Modulo.RH in lic.modulos_incluidos


def test_um_limite_a_medida_ganha_ao_do_plano(base):
    lic = _gerar(base, plano="essencial", limite_utilizadores=25)
    assert lic.limite_utilizadores == 25


def test_lista_vazia_indicada_a_mao_quer_dizer_todos_e_nao_e_ignorada(base):
    """`None` e lista vazia são coisas DIFERENTES, e é aqui que se vê.

    Se a herança testasse a verdade do valor em vez de `is None`, uma lista
    vazia indicada de propósito — «dá-lhe tudo» — era substituída pelos módulos
    do plano, e o cliente ficava com menos do que se pediu.
    """
    lic = _gerar(base, plano="essencial", modulos_incluidos=[])
    assert lic.modulos_incluidos == []


# ---------------------------------------------------------------------------
# O que já foi emitido continua a valer
# ---------------------------------------------------------------------------
def test_os_nomes_antigos_continuam_a_ser_reconhecidos():
    """Uma licença de um cliente não muda de nome porque nós mudámos de ideias.

    E uma que deixasse de ser reconhecida deixava de abrir a empresa.
    """
    for antigo, esperado in (
        ("Base", planos.ESSENCIAL),
        ("Profissional", planos.GESTAO),
        ("Enterprise", planos.COMPLETO),
    ):
        assert planos.por_codigo(antigo) is esperado


def test_os_limites_ficam_gravados_e_nao_seguem_o_plano_depois(base):
    """UM CONTRATO ASSINADO NÃO SE REESCREVE À DISTÂNCIA.

    É o contrário do que se faz com a certificação da AGT, que é resolvida à
    leitura de propósito — e a diferença é de natureza: a certificação é um
    facto sobre o programa e muda para todos ao mesmo tempo; um plano é um
    contrato, e o que um cliente contratou não deve mudar por alguém ter mexido
    na definição do plano depois.
    """
    import inspect

    lic = _gerar(base, plano="essencial")
    gravado = lic.limite_utilizadores

    fonte = inspect.getsource(lic_svc.gerar_licenca)
    # Os valores são atribuídos ao objecto, não lidos do catálogo mais tarde.
    assert "limite_utilizadores=limite_utilizadores" in fonte
    assert gravado == planos.ESSENCIAL.utilizadores


# ---------------------------------------------------------------------------
# O limite de utilizadores, nos DOIS caminhos
# ---------------------------------------------------------------------------
def test_o_limite_de_contas_e_verificado_ao_aceitar_um_pedido():
    """A SEGUNDA FALHA: só era verificado na criação directa.

    Uma empresa com licença para cinco pessoas passava dos cinco pelo caminho
    de pedir acesso e ser aceite — que é por onde a maior parte das contas
    entra.
    """
    import inspect

    from src.api.routers import user_router

    aceitar = inspect.getsource(user_router.aprovar)
    criar = inspect.getsource(user_router.criar)
    assert "exigir_lugar_livre" in aceitar
    assert "exigir_lugar_livre" in criar


def test_a_mensagem_do_limite_fala_de_licenca_e_nao_de_plano():
    """O número que trava está gravado na licença daquela empresa.

    Dizer «o plano permite 5» era reforçar a ideia de que o plano decide —
    quando o valor pode ter sido ajustado para aquele cliente.
    """
    import inspect

    from src.api.routers.user_router import exigir_lugar_livre

    fonte = inspect.getsource(exigir_lugar_livre)
    assert "licença desta empresa" in fonte
    assert "O plano permite" not in fonte
