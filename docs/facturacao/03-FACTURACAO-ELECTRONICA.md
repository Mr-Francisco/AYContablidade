# 03 — Facturação electrónica (API da AGT)

O segundo passo, depois do SAF-T. Aqui está a API tal como a AGT a documenta,
resumida ao que é preciso para a implementar.

---

## Como funciona, em três linhas

O software envia a factura em **JSON assinado** (JWS). A API valida **só a
estrutura**, devolve um `requestID` e mete o documento numa fila. Mais tarde,
o software **volta a perguntar** o estado. Não há resposta imediata a dizer
«factura válida» — há um recibo de entrega e uma consulta posterior.

```
registarFactura  →  requestID  →  (fila da AGT)  →  obterEstado  →  válida / inválida
```

Está previsto um `callback` para o futuro; hoje é **polling**.

## Autenticação

**Basic Auth**, com credenciais emitidas pela entidade gestora da Facturação
Electrónica — não são as mesmas da consulta de NIF.

```
Authorization: Basic <Base64(username:password)>
Content-Type: application/json
Accept: application/json
```

Pedem-se por **e-mail formal** a `produtores.dfe.dcrr.agt@minfin.gov.ao`, com
nome e NIF da empresa.

## As assinaturas — três, e não uma

Todas em **JWS Compact Serialization**, algoritmo **RS256** (RSA + SHA-256),
chave privada RSA de **2048 bits no mínimo, 4096 recomendado**.

| Assinatura | Assina o quê | Com que chave |
|---|---|---|
| `jwsSoftwareSignature` | Identificação do software: `productId`, `productVersion`, `softwareValidationNumber` | Chave do **produtor de software** |
| `jwsDocumentSignature` | O documento: nº, NIF, tipo, data, NIF do cliente, país, nome | Chave do **contribuinte** |
| `jwsSignature` | A própria requisição | Chave do **contribuinte** |

**As chaves dos contribuintes são geradas pela AGT** e ficam disponíveis na
conta do Portal do Contribuinte. Não somos nós a gerá-las — o que muda o
desenho: o sistema tem de as **receber e guardar**, por empresa.

O cabeçalho é `{"alg":"RS256","typ":"JWT"}` e o objecto deve ser convertido a
**JSON canónico** antes de assinar: sem quebras de linha, sem espaços, aspas
duplas, números sem formatação. Uma vírgula a mais e a assinatura não bate
certo.

## Os sete serviços

| Serviço | Para quê |
|---|---|
| `solicitarSerie` | Criar uma série de numeração |
| `listarSeries` | Ver as séries registadas e as datas |
| `registarFactura` | **O principal** — submeter documentos |
| `obterEstado` | Saber se validou |
| `consultarFactura` | Obter o detalhe de uma factura emitida em nome do contribuinte |
| `listarFacturas` | Listar facturas de um período |
| `validarDocumento` | **Do lado do comprador**: confirmar ou rejeitar uma factura em que se é o adquirente, e definir a percentagem de IVA dedutível |

O último é fácil de passar ao lado e é importante: é como o adquirente aceita a
factura que recebeu — e é isso que lhe dá direito à dedução.

## O documento, tal como a API o quer

```json
{
  "schemaVersion": "1.2",
  "submissionUUID": "a1b2c3d4-…",
  "taxRegistrationNumber": "5001636863",
  "submissionTimeStamp": "2025-11-04T14:30:00Z",
  "softwareInfo": {
    "softwareInfoDetail": {
      "productId": "SGD",
      "productVersion": "1.0.1",
      "softwareValidationNumber": "C_134"
    },
    "jwsSoftwareSignature": "eyJ0eXAiOiJKT1NFIi…"
  },
  "numberOfEntries": 1,
  "documents": [{
    "documentNo": "FT FT6325S2C/10006",
    "documentStatus": "N",
    "jwsDocumentSignature": "eyJ0eXAiOiJKT1NFIi…",
    "documentDate": "2025-11-04",
    "documentType": "FT",
    "eacCode": "12345",
    "systemEntryDate": "2025-11-04T11:15:30Z",
    "customerTaxID": "PT987654321",
    "customerCountry": "PT",
    "companyName": "Cliente Exemplo Lda",
    "lines": [{
      "lineNumber": 1,
      "productCode": "PROD001",
      "productDescription": "Produto Exemplo 1",
      "quantity": 2,
      "unitOfMeasure": "UN",
      "unitPrice": 250,
      "unitPriceBase": 250,
      "debitAmount": 0,
      "creditAmount": 500,
      "taxes": [{
        "taxType": "IVA",
        "taxCountryRegion": "AO",
        "taxCode": "NOR",
        "taxPercentage": 14,
        "taxContribution": 70
      }],
      "settlementAmount": 0
    }],
    "documentTotals": { "taxPayable": 70, "netTotal": 500, "grossTotal": 570 },
    "withholdingTaxList": [{
      "withholdingTaxType": "IRT",
      "withholdingTaxDescription": "Retenção na fonte",
      "withholdingTaxAmount": 16.5
    }]
  }]
}
```

**O que reparar neste JSON**, porque decide o que temos de guardar:

- `eacCode` — o código de actividade económica. Não o temos.
- `taxCode` (`NOR`) — vem de uma **tabela de impostos**, não é a percentagem
  solta que guardamos hoje.
- `unitOfMeasure` — a unidade do artigo, obrigatória por linha.
- `withholdingTaxList` — a retenção na fonte entra no próprio documento.
- `documentNo` no formato `FT FT6325S2C/10006` — tipo, série, sequencial.
- `customerCountry` — o país do cliente.

## O QR Code — especificação exacta

| Parâmetro | Valor |
|---|---|
| Padrão | QR Code Model 2 |
| Versão | **4** (33 × 33 módulos) |
| Correcção de erros | **M** (15%) |
| Modo de dados | Byte |
| Codificação | UTF-8 |
| Ficheiro | **PNG, 350 × 350 px** |
| Logótipo da AGT | Obrigatório, a ocupar **menos de 20%** da imagem |

E o conteúdo é uma **URL**, não um texto codificado:

```
https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=<nifEmissor>&document=<documentNo>
```

Cada espaço no `documentNo` é substituído por `%20`.

> Já sabemos fazer isto: o gerador de QR do segundo factor de autenticação já
> produz PNG com logótipo ao centro e correcção de erros ajustada. O trabalho é
> de parâmetros, não de raiz.

## O que isto implica no desenho

1. **Guardar chaves privadas por empresa** — as que a AGT emite. É material
   sensível e tem de ser cifrado, como já se faz com a chave do TOTP.
2. **Uma fila e um estado por documento**: submetido, em processamento,
   validado, rejeitado. Uma factura deixa de ser emitida num instante — passa
   a ter um percurso.
3. **Repetir a consulta sem duplicar submissões**: o `submissionUUID` e o
   `requestID` são o que garante que uma retransmissão não cria duas facturas.
4. **O número de validação do software** (`softwareValidationNumber`) entra na
   assinatura e na factura impressa. Vem da certificação do SGD pela AGT.

---

## Fontes

Documentação oficial, descarregada de `portaldoparceiro.minfin.gov.ao` e
guardada em [`oficial/texto/`](oficial/texto/):

| Ficheiro | Conteúdo |
|---|---|
| `index.txt` | Visão geral e arquitectura |
| `api.txt` | Autenticação, com exemplos em cURL e JavaScript |
| `estrutura.txt` | As três assinaturas JWS, com exemplos completos |
| `gestao.txt` | Certificados e chaves: como são entregues e renovadas |
| `modelo.txt` | O modelo assíncrono |
| `qrcode.txt` | A especificação do QR Code |
| `servicos-registar.txt` | O serviço principal — 1205 linhas, com todos os campos |
| `servicos-solicitar.txt` / `servicos-listar.txt` | Séries |
| `servicos-consultar.txt` / `servicos-consultar_fatura.txt` / `servicos-listar_faturas.txt` | Consultas |
| `servicos-validar.txt` | Validação pelo adquirente |
