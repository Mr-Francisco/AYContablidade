# Facturação — o dossier

Tudo o que é preciso para pôr o SGD a cumprir a lei angolana da facturação,
reunido e verificado em **17 de Agosto de 2026**. A ordem de trabalho é a que
foi decidida: **primeiro o SAF-T, depois a facturação electrónica.**

## O que está aqui

| Documento | Para quê |
|---|---|
| **[01 — Enquadramento legal](01-ENQUADRAMENTO-LEGAL.md)** | O que a lei obriga, desde quando, e o que acontece a quem não cumprir |
| **[02 — SAF-T (AO)](02-SAFT-AO.md)** | **A prioridade.** O ficheiro, a estrutura, o que já temos e o que falta |
| **[03 — Facturação electrónica](03-FACTURACAO-ELECTRONICA.md)** | A API da AGT: serviços, assinaturas, séries, QR Code |
| **[04 — O que já existe](04-O-QUE-JA-EXISTE.md)** | Inventário honesto do Piloto e da Produção |

E a pasta **[`oficial/`](oficial/)**, com as fontes tal como vieram:

```
oficial/
├── texto/                      ← a documentação da AGT em texto legível
│   ├── index.txt               ← visão geral da API
│   ├── api.txt                 ← autenticação
│   ├── estrutura.txt           ← assinaturas JWS
│   ├── gestao.txt              ← certificados e chaves
│   ├── modelo.txt              ← processamento assíncrono
│   ├── qrcode.txt              ← especificação do QR Code
│   └── servicos-*.txt          ← os sete serviços, com payloads completos
├── xsd/SAFTAO1.01_01.xsd       ← o esquema oficial do SAF-T (AO), 125 KB
├── Decreto-Executivo-74-19-…pdf ← regras de validação de sistemas, 27 páginas
├── AGT-documento-1173168.pdf   ← comunicado sobre a submissão dos SAF-T
└── *.html                      ← as páginas originais, como descarregadas
```

## Onde se foi buscar

**A documentação da API não está acessível no sítio principal.** O
`quiosqueagt.minfin.gov.ao/doc-agt/` serve a página de entrada e devolve uma
casca vazia em todas as outras — verificado com `curl` e com o browser. O
conteúdo está no espelho **`portaldoparceiro.minfin.gov.ao`**, no mesmo
caminho, e foi de lá que veio.

Fica registado porque é a diferença entre «a AGT não documenta» e «a AGT
documenta noutro endereço».

## Os endereços que interessam

| Serviço | Homologação | Produção |
|---|---|---|
| Registar factura | `sifphml.minfin.gov.ao/sigt/fe/v1/registarFactura` | `sifp.minfin.gov.ao/sigt/fe/v1/registarFactura` |
| Consultar estado | `…/sigt/fe/v1/obterEstado` | idem em `sifp` |
| Consultar factura | `…/sigt/fe/v1/consultarFactura` | idem |
| Listar facturas | `…/sigt/fe/ws/v1/listarFacturas` | `…/sigt/fe/v1/listarFacturas` |
| Solicitar série | `…/sigt/fe/ws/v1/registarFactura` ⚠️ | `…/sigt/fe/v1/solicitarSerie` |
| Listar séries | `…/sigt/fe/v1/listarSeries` | idem |
| Validar documento | `…/sigt/fe/v1/validarDocumento` | idem |
| Consulta de NIF | `…/sigt/contribuinte/consultarNIF/v5/obter` | idem |

⚠️ O endereço de homologação de «Solicitar Série» aparece na documentação
oficial a apontar para `registarFactura`. É **erro deles**, não nosso — está
assinalado para se confirmar com a AGT antes de se integrar.

## Estado

Nada disto está implementado. O que existe hoje está em
[04 — O que já existe](04-O-QUE-JA-EXISTE.md), e a resposta curta é: o Piloto
tem uma **demonstração** (QR desenhado à sorte, código de validação inventado,
SAF-T que exporta CSV), e a Produção tem o documento de venda com número, série
e código de validação, mas nenhuma comunicação com a AGT.
