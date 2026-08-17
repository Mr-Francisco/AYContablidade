"""Geração do ficheiro SAF-T (AO).

O ficheiro que a AGT recebe até ao dia 20 de cada mês. XML, validado contra o
esquema oficial `SAFTAO1.01_01.xsd` — que está em `core/data/saft/`, copiado da
fonte e versionado com o código, para a validação não depender de haver rede.

DUAS REGRAS QUE MANDAM EM TUDO O QUE SE SEGUE:

1. **A ORDEM DOS ELEMENTOS NÃO É NEGOCIÁVEL.** O esquema usa `xs:sequence`: um
   `CompanyName` antes do `TaxAccountingBasis` invalida o ficheiro inteiro,
   mesmo estando os dois lá. É por isso que a construção de cada bloco segue,
   linha a linha, a ordem do XSD e não a ordem que seria natural em português.

2. **NÃO SE INVENTA CONTEÚDO.** Um campo obrigatório que não temos é um erro
   que se comunica a quem exporta, com o nome do que falta e onde o preencher —
   nunca um valor por omissão que passe na validação e minta ao fisco. Um SAF-T
   que valida e está errado é pior do que um que não valida.

O QUE ESTE MÓDULO NÃO FAZ: não submete nada. Gera, valida e devolve. A entrega
é feita por quem exporta, no Portal do Contribuinte.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core import documentos_fiscais as docs_fiscais
from src.core import impostos as imp
from src.db.models.comercial import Venda, VendaLinha
from src.db.models.logistica import Artigo
from src.db.models.tenancy import Empresa
from src.db.models.terceiros import Terceiro

#: Espaço de nomes do SAF-T angolano. Fixo pela norma.
NS = "urn:OECD:StandardAuditFile-Tax:AO_1.01_01"

#: Versão do ficheiro, como o esquema a identifica.
VERSAO = "1.01_01"

#: Identificação do software no ficheiro.
#:
#: O ESQUEMA IMPÕE O FORMATO `nome/produtor` — padrão `[^/]+/[^/]+`. Não é
#: decorativo: é assim que a AGT separa a aplicação de quem a fez, e um nome
#: solto («SGD — Software de Gestão Dirigida») é recusado na validação. Foi o
#: validador que o disse, e não a documentação.
PRODUTO_ID = "SGD/AYContabilidade"
PRODUTO_EMPRESA_NIF = ""  # NIF do produtor de software, quando existir

#: Formato do número de validação do software, tal como o esquema o exige:
#: `\d+/AGT/\d{4}` — por exemplo `141/AGT/2026` — ou `0`.
#:
#: O `0` É PREVISTO PELA NORMA e quer dizer «software ainda não certificado».
#: Aceita-se, porque é o que permite gerar e conferir ficheiros antes de a
#: certificação estar concluída — mas tem de ser escrito de propósito, e não
#: entrar por omissão sem ninguém dar por isso.
PADRAO_VALIDACAO = re.compile(r"^(\d+/AGT/\d{4}|0)$")

#: O que se escreve quando o software ainda não foi certificado pela AGT.
SEM_CERTIFICACAO = "0"

XSD = Path(__file__).resolve().parents[2] / "core" / "data" / "saft" / "SAFTAO1.01_01.xsd"


class ErroSaft(Exception):
    """O ficheiro não pode ser gerado, e a mensagem diz o que falta."""


class DadosEmFalta(ErroSaft):
    """Falta informação obrigatória. Não se inventa: comunica-se."""


# ---------------------------------------------------------------------------
# Utilitários de escrita
# ---------------------------------------------------------------------------
def _e(pai: ET.Element, nome: str, valor: Any = None) -> ET.Element:
    """Um elemento, com o texto já convertido para a forma que o XSD espera."""
    el = ET.SubElement(pai, nome)
    if valor is not None:
        el.text = _texto(valor)
    return el


def _texto(v: Any) -> str:
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, Decimal):
        # Duas casas. O XSD usa `SAFmonetaryType`, e um valor com quatro casas
        # é recusado.
        return f"{v:.2f}"
    if isinstance(v, datetime):
        # Sem fuso: o SAF-T usa hora local, e um `+00:00` no fim invalida.
        return v.replace(microsecond=0, tzinfo=None).isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def _exigir(valor: Any, o_que: str, onde: str) -> Any:
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        raise DadosEmFalta(f"Falta {o_que}. Preencha em {onde} e volte a exportar.")
    return valor


# ---------------------------------------------------------------------------
# Cabeçalho
# ---------------------------------------------------------------------------
def _cabecalho(
    pai: ET.Element,
    empresa: Empresa,
    *,
    de: date,
    ate: date,
    numero_validacao: str | None,
) -> None:
    """`Header` — a identificação da empresa e do software.

    A ordem é a do XSD e não se altera: AuditFileVersion, CompanyID,
    TaxRegistrationNumber, TaxAccountingBasis, CompanyName, CompanyAddress,
    FiscalYear, StartDate, EndDate, CurrencyCode, DateCreated, TaxEntity,
    ProductCompanyTaxID, SoftwareValidationNumber, ProductID, ProductVersion.
    """
    h = ET.SubElement(pai, "Header")

    _e(h, "AuditFileVersion", VERSAO)
    _e(h, "CompanyID", _exigir(empresa.codigo, "o código da empresa", "Configurações"))
    _e(h, "TaxRegistrationNumber", _exigir(empresa.nif, "o NIF da empresa", "Configurações"))
    # `F` — facturação. É o tipo de ficheiro que se entrega mensalmente.
    _e(h, "TaxAccountingBasis", "F")
    _e(h, "CompanyName", _exigir(empresa.nome, "o nome da empresa", "Configurações"))

    morada = ET.SubElement(h, "CompanyAddress")
    _e(morada, "AddressDetail", _exigir(empresa.morada, "a morada da empresa", "Configurações"))
    _e(morada, "City", empresa.localizacao or "Luanda")
    _e(morada, "Country", "AO")

    _e(h, "FiscalYear", de.year)
    _e(h, "StartDate", de)
    _e(h, "EndDate", ate)
    _e(h, "CurrencyCode", "AOA")
    _e(h, "DateCreated", date.today())
    # A repartição fiscal. Sem cadastro dela, vai «Global», que é o que a norma
    # aceita para quem não tem sede repartida.
    _e(h, "TaxEntity", "Global")
    _e(h, "ProductCompanyTaxID", PRODUTO_EMPRESA_NIF or empresa.nif)
    validacao = _exigir(
        numero_validacao,
        "o número de validação do software atribuído pela AGT "
        f"(no formato 141/AGT/2026, ou «{SEM_CERTIFICACAO}» enquanto o "
        "software não estiver certificado)",
        "Configurações → Facturação",
    )
    if not PADRAO_VALIDACAO.match(str(validacao).strip()):
        raise DadosEmFalta(
            f"O número de validação «{validacao}» não tem o formato que a AGT "
            "exige: 141/AGT/2026, ou «0» enquanto o software não estiver "
            "certificado."
        )
    _e(h, "SoftwareValidationNumber", str(validacao).strip())
    _e(h, "ProductID", PRODUTO_ID)
    _e(h, "ProductVersion", "1.0")


# ---------------------------------------------------------------------------
# Ficheiros mestres
# ---------------------------------------------------------------------------
def _mestres(
    pai: ET.Element, db: Session, empresa: Empresa, vendas: list[Venda]
) -> tuple[dict, dict]:
    """`MasterFiles` — clientes, artigos e a tabela de impostos.

    SÓ O QUE APARECE NOS DOCUMENTOS DO PERÍODO. Exportar a base de clientes
    inteira num ficheiro mensal é mandar para a AGT dados de quem não teve
    movimento — e engorda o ficheiro sem servir a ninguém.
    """
    m = ET.SubElement(pai, "MasterFiles")

    # ---- Clientes ----
    ids = {v.cliente_id for v in vendas if v.cliente_id}
    clientes = (
        list(db.scalars(select(Terceiro).where(Terceiro.id.in_(ids))))
        if ids
        else []
    )
    for c in clientes:
        el = ET.SubElement(m, "Customer")
        _e(el, "CustomerID", _id_cliente(c))
        _e(el, "AccountID", c.conta or "Desconhecido")
        # Consumidor final é «999999999» por convenção da norma.
        _e(el, "CustomerTaxID", c.nif or "999999999")
        _e(el, "CompanyName", c.nome)
        end = ET.SubElement(el, "BillingAddress")
        _e(end, "AddressDetail", c.morada or "Desconhecido")
        _e(end, "City", c.localidade or c.provincia or "Desconhecido")
        _e(end, "Country", "AO")
        _e(el, "SelfBillingIndicator", 0)

    # Consumidor final: as vendas sem ficha de cliente precisam de um registo
    # na mesma, ou as facturas ficam a apontar para um cliente inexistente.
    if any(not v.cliente_id for v in vendas):
        el = ET.SubElement(m, "Customer")
        _e(el, "CustomerID", "CF")
        _e(el, "AccountID", "Desconhecido")
        _e(el, "CustomerTaxID", "999999999")
        _e(el, "CompanyName", "Consumidor Final")
        end = ET.SubElement(el, "BillingAddress")
        _e(end, "AddressDetail", "Desconhecido")
        _e(end, "City", "Desconhecido")
        _e(end, "Country", "AO")
        _e(el, "SelfBillingIndicator", 0)

    # ---- Artigos ----
    artigo_ids = {l.artigo_id for v in vendas for l in v.linhas if l.artigo_id}
    artigos = (
        list(db.scalars(select(Artigo).where(Artigo.id.in_(artigo_ids))))
        if artigo_ids
        else []
    )
    for a in artigos:
        el = ET.SubElement(m, "Product")
        # `S` serviço, `P` produto — o campo do artigo chama-se `tipo_artigo`.
        _e(el, "ProductType", "S" if (a.tipo_artigo or "") == "servico" else "P")
        _e(el, "ProductCode", a.codigo)
        _e(el, "ProductDescription", a.descricao)
        _e(el, "ProductNumberCode", a.codigo)

    # Linhas sem artigo — descrição livre — precisam de um código na mesma.
    if any(not l.artigo_id for v in vendas for l in v.linhas):
        el = ET.SubElement(m, "Product")
        _e(el, "ProductType", "S")
        _e(el, "ProductCode", "DIVERSOS")
        _e(el, "ProductDescription", "Artigos e serviços diversos")
        _e(el, "ProductNumberCode", "DIVERSOS")

    # ---- Tabela de impostos ----
    tt = ET.SubElement(m, "TaxTable")
    usados = _taxas_usadas(vendas)
    for codigo in sorted(usados):
        t = imp.taxa(codigo)
        entrada = ET.SubElement(tt, "TaxTableEntry")
        _e(entrada, "TaxType", t["tipo"])
        _e(entrada, "TaxCountryRegion", imp.PAIS)
        _e(entrada, "TaxCode", t["codigo"])
        _e(entrada, "Description", t["nome"])
        _e(entrada, "TaxPercentage", Decimal(t["percentagem"]))

    # Os identificadores usados aqui TÊM de ser os mesmos nos documentos: o
    # esquema liga `Invoice > CustomerID` a `MasterFiles > Customer` por
    # restrição de chave. Devolvem-se, em vez de os recalcular lá — recalcular
    # é como se chega a dois valores diferentes para a mesma coisa.
    return (
        {c.id: _id_cliente(c) for c in clientes},
        {a.id: a.codigo for a in artigos},
    )


def _id_cliente(c: Terceiro) -> str:
    """O identificador do cliente no ficheiro, dentro dos 30 caracteres.

    O `CustomerID` tem `maxLength=30` no esquema. Um UUID tem 36 e é recusado —
    foi o que o primeiro ficheiro gerado a partir de dados reais mostrou, e o
    teste sintético não apanhava porque usava vendas a consumidor final.

    Usa-se o número do cliente, que é o que a empresa conhece; sem ele, os
    primeiros 30 caracteres do UUID, que continuam a ser únicos.
    """
    return (c.numero or str(c.id))[:30]


def _taxas_usadas(vendas: list[Venda]) -> set[str]:
    """As taxas que aparecem mesmo nos documentos do período.

    Exportar a tabela toda quando só se usou uma é ruído; e o SAF-T pede as
    que foram usadas.
    """
    usadas: set[str] = set()
    for v in vendas:
        for l in v.linhas:
            usadas.add(_codigo_da_linha(v, l))
    return usadas or {imp.CODIGO_OMISSAO}


def _codigo_da_linha(venda: Venda, linha: VendaLinha) -> str:
    """A taxa da linha — com a compatibilidade para trás.

    Os documentos anteriores à tabela de impostos guardaram só `iva_perc` no
    documento. Deduz-se a taxa a partir da percentagem, que é a única pista
    que existe (ver `impostos.por_percentagem`).
    """
    if linha.taxa_codigo:
        return linha.taxa_codigo
    return imp.por_percentagem(venda.iva_perc or 0)["codigo"]


# ---------------------------------------------------------------------------
# Documentos
# ---------------------------------------------------------------------------
def _documentos(
    pai: ET.Element, vendas: list[Venda], clientes: dict, artigos: dict
) -> None:
    """`SourceDocuments > SalesInvoices` — as facturas do período."""
    fonte = ET.SubElement(pai, "SourceDocuments")
    si = ET.SubElement(fonte, "SalesInvoices")

    _e(si, "NumberOfEntries", len(vendas))
    _e(si, "TotalDebit", sum((v.subtotal or Decimal(0) for v in _do_tipo(vendas, "NC")), Decimal(0)))
    _e(si, "TotalCredit", sum((v.subtotal or Decimal(0) for v in vendas if v.tipo_doc != "NC"), Decimal(0)))

    for v in vendas:
        _factura(si, v, clientes, artigos)


def _do_tipo(vendas: list[Venda], tipo: str) -> list[Venda]:
    return [v for v in vendas if v.tipo_doc == tipo]


def _factura(pai: ET.Element, v: Venda, clientes: dict, artigos: dict) -> None:
    inv = ET.SubElement(pai, "Invoice")

    _e(inv, "InvoiceNo", _exigir(v.numero, f"o número do documento {v.id}", "Comercial"))

    ds = ET.SubElement(inv, "DocumentStatus")
    _e(ds, "InvoiceStatus", v.estado_saft or "N")
    _e(ds, "InvoiceStatusDate", v.anulado_em or v.emitido_em or v.data)
    _e(ds, "SourceID", "SGD")
    # `P` — documento produzido nesta aplicação.
    _e(ds, "SourceBilling", "P")

    # A CADEIA. Um documento sem resumo é um documento que não se pode auditar
    # — e é o que acontece aos que foram emitidos antes de a cadeia existir.
    _e(inv, "Hash", v.hash_doc or "0")
    _e(inv, "HashControl", v.hash_controlo or "0")
    _e(inv, "InvoiceDate", v.data)
    _e(inv, "InvoiceType", docs_fiscais.tipo_oficial(v.tipo_doc) or "FT")

    reg = ET.SubElement(inv, "SpecialRegimes")
    _e(reg, "SelfBillingIndicator", 0)
    _e(reg, "CashVATSchemeIndicator", 0)
    _e(reg, "ThirdPartiesBillingIndicator", 0)

    _e(inv, "SourceID", "SGD")
    _e(inv, "SystemEntryDate", v.entrada_sistema or v.emitido_em or v.data)
    _e(inv, "CustomerID", clientes.get(v.cliente_id, "CF"))

    for i, l in enumerate(v.linhas, start=1):
        _linha(inv, v, l, i, artigos)

    tot = ET.SubElement(inv, "DocumentTotals")
    _e(tot, "TaxPayable", v.iva or Decimal(0))
    _e(tot, "NetTotal", v.subtotal or Decimal(0))
    _e(tot, "GrossTotal", v.total or Decimal(0))


def _linha(
    inv: ET.Element, v: Venda, l: VendaLinha, numero: int, artigos: dict
) -> Decimal:
    """Uma linha da factura. Devolve o imposto que lhe corresponde."""
    el = ET.SubElement(inv, "Line")
    _e(el, "LineNumber", numero)
    _e(el, "ProductCode", artigos.get(l.artigo_id, "DIVERSOS"))
    _e(el, "ProductDescription", l.descricao or "Artigo")
    _e(el, "Quantity", l.qtd or Decimal(1))
    _e(el, "UnitOfMeasure", l.unidade or "UN")
    _e(el, "UnitPrice", l.preco or Decimal(0))
    _e(el, "TaxPointDate", v.data)
    _e(el, "Description", l.descricao or "Artigo")

    # Nota de crédito credita; tudo o resto debita. É o sinal contabilístico do
    # documento e o SAF-T lê-o daqui.
    if v.tipo_doc == "NC":
        _e(el, "DebitAmount", l.total or Decimal(0))
    else:
        _e(el, "CreditAmount", l.total or Decimal(0))

    codigo = _codigo_da_linha(v, l)
    t = imp.taxa(codigo)
    imposto = ET.SubElement(el, "Tax")
    _e(imposto, "TaxType", t["tipo"])
    _e(imposto, "TaxCountryRegion", imp.PAIS)
    _e(imposto, "TaxCode", t["codigo"])
    _e(imposto, "TaxPercentage", Decimal(l.taxa_perc if l.taxa_perc is not None else t["percentagem"]))

    # MOTIVO DA ISENÇÃO — obrigatório quando não se liquida imposto
    # (DP 71/25, art. 10.º f). Sem ele o documento é irregular, e por isso não
    # se inventa: usa-se o que está na linha, ou o fundamento genérico da taxa.
    if t["percentagem"] == 0:
        _e(el, "TaxExemptionReason", l.motivo_isencao or t["motivo"] or "Isento")

    base = l.total or Decimal(0)
    return (base * Decimal(t["percentagem"]) / 100).quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# Geração e validação
# ---------------------------------------------------------------------------
def gerar(
    db: Session,
    *,
    empresa: Empresa,
    de: date,
    ate: date,
    numero_validacao: str | None = None,
) -> bytes:
    """O ficheiro SAF-T de facturação do período, em bytes prontos a gravar."""
    if ate < de:
        raise ErroSaft("A data final é anterior à inicial.")

    vendas = list(
        db.scalars(
            select(Venda)
            .where(
                Venda.empresa_id == empresa.id,
                Venda.estado == "emitida",
                Venda.data >= de,
                Venda.data <= ate,
            )
            .order_by(Venda.data, Venda.numero)
        )
    )
    # A pró-forma e a guia de remessa não entram no ficheiro de facturação.
    vendas = [
        v for v in vendas
        if docs_fiscais.bloco_saft(v.tipo_doc) == "SalesInvoices"
    ]

    raiz = ET.Element("AuditFile", {"xmlns": NS})
    _cabecalho(raiz, empresa, de=de, ate=ate, numero_validacao=numero_validacao)
    clientes, artigos = _mestres(raiz, db, empresa, vendas)
    _documentos(raiz, vendas, clientes, artigos)

    ET.indent(raiz, space="  ")
    return ET.tostring(raiz, encoding="utf-8", xml_declaration=True)


def validar(xml: bytes) -> tuple[bool, list[str]]:
    """Valida contra o esquema oficial. Devolve `(válido, erros)`.

    NÃO LEVANTA EXCEPÇÃO: um ficheiro inválido é informação a mostrar a quem
    exporta, com a linha e o que está errado, para poder corrigir. Rebentar
    aqui só esconderia o motivo.
    """
    from lxml import etree

    try:
        esquema = etree.XMLSchema(etree.parse(str(XSD)))
    except Exception as e:  # pragma: no cover — o esquema vem com o código
        return False, [f"Não foi possível ler o esquema oficial: {e}"]

    try:
        doc = etree.fromstring(xml)
    except etree.XMLSyntaxError as e:
        return False, [f"XML mal formado: {e}"]

    if esquema.validate(doc):
        return True, []
    return False, [f"linha {e.line}: {e.message}" for e in esquema.error_log]
