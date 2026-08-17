"""Tabela de impostos — a `TaxTable` do SAF-T (AO).

PORQUE É QUE ISTO EXISTE. Até aqui, o IVA de uma venda era uma percentagem
escrita no documento: `iva_perc = 14`. Chega para calcular e não chega para
mais nada. O SAF-T e a facturação electrónica não perguntam «quantos por
cento» — perguntam **que imposto, de que país, com que código, e porquê**:

    "taxes": [{
      "taxType": "IVA",          ← que imposto
      "taxCountryRegion": "AO",  ← de que espaço fiscal
      "taxCode": "NOR",          ← qual das taxas desse imposto
      "taxPercentage": 14,
      "taxContribution": 70
    }]

E quando não se liquida imposto, o Decreto Presidencial 71/25 (art. 10.º f)
obriga a dizer **porquê**, com o fundamento legal. Uma linha isenta sem motivo
é uma factura irregular.

ESTAS TAXAS NÃO SÃO CONFIGURAÇÃO DA EMPRESA. São as taxas em vigor em Angola,
iguais para toda a gente — por isso vivem aqui, no código, e não numa tabela
que cada empresa possa alterar à sua maneira. O que a empresa escolhe é qual
usar em cada linha.

Fontes: Código do IVA (taxas), Decreto Presidencial n.º 71/25 (menções
obrigatórias) e o esquema `SAFTAO1.01_01.xsd` (`TaxType`, `TaxTableEntry`).
Ver `docs/facturacao/`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TypedDict


class Taxa(TypedDict):
    """Uma entrada da tabela de impostos."""

    #: Código da taxa dentro do imposto — o `taxCode` da AGT.
    codigo: str
    #: `IVA`, `IS` (Imposto de Selo) ou `NS` (não sujeito) — o `taxType`.
    tipo: str
    nome: str
    percentagem: Decimal
    #: Fundamento legal, obrigatório quando a percentagem é zero.
    motivo: str | None
    #: Onde se aplica, para o ecrã ajudar a escolher.
    nota: str


#: O espaço fiscal. Vai em `taxCountryRegion` e no SAF-T.
PAIS = "AO"

#: Taxas de IVA em vigor em Angola.
#:
#: A de Cabinda é uma taxa reduzida com base geográfica — vem do regime
#: especial da província e não se aplica em mais lado nenhum. Fica na tabela
#: porque uma empresa em Cabinda factura com ela, e sem a ter na lista o
#: sistema obrigava a escrever uma percentagem à mão, que é exactamente o que
#: o SAF-T não aceita.
TAXAS: tuple[Taxa, ...] = (
    {
        "codigo": "NOR",
        "tipo": "IVA",
        "nome": "Taxa normal",
        "percentagem": Decimal("14"),
        "motivo": None,
        "nota": "A regra geral. Aplica-se a tudo o que não tenha taxa própria.",
    },
    {
        "codigo": "INT",
        "tipo": "IVA",
        "nome": "Taxa intermédia — hotelaria e restauração",
        "percentagem": Decimal("7"),
        "motivo": None,
        "nota": "Serviços de hotelaria e restauração.",
    },
    {
        "codigo": "RED",
        "tipo": "IVA",
        "nome": "Taxa reduzida — cesta básica e insumos agrícolas",
        "percentagem": Decimal("5"),
        "motivo": None,
        "nota": "Bens da cesta básica e insumos agrícolas.",
    },
    {
        "codigo": "CAB",
        "tipo": "IVA",
        "nome": "Taxa de Cabinda",
        "percentagem": Decimal("1"),
        "motivo": None,
        "nota": "Regime especial da província de Cabinda.",
    },
    {
        "codigo": "ISE",
        "tipo": "IVA",
        "nome": "Isento",
        "percentagem": Decimal("0"),
        "motivo": "Isento nos termos do Código do IVA",
        "nota": "Operação isenta. O motivo tem de ser preciso na factura.",
    },
    {
        "codigo": "NS",
        "tipo": "NS",
        "nome": "Não sujeito",
        "percentagem": Decimal("0"),
        "motivo": "Operação não sujeita a IVA",
        "nota": "Fora do campo do imposto.",
    },
)

_POR_CODIGO = {t["codigo"]: t for t in TAXAS}

#: A taxa que vale quando não se escolhe nenhuma.
CODIGO_OMISSAO = "NOR"


def taxa(codigo: str | None) -> Taxa:
    """A taxa com este código, ou a normal quando não se reconhece.

    Nunca levanta excepção: uma venda antiga, gravada antes de isto existir,
    tem de continuar a poder ser lida.
    """
    return _POR_CODIGO.get((codigo or "").upper().strip(), _POR_CODIGO[CODIGO_OMISSAO])


def percentagem(codigo: str | None) -> Decimal:
    return taxa(codigo)["percentagem"]


def por_percentagem(valor: Decimal | int | float) -> Taxa:
    """A taxa correspondente a uma percentagem — para ler o que já está gravado.

    As vendas anteriores a esta tabela guardaram `iva_perc` e mais nada. Para
    as pôr num SAF-T é preciso descobrir de que taxa se tratava, e a
    percentagem é a única pista que existe. Com 14 acerta-se sempre; com 0 há
    duas hipóteses (isento e não sujeito) e assume-se **isento**, que é o caso
    comum — quem tiver operações não sujeitas tem de as marcar.
    """
    p = Decimal(str(valor))
    for t in TAXAS:
        if t["percentagem"] == p and t["tipo"] == "IVA":
            return t
    return _POR_CODIGO[CODIGO_OMISSAO]


def exige_motivo(codigo: str | None) -> bool:
    """Taxa a zero obriga a fundamentar — art. 10.º f) do DP 71/25."""
    return taxa(codigo)["percentagem"] == 0


def publicas() -> list[dict]:
    """A tabela para o ecrã, com a percentagem já em texto."""
    return [
        {
            "codigo": t["codigo"],
            "tipo": t["tipo"],
            "nome": t["nome"],
            "percentagem": str(t["percentagem"]),
            "motivo": t["motivo"],
            "nota": t["nota"],
            "exige_motivo": t["percentagem"] == 0,
            "pais": PAIS,
        }
        for t in TAXAS
    ]
