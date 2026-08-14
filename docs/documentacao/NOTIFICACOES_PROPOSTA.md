# Notificações — lista de operações, para validação

Levantada em 2026-08-14 a partir do código, não de suposições. Cada linha
aponta o ficheiro e a razão. **Nada implementado até haver aprovação.**

O critério que aplico, dado por si: só notifica o que **exige conhecimento,
validação, correção ou intervenção de outro módulo ou utilizador**. Uma
operação que correu bem e não pede nada a ninguém não notifica.

---

## As cinco que proponho

### 1. Factura emitida com a contabilização do custo por fazer

**Onde:** `services/comercial.py:258-270` (`baixa_stock_venda`).

**O que acontece hoje.** A baixa de stock corre com `ignorar_erro_contab=True`.
Se a saída de stock ou o lançamento do CMVMC falharem, **a factura é emitida e
numerada à mesma** — e tem de ser, porque um documento fiscal numerado não se
desfaz. O erro sobe em `avisos_stock` e aparece **uma vez**, no ecrã de quem
estava a facturar. Fecha-se o ecrã e não há registo nenhum.

**Resultado:** o proveito está lançado e o custo não. A margem daquele mês está
errada e ninguém sabe.

| | |
|---|---|
| **Destinatário** | `contab.lancar` |
| **Título** | «Factura FT 2026/0004 emitida sem o custo lançado» |
| **Texto** | A saída de stock ou o lançamento do CMVMC falhou: «{motivo}». O proveito está lançado, o custo não. |
| **Acção esperada** | Lançar o custo à mão, ou corrigir o que impediu o lançamento e repetir |
| **Liga a** | O documento de venda |
| **Resolve-se quando** | O lançamento do custo existir para aquela venda |

---

### 2. Factura emitida sem armazém configurado

**Onde:** `services/comercial.py:248-256`.

**O que acontece hoje.** Sem armazém em Parametrizações, a baixa de stock não
chega a ser tentada. Devolve um aviso e a facturação segue. **Todas** as
facturas seguintes saem no mesmo estado, silenciosamente.

| | |
|---|---|
| **Destinatário** | `logistica.gerir` |
| **Título** | «Vendas a sair sem movimentar stock» |
| **Texto** | Não há armazém de saída configurado. As facturas estão a ser emitidas sem baixa de stock nem custo. |
| **Acção esperada** | Escolher o armazém em Configurações → Parametrizações |
| **Liga a** | Configurações → Parametrizações |
| **Resolve-se quando** | Houver armazém configurado |
| **Nota** | Uma só notificação enquanto durar, não uma por factura |

---

### 3. Compra emitida com linhas que não entraram em stock

**Onde:** `services/compras.py:103-124` (`emitir_compra`, lista `erros`).

**O que acontece hoje.** Se **alguma** linha entrar, a compra é dada por
emitida. As linhas que falharam ficam em `erros` — a mercadoria não está em
stock e não foi contabilizada, mas o documento diz «emitida».

| | |
|---|---|
| **Destinatário** | `logistica.gerir` |
| **Título** | «Compra {nº}: {n} linha(s) não entraram em stock» |
| **Texto** | O documento foi emitido, mas estas linhas falharam: «{motivos}». A mercadoria não está no inventário. |
| **Acção esperada** | Corrigir o motivo e dar entrada das linhas em falta |
| **Liga a** | O documento de compra |
| **Resolve-se quando** | Existir movimento de entrada para todas as linhas |

---

### 4. Amortizações processadas sem lançamento

**Onde:** `services/imobilizados.py:234-257`.

**O que acontece hoje — e é o mais grave dos cinco.** A linha
`a.amort_acumulada = ...` corre **antes** do `try` do lançamento. Duas
maneiras de o activo ficar amortizado na ficha e não nas contas:

1. O `postar` falha → entra em `erros`, mas a amortização acumulada **já foi
   escrita**.
2. O activo não tem `conta_custo_amort` ou `conta_amort_acum` → o `if` nem
   entra, **não há erro nenhum**, e a divergência nasce em silêncio.

O mapa de imobilizados passa a discordar do balanço, e só se descobre no fecho.

| | |
|---|---|
| **Destinatário** | `contab.lancar` |
| **Título** | «{n} activo(s) amortizados sem lançamento em {mês}» |
| **Texto** | A amortização foi registada na ficha destes activos mas não nas contas: {códigos}. Motivo: {erro} ou «sem contas de amortização definidas». |
| **Acção esperada** | Definir as contas na ficha do activo, ou lançar à mão |
| **Liga a** | O processo de amortizações |
| **Resolve-se quando** | Existir lançamento para o período daqueles activos |

---

### 5. Processamento de salários por lançar

**Onde:** `services/rh.py:436-437` (`sem_lancamento=True`).

**O que acontece hoje.** O processamento pode ser gravado sem lançar. O
`ProcessamentoSalarial` fica com `lancado = False` e nada mais acontece — o
custo com pessoal do mês não está nas contas.

| | |
|---|---|
| **Destinatário** | `contab.lancar` |
| **Título** | «Salários de {mês} processados e por lançar» |
| **Texto** | O processamento está fechado mas não foi lançado. O custo com pessoal do mês não está na contabilidade. |
| **Acção esperada** | Lançar o processamento |
| **Liga a** | RH → Processamento |
| **Resolve-se quando** | `lancado` passar a verdadeiro |

---

## Duas que NÃO proponho, e porquê

**Movimento de stock anulado.** Desde hoje, anular cria o movimento contrário e
o estorno, na mesma transacção. É uma operação completa e coerente: não pede
nada a ninguém. Fica no registo de auditoria, que é onde se procura.

**Venda, compra, recepção ou expedição bem sucedidas.** São o trabalho normal.
Notificá-las enche o sino e faz com que as cinco de cima deixem de ser vistas —
que é exactamente o modo de falhar de um sistema de notificações.

---

## Duas que deixo à sua decisão

Não as implemento sem um sim explícito.

**A. Período ou exercício fechado.** Quem fecha impede os outros de lançar
naquele período. Hoje só se descobre ao tentar lançar e levar com o erro.
Notificaria `contab.lancar` a dizer que o período passou a fechado. **A favor:**
evita trabalho perdido. **Contra:** é um aviso e não uma tarefa — nada há a
corrigir.

**B. Documento de venda em rascunho há mais de N dias.** Um rascunho antigo é
quase sempre esquecimento, e não facturado é não cobrado. **A favor:** dinheiro.
**Contra:** exige escolher o N e passa a haver notificações que nascem do
tempo e não de um acto — é outra categoria de coisa, e a primeira a ser
ignorada se o N estiver mal escolhido.

---

## Como fica registada, pelas suas regras

- **Histórico:** nada se apaga. Lida e não lida são estados, não remoções.
- **Sem caducidade automática:** uma notificação só passa a «resolvida» quando
  a condição que a originou deixar de se verificar, e **fica no histórico** com
  essa marca. Nunca desaparece por ter sido lida.
- **Por capacidade:** `contab.lancar`, `logistica.gerir`. Sobrevive a
  reorganizações de perfis; «quem é contabilista» não sobrevive.
- **E-mail:** fora deste trabalho, como pediu.

## Uma decisão técnica que quero confirmada

**As notificações nascem dentro da mesma transacção da operação.** Se a
operação reverter, a notificação reverte com ela — uma notificação de uma coisa
que não aconteceu é pior do que não haver notificação.

O reverso é que uma falha a criar a notificação faria reverter a operação. Para
isso não acontecer, o `notificar()` nunca levanta: se falhar, regista no log do
servidor e deixa a operação seguir. **A operação é que manda; a notificação é
sobre ela.**
