# 01 — Enquadramento legal

O que a lei angolana obriga, desde quando, e o que isso significa para o SGD.

---

## Os três diplomas que contam

| Diploma | O que faz |
|---|---|
| **Decreto Presidencial n.º 71/25**, de 20 de Março | O **novo** Regime Jurídico das Facturas. Substitui o anterior e é o que manda hoje. |
| **Decreto Presidencial n.º 312/18**, de 21 de Dezembro | O regime anterior. É dele que vem a obrigação do SAF-T (AO) e o esquema `SAFTAO1.01_01.xsd`. |
| **Decreto Executivo n.º 74/19**, de 6 de Março | As **regras técnicas** de validação dos sistemas de facturação. É o documento que diz o que um software tem de fazer para ser certificado. |

## O calendário — e onde estamos hoje

O DP 71/25 entrou em vigor **seis meses após a publicação**, ou seja em
**Setembro de 2025**, com um período de adaptação até **31 de Dezembro de
2025** em que ainda se podia facturar em formato normal sem penalização.

Depois disso, por fases (art. 37.º):

| Desde | Quem é obrigado |
|---|---|
| **1 de Janeiro de 2026** | Grandes contribuintes (Repartição dos Grandes Contribuintes) e **fornecedores do Estado** |
| **1 de Janeiro de 2027** | **Todos** os sujeitos passivos dos regimes Geral e Simplificado de IVA |

**Hoje é Agosto de 2026.** Quer dizer: a facturação electrónica já é
obrigatória para os grandes contribuintes e para quem fornece o Estado, e falta
**menos de meio ano** para ser obrigatória para toda a gente que o SGD serve.

Não é uma funcionalidade para o ano que vem. É uma funcionalidade para agora.

## O que o DP 71/25 exige de uma factura (art. 10.º)

Cada uma destas alíneas é um campo que o documento tem de ter:

- **a)** Nome, firma ou denominação social, **NIF** e sede ou domicílio, do
  fornecedor **e** do adquirente.
- **b)** **Numeração sequencial e cronológica**, por tipo de documento e por
  ano fiscal. Pode haver uma ou mais séries identificadas.
- **c)** Discriminação dos bens ou serviços, com quantidades.
- **d)** Preço unitário e total, **em moeda nacional**.
- **e)** Taxas de imposto aplicáveis e respectivos montantes.
- **f)** Justificação quando não houver liquidação de imposto — o motivo da
  isenção tem de constar.
- **g)** Data, hora e local da entrega ou da prestação.
- **h)** Redigida **em português**.
- **i)** Data de emissão.
- **j)** **Identificação do software validado pela AGT, código de controlo
  (hash) e identificação da impressão.**

E ainda: a numeração das **auto-facturas** tem de ser diferente da das facturas
de venda (art. 10.º n.º 3).

## Prazos de emissão (art. 8.º)

- **Cinco dias úteis** após a operação.
- Facturas globais: **cinco dias úteis** após o fecho do período.

## Autenticidade (art. 19.º)

O contribuinte tem de garantir **autenticidade, integridade e legibilidade**
das facturas, desde a emissão até ao fim do prazo de arquivo. A autenticação
faz-se por **um código digital definido pela Administração Tributária** — não
é um código que o software invente.

> É por isto que o «código de validação» do Piloto, que é um `hash` djb2 do
> número com o total, **não serve**. Parece um código de validação e não é.

## SAF-T — as duas obrigações (arts. 24.º e 25.º)

| Ficheiro | Quando | Quem |
|---|---|---|
| **SAF-T de Facturação** | Até ao **dia 20** do mês seguinte | Regimes Geral e Simplificado de IVA |
| **SAF-T de Aquisição de bens e serviços** | Até ao **dia 20** do mês seguinte | idem |
| **SAF-T de Contabilidade** | Até **10 de Abril** do ano seguinte | Sujeitos passivos com contabilidade organizada |

O comunicado da AGT que está em
[`oficial/AGT-documento-1173168.pdf`](oficial/AGT-documento-1173168.pdf)
confirma os dois primeiros.

**A falta de submissão por mais de três períodos consecutivos** activa as
penalizações do art. 35.º (n.os 11 e 12).

## O que isto significa para o SGD, em três frases

1. **O SAF-T não é opcional nem é para o futuro**: é mensal, é para os dois
   regimes de IVA, e o prazo é o dia 20.
2. **A facturação electrónica tem data marcada** para os clientes do SGD:
   Janeiro de 2027, e já hoje para quem for grande contribuinte ou fornecer o
   Estado.
3. **O software tem de ser validado pela AGT** — o número de validação entra
   na própria factura (art. 10.º j) e na assinatura enviada à API
   (`softwareValidationNumber`). Sem isso, o resto não vale.

---

## Fontes

- Decreto Presidencial n.º 71/25 — texto consultado em `angolex.com`
- Decreto Executivo n.º 74/19 — [PDF oficial do MINFIN](oficial/Decreto-Executivo-74-19-regras-validacao-sistemas.pdf), 27 páginas
- Comunicado da AGT sobre SAF-T — [PDF oficial](oficial/AGT-documento-1173168.pdf)
- Esquema SAF-T (AO) — [`oficial/xsd/SAFTAO1.01_01.xsd`](oficial/xsd/SAFTAO1.01_01.xsd)
