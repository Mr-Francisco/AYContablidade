# Fase 2 — reestruturação de comportamento, ecrã inicial e licenças

**Não é uma reescrita da lógica de negócio.** As regras contabilísticas, os
cálculos de IRT e INSS, o apuramento de IVA e as amortizações ficam como estão
— foram migrados do Piloto e estão cobertos por 498 testes. O que se
reestrutura é **como o sistema se comporta com quem o usa**.

Aberto em 16 de Agosto de 2026, depois de a V1 de teste estar no ar.

---

## O que fica desta fase (ponto de partida)

| | Estado |
|---|---|
| Backend | 498 testes a passar |
| Frontend | build de produção limpo |
| No ar | frontend e API no Render, base no Neon (Frankfurt, PG 18) |
| Consulta de NIF à AGT | feita — botão em clientes, fornecedores, colaboradores, independentes e licenças |
| Metadados, ícones, Open Graph, manifesto | feitos |
| Cabeçalho recolhível, acesso rápido «+» | feitos |

---

## 1. Ecrã inicial

O que está: um carrossel de dois painéis — indicadores e identidade — que ocupa
o ecrã e não deixa a página crescer.

A rever, com o utilizador:

- **O que a primeira coisa vista deve responder.** Hoje responde «como está a
  empresa». Podia responder «o que tenho de fazer hoje» — que é a pergunta com
  que se abre um ERP de manhã.
- **Se o painel de identidade merece metade do carrossel** ou se é matéria de
  uma página institucional.
- **Atalhos ao que se usa mesmo**, em vez de uma grelha de módulos igual para
  toda a gente: quem lança movimentos abre Movimentos vinte vezes por dia.
- **O que fazer numa empresa acabada de criar** — hoje o painel de uma empresa
  sem dados mostra zeros, que é honesto mas não ajuda ninguém a começar.

## 2. Comportamento e UX, transversal

Pontos já identificados no caminho até aqui:

- **Estados vazios que ensinam.** Vários ecrãs dizem «Ainda não há registos».
  O que falta é dizer o passo seguinte e ter o botão que o faz.
- **Erros que já dizem o motivo, mas nem sempre o caminho.** A regra dos botões
  bloqueados está aplicada; falta a mesma exigência nos avisos de ecrã.
- **Confirmações desiguais.** Uns sítios confirmam com diálogo, outros não.
  Decidir a regra: o que se confirma, o que se desfaz.
- **Consistência das listagens.** A regra de paginação está escrita e aplicada,
  mas três ecrãs liam como lista o que vem paginado — sinal de que a regra
  precisa de uma verificação automática e não só de disciplina.
- **Retorno de acção.** Gravar, processar e lançar nem sempre dizem o que
  aconteceu a seguir.

## 3. Gestão de licenças

A área que mais cresceu por acumulação e menos foi desenhada de uma vez.

O que existe: gerar licença (chave mostrada uma vez, NIF e nome gravados),
activar (cria empresa + administrador + plano de contas), listar com filtro e
paginação, editar, revogar, suspender/reactivar/cancelar empresas, contas da
plataforma, consumo de IA por empresa.

A tratar:

- **O ciclo de vida visto de uma vez** — emitida → activada → em vigor → a
  expirar → expirada → renovada. Hoje lê-se em três ecrãs diferentes.
- **Renovação.** Não existe: uma licença que chega ao fim obriga a emitir
  outra, e a empresa fica com duas na lista sem ligação entre elas.
- **Avisar antes de expirar.** Quem tem a licença a acabar devia sabê-lo com
  antecedência, dentro do sistema.
- **Planos e módulos.** Os módulos incluídos são uma lista escolhida à mão em
  cada licença; deviam vir de planos definidos uma vez.
- **Limites com consequência visível.** Utilizadores e tokens têm limite; o que
  acontece ao atingi-lo tem de ser previsível e explicado a quem bate nele.
- **A conta da plataforma vista pela empresa** — o que a empresa vê da sua
  própria licença é hoje quase nada.

---

## Método (o mesmo que trouxe até aqui)

Por ponto: ver o que existe na Produção, ver como funciona no Piloto quando lá
existe, identificar a diferença, implementar, **medir no browser**, confirmar
que não há regressões, seguir. Só parar perante uma decisão de negócio que não
esteja escrita.

E o que esta fase acrescenta ao método: **cada regra transversal que se decida
passa a ter uma verificação automática**. A regra das listagens estava escrita
no `CLAUDE.md` e mesmo assim três ecrãs divergiram — uma regra sem teste é uma
intenção.
