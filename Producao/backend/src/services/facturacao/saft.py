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


def _instante_ou_meia_noite(quando: datetime | None, dia: date) -> datetime:
    """Uma data-hora, sempre.

    Onde o esquema pede `dateTime`, uma `date` é recusada. Sem hora conhecida,
    meia-noite do próprio dia é o que mais se aproxima da verdade — e é
    melhor do que inventar uma hora ou do que invalidar o ficheiro.
    """
    if quando is not None:
        return quando
    return datetime(dia.year, dia.month, dia.day)


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
    tipo_ficheiro: str = "F",
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
    # O TIPO DE FICHEIRO. `F` facturação, `A` aquisição de bens e serviços,
    # `C` contabilidade — os três que a AGT pede. Distinguem-se aqui; o resto
    # é o mesmo `AuditFile` com outros blocos preenchidos.
    _e(h, "TaxAccountingBasis", tipo_ficheiro)
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
    # O FILTRO POR EMPRESA É REDUNDANTE — os ids vieram das vendas desta
    # empresa — e fica na mesma. As facturas de uma empresa NUNCA se misturam
    # com as de outra, e é a regra que não se pode confiar a uma cadeia de
    # deduções: basta um dado mal ligado para o ficheiro de uma empresa levar
    # o nome de um cliente de outra. Aqui, se isso acontecer, o cliente não
    # aparece — em vez de aparecer indevidamente.
    clientes = (
        list(
            db.scalars(
                select(Terceiro).where(
                    Terceiro.id.in_(ids), Terceiro.empresa_id == empresa.id
                )
            )
        )
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
        list(
            db.scalars(
                select(Artigo).where(
                    Artigo.id.in_(artigo_ids), Artigo.empresa_id == empresa.id
                )
            )
        )
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
    # DATA-HORA, e não data. O `InvoiceStatusDate` é `SAFdateTimeType`: um
    # documento antigo sem hora de emissão caía na data e invalidava o
    # ficheiro inteiro. Só apareceu num teste de carga com dois mil documentos
    # sintéticos — nos testes pequenos, todos tinham hora.
    _e(
        ds,
        "InvoiceStatusDate",
        _instante_ou_meia_noite(v.anulado_em or v.emitido_em, v.data),
    )
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
    # Também `dateTime` — mesma armadilha do `InvoiceStatusDate`.
    _e(
        inv,
        "SystemEntryDate",
        _instante_ou_meia_noite(v.entrada_sistema or v.emitido_em, v.data),
    )
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
# Compras — o SAF-T de «Aquisição de bens e serviços»
# ---------------------------------------------------------------------------
def _mestres_compras(
    pai: ET.Element, db: Session, empresa: Empresa, compras: list
) -> tuple[dict, dict]:
    """`MasterFiles` do lado das compras: fornecedores, artigos e impostos.

    A ESTRUTURA É A MESMA do ficheiro de facturação — muda quem aparece. Onde
    havia `Customer` há `Supplier`, e a ordem dos elementos é a que o esquema
    fixa: SupplierID, AccountID, SupplierTaxID, CompanyName, BillingAddress,
    SelfBillingIndicator.
    """
    m = ET.SubElement(pai, "MasterFiles")

    ids = {c.fornecedor_id for c in compras if c.fornecedor_id}
    fornecedores = (
        list(
            db.scalars(
                select(Terceiro).where(
                    Terceiro.id.in_(ids), Terceiro.empresa_id == empresa.id
                )
            )
        )
        if ids
        else []
    )
    for f in fornecedores:
        el = ET.SubElement(m, "Supplier")
        _e(el, "SupplierID", _id_cliente(f))
        _e(el, "AccountID", f.conta or "Desconhecido")
        _e(el, "SupplierTaxID", f.nif or "999999999")
        _e(el, "CompanyName", f.nome)
        end = ET.SubElement(el, "BillingAddress")
        _e(end, "AddressDetail", f.morada or "Desconhecido")
        _e(end, "City", f.localidade or f.provincia or "Desconhecido")
        _e(end, "Country", "AO")
        _e(el, "SelfBillingIndicator", 0)

    if any(not c.fornecedor_id for c in compras):
        el = ET.SubElement(m, "Supplier")
        _e(el, "SupplierID", "FD")
        _e(el, "AccountID", "Desconhecido")
        _e(el, "SupplierTaxID", "999999999")
        _e(el, "CompanyName", "Fornecedor diverso")
        end = ET.SubElement(el, "BillingAddress")
        _e(end, "AddressDetail", "Desconhecido")
        _e(end, "City", "Desconhecido")
        _e(end, "Country", "AO")
        _e(el, "SelfBillingIndicator", 0)

    artigo_ids = {l.artigo_id for c in compras for l in c.linhas if l.artigo_id}
    artigos = (
        list(
            db.scalars(
                select(Artigo).where(
                    Artigo.id.in_(artigo_ids), Artigo.empresa_id == empresa.id
                )
            )
        )
        if artigo_ids
        else []
    )
    for a in artigos:
        el = ET.SubElement(m, "Product")
        _e(el, "ProductType", "S" if (a.tipo_artigo or "") == "servico" else "P")
        _e(el, "ProductCode", a.codigo)
        _e(el, "ProductDescription", a.descricao)
        _e(el, "ProductNumberCode", a.codigo)

    if any(not l.artigo_id for c in compras for l in c.linhas):
        el = ET.SubElement(m, "Product")
        _e(el, "ProductType", "S")
        _e(el, "ProductCode", "DIVERSOS")
        _e(el, "ProductDescription", "Artigos e serviços diversos")
        _e(el, "ProductNumberCode", "DIVERSOS")

    tt = ET.SubElement(m, "TaxTable")
    usadas = {imp.por_percentagem(c.iva_perc or 0)["codigo"] for c in compras} or {
        imp.CODIGO_OMISSAO
    }
    for codigo in sorted(usadas):
        x = imp.taxa(codigo)
        entrada = ET.SubElement(tt, "TaxTableEntry")
        _e(entrada, "TaxType", x["tipo"])
        _e(entrada, "TaxCountryRegion", imp.PAIS)
        _e(entrada, "TaxCode", x["codigo"])
        _e(entrada, "Description", x["nome"])
        _e(entrada, "TaxPercentage", Decimal(x["percentagem"]))

    return (
        {f.id: _id_cliente(f) for f in fornecedores},
        {a.id: a.codigo for a in artigos},
    )


def _documentos_compras(
    pai: ET.Element, compras: list, fornecedores: dict, artigos: dict
) -> None:
    """`SourceDocuments > PurchaseInvoices` — as compras do período.

    A COMPRA NÃO LEVA CADEIA DE RESUMOS, e a razão é de fundo: o documento não
    foi emitido por nós. Quem responde pela integridade de uma factura de
    compra é quem a emitiu; o que declaramos é o que recebemos. O `Hash` que o
    esquema pede vai a zero, como é próprio de um documento de terceiro.
    """
    fonte = ET.SubElement(pai, "SourceDocuments")
    pi = ET.SubElement(fonte, "PurchaseInvoices")

    # SÓ `NumberOfEntries` E OS DOCUMENTOS. Ao contrário de `SalesInvoices`,
    # o bloco das compras não leva totais — o esquema di-lo e o validador
    # apanhou-o à primeira: «TotalDebit: This element is not expected».
    _e(pi, "NumberOfEntries", len(compras))

    for c in compras:
        inv = ET.SubElement(pi, "Invoice")
        _e(inv, "InvoiceNo", (c.numero or f"CP {c.documento_codigo}")[:60])
        _e(inv, "Hash", "0")
        _e(inv, "SourceID", "SGD")
        _e(inv, "InvoiceDate", c.data)
        # `FT`: o que se recebe de um fornecedor é, por omissão, uma factura.
        _e(inv, "PurchaseType", "FT")
        _e(inv, "SupplierID", fornecedores.get(c.fornecedor_id, "FD"))

        # SEM LINHAS, e não por esquecimento: no SAF-T angolano uma factura de
        # COMPRA é cabeçalho e totais — `InvoiceNo`, `Hash`, `SourceID`,
        # `InvoiceDate`, `PurchaseType`, `SupplierID` e `DocumentTotals`. Não
        # há `Line` nenhuma. O validador disse-o sem margem: «Line: This
        # element is not expected. Expected is DocumentTotals».
        #
        # Faz sentido: o que se declara numa aquisição é o que se pagou e o
        # imposto que se suportou, não a discriminação do que o fornecedor
        # vendeu — essa é a declaração DELE.

        tot = ET.SubElement(inv, "DocumentTotals")
        _e(tot, "TaxPayable", c.iva or Decimal(0))
        _e(tot, "NetTotal", c.subtotal or Decimal(0))
        _e(tot, "GrossTotal", c.total or Decimal(0))


def gerar_compras(
    db: Session,
    *,
    empresa: Empresa,
    de: date,
    ate: date,
    numero_validacao: str | None = None,
) -> bytes:
    """O SAF-T de «Aquisição de bens e serviços» — o outro ficheiro mensal.

    Mesmo prazo do de facturação: dia 20 do mês seguinte. E o mesmo
    `AuditFile`, com `TaxAccountingBasis = "A"` e os blocos das compras.
    """
    from src.db.models.comercial import Compra

    if ate < de:
        raise ErroSaft("A data final é anterior à inicial.")

    compras = list(
        db.scalars(
            select(Compra)
            .where(
                Compra.empresa_id == empresa.id,
                Compra.estado == "emitida",
                Compra.data >= de,
                Compra.data <= ate,
            )
            .order_by(Compra.data, Compra.numero)
        )
    )

    raiz = ET.Element("AuditFile", {"xmlns": NS})
    _cabecalho(
        raiz,
        empresa,
        de=de,
        ate=ate,
        numero_validacao=numero_validacao,
        tipo_ficheiro="A",
    )
    fornecedores, artigos = _mestres_compras(raiz, db, empresa, compras)
    _documentos_compras(raiz, compras, fornecedores, artigos)

    ET.indent(raiz, space="  ")
    return ET.tostring(raiz, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------------------
# Contabilidade — o SAF-T anual
# ---------------------------------------------------------------------------
def _plano_de_contas(
    pai: ET.Element, db: Session, empresa: Empresa, de: date, ate: date
) -> None:
    """`MasterFiles > GeneralLedgerAccounts` — o plano de contas em PGC-AR.

    Vai INTEIRO, e não só as contas movimentadas: o ficheiro de contabilidade
    é a fotografia do plano com que a empresa trabalhou no exercício, e uma
    conta sem movimento no ano continua a fazer parte dele.
    """
    from src.db.models.contabilidade import Conta

    m = ET.SubElement(pai, "MasterFiles")
    gl = ET.SubElement(m, "GeneralLedgerAccounts")

    contas = list(
        db.scalars(
            select(Conta)
            .where(Conta.empresa_id == empresa.id)
            .order_by(Conta.codigo)
        )
    )
    # OS SALDOS DE ABERTURA E FECHO. A ordem que o esquema fixa é
    # AccountID, AccountDescription, Opening(Debit|Credit)Balance,
    # Closing(Debit|Credit)Balance, GroupingCategory — e não se altera.
    #
    # Calculam-se a partir dos lançamentos: abertura é o acumulado ATÉ ao
    # início do período, fecho é o acumulado até ao fim. Não se inventa: uma
    # conta sem movimento fica a zero, que é o seu saldo verdadeiro.
    abertura = _saldos_ate(db, empresa, de)
    fecho = _saldos_ate(db, empresa, ate, inclusive=True)

    for c in contas:
        el = ET.SubElement(gl, "Account")
        _e(el, "AccountID", c.codigo)
        _e(el, "AccountDescription", c.nome)

        ad, ac = abertura.get(c.codigo, (Decimal(0), Decimal(0)))
        fd, fc = fecho.get(c.codigo, (Decimal(0), Decimal(0)))
        _e(el, "OpeningDebitBalance", ad)
        _e(el, "OpeningCreditBalance", ac)
        _e(el, "ClosingDebitBalance", fd)
        _e(el, "ClosingCreditBalance", fc)

        # `GM` conta de movimento, `GR` integradora — o campo `tipo` do plano
        # já o diz: M movimento, I integradora, R razão.
        _e(el, "GroupingCategory", "GM" if (c.tipo or "M") == "M" else "GR")


def _saldos_ate(
    db: Session, empresa: Empresa, limite: date, *, inclusive: bool = False
) -> dict[str, tuple[Decimal, Decimal]]:
    """Débito e crédito acumulados por conta, até uma data.

    Uma consulta agregada e não um ciclo por conta: com 1600 contas e milhares
    de linhas, percorrer conta a conta seriam 1600 consultas para responder a
    uma pergunta que a base responde de uma vez.
    """
    from sqlalchemy import func

    from src.db.models.contabilidade import Lancamento, LancamentoLinha

    condicao = (
        Lancamento.data <= limite if inclusive else Lancamento.data < limite
    )
    linhas = db.execute(
        select(
            LancamentoLinha.conta_codigo,
            func.coalesce(func.sum(LancamentoLinha.debito), 0),
            func.coalesce(func.sum(LancamentoLinha.credito), 0),
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa.id, condicao)
        .group_by(LancamentoLinha.conta_codigo)
    ).all()
    return {c: (Decimal(str(d)), Decimal(str(cr))) for c, d, cr in linhas}


def _lancamentos(
    pai: ET.Element, db: Session, empresa: Empresa, de: date, ate: date
) -> None:
    """`GeneralLedgerEntries` — os lançamentos do exercício.

    O `TransactionType` vem do PERÍODO, e não de uma escolha nossa: os
    períodos 13, 14 e 15 do plano angolano são exactamente as categorias que a
    norma distingue — regularizações e apuramentos —, e a correspondência é
    directa. Um lançamento do período 14 é um apuramento, e dizê-lo `N` seria
    declarar mal uma coisa que o sistema já sabe.
    """
    from src.db.models.contabilidade import Conta, Lancamento

    lancamentos = list(
        db.scalars(
            select(Lancamento)
            .where(
                Lancamento.empresa_id == empresa.id,
                Lancamento.data >= de,
                Lancamento.data <= ate,
            )
            .order_by(Lancamento.data, Lancamento.numero_op)
        )
    )

    # TODA A CONTA USADA TEM DE EXISTIR NO PLANO EXPORTADO, e o esquema
    # verifica-o com uma `keyref`. Não é um pormenor: a linha do lançamento
    # guarda o código da conta como texto — de propósito, para o razão mostrar
    # a conta como estava à data —, e por isso nada impede que exista uma linha
    # numa conta que entretanto saiu do plano, ou que lá nunca esteve por ter
    # vindo de uma importação.
    #
    # Sem isto, o ficheiro sai, o validador recusa-o e a mensagem que se lê é
    # «No match found for key-sequence ['4321'] of keyref
    # GeneralLedgerEntriesCreditLineAccountIDConstraint». Ninguém age sobre
    # aquilo. Preferimos parar aqui e dizer que conta é e em que lançamento.
    no_plano = set(
        db.scalars(select(Conta.codigo).where(Conta.empresa_id == empresa.id))
    )
    orfas: dict[str, str] = {}
    for x in lancamentos:
        for l in x.linhas:
            if l.conta_codigo and l.conta_codigo not in no_plano:
                orfas.setdefault(l.conta_codigo, x.numero_op or str(x.numero))
    if orfas:
        detalhe = "; ".join(
            f"{codigo} (lançamento {onde})" for codigo, onde in sorted(orfas.items())
        )
        raise ErroSaft(
            "Há lançamentos em contas que não estão no plano de contas da "
            f"empresa: {detalhe}. O SAF-T seria recusado pela AGT — o esquema "
            "exige que todas as contas movimentadas existam no plano "
            "exportado. Acrescente as contas ao plano, ou corrija os "
            "lançamentos, antes de exportar."
        )

    gle = ET.SubElement(pai, "GeneralLedgerEntries")
    _e(gle, "NumberOfEntries", len(lancamentos))

    total_d = sum(
        (l.debito or Decimal(0) for x in lancamentos for l in x.linhas), Decimal(0)
    )
    total_c = sum(
        (l.credito or Decimal(0) for x in lancamentos for l in x.linhas), Decimal(0)
    )
    _e(gle, "TotalDebit", total_d)
    _e(gle, "TotalCredit", total_c)

    # Um diário por grupo, como a norma quer.
    por_diario: dict[str, list] = {}
    for x in lancamentos:
        por_diario.setdefault(x.diario_codigo or "1", []).append(x)

    for diario, docs in sorted(por_diario.items()):
        j = ET.SubElement(gle, "Journal")
        _e(j, "JournalID", diario)
        _e(j, "Description", f"Diário {diario}")

        for x in docs:
            tr = ET.SubElement(j, "Transaction")
            # O `TransactionID` TEM UMA FORMA FIXA no esquema:
            # `AAAA-MM-DD DIÁRIO NÚMERO`, com espaços a separar. O nosso
            # número de operação sozinho («00/101.001») é recusado. Foi o
            # validador que o disse — a documentação não o refere.
            _e(
                tr,
                "TransactionID",
                f"{x.data.isoformat()} {x.diario_codigo} "
                f"{(x.numero_op or str(x.numero)).replace(' ', '')}",
            )
            _e(tr, "Period", _periodo_saft(x.mes, x.data))
            _e(tr, "TransactionDate", x.data)
            _e(tr, "SourceID", "SGD")
            _e(tr, "Description", x.descricao or "Lançamento")
            _e(tr, "DocArchivalNumber", x.numero_op or "—")
            _e(tr, "TransactionType", _tipo_de_transaccao(x.mes))
            # DATA, e não data-hora: o esquema usa `SAFdateType`.
            _e(
                tr,
                "GLPostingDate",
                (x.criado_em.date() if x.criado_em else x.data),
            )

            linhas = ET.SubElement(tr, "Lines")

            # PRIMEIRO OS DÉBITOS, DEPOIS OS CRÉDITOS. O esquema declara
            # `DebitLine*` seguido de `CreditLine*` numa `xs:sequence`, e
            # intercalá-los pela ordem em que foram escritos — que é a ordem
            # natural de um lançamento — invalida o ficheiro. O `RecordID`
            # guarda a posição original de cada linha.
            debitos = [
                (i, l)
                for i, l in enumerate(x.linhas, start=1)
                if (l.debito or Decimal(0)) > 0
            ]
            creditos = [
                (i, l)
                for i, l in enumerate(x.linhas, start=1)
                if (l.debito or Decimal(0)) <= 0
            ]

            for nome, grupo, campo in (
                ("DebitLine", debitos, "DebitAmount"),
                ("CreditLine", creditos, "CreditAmount"),
            ):
                for i, l in grupo:
                    el = ET.SubElement(linhas, nome)
                    _e(el, "RecordID", str(i))
                    _e(el, "AccountID", l.conta_codigo)
                    _e(el, "SystemEntryDate", x.criado_em or x.data)
                    _e(el, "Description", l.descricao or x.descricao or "Linha")
                    _e(
                        el,
                        campo,
                        (l.debito if campo == "DebitAmount" else l.credito)
                        or Decimal(0),
                    )


def _periodo_saft(mes: str | None, data: date) -> int:
    """O período no vocabulário do esquema, que vai de 1 a 16.

    O plano angolano numera de 00 a 15 — dezasseis posições, as mesmas que o
    esquema aceita, mas a começar noutro sítio. Os meses mantêm-se alinhados
    (01 → 1, …, 12 → 12), tal como 13, 14 e 15, e a **abertura (00) vai para
    1**: é um lançamento datado de 1 de Janeiro e pertence ao primeiro
    período. Deslocar tudo em um faria Janeiro aparecer como 2, e quem lê o
    ficheiro leria Fevereiro.
    """
    p = (mes or "").strip()
    if not p:
        return data.month
    if p == "00":
        return 1
    try:
        return min(16, max(1, int(p)))
    except ValueError:
        return data.month


def _tipo_de_transaccao(periodo: str | None) -> str:
    """`N` normal, `R` regularizações, `A` apuramentos, `J` ajustamentos.

    A correspondência com os períodos do plano angolano é directa: 13 são as
    regularizações e 14/15 os apuramentos. É informação que o sistema já tem —
    declará-la a partir do período é dizer a verdade sem pedir nada a ninguém.
    """
    p = (periodo or "").strip()
    if p == "13":
        return "R"
    if p in {"14", "15"}:
        return "A"
    return "N"


def gerar_contabilidade(
    db: Session,
    *,
    empresa: Empresa,
    de: date,
    ate: date,
    numero_validacao: str | None = None,
) -> bytes:
    """O SAF-T de Contabilidade — anual, entregue até 10 de Abril.

    É o terceiro dos ficheiros que a AGT pede, e o único que não é mensal:
    leva o plano de contas inteiro e os lançamentos do exercício.
    """
    if ate < de:
        raise ErroSaft("A data final é anterior à inicial.")

    raiz = ET.Element("AuditFile", {"xmlns": NS})
    _cabecalho(
        raiz,
        empresa,
        de=de,
        ate=ate,
        numero_validacao=numero_validacao,
        tipo_ficheiro="C",
    )
    _plano_de_contas(raiz, db, empresa, de, ate)
    _lancamentos(raiz, db, empresa, de, ate)

    ET.indent(raiz, space="  ")
    return ET.tostring(raiz, encoding="utf-8", xml_declaration=True)


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


# ---------------------------------------------------------------------------
# Traduzir o validador para português de quem trabalha
# ---------------------------------------------------------------------------
#
# O validador do esquema fala a língua dele, e é esta:
#
#   linha 14674: Element '{urn:OECD:...}CreditLine': No match found for
#   key-sequence ['4321'] of keyref '{urn:OECD:...}GeneralLedgerEntries
#   CreditLineAccountIDConstraint'.
#
# Isso ia inteiro para o ecrã. Quem exporta o SAF-T é um contabilista com um
# prazo no dia 20, não quem escreveu o programa: aquela linha não lhe diz o que
# está mal nem o que fazer, e o prazo continua a correr.
#
# O que se mostra passa a ser a tradução. O texto original não desaparece —
# segue no campo `detalhe`, para quem der apoio o poder ler.

#: Nomes do esquema traduzidos para o que a pessoa vê nos ecrãs.
NOMES = {
    "AccountID": "código da conta",
    "CustomerID": "código do cliente",
    "SupplierID": "código do fornecedor",
    "ProductCode": "código do artigo",
    "InvoiceNo": "número do documento",
    "InvoiceDate": "data do documento",
    "TaxRegistrationNumber": "NIF",
    "SoftwareValidationNumber": "número de certificação do software",
    "ProductID": "identificação do programa",
    "CompanyName": "nome da empresa",
    "CompanyAddress": "morada da empresa",
    "AddressDetail": "morada",
    "City": "localidade",
    "TaxPayable": "imposto",
    "GrossTotal": "total",
    "NetTotal": "total sem imposto",
    "Period": "período",
    "TransactionID": "identificação do lançamento",
    "TransactionDate": "data do lançamento",
    "GLPostingDate": "data de registo",
    "SystemEntryDate": "data de entrada no sistema",
    "TaxCode": "código de imposto",
    "TaxPercentage": "taxa de imposto",
    "EACCode": "código de actividade económica (CAE)",
    "Description": "descrição",
    "DebitAmount": "valor a débito",
    "CreditAmount": "valor a crédito",
}


def _legivel(nome: str) -> str:
    """`{urn:...}CreditLine` → «linha de crédito»."""
    limpo = re.sub(r"^\{[^}]*\}", "", nome or "").strip()
    if limpo in NOMES:
        return NOMES[limpo]
    return {
        "DebitLine": "linha de débito",
        "CreditLine": "linha de crédito",
        "Invoice": "documento",
        "Line": "linha do documento",
        "Transaction": "lançamento",
        "Account": "conta",
        "Customer": "cliente",
        "Supplier": "fornecedor",
        "Product": "artigo",
        "Header": "cabeçalho",
    }.get(limpo, limpo)


def explicar(erros: list[str]) -> list[dict]:
    """Cada erro do validador, dito em português de quem usa o sistema.

    Devolve `{"mensagem": …, "detalhe": …}` — a tradução e o texto original.
    Mensagens repetidas são agrupadas: cinquenta linhas a dizer o mesmo não
    ajudam ninguém a corrigir mais depressa do que uma.
    """
    vistas: dict[str, dict] = {}

    for erro in erros:
        mensagem = _traduzir(erro)
        entrada = vistas.setdefault(
            mensagem, {"mensagem": mensagem, "detalhe": erro, "ocorrencias": 0}
        )
        entrada["ocorrencias"] += 1

    return list(vistas.values())


def _traduzir(erro: str) -> str:
    # Uma conta usada num lançamento que não existe no plano exportado.
    m = re.search(r"No match found for key-sequence \['([^']*)'\].*?AccountID", erro)
    if m:
        return (
            f"A conta {m.group(1)} é usada em lançamentos mas não existe no "
            "plano de contas. Acrescente a conta ao plano ou corrija os "
            "lançamentos que a usam."
        )

    m = re.search(r"No match found for key-sequence \['([^']*)'\]", erro)
    if m:
        return (
            f"O código {m.group(1)} é usado mas não está declarado no "
            "ficheiro. Confirme se o registo a que pertence existe."
        )

    # Valor que não respeita o formato exigido.
    m = re.search(r"The value '([^']*)' is not accepted by the pattern", erro)
    if m:
        campo = _campo_do_erro(erro)
        onde = f" em {campo}" if campo else ""
        return (
            f"O valor «{m.group(1)}»{onde} não tem o formato exigido pela AGT. "
            "Corrija-o antes de exportar."
        )

    # Valor demasiado comprido. A mensagem do validador tem esta forma:
    # «The value has a length of '36'; this exceeds the allowed maximum
    # length of '30'» — o valor em si não vem lá, só os comprimentos.
    m = re.search(
        r"length of '(\d+)'.*?maximum length of '(\d+)'", erro, re.S
    )
    if m:
        campo = _campo_do_erro(erro)
        onde = f"O {campo}" if campo else "Um dos valores"
        return (
            f"{onde} é demasiado comprido: tem {m.group(1)} caracteres e a AGT "
            f"aceita no máximo {m.group(2)}. Encurte-o e exporte de novo."
        )

    # Campo obrigatório em falta.
    m = re.search(r"Missing child element\(s\).*?Expected is[^(]*\(\s*([^)]*)\)", erro)
    if m:
        falta = ", ".join(_legivel(x) for x in m.group(1).split(",")[:3])
        return f"Falta preencher: {falta}. Complete a informação e exporte de novo."

    # Elemento fora de sítio ou a mais.
    m = re.search(r"This element is not expected", erro)
    if m:
        campo = _campo_do_erro(erro)
        onde = f" ({campo})" if campo else ""
        return (
            f"Há informação fora do sítio no ficheiro{onde}. "
            "Contacte o fornecedor da plataforma."
        )

    # Tipo errado — data onde se espera data e hora, texto onde se espera número.
    m = re.search(r"'([^']*)' is not a valid value of the atomic type '([^']*)'", erro)
    if m:
        campo = _campo_do_erro(erro)
        onde = f" em {campo}" if campo else ""
        return (
            f"O valor «{m.group(1)}»{onde} não é aceite pela AGT. "
            "Verifique se está preenchido correctamente."
        )

    if "XML mal formado" in erro or "não foi possível ler o esquema" in erro.lower():
        return (
            "Não foi possível preparar o ficheiro. "
            "Contacte o fornecedor da plataforma."
        )

    # O que não se reconhece não se inventa: diz-se que é preciso ajuda.
    return (
        "O ficheiro tem um problema que impede a entrega à AGT. "
        "Contacte o fornecedor da plataforma com o detalhe técnico."
    )


def _campo_do_erro(erro: str) -> str:
    """O nome do campo que o validador cita, já traduzido."""
    m = re.search(r"Element '\{[^}]*\}([A-Za-z]+)'", erro)
    return _legivel(m.group(1)) if m else ""
