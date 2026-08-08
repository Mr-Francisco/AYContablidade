"""Tabela de preços da API da OpenAI, lida de configuração.

Vive fora do código porque os preços mudam sem aviso e não devem obrigar a um
deploy. Não é segredo — os preços são públicos — por isso o ficheiro está
versionado; os segredos continuam a viver só no `.env`.

FALHA ABERTA, ao contrário de quase tudo o resto neste sistema. Se o ficheiro
não existir ou estiver mal formado, usa-se a tabela embutida e regista-se o
aviso. É deliberado: um ficheiro de preços partido não pode derrubar o módulo
de IA, porque o que ele afecta é a ESTIMATIVA de custo — o consumo continua a
ser medido em tokens, que vêm da resposta da API e são exactos.
"""

import json
import logging
from decimal import Decimal
from pathlib import Path
from typing import NamedTuple

from src.core.config import get_settings

log = logging.getLogger(__name__)


class Preco(NamedTuple):
    """Dólares por 1 000 000 de tokens."""

    entrada: Decimal
    saida: Decimal


#: Último recurso, se a configuração não puder ser lida. Mantém o sistema a
#: estimar custos em vez de o deixar sem tabela nenhuma.
EMBUTIDOS: dict[str, Preco] = {
    "gpt-4o": Preco(Decimal("2.50"), Decimal("10.00")),
    "gpt-4o-mini": Preco(Decimal("0.15"), Decimal("0.60")),
    "gpt-4.1": Preco(Decimal("2.00"), Decimal("8.00")),
    "gpt-4.1-mini": Preco(Decimal("0.40"), Decimal("1.60")),
}

#: Usado quando o modelo não está na tabela. Deliberadamente o mais CARO dos
#: conhecidos: um modelo desconhecido deve sobrestimar o custo, nunca
#: subestimá-lo — subestimar é que deixa passar consumo a mais sem se dar por isso.
POR_OMISSAO_EMBUTIDO = Preco(Decimal("2.50"), Decimal("10.00"))


class Tabela(NamedTuple):
    modelos: dict[str, Preco]
    por_omissao: Preco
    #: De onde veio, para a interface poder dizer se está a usar configuração
    #: ou o recurso embutido — a diferença importa a quem confere a factura.
    origem: str
    confirmado_em: str | None


def _decimal(valor) -> Decimal:
    """Aceita texto ou número. Texto é preferível num JSON de preços: `0.1` em
    vírgula flutuante não é exactamente um décimo, e aqui somam-se dinheiros."""
    return Decimal(str(valor))


def _caminho() -> Path:
    configurado = (get_settings().PRECOS_IA_FICHEIRO or "").strip()
    if configurado:
        return Path(configurado)
    # backend/src/services/ia/precos.py -> backend/config/precos_ia.json
    return Path(__file__).resolve().parents[3] / "config" / "precos_ia.json"


def _ler() -> Tabela:
    caminho = _caminho()
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
        modelos = {
            str(nome): Preco(_decimal(p["entrada"]), _decimal(p["saida"]))
            for nome, p in (bruto.get("modelos") or {}).items()
        }
        if not modelos:
            raise ValueError("a tabela de modelos está vazia")
        po = bruto.get("por_omissao") or {}
        por_omissao = (
            Preco(_decimal(po["entrada"]), _decimal(po["saida"]))
            if po
            else POR_OMISSAO_EMBUTIDO
        )
        return Tabela(modelos, por_omissao, str(caminho), bruto.get("_confirmado_em"))
    except Exception as e:  # noqa: BLE001 — ver o cabeçalho: falha aberta.
        log.warning(
            "Preços de IA: não foi possível ler %s (%s). A usar a tabela "
            "embutida — a estimativa de custo pode divergir da factura.",
            caminho,
            e,
        )
        return Tabela(dict(EMBUTIDOS), POR_OMISSAO_EMBUTIDO, "embutida", None)


#: Lido uma vez. `recarregar()` existe para quem editar o ficheiro sem querer
#: reiniciar, e para os testes.
_tabela: Tabela | None = None


def tabela() -> Tabela:
    global _tabela
    if _tabela is None:
        _tabela = _ler()
    return _tabela


def recarregar() -> Tabela:
    global _tabela
    _tabela = _ler()
    return _tabela


def preco_de(modelo: str | None) -> Preco:
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
    t = tabela()
    nome = str(modelo or "")
    if nome in t.modelos:
        return t.modelos[nome]

    candidatos = [m for m in t.modelos if nome.startswith(m)]
    if candidatos:
        return t.modelos[max(candidatos, key=len)]
    return t.por_omissao
