"""Filtragem de segredos no registo de auditoria.

O registo guarda o que mudou, e o que mudou passa por quem chama. Se um sítio
se distrair e incluir uma palavra-passe nos detalhes, ela fica gravada para
sempre num sítio que existe precisamente para ser lido mais tarde.

Por isso a filtragem é feita no `auditar()` e não em cada chamada: uma defesa
que dependa de todos os sítios se lembrarem dela não é defesa.
"""

from src.services.auditoria import _limpar


def test_campos_com_password_sao_removidos():
    saida = _limpar({"password": "segredo", "password_nova": "outro", "nome": "Ana"})
    assert saida["password"] == "[removido]"
    assert saida["password_nova"] == "[removido]"
    # O que não é sensível passa intacto, senão o registo não serve de nada.
    assert saida["nome"] == "Ana"


def test_a_comparacao_e_por_substring_e_sem_caixa():
    """`admin_password`, `PASSWORD` e `senhaAntiga` têm de ser todos apanhados —
    ninguém escreve sempre a mesma variante."""
    saida = _limpar(
        {
            "admin_password": "x",
            "PASSWORD": "x",
            "senhaAntiga": "x",
            "chave_licenca": "SGD-AAAA",
            "access_token": "ey…",
            "password_hash": "$2b$…",
            "client_secret": "x",
        }
    )
    assert all(v == "[removido]" for v in saida.values()), saida


def test_filtra_em_profundidade():
    """As mudanças vão em `{"antes": {...}, "depois": {...}}` — filtrar só o
    primeiro nível deixaria passar tudo o que interessa."""
    saida = _limpar(
        {
            "antes": {"perfil": "consulta", "password_hash": "$2b$aaa"},
            "depois": {"perfil": "admin", "password_hash": "$2b$bbb"},
        }
    )
    assert saida["antes"]["password_hash"] == "[removido]"
    assert saida["depois"]["password_hash"] == "[removido]"
    assert saida["antes"]["perfil"] == "consulta"
    assert saida["depois"]["perfil"] == "admin"


def test_nada_a_filtrar_nao_altera_o_conteudo():
    original = {"perfil": "admin", "modulos": ["rh", "comercial"], "n": 3}
    assert _limpar(original) == original


def test_vazio_e_nulo_dao_dicionario_vazio():
    assert _limpar(None) == {}
    assert _limpar({}) == {}
