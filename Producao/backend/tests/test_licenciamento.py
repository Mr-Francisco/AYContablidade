"""Licenciamento: chaves, códigos de empresa e prazos.

O que se testa aqui é a aritmética e as regras que não precisam de base de
dados. A activação concorrente — o `FOR UPDATE` — não cabe num teste unitário
porque o que se quer verificar é o comportamento de DUAS transacções, e para
isso é preciso Postgres a sério.
"""

from datetime import date

import pytest

from src.services import licenciamento as lic


# ---------------------------------------------------------------------------
# Chaves
# ---------------------------------------------------------------------------
def test_chave_tem_o_formato_esperado():
    chave = lic.gerar_chave()
    assert chave.startswith("SGD-")
    grupos = chave.split("-")
    assert len(grupos) == 4
    assert all(len(g) == 4 for g in grupos[1:])


def test_chave_nao_usa_caracteres_ambiguos():
    """Sem I, O, 0 e 1: a chave é lida em voz alta e escrita à mão, e um zero
    confundido com um O é um pedido de suporte."""
    juntas = "".join(lic.gerar_chave() for _ in range(200))
    for ambiguo in ("I", "O", "0", "1"):
        assert ambiguo not in juntas.replace("SGD-", "").replace("-", "")


def test_chaves_nao_se_repetem():
    """60 bits de um CSPRNG. Mil chaves sem colisão não prova a entropia, mas
    apanharia um gerador partido — um contador, ou uma semente fixa."""
    chaves = {lic.gerar_chave() for _ in range(1000)}
    assert len(chaves) == 1000


def test_hash_e_estavel_e_tolerante_a_formatacao():
    """Quem recebe a chave por e-mail copia-a com espaços e em qualquer caixa."""
    base = lic.hash_chave("SGD-ABCD-EFGH-JKLM")
    assert base == lic.hash_chave("  sgd-abcd-efgh-jklm  ")
    assert base == lic.hash_chave("SGD ABCD EFGH JKLM")
    assert base != lic.hash_chave("SGD-ABCD-EFGH-JKLN")


def test_hash_nao_deixa_recuperar_a_chave():
    """O hash tem 64 hexadecimais e não contém a chave. É o ponto todo: uma
    leitura da base não entrega nenhuma licença por activar."""
    chave = lic.gerar_chave()
    h = lic.hash_chave(chave)
    assert len(h) == 64
    assert chave not in h
    assert chave.replace("-", "") not in h


def test_prefixo_identifica_sem_revelar():
    chave = "SGD-A3F2-MMA8-ETUM"
    p = lic.prefixo_de(chave)
    assert p == "SGD-A3F2"
    # Sobram 8 caracteres do alfabeto de 32: 40 bits por adivinhar.
    assert len(p) < len(chave)


# ---------------------------------------------------------------------------
# Código da empresa
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("nome", "esperado"),
    [
        # O exemplo da especificação.
        ("Banco Empresarial", "BE"),
        # Regressão: «S.A.» com pontos parte-se em «S» e «A», e o «S» entrava
        # como terceira inicial — dava «BES» em vez de «BE».
        ("Banco Empresarial, S.A.", "BE"),
        ("Banco Empresarial SA", "BE"),
        ("Demo Contabilidade, Lda.", "DC"),
        ("Construções do Sul, Unipessoal Lda", "CS"),
        ("Sociedade Anónima de Transportes, S.A.R.L.", "AT"),
        # Acentos não entram no código.
        ("Óptica Ásia", "OA"),
        # Nada de aproveitável: cai no genérico em vez de rebentar.
        ("", "EMP"),
        ("S.A.", "EMP"),
    ],
)
def test_iniciais(nome, esperado):
    assert lic._iniciais(nome) == esperado


def test_iniciais_nunca_passam_de_tres_letras():
    """O código tem 12 caracteres no total e a sequência ocupa três."""
    longo = "Alfa Beta Gama Delta Epsilon Zeta Eta Teta"
    assert len(lic._iniciais(longo)) == 3


# ---------------------------------------------------------------------------
# Datas
# ---------------------------------------------------------------------------
def test_validade_conta_a_partir_da_activacao():
    """Uma licença gerada em Janeiro e activada em Março dá o período completo —
    a duração é do contrato, não do tempo que a chave esteve parada."""
    assert lic._somar_meses(date(2026, 3, 15), 12) == date(2027, 3, 15)
    assert lic._somar_meses(date(2026, 3, 15), 1) == date(2026, 4, 15)


def test_somar_meses_nao_inventa_datas():
    """31 de Janeiro mais um mês é 28 de Fevereiro, não «31 de Fevereiro»."""
    assert lic._somar_meses(date(2026, 1, 31), 1) == date(2026, 2, 28)
    # 2028 é bissexto.
    assert lic._somar_meses(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert lic._somar_meses(date(2026, 8, 31), 1) == date(2026, 9, 30)


def test_somar_meses_atravessa_o_ano():
    assert lic._somar_meses(date(2026, 11, 10), 3) == date(2027, 2, 10)
    assert lic._somar_meses(date(2026, 12, 1), 12) == date(2027, 12, 1)


def test_bissextos():
    assert lic._bissexto(2028) and lic._bissexto(2000)
    assert not lic._bissexto(2026) and not lic._bissexto(1900)


def test_prazo_de_activacao_e_de_sete_dias():
    """A especificação fixa 7 dias. Está numa constante para não haver dois
    sítios a decidir o mesmo prazo."""
    assert lic.DIAS_PARA_ACTIVAR == 7
