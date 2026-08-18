"""Uma palavra-passe curta é um erro do pedido, nunca um 500.

REGRESSÃO REAL, apanhada em produção no primeiro dia. A política mínima estava
em 10 caracteres na instalação e em 8 em desenvolvimento; quem se registou com
nove viu **«Não foi possível contactar o servidor. Verifique a ligação.»** e foi
verificar o Wi-Fi. O servidor estava bem: `validar_forca_password` levantava um
`ValueError` que ninguém apanhava, a rota respondia 500, e um 500 por excepção
não tratada sai **sem os cabeçalhos de CORS** — o browser bloqueia a resposta e
o cliente não chega a ver o motivo.

São duas coisas a garantir, e nenhuma se garante lendo o código:

1. A excepção tem tipo próprio e a aplicação tem um tratador registado para
   ela — senão volta a ser 500 na primeira distracção.
2. **Todas** as rotas que mexem em palavras-passe passam por lá. Eram cinco;
   basta uma nova ser escrita sem cuidado para o defeito voltar, por isso o
   teste procura-as no código em vez de as listar à mão.
"""

import inspect
import re

import pytest

from src.auth.security import ErroPolitica, validar_forca_password


def test_a_politica_levanta_o_erro_proprio():
    with pytest.raises(ErroPolitica) as e:
        validar_forca_password("1234")
    # A mensagem diz o número. «Demasiado curta» obriga a adivinhar quanto.
    assert re.search(r"\d+ caracteres", str(e.value))


def test_o_erro_continua_a_ser_um_valueerror():
    """Quem já apanhava `ValueError` não deixa de apanhar."""
    assert issubclass(ErroPolitica, ValueError)


def test_a_aplicacao_tem_tratador_para_o_erro():
    """REGRESSÃO: sem tratador, cada uma destas rotas devolve 500."""
    from src.api.main import app

    registados = {e.__name__ for e in app.exception_handlers if isinstance(e, type)}
    assert "ErroPolitica" in registados, (
        "sem tratador, uma palavra-passe curta volta a dar 500 — e um 500 sai "
        "sem CORS, que é o que faz o browser dizer «não foi possível contactar "
        "o servidor»"
    )


def test_o_tratador_devolve_422_com_a_mensagem():
    from src.api.main import app

    tratador = next(
        f for e, f in app.exception_handlers.items()
        if isinstance(e, type) and e.__name__ == "ErroPolitica"
    )
    resposta = tratador(None, ErroPolitica("A palavra-passe deve ter pelo menos 10 caracteres."))
    assert resposta.status_code == 422
    assert b"10 caracteres" in resposta.body


def test_pedir_acesso_nao_recebe_palavra_passe_nenhuma():
    """A rota que era a quinta desta lista deixou de ter o que validar.

    Pedir acesso a uma empresa não pede palavra-passe: escolher uma credencial
    para uma conta que a empresa ainda não aceitou — e que pode nunca vir a
    existir — não faz sentido nenhum. Ela nasce quando o pedido é aceite.

    Este teste substitui a entrada de `registar` na lista abaixo, e é de
    propósito: apagar a linha e seguir em frente deixava a porta aberta para
    alguém voltar a pôr lá um campo de palavra-passe sem validação nenhuma.
    """
    from src.db.schemas.auth import RegistoPedido

    assert "password" not in RegistoPedido.model_fields


def test_todas_as_rotas_de_password_usam_a_politica():
    """As rotas que definem palavras-passe validam-nas.

    Procura no código em vez de fixar uma lista: uma rota nova escrita sem a
    validação passaria despercebida a uma lista escrita à mão.

    `auth_router.registar` esteve aqui e saiu quando deixou de receber
    palavra-passe — ver o teste acima, que garante que não volta a receber.
    """
    import importlib

    esperado = {
        ("auth_router", "alterar_password"),
        ("licenca_router", "activar"),
        ("user_router", "criar"),
        ("user_router", "definir_password"),
    }

    encontrados = set()
    for modulo in ("auth_router", "licenca_router", "user_router"):
        fonte = inspect.getsource(
            importlib.import_module(f"src.api.routers.{modulo}")
        )
        for m in re.finditer(r"def (\w+)\(", fonte):
            nome = m.group(1)
            corpo = fonte[m.end():]
            fim = corpo.find("\ndef ")
            if "validar_forca_password(" in (corpo[:fim] if fim > 0 else corpo):
                encontrados.add((modulo, nome))

    em_falta = esperado - encontrados
    assert not em_falta, f"rotas sem validação de política: {em_falta}"
