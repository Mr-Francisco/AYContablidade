# Requisitos — Assistente e Fiscalidade (15 de Agosto de 2026)

Continuação de `REQUISITOS_RH_E_UX_2026-08-15.md`.

| # | Ponto | Estado |
|---|-------|--------|
| A | [Assistente — histórico na lateral](#a-assistente--o-histórico-sai-da-conversa) | ✅ feito |
| B | [Botão «+» de acesso rápido, em TODOS os ecrãs](#b-botão--de-acesso-rápido) | ✅ feito |
| C | [O azul do Piloto, recuperado](#c-o-azul-do-piloto) | ✅ feito |
| D | [Mapa de Remunerações igual ao Piloto](#d-mapa-de-remunerações) | ✅ feito |
| E | [Calendário Fiscal — layout](#e-calendário-fiscal) | ✅ feito |
| F | [Catálogo de Impostos — layout](#f-catálogo-de-impostos) | ✅ feito |

---

## A. Assistente — o histórico sai da conversa

**Antes:** as vinte perguntas anteriores eram despejadas por cima da caixa de
escrita. Abrir a página dava um ecrã de coisas antigas para rolar antes de
chegar à pergunta que se ia fazer.

**Agora:**

- **Coluna à esquerda, só com o histórico.** Uma linha por conversa, com o
  título (a pergunta) e a hora, **agrupadas por dia** — «Hoje», «Ontem»,
  «Há 3 dias», e depois a data por extenso. É como se procura uma conversa
  antiga: «foi na terça».
- **A conversa activa distingue-se** por barra à esquerda, fundo da marca e
  `aria-current` — para quem lê o ecrã com leitor de ecrã, e não só para quem o vê.
- **Ao centro, uma conversa e só uma**: a escolhida na lateral, ou a que está a
  decorrer. «Nova conversa» limpa o centro sem apagar nada.
- **O scroll é da coluna**, não da página — regra do projecto.
- **Em ecrã pequeno** a coluna não cabe: passa a um botão «Abrir o histórico de
  conversas» que a mostra num diálogo. Nada desaparece.

Não se inventou um conceito de «sessão» que o servidor não tem: cada pergunta é
respondida por si só — é o que a nota ao fundo do ecrã diz — e por isso cada
pergunta é uma conversa. **O backend não foi tocado.**

## B. Botão «+» de acesso rápido

Canto inferior direito, em **todos os ecrãs de trabalho** — vive no
`app/(app)/layout.tsx`, não em cada página. Abre a lista dos módulos e das
páginas, agrupada por módulo.

**Só o que o utilizador pode abrir.** A lista não é uma segunda cópia das
permissões: veio de `useNavegacaoVisivel` (`lib/navegacaoVisivel.ts`), que é a
mesma função que decide o que a barra de topo mostra. Se um módulo não está na
barra, não está aqui — e não há forma de divergirem.

Confirmado com `contab@demo.ao`: aparecem Contabilidade, Analítica, Contas
Correntes, Imobilizados, Fiscalidade e Assistente. Não aparecem Comercial,
Logística nem RH.

Não se imprime (`sem-imprimir`).

## C. O azul do Piloto

O Piloto usa `#0b3d91 → #3d7fe0` nos **dois** temas — é o azul que identifica o
produto. A Produção tinha, no tema escuro, `#16264a → #2b5da8`, que lê como
cinzento azulado e não como a marca.

Passa a `#0e46a0 → #4a86e8`: a mesma família do Piloto, um passo mais claro para
não afundar no fundo escuro, sem chegar ao lavado. **O tema claro fica exactamente
como o Piloto** — não havia nada a corrigir lá.

Só o token mudou; nenhum componente foi alterado por causa da cor.

---

## D. Mapa de Remunerações
## E. Calendário Fiscal
## F. Catálogo de Impostos

✅ **Feitos**, e escritos ao pormenor em
[`REQUISITOS_FISCALIDADE_2026-08-15.md`](REQUISITOS_FISCALIDADE_2026-08-15.md)
— o mapa com os cabeçalhos de grupo coloridos e as catorze colunas do Piloto,
o scroll horizontal no componente e não na página, o diálogo «✎ Rubricas», o
`.xlsx` a preencher o modelo oficial da AGT, e o calendário e o catálogo
refeitos. Ficam aqui só para a lista deste dia estar completa; a descrição não
se repete para não haver dois sítios a dizer a mesma coisa e a divergirem.

---

## Método

Por ponto: ver o que existe na Produção, ver como funciona no Piloto,
identificar a diferença, implementar, testar no browser, confirmar que não há
regressões, seguir.
