# Requisitos — RH e regra global de UX (15 de Agosto de 2026)

Continuação de `REQUISITOS_CONTABILIDADE_2026-08-15.md`. O Piloto é a
referência funcional: layout + comportamento + estados + filtros + carregamento
+ interacções + campos obrigatórios, e não só a aparência.

| # | Ponto | Estado |
|---|-------|--------|
| A | [Regra global: `disabled` explica-se sempre](#a-regra-global-disabled-explica-se-sempre) | por fazer |
| B | [Amortizações — configurações e estado](#b-amortizações) | ✅ feito |
| 1 | [RH · Funcionários](#1-rh--funcionários) | ✅ feito |
| 2 | [RH · Alterações mensais](#2-rh--alterações-mensais) | ✅ feito |
| 3 | [RH · Processamento](#3-rh--processamento) | ✅ feito |
| 4 | [RH · Pagamentos](#4-rh--pagamentos) | ✅ feito |
| 5 | [RH · Recibos](#5-rh--recibos) | ✅ feito |
| 6 | [RH · Simulação](#6-rh--simulação) | por fazer |
| 7 | [RH · Independentes e honorários](#7-rh--independentes-e-honorários) | por fazer |
| 8 | [RH · Tabelas](#8-rh--tabelas) | por fazer |

---

## A. Regra global: `disabled` explica-se sempre

**Nunca bloquear um botão sem dizer porquê.** Vale para toda a aplicação, não
caso a caso.

- Botão desactivado + rato por cima → **tooltip com o motivo**.
  Exemplo: «Não é possível emitir porque o período contabilístico está
  fechado.»
- Situações sensíveis: além do tooltip, **aviso explícito no ecrã** com o
  motivo e, quando aplicável, o que fazer para desbloquear.
- **Não usar o `disabled` nativo de forma que mate o hover** — um `<button
  disabled>` não dispara eventos de rato na maioria dos browsers, e o tooltip
  nunca apareceria. A solução tem de manter o motivo acessível.

`disabled` nunca pode significar «o botão simplesmente não funciona».

## B. Amortizações

✅ **Feito.** Botão «Configurações» com o diário e o documento usados ao
processar (`GET`/`PUT /api/imobilizados/config`), estado a dizer
«Processado em 31/08/2026» e não só «Processado», e a nota do Piloto por baixo
do mapa com a fórmula da quota e o aviso de idempotência.

Também: notificação ao processar. O lançamento entra na contabilidade e não
havia nada a dizê-lo a ninguém — agora notifica quem tem `contab.ver`.

---

## 1. RH · Funcionários

✅ **Feito.** A ficha passou de nove campos para os trinta do Piloto, em oito
separadores; a tabela mostra o NIF (e diz «em falta» a vermelho quando não há);
os filtros ganharam **Categoria**, tirada das fichas que existem; a pesquisa
passou a incluir NIF e Nº de Segurança Social.

Três coisas que apareceram pelo caminho e ficaram resolvidas:

- **A migração `a7f3c19d84b2`**: os vinte e seis campos que faltavam não tinham
  coluna onde ser guardados — quem preenchesse a morada ou o contacto
  perdia-os ao gravar, sem aviso.
- **O `PATCH` ignorava o número do funcionário**: corrigi-lo não fazia nada.
  Agora altera, e um número repetido responde 409 a dizer qual é.
- **O 403 aparecia como «Ainda não há funcionários registados»**: um perfil sem
  `rh.ver` era mandado procurar fichas que existem e ele não pode ver. Passa
  pelo `FalhaAoCarregar`, como os mapas da contabilidade.

Fica em aberto, para quando se tocar no cabeçalho: um perfil só de RH leva 403
em `/api/empresa` e `/api/contabilidade/exercicios`, que o topo da página pede
sempre. Não parte nada — o nome da empresa vem do cartão — mas enche a consola.

Pedido original:

- **Falta a coluna NIF na tabela.**
- **Campos obrigatórios a sério**: NIF (ou o número do BI quando não há NIF),
  contactos, e os restantes que o RH exige — verificar no Piloto quais são.
- **Adicionar colaborador igual ao Piloto** (ver imagem): separadores
  Identificação · Documentos · Dados Fiscais · Contrato · Processamento ·
  Pagamento · Subsídios e Férias · Habilitações. Melhorar só o UI/UX.
- **O mesmo para o botão Editar** — segue a lógica do Piloto.
- A ficha é longa; os campos e a lógica são os do Piloto, sem esquecer os
  obrigatórios.
- Manter os filtros existentes e **acrescentar mais um**, e a pesquisa.

## 2. RH · Alterações mensais

✅ **Feito.** A tabela é a do Piloto — Faltas · Abonos · Descontos · **Bruto** ·
**Líquido** — e ocupa a página toda. As duas últimas colunas faltavam porque a
lista estava espremida ao lado de um formulário fixo; são elas que mostram o
efeito do que se está a lançar, que é a única razão para se estar nesta página.

A edição passa a ser uma janela, como no Piloto: faltas em dias com a nota
«Cada dia de falta desconta 1/30 do salário base», abonos «(acrescem ao bruto)»
e descontos «(deduzem ao líquido)» em linhas com Descrição · Valor · ✕, e o
**líquido resultante ao fundo**, a acompanhar o que se escreve.

O líquido da pré-visualização vem do servidor (`POST /api/rh/alteracoes/
simular`), da MESMA função que processa a folha. No Piloto a fórmula estava
escrita duas vezes — `R.recibo` e `reciboComAlt` — e bastava mexer numa para o
número que o utilizador via deixar de ser o que ia ser pago.

Duas regras ficaram explícitas, com o motivo à vista (regra A):

- **Mês pago**: não se altera. Agora também no servidor (409) — o Piloto só
  desactivava o botão, e o dinheiro já saiu.
- **Mês processado**: não se altera porque a Produção **não reprocessa** (o
  Piloto reprocessava e duplicava o custo na contabilidade; ver
  `processar_mes`). A correcção faz-se por rectificação.

## 3. RH · Processamento

✅ **Feito.** A tabela já tinha as colunas todas; faltava-lhe o **Nº** do
colaborador, que é por onde o RH procura numa folha impressa — dois
colaboradores podem ter o mesmo nome. O histórico passou a **separador ao mesmo
nível** da folha, e voltaram o cabeçalho do mapa (empresa · Folha de Salários ·
exercício · moeda) e a nota do Piloto a dizer em que contas o processamento vai
cair, com a percentagem do INSS da empresa vinda da configuração e não fixa no
código.

Pedido original:

- A tabela deve ser **exactamente a do Piloto**, mais a coluna «Faltas» que a
  Produção acrescentou.
- Colunas: Colaborador · Base · Faltas · Subsídios · Bruto · INSS 3% ·
  **Matéria** · IRT · **Outros desc.** · Líquido · **INSS empresa**, com a
  linha de totais.
- O **histórico deixa de ficar por baixo**: vai para um separador ao mesmo
  nível da «Folha a processar».

## 4. RH · Pagamentos

✅ **Feito.** A tabela passou a ser a do Piloto: **os meses processados**, com
Mês · Líquido · Estado · Conta · Lançamento e um botão **Pagar** em cada linha
por pagar. Listavam-se os pagamentos já feitos — o contrário do que quem entra
nesta página quer saber; para descobrir o que faltava pagar só experimentando
mês a mês no selector.

Os quatro indicadores e a UX da Produção ficam como estavam. Nova rota
`GET /api/rh/meses-a-pagar`, paginada, que cruza processamentos e pagamentos
por **(exercício, mês)** — só pelo mês, «08» de 2026 e de 2027 seriam o mesmo.

Pelo caminho: um `Selector` com uma opção de valor vazio («A da configuração de
RH», «Todos») mostrava «Seleccionar…» mesmo com ela escolhida. A opção passa a
ganhar ao placeholder.

## 5. RH · Recibos

✅ **Feito.** O recibo é o do Piloto, linha a linha: cabeçalho com empresa ·
«Recibo de Vencimento — mês» · moeda; identificação com nome, número,
categoria e admissão; **estado do mês** ao lado; e a tabela com Salário base ·
Subsídios · Desconto por faltas · Abonos do mês · **Remuneração bruta** ·
INSS (3%) · Matéria colectável IRT · IRT · Outros descontos · **Líquido a
receber**, com os valores a subtrair entre parênteses. Ao fundo, o INSS da
empresa e a linha da assinatura.

O que estava era outro documento: dois blocos («Remunerações» e «Descontos»),
um «Total de descontos» que o Piloto não tem, e o INSS da empresa numa caixa
de aviso azul. Um recibo é um papel que se assina.

Também: o selector passa a listar **todos** os colaboradores e a folha vem com
`so_ativos=false` — quem saiu em Março tem recibo de Março, e é esse que se vai
buscar mais tarde.

## 6. RH · Simulação

Manter o que está, mas com o comportamento, a lógica e tudo o que existe no
Piloto. Ver se ganha com um separador próprio.

## 7. RH · Independentes e honorários

- **Independentes: totalmente igual ao Piloto, sem excepção** (ver imagens:
  ficha com Nome · NIF · Retenção IRT (%) · Actividade · Estado; e «Processar
  honorário» com Independente · Valor bruto · Data · Descrição, e a retenção e
  o líquido calculados ao fundo).
- **Honorários processados** passam para um separador ao mesmo nível da tabela
  dos Independentes, para não obrigar a rolar.

## 8. RH · Tabelas

Separar em dois:

- **Configurações** — só administrador: Segurança Social (INSS).
- **Carreiras e tabelas** — o resto, igual ao Piloto.

---

## Método

Por ponto: ver o que existe na Produção, ver como funciona no Piloto,
identificar a diferença, implementar, testar no browser, confirmar que não há
regressões, seguir. Só parar perante uma decisão de negócio que não esteja
aqui.
