"""Os planos de licenciamento, definidos num sítio só.

PORQUE ESTE FICHEIRO EXISTE. O campo `plano` da licença era uma etiqueta: três
nomes escritos à mão numa lista do ecrã — «Base», «Profissional»,
«Enterprise» — que não decidiam nada. Procurei todas as leituras de `.plano` no
servidor: escreviam-no, devolviam-no ou mostravam-no. Nenhuma mudava
comportamento.

Pior do que inútil, era enganador: quem lesse «Enterprise» na lista de licenças
supunha que aquilo queria dizer alguma coisa. E havia uma consequência a sério
— o formulário de gerar licenças não tinha campo para os módulos, e como lista
vazia significa «todos», TODA a licença criada pela interface incluía TODOS os
módulos, escolhesse-se «Base» ou «Enterprise».

O que um plano decide agora, e é tudo o que a licença já sabia limitar:

- **os módulos incluídos** — verificado em `auth/permissions.py`;
- **o número de utilizadores activos** — verificado ao criar contas;
- **os tectos mensais do assistente**, em tokens e em custo.

OS NÚMEROS AQUI SÃO UM PONTO DE PARTIDA E NÃO UMA DECISÃO COMERCIAL. Foram
escolhidos a partir do que o sistema tem — quais módulos existem, o que custa
uma resposta do assistente — e revêem-se com quem vende. O que este ficheiro
garante é que a decisão fica **num sítio só**: mudar um plano é mudar aqui, e
não ir licença a licença.

CADA LICENÇA CONTINUA A PODER SER AJUSTADA. O plano preenche; não tranca. Uma
empresa que precise de um módulo a mais ou de um tecto diferente recebe-o na
sua licença, e isso não obriga a inventar um plano novo para um cliente só.
"""

from __future__ import annotations

from decimal import Decimal
from typing import NamedTuple

from src.core.constants import Modulo


class Plano(NamedTuple):
    """Um plano. O que ele decide, e nada mais."""

    codigo: str
    nome: str
    #: A quem se destina, em linguagem de quem vende — não de quem programa.
    para_quem: str
    #: Módulos incluídos. Lista vazia quer dizer TODOS, e é o que a licença
    #: entende: `permissions.py` não filtra quando a lista está vazia.
    modulos: tuple[str, ...]
    #: Contas activas permitidas. `None` = sem limite.
    utilizadores: int | None
    #: Tecto mensal de tokens do assistente. `None` = sem limite.
    tokens_mes: int | None
    #: Tecto mensal de custo do assistente, em USD. `None` = sem limite.
    custo_mes: Decimal | None

    @property
    def todos_os_modulos(self) -> bool:
        return not self.modulos


#: O plano mais pequeno: contabilidade e o que a lei obriga a entregar.
#:
#: Leva Fiscalidade de propósito, e não é generosidade: sem ela não há
#: apuramento de IVA nem SAF-T, e uma empresa angolana sem isso não cumpre a
#: lei. Vender um plano que não permite cumprir a lei não é vender um plano
#: pequeno — é vender um problema.
ESSENCIAL = Plano(
    codigo="essencial",
    nome="Essencial",
    para_quem="Empresas que precisam de contabilidade e das obrigações fiscais.",
    modulos=(
        Modulo.CONTABILIDADE,
        Modulo.FISCALIDADE,
        Modulo.CONTAS_CORRENTES,
    ),
    utilizadores=3,
    tokens_mes=100_000,
    custo_mes=Decimal("5"),
)

#: Acrescenta o ciclo comercial e de existências — quem factura e tem stock.
GESTAO = Plano(
    codigo="gestao",
    nome="Gestão",
    para_quem="Empresas que facturam e movimentam existências.",
    modulos=(
        Modulo.CONTABILIDADE,
        Modulo.FISCALIDADE,
        Modulo.CONTAS_CORRENTES,
        Modulo.COMERCIAL,
        Modulo.LOGISTICA,
        Modulo.IMOBILIZADOS,
    ),
    utilizadores=10,
    tokens_mes=400_000,
    custo_mes=Decimal("20"),
)

#: Tudo, sem tectos. Para gabinetes e para quem tem RH e análise de custos.
COMPLETO = Plano(
    codigo="completo",
    nome="Completo",
    para_quem="Gabinetes de contabilidade e empresas com salários e centros de custo.",
    # Lista vazia = todos os módulos, incluindo os que vierem a existir. Listar
    # os oito à mão obrigaria a lembrar-se deste ficheiro ao acrescentar um
    # módulo novo, e ninguém se lembra.
    modulos=(),
    utilizadores=None,
    tokens_mes=None,
    custo_mes=None,
)

PLANOS: tuple[Plano, ...] = (ESSENCIAL, GESTAO, COMPLETO)

#: O plano por omissão de uma licença nova.
POR_OMISSAO = GESTAO


def por_codigo(codigo: str) -> Plano | None:
    """O plano com este código, se existir.

    Aceita também os nomes ANTIGOS — «Base», «Profissional», «Enterprise» — que
    ficaram em licenças já emitidas. Não se apagam do sistema: a licença de um
    cliente não muda de nome porque nós mudámos de ideias, e uma licença que
    deixasse de ser reconhecida deixava de abrir a empresa.
    """
    alvo = (codigo or "").strip().casefold()
    for p in PLANOS:
        if alvo in (p.codigo, p.nome.casefold()):
            return p
    return ANTIGOS.get(alvo)


#: Os nomes que já foram emitidos, ligados ao plano que hoje lhes corresponde.
#: `Base` era o mais pequeno, `Enterprise` o maior — a correspondência é essa e
#: nada muda nas licenças que já existem: os limites delas estão gravados na
#: própria licença, não vêm daqui.
ANTIGOS: dict[str, Plano] = {
    "base": ESSENCIAL,
    "profissional": GESTAO,
    "enterprise": COMPLETO,
}


def descrever(p: Plano) -> dict:
    """O plano para o ecrã, com os módulos já em nomes de gente."""
    from src.core.constants import MODULO_LABEL, Modulo as M

    return {
        "codigo": p.codigo,
        "nome": p.nome,
        "para_quem": p.para_quem,
        "modulos": list(p.modulos),
        "modulos_nomes": (
            [MODULO_LABEL[M(m)] for m in p.modulos]
            if p.modulos
            else list(MODULO_LABEL.values())
        ),
        "todos_os_modulos": p.todos_os_modulos,
        "utilizadores": p.utilizadores,
        "tokens_mes": p.tokens_mes,
        "custo_mes": str(p.custo_mes) if p.custo_mes is not None else None,
    }


def catalogo() -> list[dict]:
    """Os planos todos, para o ecrã de licenças os poder oferecer."""
    return [descrever(p) for p in PLANOS]
