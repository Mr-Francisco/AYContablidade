# Requisitos — Fiscalidade (15 de Agosto de 2026)

Continuação de `REQUISITOS_RH_E_UX_2026-08-15.md`. O Piloto é a referência
funcional; nestes três pontos o pedido separa o que é **cópia fiel** do que é
**melhoria de layout**.

| # | Ponto | Estado |
|---|-------|--------|
| 1 | [Mapa de Remunerações — igual ao Piloto](#1-mapa-de-remunerações) | ✅ feito |
| 2 | [Calendário Fiscal — melhorar o layout](#2-calendário-fiscal) | ✅ feito |
| 3 | [Catálogo de Impostos — melhorar o layout](#3-catálogo-de-impostos) | ✅ feito |

---

## 1. Mapa de Remunerações

**Totalmente igual ao Piloto, sem alterar nada na tabela.** ✅

Campos e acções, como em `Piloto/mapa-remuneracoes.html`:

- **NIF do Contribuinte** (editável, começa no NIF da empresa), **Período**
  (mês) e **Ano** separados, e o texto «N trabalhadores · valores em Kz».
- **CSV (interno)** — com o NIF e o período no topo e a linha de TOTAIS.
- **Imprimir** — vira a folha para paisagem; catorze colunas não cabem em
  retrato.
- **Gerar .xlsx (modelo AGT)** — preenche o **modelo oficial**
  (`public/modelos/mapa-irt-a2.1.xlsx`), célula a célula, preservando estilos,
  listas pendentes e a folha «Auxiliar». As províncias vão em código de duas
  letras (LA, BA, HO…), como o modelo exige. O escritor de `.xlsx` é o do
  Piloto, transposto para `lib/xlsx.ts` — sem bibliotecas novas.

**A tabela é a do Piloto, coluna a coluna**: duas filas de cabeçalho, com os
grupos coloridos — Identificação do Trabalhador (índigo), Não Sujeito a IRT
(verde), Sujeito a IRT (rosa), Segurança Social (roxo), IRT (magenta) — as
catorze colunas pela mesma ordem, o zero como «—», linhas alternadas, TOTAIS
fixo em baixo e a nota final com o IRT a entregar.

**O scroll é da tabela, não da página**: `min-width: 1180px` na tabela dentro
de uma caixa com `overflow-x`. Medido a 1280px de viewport: tabela 1688px,
caixa 1179px, página sem scroll horizontal. A 375px, idem.

**Rubricas** por trabalhador (o modal do Piloto): os cinco subsídios não
sujeitos, o excesso, os dez sujeitos, e as três marcas do modelo (isento de
IRT, não sujeito a SS, base tributável manual), com o apuramento ao fundo a
acompanhar o que se escreve — e «—» enquanto a tabela do IRT não chega, para
não mostrar zeros que não são zeros.

## 2. Calendário Fiscal

✅ **Refeito.** Era uma grelha de cartões todos iguais: «Mensal», com quatro
obrigações que se repetem doze vezes por ano, tinha o mesmo peso que «Abril»,
com uma; e a ordem era a do ficheiro.

- O **recorrente** fica em destaque no topo, uma só vez, em duas colunas.
- O que tem data fica numa **linha do tempo por ordem de calendário** (os
  trimestres contam pelo mês em que acabam).
- O **período em curso** vem assinalado — é a pergunta que se traz para aqui.
- Cada obrigação separa o **imposto** (destacado) do prazo entre parênteses,
  que passa a uma segunda linha discreta.
- O aviso da AGT deixa de empurrar o calendário para baixo da dobra: fica no
  fim, com o mesmo texto.

## 3. Catálogo de Impostos

✅ **Refeito.** Dez cartões iguais em lista corrida obrigavam a ler os dez para
encontrar um.

- **Agrupado por categoria**, como no Piloto, com o número de impostos em cada
  uma.
- Cartão com a **faixa de cabeçalho** e a sigla no gradiente da marca, e a
  **taxa destacada** — é o que se vem cá buscar.
- Os modelos passam a **etiquetas que quebram linha** (são frases inteiras, e
  um selo que não quebra empurrava a página para fora a 375px).
- Barra de filtros numa linha só, com a contagem de resultados.

---

## Verificado

- Ficheiro `.xlsx` gerado no browser: 854 KB, assinatura ZIP válida, e a folha
  contém o NIF em `A5` **com o estilo original do modelo** (`s="34"`), o nome,
  o código da província, o salário e o IRT.
- Cores dos grupos da tabela lidas do DOM: correspondem às do Piloto.
- Página sem scroll horizontal a 1280px e a 375px.
