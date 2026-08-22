# Pendentes — 22 de Agosto de 2026

Dezanove pontos: notificações, criação de terceiros, imobilizado em curso e
classificação automática dos fluxos de caixa.

**Este ficheiro é a memória do trabalho.** Cada ponto traz o que JÁ EXISTE e
onde, o que falta, e onde se deve mexer. Nada aqui foi assumido: os códigos de
conta foram lidos do plano da empresa de demonstração, e o que não bate está
assinalado.

---

## Estado

| | Ponto | Estado |
|---|---|---|
| 1 | Notificações: estados e filtro por módulo | **FEITO** (falta responder sobre «atendida») |
| 2 | Criar fornecedores nas Compras | **FEITO** |
| 3 | Clientes: 3.ª categoria «Outros devedores» | **FEITO** |
| 4 | Criar fornecedores nos Imobilizados | Analisado |
| 5–8 | Imobilizado em Curso | **BLOQUEADO — contas não batem** |
| 9–12 | Amortização especial, não amortizável, tipo | Analisado |
| 14–19 | Classificação automática de fluxos | Analisado |

---

# PARTE I — O que a análise encontrou

## 1. Notificações

**Já existe, e é mais do que o pedido sugere.**

`backend/src/db/models/notificacoes.py`:

- `Notificacao.origem` — **o módulo já está guardado** (`comercial`,
  `logistica`, `rh`, `imobilizado`, `contabilidade`).
- `Notificacao.resolvida_em` — a situação que a originou deixou de existir.
- `Notificacao.chave` — identidade da SITUAÇÃO, para não repetir o aviso.
- `NotificacaoLida` — tabela à parte: a notificação é para uma **capacidade**,
  não para uma pessoa, e cada uma marca a sua a seu tempo.

`backend/src/services/notificacoes.py`: `notificar()`, `resolver()`,
`listar()`, `marcar_lida()`, `marcar_nao_lida()`, `marcar_todas_lidas()`,
`contar_por_ler()`.

`frontend/src/app/(app)/notificacoes/page.tsx` **já tem os quatro estados**,
num selector: Por ler / Lidas / Por resolver / Resolvidas. E **já mostra o
módulo** em cada linha (`ROTULO_ORIGEM[n.origem]`).

**Quem gera notificações hoje** — os sete sítios, para não se mexer neles às
cegas:

| Ficheiro | Linha | Situação |
|---|---|---|
| `services/comercial.py` | 327, 554 | facturação |
| `services/compras.py` | 135 | compras |
| `services/diferidos.py` | 198 | fluxo por indicar |
| `services/imobilizados.py` | 305, 323 | amortizações |
| `services/rh.py` | 553 | processamento |

### ✅ O filtro por módulo — FEITO

`listar()` aceita `origem` e filtra **no servidor**. Tinha de ser: o histórico
é paginado, por isso filtrar no ecrã devolvia as comerciais das últimas vinte e
cinco e mais nenhumas — e parecia que não havia mais.

`contar_por_origem()` dá as contagens **de todas**, não da página, para o
filtro poder dizer «Comercial (12)». Respeita as capacidades: anunciar
«Contabilidade (7)» a quem depois vê uma lista vazia é pior do que não dizer
número nenhum.

**Um defeito encontrado pelo caminho:** `apuramento` era usado como origem nos
serviços e faltava na tabela de rótulos do ecrã — aparecia o código cru
«apuramento» ao lado de nomes como «Contabilidade». Corrigido.

4 testes novos (699 no total).

### ⚠️ A confirmar antes de mexer

«Não atendidas / Atendidas» — o sistema tem **«por resolver / resolvidas»**, e
`resolvida_em` é posto pelo SISTEMA quando a situação desaparece (a factura foi
contabilizada, o armazém foi configurado). Não é a pessoa que atende.

São a mesma coisa com nomes diferentes, ou quer um estado **novo**, marcado
pela pessoa («já tratei disto»), independente de o sistema ainda detectar a
situação? São implementações diferentes e não quero adivinhar.

---

## 2, 3 e 4 — Criação de clientes e fornecedores

### O que já existe

**Clientes** (`frontend/src/components/comercial/CriarClienteRapido.tsx`):
criação sem sair da facturação, com número sequencial, conta corrente própria
(`31121001`, `31121002`…) e a conta-mãe escolhida pela nacionalidade. Usado em
`app/(app)/comercial/vendas/FormularioVenda.tsx`.

No servidor, `services/comercial.py`:

- `NACIONAIS` — o conjunto de países que contam como Angola;
- `eh_nacional(cliente)`;
- `conta_base_do_cliente(cliente, cfg)` — devolve `31121` ou `31122`;
- `conta_corrente_cliente(...)` — cria a subconta seguinte.

Config: `conta_cliente` = `31121`, `conta_cliente_estrangeiro` = `31122`.

**Fornecedores:** ao contrário do que o pedido diz, **a criação já existe** —
`POST /api/compras/fornecedores` (`api/routers/compras_router.py:90`) e o ecrã
`logistica/fornecedores` tem «Novo fornecedor», partilhando a `FichaTerceiro`
com os clientes.

**O que NÃO existe nos fornecedores:**

1. **Criação a partir do documento de compra.** `components/logistica/FormularioCompra.tsx`
   escolhe o fornecedor de uma lista; não há o equivalente ao
   `CriarClienteRapido`. É isto que falta, e é o «mesmo princípio que já existe
   na criação de clientes».
2. **Categorias.** Há uma conta única: `conta_contrapartida: "32121"`
   (`services/logistica.py:58`). Não há nacional/estrangeiro/outros.

### Contas verificadas no plano ✅

| Código | Existe | Tipo | Nome no plano |
|---|---|---|---|
| `31121` | sim | I | Nacionais |
| `31122` | sim | M | Estrangeiros |
| `3791` | sim | M | **Outros Devedores** |
| `32121` | sim | I | Nacionais |
| `32221` | sim | M | Nacionais |
| `3792` | sim | M | **Outros Credores** |

As seis existem e os nomes batem com o que foi pedido. **Estes três pontos
podem avançar.**

### ✅ Ponto 3 — FEITO

`Terceiro.categoria_conta` (`nacional` | `estrangeiro` | `outros`), migração
`e5b1c8d47a92`. **A mesma coluna serve os dois lados** — o que muda entre um
cliente e um fornecedor é a conta a que cada categoria corresponde, não a
categoria. Os pontos 2 e 4 reutilizam-na.

`services/comercial.py`: `CATEGORIAS_TERCEIRO`, `categoria_do_terceiro()` e
`conta_base_do_terceiro(terceiro, cfg, tipo=…)`, com as seis chaves de
configuração declaradas em `cfg_com_default()`. `conta_base_do_cliente()` fica
e delega, para a regra viver num sítio só.

**Nada muda para quem já existe:** a coluna nasceu vazia, e sem categoria
decide-se pelo país, como sempre. Um teste fixa isso — se a ausência de
categoria mudasse alguma coisa, a migração tinha mexido na conta corrente de
todos os clientes registados.

A porta da API recusa uma categoria desconhecida em vez de a ignorar: guardada
tal e qual, caía no ramo por omissão e a ficha ia parar à conta dos nacionais
sem ninguém perceber porquê.

Ecrã: `CriarClienteRapido.tsx` passou de duas opções derivadas da morada para
três explícitas. O campo «País» só aparece em Estrangeiro.

7 testes novos (690 no total).

### ✅ Ponto 2 — FEITO

**O que faltava não era criar fornecedores** — isso já existia. Era criá-los a
partir do documento de compra, e as categorias.

- `conta_corrente_fornecedor()` em `services/comercial.py`, espelho do lado dos
  clientes. O núcleo passou a ser partilhado (`_subconta_do_terceiro`): estava
  escrito duas vezes e a segunda cópia ficaria para trás à primeira correcção.
- `POST /api/compras/fornecedores/rapido`, igual ao dos clientes: número
  sequencial e conta corrente criadas **já**, não só na primeira compra.
- **A compra passou a lançar na conta da ficha.** Até aqui criava a subconta a
  partir do NOME escrito no documento, sempre debaixo de `32121`. Duas
  consequências: um fornecedor estrangeiro ou um outro credor ficavam na conta
  dos nacionais — o mesmo que acontecia com os clientes antes de terem
  categoria —, e a conta ficava presa a um texto, por isso corrigir o nome na
  ficha deixava a conta antiga órfã e criava outra.
  `registar_movimento` ganhou `conta_terceiro`; em branco, o caminho antigo
  mantém-se e uma compra escrita só com o nome continua a funcionar.
- **Mudar a categoria não mexe na conta já atribuída** — os lançamentos feitos
  ficam onde estão; a conta nova nasce no documento seguinte. Há teste.

Ecrã: `CriarTerceiroRapido.tsx` — **um componente para os dois lados**, porque
as duas janelas pedem o mesmo, criam o mesmo e diferem em três coisas: a
palavra, a rota e as contas. `CriarClienteRapido` ficou uma casca fina, para os
chamadores não quebrarem. Na compra, o `CampoEntidade` já tinha o gancho
`aoCriar` — foi ligá-lo.

5 testes novos (695 no total).

Nota: `31121` e `32121` são de **integração** (`I`), não de movimento — é por
isso que a lógica actual cria uma subconta por cliente em vez de lançar na
conta-mãe. O mesmo terá de valer para os fornecedores.

---

## 5 a 12 — Imobilizado em Curso

### O que já existe

`backend/src/db/models/imobilizados.py`, modelo `Ativo`:

`codigo`, `designacao`, `conta_imob`, `conta_amort_acum`, `conta_custo_amort`,
`data_aquisicao`, `valor_aquisicao`, `taxa`, `metodo`, `amort_acumulada`,
`fornecedor` (**texto livre**, não é ligação à ficha de terceiro), `estado`
(`activo` | `abatido`).

Ecrãs: `imobilizados/ativos` e `imobilizados/amortizacoes`.

**Não existe:** tipo de imobilizado, estado «em curso», acumulação de vários
itens num activo, marca de não amortizável, condições especiais de amortização,
nem transferência.

### 🛑 BLOQUEIO — as contas indicadas não correspondem ao plano

O utilizador pediu para confirmar (pontos A e B) e fez bem. **Não batem.**

#### A. Contas 371… — a estrutura real é outra

O plano tem `371 Compras de Imobilizado` com **três ramos por tipo**, e o
último dígito é a **nacionalidade do fornecedor**:

```
371        Compras de Imobilizado
├── 3711   Corporeo
│   └── 37112 Não grupo → 371121 Nacionais · 371122 Estrangeiros
├── 3712   Incorporeo
│   └── 37122 Não grupo → 371221 Nacionais · 371222 Estrangeiros
└── 3713   Financeiro
    └── 37132 Não grupo → 371321 Nacionais · 371322 Estrangeiros
```

Comparando com o que foi indicado:

| Conta | Foi indicado | O plano diz |
|---|---|---|
| `371121` | compra de imobilizado corpóreo | Corpóreo · **Nacionais** ✅ |
| `371122` | investimento financeiro, forn. nacional | **Corpóreo · Estrangeiros** ❌ |
| `371321` | investimento financeiro, forn. estrangeiro | **Financeiro · Nacionais** ❌ |
| `371322` | imobilizado incorpóreo | **Financeiro · Estrangeiros** ❌ |

E as duas contas do **Incorpóreo** (`371221`, `371222`) não foram indicadas.

**A intenção parece certa** — tipo de imobilizado × nacionalidade do fornecedor
— e é exactamente o que o plano já modela, em 3 × 2. O que está trocado são os
códigos. A regra que o plano suporta é:

> `371` + (`1` Corpóreo | `2` Incorpóreo | `3` Financeiro) + `2` (não grupo)
> + (`1` Nacional | `2` Estrangeiro)

**Confirma que é esta a regra?** Se sim, avança sem mais perguntas.

#### B. Contas 141, 142, 143 — não são o destino

| Conta | Foi indicado | O plano diz |
|---|---|---|
| `141` | destino: Imobilizado Corpóreo | `14 IMOBILIZAÇÕES EM CURSO` → **`141 Obra em curso`** |
| `142` | destino: Imobilizado Incorpóreo | **`142 Obra em curso`** (mesmo nome) |
| `143` | destino: Investimento Financeiro | **NÃO EXISTE** |

A classe `14` é **«Imobilizações em curso»** — ou seja, é a conta **de origem**
do imobilizado em curso, não o destino. O destino são as classes que também
foram mencionadas no ponto 8:

```
11 IMOBILIZAÇÕES CORPÓREAS    111 Terrenos · 112 Edifícios · 113 Equipamento básico
                              114 Equipamento de carga · 115 Administrativo
                              116 Taras e vasilhame · 119 Outras
12 IMOBILIZAÇÕES INCORPÓREAS  121 Trespasses · 122 Investigação · 123 Propriedade
                              industrial · 124 Constituição · 129 Outras
13 INVESTIMENTOS FINANCEIROS  131 Subsidiárias · 132 Associadas · 133 Outras
                              134 Imóveis · 135 Fundos · 139 Outros
```

Todas as filhas de `11`, `12` e `13` são de **integração** — a conta de
movimento está um nível abaixo. Ou seja: **não há uma «conta 141» para onde
transferir**; há que escolher a subconta certa conforme a natureza do bem
(um terreno vai para `111…`, um edifício para `112…`).

**Perguntas, e não avanço sem resposta:**

1. `141`/`142` são as contas **em curso** (origem da transferência) — confirma?
2. O destino é escolhido **por quem fecha a ficha**, de entre as subcontas de
   `11`/`12`/`13`? Ou quer uma correspondência fixa por tipo?
3. Não existindo `143`, o investimento financeiro em curso acumula onde?

#### C, D, E — as três perguntas que o próprio pedido levanta

- **C.** A transferência gera o movimento contabilístico, ou só muda o estado?
- **D.** A amortização começa quando? (data do fecho, do 1.º item, outra?)
- **E.** Com condições especiais, qual é a regra de cálculo?

Ficam por responder. **Nada disto se implementa sem resposta.**

### O que PODE avançar em Imobilizados sem esperar

Estes não dependem das contas e são independentes entre si:

- **Ponto 6** — campo `tipo_imobilizado` (Corpóreo / Incorpóreo / Financeiro)
  na ficha. É informação da ficha; só a *conta automática* é que depende de A.
- **Ponto 10** — marca `não amortizável`, que a amortização passa a respeitar.
  Está isolado e não toca em contas.
- **Ponto 4** — fornecedor com categorias na ficha de imobilizado, assim que o
  ponto 2 existir.

---

## 14 a 19 — Classificação automática dos fluxos de caixa

### O que já existe

**Não há classificação automática nenhuma.** O `fluxo_codigo` de cada linha ou
é escrito à mão no lançamento, ou fica vazio.

`services/diferidos.py` **detecta** as linhas por classificar — origem
automática, conta de disponibilidades (`43` bancos, `45` caixa), sem
`fluxo_codigo` — e notifica a contabilidade. O ecrã `contabilidade/diferidos`
deixa classificá-las uma a uma.

Ou seja: a infra-estrutura de detecção já existe e **é o sítio certo** para
pendurar a classificação automática — antes de a linha ser dada como pendente.

### As rubricas de destino existem ✅

| Rubrica | Descrição |
|---|---|
| `1100` | Recebimento de Clientes |
| `1101` | Pagamentos a Fornecedores |
| `1102` | Pagamentos a Pessoal |
| `1200` | Juros |
| `1202` | Impostos |

### As classes verificadas — e uma armadilha

```
31 CLIENTES     311 correntes · 312 títulos a receber · 313 títulos descontados
                314 Compras-Embalagens          ← NÃO É CLIENTE
                316 Compras-Mat.Primas,Subsid.  ← NÃO É CLIENTE
                318 cobrança duvidosa · 319 saldos credores
32 FORNECEDORES 321 correntes · 322 títulos a pagar · 328 fac.em conferência
                329 saldos devedores
36 PESSOAL      361 remunerações · 362 participações · 363 adiantamentos
                369 outros
34 ESTADO       341 lucros · 342 produção/consumo · 343 rendimento trabalho
                344 circulação · 345 IVA · 346 crédito fiscal · 347 selo
                348 subsídios · 349 outros
```

**O ponto 18 tem razão, e há prova.** As contas `314 Compras-Embalagens` e
`316 Compras-Mat. Primas` vivem dentro da classe 31 (CLIENTES) e **não são
contas de cliente** — são de compras. Uma regra «toda a 31 é recebimento de
cliente» classificava-as mal.

Proposta: as regras do ponto 19 restringem-se às contas **correntes**, não à
classe inteira:

| Sentido | Contrapartida | Rubrica |
|---|---|---|
| Entrada no banco/caixa | `311…` (clientes correntes) | `1100` Recebimento de Clientes |
| Saída | `321…` (fornecedores correntes) | `1101` Pagamentos a Fornecedores |
| Saída | `361…` (pessoal-remunerações) | `1102` Pagamentos a Pessoal |

Fica de fora, deliberadamente: `312`/`313` (títulos), `318` (cobrança
duvidosa), `319`/`329` (saldos invertidos), `363` (adiantamentos a pessoal),
e toda a classe 34 — o ponto 16 já avisa que os juros e o Estado precisam de
decisão humana.

### ⚠️ A confirmar

**Restringir a `311`/`321`/`361` em vez de `31`/`32`/`36`** é mais estreito do
que o ponto 19 pede, e é de propósito: evita as contas de compras que estão
dentro da classe 31. Concorda? Se preferir a classe inteira, digo já que
classifica mal a `314` e a `316`.

Sobre o **Estado (34)**: só depois de dizer quais das nove sub-contas são
inequívocas é que proponho regras. Não invento.

---

# PARTE II — Onde se implementa cada coisa

| Ponto | Servidor | Ecrã |
|---|---|---|
| 1 | `services/notificacoes.py` (`listar`), `api/routers/notificacoes_router.py` | `app/(app)/notificacoes/page.tsx` |
| 2 | `services/compras.py` ou `logistica.py` (conta base), `compras_router.py` | novo `CriarFornecedorRapido.tsx`, usado em `components/logistica/FormularioCompra.tsx` |
| 3 | `services/comercial.py` (`conta_base_do_cliente`) | `components/comercial/CriarClienteRapido.tsx` |
| 4 | reutiliza o ponto 2 | ficha de imobilizado |
| 5–8, 12 | `db/models/imobilizados.py`, `services/imobilizados.py` | `app/(app)/imobilizados/` |
| 6, 9–11 | `db/models/imobilizados.py`, `services/imobilizados.py` | ficha de activo |
| 14–19 | `services/diferidos.py` (antes de marcar pendente) | `contabilidade/diferidos` |

---

# PARTE III — Ordem de trabalho

Faz-se um a um, e pela ordem em que se desbloqueiam:

1. **Ponto 3** — «Outros devedores» nos clientes. É acrescentar uma categoria a
   uma estrutura que já existe e está verificada.
2. **Ponto 2** — fornecedores com as três categorias, e a criação a partir do
   documento de compra.
3. **Ponto 1** — filtro por módulo nas notificações.
4. **Ponto 4** — fornecedor na ficha de imobilizado (depende do 2).
5. **Pontos 6 e 10** — tipo de imobilizado e não amortizável, que não dependem
   das contas por confirmar.
6. **Ponto 19** — as três regras automáticas de fluxo.
7. **Pontos 5, 7, 8, 9, 11, 12** — só depois das respostas a A, B, C, D, E.
