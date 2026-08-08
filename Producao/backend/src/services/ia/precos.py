"""Preços da API da OpenAI, geridos pelo superadministrador.

Vivem na tabela `ia_modelos` e não no código: os preços mudam sem aviso e
mudá-los não pode obrigar a um deploy. Não são segredo — são públicos — e por
isso podem viver na base sem cuidados especiais; a chave da API continua a
viver só no ambiente.

FALHA ABERTA, ao contrário de quase tudo o resto neste sistema. Se a tabela
estiver vazia ou não puder ser lida, usa-se o recurso embutido e regista-se o
aviso. É deliberado: uma tabela de preços em falta não pode derrubar o módulo
de IA, porque o que ela afecta é a ESTIMATIVA de custo — o consumo continua a
ser medido em tokens, que vêm da resposta da API e são exactos.
"""

import logging
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)


class Preco(NamedTuple):
    """Dólares por 1 000 000 de tokens.

    `entrada_cache` é o preço da entrada que a API serviu de cache. Nulo quando
    o modelo não distingue — e aí essa parte paga o preço de entrada normal.
    """

    entrada: Decimal
    saida: Decimal
    entrada_cache: Decimal | None = None


#: Último recurso, se a tabela não puder ser lida. Mantém o sistema a estimar
#: custos em vez de o deixar sem preços nenhuns. Não é a lista de modelos
#: disponíveis: essa é a tabela, e só a tabela.
EMBUTIDOS: dict[str, Preco] = {
    "gpt-4o": Preco(Decimal("2.50"), Decimal("10.00"), Decimal("1.25")),
    "gpt-4o-mini": Preco(Decimal("0.15"), Decimal("0.60"), Decimal("0.075")),
    "gpt-4.1": Preco(Decimal("2.00"), Decimal("8.00"), Decimal("0.50")),
    "gpt-4.1-mini": Preco(Decimal("0.40"), Decimal("1.60"), Decimal("0.10")),
}

#: Usado quando o modelo não está na tabela. Deliberadamente o mais CARO dos
#: conhecidos: um modelo desconhecido deve sobrestimar o custo, nunca
#: subestimá-lo — subestimar é que deixa passar consumo a mais sem se dar por
#: isso. `entrada_cache` fica a `None` de propósito: sem saber o preço, a
#: entrada em cache paga como entrada normal, que é o valor mais alto.
POR_OMISSAO_EMBUTIDO = Preco(Decimal("2.50"), Decimal("10.00"))


class Tabela(NamedTuple):
    modelos: dict[str, Preco]
    por_omissao: Preco
    #: De onde veio, para a interface poder dizer se está a usar a configuração
    #: ou o recurso embutido — a diferença importa a quem confere a factura.
    origem: str


def tabela(db: Session) -> Tabela:
    """Preços em vigor, lidos da base a cada chamada.

    Sem cache de propósito. Um preço alterado tem de valer para a consulta
    seguinte, e guardá-lo em memória faria cada processo servir um valor
    diferente até reiniciar — precisamente o problema que tirar isto do
    ficheiro veio resolver. É um SELECT de três linhas antes de uma chamada à
    API que demora segundos.

    Inclui os modelos DESACTIVADOS: um modelo desactivado hoje pode ter
    atendido consultas ontem, e o histórico precisa do preço para se explicar.
    """
    from src.db.models.ia import ModeloIA

    try:
        linhas = db.execute(
            select(
                ModeloIA.modelo_id,
                ModeloIA.preco_entrada,
                ModeloIA.preco_saida,
                ModeloIA.preco_entrada_cache,
            )
        ).all()
    except Exception as e:  # noqa: BLE001 — ver o cabeçalho: falha aberta.
        log.warning(
            "Preços de IA: não foi possível ler a tabela (%s). A usar os "
            "valores embutidos — a estimativa de custo pode divergir da "
            "factura.",
            e,
        )
        return Tabela(dict(EMBUTIDOS), POR_OMISSAO_EMBUTIDO, "embutida")

    modelos = {
        str(m): Preco(entrada, saida, cache) for m, entrada, saida, cache in linhas
    }
    if not modelos:
        log.warning(
            "Preços de IA: a tabela `ia_modelos` está vazia. A usar os valores "
            "embutidos."
        )
        return Tabela(dict(EMBUTIDOS), POR_OMISSAO_EMBUTIDO, "embutida")

    # O de omissão é o MAIS CARO dos configurados, pela mesma razão de sempre:
    # um modelo que não está na tabela tem de sobrestimar, nunca subestimar.
    #
    # E SEM PREÇO DE CACHE, de propósito. Aplicar a um modelo desconhecido o
    # desconto de cache de outro era descontar às cegas — exactamente o lado
    # errado do erro. Sem preço de cache, essa parte paga como entrada normal.
    mais_caro = max(modelos.values(), key=lambda p: p.saida)
    return Tabela(
        modelos, Preco(mais_caro.entrada, mais_caro.saida, None), "configuração"
    )


def preco_de(db: Session, modelo: str | None) -> Preco:
    """Preço a aplicar a um modelo. Nunca falha: cai no de omissão.

    ACEITA SNAPSHOTS DATADOS. A API não devolve `gpt-4o` — devolve
    `gpt-4o-2024-08-06`, a versão concreta que atendeu o pedido. Uma
    correspondência exacta falhava sempre e mandava tudo para o preço de
    omissão. Para o `gpt-4o` isso até dava o valor certo por acaso, porque o de
    omissão é o dele; para o `gpt-4o-mini` sobrestimava DEZASSEIS VEZES, o que
    faria as quotas travar cedo demais e o painel de custos mentir.

    O prefixo MAIS LONGO ganha: `gpt-4o-mini-2024-07-18` casa com `gpt-4o-mini`
    e não com `gpt-4o`, que também é prefixo dele.
    """
    return escolher(tabela(db), modelo)


def escolher(t: Tabela, modelo: str | None) -> Preco:
    """A correspondência, separada da leitura — para quem já tem a tabela."""
    nome = str(modelo or "")
    if nome in t.modelos:
        return t.modelos[nome]

    candidatos = [m for m in t.modelos if nome.startswith(m)]
    if candidatos:
        return t.modelos[max(candidatos, key=len)]
    return t.por_omissao
