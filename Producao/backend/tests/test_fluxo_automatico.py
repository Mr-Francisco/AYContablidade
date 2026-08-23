"""Classificação automática do fluxo de caixa, e onde ela se recusa.

A REGRA: conta em contrapartida + sentido do movimento → rubrica de fluxo.

O QUE ESTES TESTES FIXAM É SOBRETUDO O QUE **NÃO** SE CLASSIFICA. Automatizar
demais aqui é pior do que não automatizar: uma linha por classificar aparece em
Diferidos e alguém decide; uma linha MAL classificada desaparece da lista e
ninguém volta a olhar para ela — e a Demonstração de Fluxos de Caixa fecha com
números que não são os da tesouraria.

O caso concreto que obrigou a restringir: dentro da classe `31 CLIENTES` do
plano carregado vivem `314 Compras — Embalagens` e `316 Compras — Matérias-
primas`. Não são contas de cliente. Uma regra sobre a classe inteira
chamava-lhes recebimentos de clientes.
"""

from src.services.diferidos import rubrica_automatica


# ---------------------------------------------------------------------------
# O que se classifica
# ---------------------------------------------------------------------------
def test_entrada_de_um_cliente_corrente_e_recebimento():
    assert rubrica_automatica(["3111001"], "entrada") == "1100"


def test_saida_para_um_fornecedor_corrente_e_pagamento():
    assert rubrica_automatica(["3211002"], "saida") == "1101"


def test_saida_para_remuneracoes_e_pagamento_de_pessoal():
    assert rubrica_automatica(["3611"], "saida") == "1102"


def test_saida_para_o_estado_e_pagamento_de_impostos():
    """Dinheiro que SAI do banco para uma conta de imposto é um pagamento de
    imposto — o sentido não deixa dúvida."""
    for conta in ("3431", "34531", "3411", "3471"):
        assert rubrica_automatica([conta], "saida") == "1202", conta


# ---------------------------------------------------------------------------
# O que NÃO se classifica — e é aqui que está o valor
# ---------------------------------------------------------------------------
def test_as_contas_de_compras_dentro_da_classe_31_nao_sao_clientes():
    """`314` e `316` vivem dentro de CLIENTES e são contas de COMPRAS.

    É o caso que obrigou a restringir às contas correntes. Uma regra sobre a
    classe 31 inteira apanhava-as.
    """
    assert rubrica_automatica(["314"], "entrada") is None
    assert rubrica_automatica(["3161"], "entrada") is None


def test_os_titulos_a_receber_ficam_para_decisao_humana():
    """Receber um título e descontá-lo no banco não são a mesma operação."""
    assert rubrica_automatica(["3121"], "entrada") is None
    assert rubrica_automatica(["3131"], "entrada") is None


def test_a_cobranca_duvidosa_nao_se_classifica_sozinha():
    assert rubrica_automatica(["3181"], "entrada") is None


def test_os_saldos_invertidos_ficam_de_fora():
    """Um saldo credor de cliente não é uma venda por receber, e um saldo
    devedor de fornecedor não é uma compra por pagar."""
    assert rubrica_automatica(["3191"], "entrada") is None
    assert rubrica_automatica(["3291"], "saida") is None


def test_os_adiantamentos_a_pessoal_nao_sao_remuneracoes():
    """`363` é um empréstimo ao trabalhador, não um salário."""
    assert rubrica_automatica(["3631"], "saida") is None


def test_o_credito_fiscal_e_os_subsidios_do_estado_ficam_de_fora():
    """`346` é um activo sobre o Estado; `348` vem do Estado, não vai para ele.

    São as duas contas da classe 34 que NÃO são impostos a pagar, e por isso as
    duas que a regra do Estado não pode apanhar.
    """
    assert rubrica_automatica(["3461"], "saida") is None
    assert rubrica_automatica(["3481"], "saida") is None


def test_o_sentido_conta_tanto_como_a_conta():
    """A mesma conta, sentido contrário, deixa de ser classificável.

    Devolver dinheiro a um cliente não é «recebimento de clientes», e receber
    de um fornecedor não é «pagamento a fornecedores».
    """
    assert rubrica_automatica(["3111001"], "saida") is None
    assert rubrica_automatica(["3211002"], "entrada") is None


def test_uma_operacao_com_contrapartidas_de_naturezas_diferentes_nao_se_classifica():
    """Um pagamento que salda um fornecedor E paga imposto na mesma operação
    não é uma coisa nem outra. Escolher uma delas seria inventar."""
    assert rubrica_automatica(["3211002", "3431"], "saida") is None


def test_uma_contrapartida_desconhecida_contamina_a_operacao_inteira():
    """Não se classifica metade de um movimento: o valor que entrou no banco é
    um só, e atribuí-lo a uma rubrica que só explica parte dele é pior do que
    deixá-lo por explicar."""
    assert rubrica_automatica(["3211002", "6111"], "saida") is None


def test_sem_contrapartida_nao_ha_o_que_deduzir():
    assert rubrica_automatica([], "entrada") is None
    assert rubrica_automatica([""], "entrada") is None
