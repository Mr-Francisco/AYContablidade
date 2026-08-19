# Pendentes de Contabilidade — obrigatórios

Cinco pontos indicados pelo cliente em 18 de Agosto de 2026. **São
obrigatórios.** Ficam aqui para não se perderem, com o estado de cada um.

---

## 1. Duplo clique numa linha do extracto não abre o movimento

**O que se pede:** no Extracto de conta, dar duplo clique numa linha de
operação deve levar ao movimento que a originou.

**Estado:** por fazer.

---

## 2. Movimento gerado em Vendas não permite alteração na Contabilidade

**O que se pede:** um lançamento que nasceu de uma venda tem de poder ser
alterado na Contabilidade.

**Estado:** por fazer.

**Nota técnica:** hoje o `EditorLancamento` bloqueia estes lançamentos —
mostra «gerado automaticamente, só se altera no documento que o originou».
A regra vai mudar; ver o que fica na secção do desenho.

---

## 3. Facturas do mesmo período podem ser eliminadas sem nota de crédito

**O que se pede:** dentro do **mesmo período**, eliminar uma factura não
obriga a emitir nota de crédito.

**Estado:** por fazer.

---

## 4. A nota de crédito é obrigatória ao anular documentos de período diferente

**O que se pede:** a obrigatoriedade da nota de crédito surge **quando o
documento a anular é de um período diferente** do actual.

**Estado:** por fazer.

**3 e 4 são a mesma regra, vista dos dois lados:**

| Documento a anular | O que acontece |
|---|---|
| Do período **actual** | Pode ser eliminado. Sem nota de crédito. |
| De período **anterior** | Não se elimina. Anula-se com **nota de crédito**. |

A razão é contabilística e não informática: um período já encerrado ou já
declarado não se reescreve — corrige-se com um documento novo que deixe rasto.

---

## 5. Movimentos automáticos e o fluxo de caixa por indicar

**O que se pede:** cada factura, recebimento ou recibo continua a gerar o
movimento automaticamente, **como já acontece**. Mas:

- a Contabilidade passa a ter uma **aba de diferidos**;
- a Contabilidade é **notificada** de que aquele movimento está pendente de
  indicação de fluxo de caixa.

**Estado:** por fazer.

**Nota técnica:** o conceito já existe no modelo — `Lancamento.diferido`
(«pendente de integração: não entra em balancete, razão, extracto, fluxos,
apuramentos nem contas correntes até ser integrado») e `LancamentoLinha`
tem `fluxo_codigo`. O que falta é o ecrã, a notificação e a ligação entre os
dois.

---

## Ordem de trabalho

1. **3 e 4** primeiro — é a regra de negócio, e as outras dependem de saber o
   que acontece a um documento anulado.
2. **5** — a aba de diferidos e a notificação.
3. **2** — alterar um lançamento vindo de vendas, com o cuidado de não deixar a
   contabilidade a contradizer o documento.
4. **1** — o duplo clique, que é o mais simples e o mais visível.
