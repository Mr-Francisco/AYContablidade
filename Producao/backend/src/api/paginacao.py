"""Paginação de listagens.

REGRA DO PROJECTO: nenhum histórico é infinito. Tudo o que possa crescer sem
limite — auditoria, movimentos, lançamentos, vendas, notificações — devolve
uma página de cada vez e diz quantos há ao todo.

Sem o `total`, o cliente não sabe se há mais nada e tem de adivinhar pelo
tamanho da página; com ele, mostra «1–25 de 4 812» e sabe quando parar.

O `total` é uma consulta à parte, e de propósito: contar com `OVER()` na mesma
consulta traz a contagem repetida em cada linha e obriga a ler tudo. São dois
`SELECT` e é mais barato assim.
"""

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

#: O que se devolve quando ninguém pede tamanho. Vinte e cinco linhas enchem
#: um ecrã sem o encher de mais.
LIMITE_OMISSAO = 25

#: Tecto por pedido. Existe para que um `limite=100000` na barra de endereços
#: não traga a tabela inteira para memória.
LIMITE_MAXIMO = 200


def pagina(
    db: Session,
    consulta: Select,
    *,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
    formatar,
) -> dict[str, Any]:
    """Uma página de resultados, com o total e a posição.

    `consulta` já traz filtros e ordenação, e NÃO traz `limit`/`offset` — são
    postos aqui, para que a contagem veja o mesmo conjunto que a página.
    """
    limite = max(1, min(limite, LIMITE_MAXIMO))
    offset = max(0, offset)

    # A contagem parte da mesma consulta sem ordenação: `ORDER BY` numa
    # subconsulta de contagem não muda o resultado e alguns motores recusam-no.
    total = db.scalar(
        select(func.count()).select_from(consulta.order_by(None).subquery())
    ) or 0

    linhas = db.scalars(consulta.offset(offset).limit(limite)).all()
    return {
        "linhas": [formatar(x) for x in linhas],
        "total": total,
        "offset": offset,
        "limite": limite,
    }
