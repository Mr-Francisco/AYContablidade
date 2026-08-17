# 02 — SAF-T (AO)

**A prioridade.** É o que se implementa primeiro, e por três razões: já é
obrigatório hoje, é mensal, e obriga a arrumar dados que a facturação
electrónica vai precisar de qualquer maneira.

---

## O que é

Um ficheiro **XML** exportado da contabilidade, da facturação e da logística,
referente a um período (no máximo um ano), com uma estrutura fixa definida pelo
esquema **`SAFTAO1.01_01.xsd`** — que está em
[`oficial/xsd/`](oficial/xsd/SAFTAO1.01_01.xsd), são 125 KB de esquema.

O espaço de nomes é `urn:OECD:StandardAuditFile-Tax:AO_1.01_01`. É o padrão da
OCDE adaptado a Angola, o que quer dizer que muito do que já se sabe sobre o
SAF-T português se aplica — mas **as tabelas de imposto e o plano de contas são
os angolanos**, e é aí que as implementações copiadas falham.

## A estrutura, por blocos

```
AuditFile
├── Header                    → identificação da empresa, período, software
├── MasterFiles
│   ├── GeneralLedgerAccounts → o plano de contas (PGC-AR)
│   ├── Customer              → clientes
│   ├── Supplier              → fornecedores
│   ├── Product               → artigos e serviços
│   └── TaxTable              → as taxas de imposto usadas
├── GeneralLedgerEntries      → os lançamentos contabilísticos
└── SourceDocuments
    ├── SalesInvoices         → facturas e documentos equivalentes
    ├── MovementOfGoods       → guias de remessa / movimentos de mercadoria
    ├── WorkingDocuments      → documentos de trabalho (proformas, orçamentos)
    └── Payments              → recibos
```

**Os três tipos de ficheiro** que a AGT pede não são três estruturas
diferentes: são o mesmo `AuditFile` preenchido em partes diferentes.

| Tipo | Blocos que leva | Prazo |
|---|---|---|
| **Facturação** | Header, MasterFiles (clientes, produtos, impostos), SalesInvoices | Dia 20 do mês seguinte |
| **Aquisição de bens e serviços** | Header, MasterFiles (fornecedores, produtos), e as compras | Dia 20 do mês seguinte |
| **Contabilidade** | Header, GeneralLedgerAccounts, GeneralLedgerEntries | 10 de Abril do ano seguinte |

## O que o SGD já tem — e é mais do que parece

Isto é a boa notícia: a maior parte dos dados **já existe e está normalizado**.

| Bloco do SAF-T | O que temos | Estado |
|---|---|---|
| `Header` | Ficha da empresa: nome, NIF, morada, exercício | ✅ existe |
| `GeneralLedgerAccounts` | Plano de contas PGC-AR completo, 1619 contas | ✅ existe |
| `Customer` | `Terceiro` com NIF, morada, província, município | ✅ existe |
| `Supplier` | O mesmo modelo, `tipo_terceiro = fornecedor` | ✅ existe |
| `Product` | `Artigo` com código, descrição, unidade | ✅ existe |
| `TaxTable` | Taxas de IVA nas parametrizações | ⚠️ existe, por normalizar |
| `GeneralLedgerEntries` | `Lancamento` + `LinhaLancamento`, com diário e período | ✅ existe |
| `SalesInvoices` | `Venda` + `VendaLinha`, com número, série, data, cliente, IVA | ✅ existe |
| `MovementOfGoods` | `MovimentoStock` | ✅ existe |
| `WorkingDocuments` | Vendas em rascunho | ⚠️ existe, por mapear |
| `Payments` | Recibos / recebimentos | ⚠️ parcial |

## O que falta — e é aqui que está o trabalho

### 1. O `hash` de cada documento

O SAF-T exige, por documento, um **código de controlo** encadeado: cada factura
leva o hash da anterior, de forma a que apagar ou alterar uma no meio parta a
cadeia. É o que torna o ficheiro auditável.

Hoje temos `codigo_validacao`, que é **outra coisa** — um resumo do número com
o total, sem encadeamento e sem assinatura. Não serve, e é o item de maior
esforço desta lista.

### 2. A tabela de impostos normalizada

O `TaxTable` precisa de cada taxa com o seu código (`NOR`, `ISE`, `RED`…),
percentagem e descrição, e cada linha de factura tem de apontar para uma
entrada dessa tabela. Hoje o IVA é uma percentagem escrita na venda.

### 3. A numeração com série explícita

O SAF-T e a API querem `documentNo` no formato `FT FT2026S1/00001` — tipo,
série e sequencial. Temos `FT 2026/0001`. É perto, mas tem de ser exacto.

### 4. Os campos que ainda não se recolhem

- **Código EAC** (actividade económica) da empresa — vai no cabeçalho e em cada
  documento (`eacCode`).
- **Motivo de isenção**, por linha, quando não há liquidação de IVA (art. 10.º f).
- **Hora e local** da entrega ou prestação (art. 10.º g).
- **País do cliente** (`customerCountry`), para não residentes.

### 5. A exportação em si

Gerar o XML, validá-lo **contra o XSD** antes de o entregar, e guardar o que
foi entregue. Um SAF-T que não passa no validador da AGT é uma entrega falhada,
e o prazo não pára.

## Estado da implementação

| Passo | Estado |
|---|---|
| 1. Tabela de impostos normalizada | ✅ `core/impostos.py` — as seis taxas em vigor, com motivo obrigatório a zero |
| 1b. Tradução dos tipos de documento | ✅ `core/documentos_fiscais.py` — os nossos onze tipos → tabelas da AGT |
| 2. Séries como entidade | ✅ `services/facturacao/series.py` + tabela `series_documento` |
| 3. Encadeamento por hash | ✅ `services/facturacao/cadeia.py`, ligado à emissão |
| 4. Campos em falta | ⚠️ na base (`entrada_sistema`, `local_operacao`, `cliente_pais`, `motivo_isencao`); falta o EAC e o preenchimento no ecrã |
| 5. Gerador de XML | ⬜ por fazer |
| 6. Ecrã de exportação | ⬜ por fazer |

**O que já acontece numa emissão real** (verificado em
`tests/test_emissao_com_serie.py`): o documento recebe número da série no
formato `FT FT2026S1/00001`, guarda a hora de entrada no sistema, calcula o
resumo encadeado com o do documento anterior, grava o código de controlo de
quatro caracteres e fica marcado como «por comunicar» — ou «não aplicável», se
for uma pró-forma.

## Plano de implementação — por onde começar

Pela ordem em que cada passo desbloqueia o seguinte:

1. **Normalizar a tabela de impostos.** Sem ela, nem o SAF-T nem a factura
   electrónica conseguem descrever uma linha.
2. **Séries de numeração como entidade própria.** Hoje a série é um pedaço do
   número; passa a ter existência, porque a API da AGT regista séries e o
   SAF-T identifica-as.
3. **Encadeamento por hash na emissão.** É a alteração mais sensível: mexe no
   momento em que um documento passa a definitivo, e a partir daí a cadeia não
   pode partir.
4. **Os campos em falta** — EAC, motivo de isenção, hora e local.
5. **O gerador de XML**, um bloco de cada vez, validado contra o XSD a cada
   passo.
6. **O ecrã de exportação**: escolher período e tipo, gerar, validar, guardar,
   descarregar.

O passo 3 é o que exige mais cuidado e o que não se pode fazer a meio. Os
passos 1, 2 e 4 são preparação e podem ser feitos sem risco.

## O validador

A AGT disponibiliza validação dos ficheiros no Portal do Contribuinte. Antes de
entregar seja o que for, o ficheiro tem de passar no `SAFTAO1.01_01.xsd` — e
isso podemos verificar aqui, no nosso lado, com o esquema que já está
descarregado. **Um teste que valide contra o XSD tem de existir desde a
primeira linha do gerador**, não no fim.

---

## Fontes

- Esquema oficial: [`oficial/xsd/SAFTAO1.01_01.xsd`](oficial/xsd/SAFTAO1.01_01.xsd)
- [Decreto Executivo n.º 74/19](oficial/Decreto-Executivo-74-19-regras-validacao-sistemas.pdf) — regras e requisitos de validação
- [Comunicado da AGT](oficial/AGT-documento-1173168.pdf) — obrigação e prazos dos dois SAF-T mensais
