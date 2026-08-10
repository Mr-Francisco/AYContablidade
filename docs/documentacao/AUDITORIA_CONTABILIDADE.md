# Auditoria funcional — módulo Contabilidade

Comparação página a página entre `Piloto/` e `Producao/`, feita com o Piloto **a
correr no browser** (`localhost:4173`) e com leitura do HTML, CSS e JavaScript.

Levantado em 2026-08-10. Actualizado à medida que as diferenças se fecham.

Legenda: ✅ feito · 🔧 em curso · ❌ por fazer

---

## 0. Transversal ao módulo

| O que | Piloto | Produção | Estado |
|---|---|---|---|
| Ribbon com ícones | 74 px, ícone 22 px por cima do rótulo, rótulo de secção com traço, separadores | Só texto | ✅ 36 ícones portados de `ICO` |
| Explorador | `contabilidade.html` — índice do módulo | Não existia | ✅ criado |
| Atalhos de teclado | **F4**, **Escape**, **Enter**, **duplo clique**. Não há F2 nem combinações | Nenhum | ✅ F4/Esc/Enter · ❌ duplo clique nos mapas |

---

## 1. Painel Contabilístico ❌

`painel-contabilidade.html` → `AY.dash.render("contabilidade")`

| Elemento | Piloto | Produção |
|---|---|---|
| Faixa (hero) | `Contabilidade · PGC-Angola` / **Painel Contabilístico** / «Posição financeira e resultado do exercício em tempo real.» + 3 valores inline | Cabeçalho simples «Visão geral do exercício» |
| KPI 1 | Total do Activo · `Balanço equilibrado ✓` | Proveitos |
| KPI 2 | Capital Próprio · `Passivo {x}` | Custos |
| KPI 3 | Resultado Líquido · `Lucro`/`Prejuízo` | Resultado |
| KPI 4 | Lançamentos (contagem) · `Movimentado {x}` | Total do Activo |
| Donut | **Composição do Activo** — Imobilizado, Existências, Contas a Receber, Disponibilidades; total ao centro | Não existe |
| Lista | **Últimos Lançamentos** — 6 entradas: `nºOp · descrição` / `data · Diário X` / valor | Não existe |
| Barras 1 | **Resultado do Exercício** — Proveitos, Custos, Resultado · «Proveitos − Custos» | Não existe |
| Barras 2 | **Estrutura Financeira** — Activo, Capital Próprio, Passivo · «Activo = CP + Passivo» | Não existe |
| Selector de exercício | Não tem (usa o activo) | Tem |

**Nota:** o painel actual da Produção estava mais próximo do *Explorador* do
Piloto do que do *Painel*. Com o Explorador criado à parte, `/contabilidade`
fica livre para ser o Painel Contabilístico.

---

## 2. Movimentos 🔧

`movimentos.html` — a página mais usada do sistema.

| Elemento | Piloto | Produção |
|---|---|---|
| Estrutura | **Editor em página**: barra de acções + lista à esquerda + editor à direita | Lista + **modal** |
| Barra | `Gravar` `Novo` `Eliminar` `Integrar` (só em diferidos) + **selo de estado** à direita | Só «Novo movimento» |
| Selo de estado | Por ordem: `⚠ Indica o diário` → `⚠ Indica o documento` → `⚠ Indica o fluxo da conta X` → `vazio` → `✓ equilibrado` → `✗ diferença N` | Não existe |
| Gravar desactivado | Sim, com `title` a dizer porquê | Não |
| Lista | Filtro diário + pesquisa + «Só diferidos»; item com nºOp, data, diário, descrição, valor | ✅ construída |
| Data | Ano + **grelha Mês 0–15 / Dia 1–31** | `<input type="date">` |
| Campo Lançamento | Nº de operação, ou `(automático)` | Não existe |
| Diário | Código + nome ao lado | Dropdown |
| Separadores | **Geral · Centros de Custo · Fluxos Caixa** | Não existem |
| Colunas da grelha | Conta, Débito, Crédito, **IVA %**, **% n/Ded.**, **IVA Autoliq.**, **T. Entidade**, Entidade, **Moeda**, **Câmbio**, Descrição, ✕ | Conta, Descrição, Entidade, Centro, Débito, Crédito |
| Totais / Diferença | Duas linhas no rodapé da grelha | Existe |
| `Enter` na grelha | Avança de célula; no fim cria linha e foca a conta | Não |
| Auto-equilíbrio | Ao chegar a uma célula de valor vazia, preenche o que falta | Não |
| Documento pré-preenche | Contas débito/crédito por omissão + descrição | Não |
| Conta inexistente ao gravar | Abre o diálogo de criação e **retoma a gravação** | ✅ diálogo (falta retomar) |
| Fluxo obrigatório 43/45 | Bloqueia a gravação | Não |
| Sugestão de imobilizado | Débito em 11x/12x oferece abrir a Ficha de Activos | Não |
| Editar movimento | Sim, qualquer um | **Não havia rota.** Criada `actualizar` |
| Novo() preserva | Diário e documento do anterior | — |

**Decisão aprovada:** editar só `origem == "manual"`. Nos outros o botão fica
visível e desactivado, a dizer de onde vem o movimento — na Produção há tabelas
(vendas, compras, salários, amortizações) que guardam o `lancamento_id`, e
editar à mão deixaria o documento de origem a discordar da contabilidade.

---

## 3. Plano de Contas ❌

| Elemento | Piloto | Produção |
|---|---|---|
| Apresentação | **Árvore** (classes → integradoras → subcontas) com `▸`/`▾` | Lista plana |
| `⊞` / `⊟` | Expandir e colapsar tudo | Não existe |
| Filtro Natureza | Sim | Não |
| Importar (Primavera) | Botão + diálogo | Não (a rota existe) |
| `+ Sub` por linha | Criar subconta a partir da linha | Existe (noutro sítio) |
| Duplo clique | Abre/fecha o nó | Não |
| F4 nos campos Conta / Conta Alternativa | Sim, com botão `F4` visível | Não |

---

## 4. Balancete Geral ❌ — o mapa central

| Elemento | Piloto | Produção |
|---|---|---|
| Modelo | **Primavera**: cabeçalho de duas linhas, `Anterior ×3 · Período ×3 · Acumulado ×3` (Débito, Crédito, Saldo) | Uma só coluna de cada |
| Filtro `Análise` | Anterior / Período / Acumulado — escolhe os grupos a mostrar | Não existe |
| `De` / `Até` por data | Sim | Não |
| `De conta` / `Até conta` | Intervalo de contas | Não |
| `Grau de detalhe` | Limita o nível da conta | Não |
| Sub Totais por classe | `Sub Total 11`, `Sub Total 21`… | Não |
| `Limpar filtro` | Sim | Não |
| **Duplo clique → extracto** | Sim | Não |
| Atualizar / CSV / Imprimir | Sim | CSV e Imprimir sim |

**Backend:** `svc.balancete` aceita `de`, `ate`, `ate_mes` mas **não** calcula
saldos anteriores nem acumulados. As três colunas exigem trabalho de serviço,
não só de interface.

---

## 5. Balancete do Razão ❌

Falta `Modo` (análise) e `Grau`. O resto está.

## 6. Balanço ✅ (com nota)

O Piloto só filtra por exercício; a Produção acrescenta «Até ao período». É a
mais, não a menos — fica.

## 7. Result. e Outros ❌

Falta o **apuramento de resultados**: `🧮 Apurar Resultados do Exercício`,
`↺ Reabrir apuramento`, `Ver lançamento`, e o campo `Data de apuramento`.
As rotas existem (`/api/apuramentos/resultados`).

## 8. Notas ✅

Editar, Guardar e `↺ Repor automático` — todos presentes, o último já com
confirmação.

## 9. Fluxos de Caixa ✅

## 10. Apuramento do IVA ❌

Falta `⚙️ Apurar e lançar`. A rota existe.

## 11. Retenções na Fonte ✅

## 12. Extratos ❌

Falta o **F4** no campo Conta (com botão visível) e o **checkbox «incluir
subcontas»**.

## 13. Razão ❌

Falta o **checkbox «incluir subcontas»**.

## 14. Diários ✅

Novo, Editar, Eliminar, **Gerir fechos** — todos feitos.

## 15. Documentos ❌

Falta o **F4** nos campos Conta Débito / Conta Crédito.

## 16. Explorador ✅

---

## Resumo do que falta

**Grande (serviço + interface):**
1. Balancete Modelo Primavera — 3 grupos de colunas, subtotais, intervalos.
2. Movimentos — editor em página, 11 colunas, 3 separadores, `Enter`, auto-equilíbrio.
3. Plano de Contas em árvore.
4. Painel Contabilístico.

**Médio (só interface, rotas existem):**
5. Apuramento de resultados e de IVA — botões.
6. Duplo clique → extracto em balancete, balancete-razão e contas correntes.
7. Checkbox «incluir subcontas» em extracto e razão.
8. F4 em extracto, plano de contas e documentos.
9. Importar plano (Primavera).
