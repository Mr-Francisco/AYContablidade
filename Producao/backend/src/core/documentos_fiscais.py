"""Tipos de documento — o que o sistema emite, e como isso se diz à AGT.

DUAS TABELAS E UMA TRADUÇÃO ENTRE ELAS, e é essa a razão deste ficheiro.

O sistema tem os seus tipos, herdados do Piloto (`TIPOS_DOC` em
`db/models/comercial.py`): FT, FR, FS, FG, FA, VD, ND, NC, RC, GR, PP. Servem
para saber o que lançar na contabilidade e o que pedir no ecrã.

A AGT tem os dela, e **não são as mesmas**. Verificado na documentação oficial
e no esquema `SAFTAO1.01_01.xsd` (ver `docs/facturacao/`):

- **`FS` e `VD` não existem** nas tabelas da AGT. O equivalente é **`TV`** —
  Talão de Venda.
- **`GR` não é uma factura.** É um movimento de mercadorias, e no SAF-T vai
  para `MovementOfGoods`, com o seu próprio tipo (`GR` em `MovementType`).
- **`PP` — a pró-forma — não é um documento fiscal.** Não se comunica à AGT e
  não entra em `SalesInvoices`; se entrar em algum lado é em
  `WorkingDocuments`. É por isso que já está marcada `fiscal: False`.
- **Não existe «NE»** em tabela nenhuma. Anular uma factura faz-se de duas
  maneiras, ambas previstas: emitir uma **Nota de Crédito (NC)** que a estorna,
  ou marcar o documento como anulado — `InvoiceStatus = "A"` no SAF-T. Um
  documento fiscal emitido **não se apaga**; corrige-se com outro documento.

Sem esta tradução escrita num sítio só, cada exportação inventava a sua — e a
que estivesse errada só se descobria no dia da entrega.
"""

from __future__ import annotations

from typing import TypedDict


class Correspondencia(TypedDict):
    """Como um tipo interno se diz nas tabelas oficiais."""

    #: O que vai em `documentType` (AGT) e em `InvoiceType` (SAF-T).
    oficial: str | None
    #: Onde entra no SAF-T: `SalesInvoices`, `MovementOfGoods`,
    #: `WorkingDocuments`, `Payments`, ou `None` quando não entra.
    bloco: str | None
    #: Comunica-se à AGT em tempo real?
    comunicavel: bool
    nota: str


#: Tipos internos → tabelas oficiais.
MAPA: dict[str, Correspondencia] = {
    "FT": {
        "oficial": "FT",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Factura.",
    },
    "FR": {
        "oficial": "FR",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Factura/Recibo — venda e recebimento no mesmo documento.",
    },
    "FS": {
        "oficial": "TV",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Factura simplificada. A AGT não tem este código: vai como Talão de Venda.",
    },
    "VD": {
        "oficial": "TV",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Venda a dinheiro. Idem — Talão de Venda.",
    },
    "FG": {
        "oficial": "FG",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Factura global, do período.",
    },
    "FA": {
        "oficial": "FA",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Factura de adiantamento.",
    },
    "ND": {
        "oficial": "ND",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Nota de débito — acresce ao que foi facturado.",
    },
    "NC": {
        "oficial": "NC",
        "bloco": "SalesInvoices",
        "comunicavel": True,
        "nota": "Nota de crédito — é COM ISTO que se anula ou corrige uma factura.",
    },
    "RC": {
        "oficial": "RC",
        "bloco": "Payments",
        "comunicavel": True,
        "nota": "Recibo emitido. Não leva linhas de artigo; leva os dados do recebimento.",
    },
    "GR": {
        "oficial": "GR",
        "bloco": "MovementOfGoods",
        "comunicavel": False,
        "nota": "Guia de remessa. Movimento de mercadorias, não é factura.",
    },
    "PP": {
        "oficial": None,
        "bloco": None,
        "comunicavel": False,
        "nota": "Pró-forma. NÃO é documento fiscal: não se comunica nem entra no SAF-T de facturação.",
    },
}

#: Tipos que a AGT aceita em `documentType` (documentação oficial de
#: `registarFactura`). Guardado para validar antes de submeter — enviar um
#: código fora desta lista é rejeição certa.
TIPOS_AGT = (
    "FA", "FT", "FR", "FG", "GF", "AC", "AR", "TV",
    "RC", "RG", "RE", "ND", "NC", "AF",
    # Sector segurador
    "RP", "RA", "CS", "LD",
)

#: Tipos de movimento de mercadorias (`MovementType` no SAF-T). São OUTRA
#: tabela: uma guia de remessa não é uma factura e não se diz com um
#: `documentType`. Confundi-los é o erro que o teste
#: `test_o_codigo_oficial_e_sempre_aceite_pela_agt` apanha.
TIPOS_MOVIMENTO = ("GR", "GT", "GA", "GD")

#: Estados do documento no SAF-T (`InvoiceStatus`).
ESTADOS_SAFT = {
    "N": "Normal",
    "S": "Autofacturação",
    "A": "Anulado",
    "R": "Documento de resumo",
}

#: Estados na submissão à AGT (`documentStatus`).
ESTADOS_AGT = {
    "N": "Normal",
    "C": "Correcção de documento rejeitado",
}


def correspondencia(tipo_interno: str) -> Correspondencia:
    return MAPA.get(
        (tipo_interno or "FT").upper(),
        {
            "oficial": None,
            "bloco": None,
            "comunicavel": False,
            "nota": "Tipo desconhecido — não se comunica.",
        },
    )


def tipo_oficial(tipo_interno: str) -> str | None:
    """O código a pôr em `documentType` / `InvoiceType`."""
    return correspondencia(tipo_interno)["oficial"]


def comunicavel(tipo_interno: str) -> bool:
    """Vai para a AGT em tempo real?"""
    return correspondencia(tipo_interno)["comunicavel"]


def bloco_saft(tipo_interno: str) -> str | None:
    """Em que parte do SAF-T este documento entra."""
    return correspondencia(tipo_interno)["bloco"]


def anula_documento(tipo_interno: str) -> bool:
    """Este tipo serve para anular ou corrigir outro?

    Só a nota de crédito. Não há em Angola um «documento de anulação» à parte:
    um documento fiscal emitido não se apaga — estorna-se.
    """
    return (tipo_interno or "").upper() == "NC"
