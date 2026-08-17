# Correcções pedidas — 16 de Agosto de 2026

Onze pontos, com a mesma regra em todos: **a lógica contabilística não muda**,
reutiliza-se o que existe, e o que for regra de negócio corrige-se no servidor
e não só no ecrã.

| # | Ponto | Estado |
|---|-------|--------|
| 1 | [Datas iguais em toda a Contabilidade](#1-datas-iguais-em-toda-a-contabilidade) | ✅ feito |
| 2 | [Criar conta a partir do Movimento](#2-criar-conta-onde-se-escreve-uma-conta) | ✅ feito |
| 3 | [Carrossel: logótipo primeiro](#3-carrossel-o-logótipo-primeiro) | ✅ feito |
| 4 | [Números legíveis — `1 000 000`](#4-números-legíveis) | ✅ feito |
| 5 | [Movimento: equilíbrio antes de nova linha](#5-movimento-equilíbrio-antes-de-nova-linha) | ✅ feito |
| 6 | [Plano de Contas: alinhamento](#6-plano-de-contas-alinhamento) | ✅ feito |
| 7 | [Notas com IA — análise de viabilidade](#7-notas-com-ia--análise-antes-de-implementar) | ✅ análise feita |
| 8 | [RH: campos obrigatórios a sério](#8-rh--campos-obrigatórios-a-sério) | ✅ feito |
| 9 | [Subsídio de férias em percentagem](#9-subsídio-de-férias-em-percentagem) | ✅ feito |
| 10 | [Bancos vêm do sistema](#10-bancos-vêm-do-sistema) | ✅ feito |
| 11 | [Imobilizado: criar contas](#11-imobilizado-criar-contas) | ✅ feito |

---

## 1. Datas iguais em toda a Contabilidade

A regra central é a do Movimento: **período 00–15** (00 abertura, 01–12 meses,
13 regularizações, 14 e 15 apuramentos) e o dia limitado aos dias reais do mês.

O que está errado hoje: cada ecrã escreve a sua versão do mesmo selector. Uns
dizem «Até ao mês», outros «Período», outros «Mês»; uns separam com `·`, outros
com `—`; a opção de «todos» chama-se «Todos (15 · Resultado Líquido)» num sítio
e «Todo o exercício» noutro. É o mesmo conceito com três aspectos.

Fazer: um selector de período partilhado, e os intervalos De/Até limitados ao
exercício escolhido.

## 2. Criar conta onde se escreve uma conta

Já existe — `CampoConta` detecta o código inexistente e oferece «criar», e o
diálogo `CriarContaEmFalta` cria-a sem sair do ecrã. **Só que só está ligado no
Movimento.** Nos Imobilizados, nas Configurações, nos Documentos e no Extrato o
mesmo campo diz «conta inexistente» e não oferece nada.

Fazer: ligar o mesmo fluxo em todos os sítios que usam `CampoConta`, com a
conta a ficar disponível imediatamente.

## 3. Carrossel: o logótipo primeiro

Trocar a ordem dos dois painéis do painel inicial: identidade primeiro,
indicadores a seguir.

## 4. Números legíveis

`1000000` → `1 000 000`. Os valores monetários já o fazem (`lib/dinheiro.ts`,
com espaço fino). Faltam os **inteiros** — tokens, contagens — que ainda usam
`toLocaleString("pt-PT")` e saem com pontos: `1.000.000`.

Fazer: um `formataInteiro` com o mesmo agrupamento, e usá-lo onde há números
crus. Não muda nenhum valor guardado.

## 5. Movimento: equilíbrio antes de nova linha

Antes de acrescentar uma linha nova, se o débito e o crédito já estiverem
iguais e o documento tiver conteúdo, perguntar se quer gravar. Se sim, grava;
se não, fica no documento a editar. **As validações actuais mantêm-se.**

## 6. Plano de Contas: alinhamento

Tirar a indentação por nível (`paddingLeft: nivel * 16`). Os códigos ficam
todos alinhados à esquerda, como no Balancete Geral. A hierarquia continua a
ler-se pelo próprio código (`11`, `111`, `1111`) e pelo peso do texto.

## 7. Notas com IA — análise antes de implementar

Pedido explícito: **avaliar** antes de fazer. Duas hipóteses — gerar o texto da
nota, e explicar uma nota já escrita. A análise está em
[NOTAS_COM_IA.md](NOTAS_COM_IA.md).

## 8. RH — campos obrigatórios a sério

Obrigatórios: NIF, nome, INSS (nº de Segurança Social), província, salário
base, morada, localidade e município. **No formulário e no servidor.**

## 9. Subsídio de férias em percentagem

Sem separador novo. No campo que já existe, poder escolher entre **valor fixo**
(o que existe hoje) e **percentagem do salário base**.

## 10. Bancos vêm do sistema

Não há tabela de bancos, e não se cria uma: os bancos **são contas do plano**,
sob `43 — Bancos` (PGC-AR). O campo passa a sugerir as que existem, deixando
escrever um banco que ainda não esteja lá.

## 11. Imobilizado: criar contas

O mesmo do ponto 2, com a validação própria do módulo: a conta tem de poder
receber lançamentos, e o motivo aparece explicado quando não puder.
