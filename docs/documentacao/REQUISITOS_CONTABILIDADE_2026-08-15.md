# Requisitos — intervenção de 15 de Agosto de 2026

Pedido único, com imagens de referência. **O Piloto é a referência funcional**:
«como no Piloto» significa layout + comportamento + estados + filtros +
carregamento + interacções + atalhos + estrutura, e não só a aparência.

Este ficheiro existe para nenhum ponto se perder. Cada um tem: o que se pediu,
o que se encontrou, o que se fez e como se confirma.

| # | Ponto | Estado |
|---|-------|--------|
| 1 | Diário — pesquisa e paginação | ✅ feito |
| 2 | Plano de Contas — pesquisa inline no Código | ✅ feito |
| 3 | Cabeçalho de módulo mais estreito | ✅ feito |
| 4 a 11 | Ecrãs que «não carregavam» | ✅ feito — causa única, ver abaixo |
| 12 | Extractos — F4 e ordem dos campos | ✅ feito |
| 13 | Razão — estado inicial e carregamento | ✅ feito |
| 14 | Diário — aviso de fecho e tabela | ✅ feito |

---

## O que se encontrou nos pontos 4 a 11 — uma causa só

**Não havia avaria nenhuma no carregamento.** Todas as rotas foram chamadas
com os parâmetros exactos que os ecrãs usam, nas três empresas da base, e
responderam 200 com dados.

O que havia era isto: dez ecrãs mostravam a mesma frase — «Não foi possível
carregar X» — sempre que o pedido não devolvesse dados. Só que o servidor
**responde e explica**:

| Situação | O que o servidor diz | O que o ecrã dizia |
|---|---|---|
| Sessão expirada (401) | «Sessão inválida ou expirada» | «Não foi possível carregar» |
| Conta de plataforma (400) | «O superadmin da plataforma não está associado a nenhuma empresa» | «Não foi possível carregar» |
| Sem permissão (403) | a capacidade que falta | «Não foi possível carregar» |
| Licença caducada (402) | «A licença não está activa ou expirou» | «Não foi possível carregar» |
| **Empresa nova, sem movimentos** | 200, mapa vazio | «Não foi possível carregar» ← e nem erro era |

Confirmado por medição: entrando como `super@plataforma.ao`, as NOVE rotas
respondem 400 com a frase certa, e os nove ecrãs escondiam-na.

O balancete tinha ainda um caso próprio: a condição era `!data || !total`. Um
período sem lançamentos não tem total, e o ecrã dava erro por não haver
movimentos — que é o estado normal de uma empresa no primeiro dia.

**Correcção:** `components/ui/FalhaAoCarregar.tsx`, usado pelos dez ecrãs.
Mostra a razão verdadeira, distingue o vazio do erro (azul e não vermelho), e
no caso da sessão caída dá o botão para voltar a entrar.

---

## 1. Diário — pesquisa e paginação

- Campo de pesquisa no Diário da Contabilidade.
- Na área lateral de Movimentos: **10 por página**, começando pelos 10 mais
  recentes. Nada de lista infinita.
- Paginação, e a pesquisa tem de a respeitar.

## 2. Plano de Contas — pesquisa inline no Código

Pesquisa inline no próprio campo **Código**, se der para o fazer sem prejudicar
o componente. Manter comportamento e estrutura existentes.

## 3. Cabeçalho de módulo mais estreito

Reduzir ligeiramente a largura de cada cabeçalho de módulo para a navegação
caber num ecrã de PC **sem scroll horizontal**. Não remover elementos nem mudar
a identidade visual.

## 4. Balancete Geral

Produção: «Não foi possível carregar o balancete.» Corrigir e deixar como o
Piloto — visual e comportamento.

## 5. Balancete do Razão

Produção: «Não foi possível carregar o balancete do razão.» Mesmo
comportamento do Piloto, incluindo como os dados são carregados.

## 6. Balanço — ✅ aceite, com uma verificação adiada

Estrutura, comportamento e apresentação conferidos contra o Piloto e a imagem:
Activo à esquerda, Capital Próprio e Passivo à direita, com os números de nota,
o selo «Equilibrado» e o filtro de período.

**POR VERIFICAR — a coluna do exercício anterior.** A base tem hoje UM
exercício por empresa, por isso essa coluna aparece a «—», tanto na Produção
como na imagem de referência. Não se criaram dados fictícios só para a ver
preenchida: um comparativo inventado não prova nada e fica na base a estorvar.

Quando existir uma empresa com dois exercícios, confirmar:
- a coluna do ano anterior traz os valores do exercício imediatamente anterior;
- as linhas sem correspondência no ano anterior ficam a «—» e não a zero —
  «0,00» diz que houve movimento nulo, «—» diz que não havia exercício;
- o total do ano anterior fecha com o balanço desse ano.

## 7. Resultados

Produção: «Não foi possível carregar a demonstração.»

## 8. Notas

Produção: «Não foi possível carregar as notas.»

## 9. Fluxos de Caixa

Produção: «Não foi possível carregar os fluxos de caixa.» Layout e
comportamento da imagem e do Piloto.

## 10. Apuramento do IVA

Produção: «Não foi possível carregar o apuramento.»

## 11. Retenções na Fonte

Produção: «Não foi possível carregar as retenções.»

## 12. Extractos — F4 e ordem dos campos

- O **F4** existe no Piloto e não existe na Produção. Repor exactamente o
  comportamento do Piloto.
- Os campos estão desorganizados: reordenar como no Piloto e como na imagem.

## 13. Razão — estado inicial e carregamento

O ponto mais importante. No Piloto, ao abrir a Razão o cabeçalho já vem com a
opção seleccionada e os dados carregados. Replicar o fluxo completo: selecção,
carregamento, filtros, dados, estado inicial, comportamento do cabeçalho,
interacção e navegação.

## 14. Diário — aviso de fecho e tabela

- Mostrar: «Podes fechar um diário num mês/período concreto (do exercício
  acima) — deixa de aceitar novos lançamentos nesse diário + período até ser
  reaberto.» Apresentado de forma profissional, como no Piloto.
- Melhorar a tabela do Diário: mais profissional, organizada e coerente com o
  desenho existente, **sem alterar a lógica contabilística**.

---

## Método exigido, por ponto

1. verificar o que já existe na Produção;
2. verificar como funciona no Piloto;
3. identificar a diferença;
4. implementar;
5. testar;
6. confirmar que não há regressões;
7. seguir para o ponto seguinte, sem parar a pedir autorização.

Só parar perante uma decisão de negócio que não esteja definida acima.
