# Pendentes de Contabilidade — obrigatórios

Cinco pontos indicados pelo cliente em 18 de Agosto de 2026. **São
obrigatórios.** Ficam aqui para não se perderem, com o estado de cada um.

---

## 1. Duplo clique numa linha do extracto não abre o movimento

**O que se pede:** no Extracto de conta, dar duplo clique numa linha de
operação deve levar ao movimento que a originou.

**Estado: FEITO.** Duplo clique e não clique simples: no extracto percorre-se a
lista a ler, e um clique a navegar tirava a pessoa da página a cada engano.
Usa a mesma convenção que já existia — `/contabilidade/movimentos?id=…`.

---

## 2. Movimento gerado em Vendas não permite alteração na Contabilidade

**O que se pede:** um lançamento que nasceu de uma venda tem de poder ser
alterado na Contabilidade.

**Estado: FEITO**, com uma fronteira.

**Corrige-se a classificação; não se muda o valor.** Contas, centros de custo,
rubricas de fluxo e descritivos passam a ser editáveis. O total de débitos e
créditos não: o documento foi entregue ao cliente e à AGT, e a contabilidade a
dizer outro número seria uma divergência sem nada a assinalá-la. Para mudar o
valor, muda-se o documento — e a mensagem diz onde.

A comparação é sobre os TOTAIS e não linha a linha, de propósito: dividir uma
linha em duas — por centros de custo diferentes, por exemplo — é uma
reclassificação legítima e não muda o valor de nada.

---

## 3. Facturas do mesmo período podem ser eliminadas sem nota de crédito

**O que se pede:** dentro do **mesmo período**, eliminar uma factura não
obriga a emitir nota de crédito.

**Estado: FEITO** — com um ajuste, explicado abaixo.

---

## 4. A nota de crédito é obrigatória ao anular documentos de período diferente

**O que se pede:** a obrigatoriedade da nota de crédito surge **quando o
documento a anular é de um período diferente** do actual.

**Estado: FEITO.**

**3 e 4 são a mesma regra, vista dos dois lados:**

| Documento a anular | O que acontece |
|---|---|
| Do período **actual** | Pode ser eliminado. Sem nota de crédito. |
| De período **anterior** | Não se elimina. Anula-se com **nota de crédito**. |

A razão é contabilística e não informática: um período já encerrado ou já
declarado não se reescreve — corrige-se com um documento novo que deixe rasto.

### O ajuste, e porque foi preciso

Pediu-se **eliminar**; faz-se **anular mantendo o número**. Um documento
emitido não se pode apagar, e não é uma limitação nossa:

1. o número vem de uma série e a lei (DP 71/25, art. 10.º b) exige numeração
   **sequencial sem falhas** — apagar deixa um salto que a AGT vê;
2. cada documento leva o **resumo do anterior** da mesma série, e apagar um
   pelo meio **parte a cadeia** — que é exactamente o que essa cadeia existe
   para tornar detectável.

O efeito para quem trabalha é o que se pediu: desfazer sem papelada e sem nota
de crédito. O que muda é que fica prova de que se desfez. No SAF-T o documento
vai com `InvoiceStatus = A`, que é o estado que a própria norma prevê.

### E a contabilidade

O lançamento que a emissão criou é **revertido com um lançamento de sentido
contrário**, não apagado. Apagar deixava o balancete certo e o histórico a
mentir; o contrário deixa os dois certos e deixa rasto.

**Onde está:** `backend/src/services/comercial_anulacao.py`, rotas
`POST /api/comercial/vendas/{id}/anular` e `GET …/pode-anular` — esta última
existe para o ecrã poder dizer o que vai acontecer antes de se carregar no
botão. Cobertura em `tests/test_anulacao_documentos.py` (9 testes).

**O botão** está no detalhe de uma factura, em Comercial → Consulta de facturas. Antes de perguntar o motivo, o diálogo pergunta ao servidor se o documento pode ser anulado — para dizer o que vai acontecer em vez de mostrar um erro depois de a pessoa decidir.

---

## 5. Movimentos automáticos e o fluxo de caixa por indicar

**O que se pede:** cada factura, recebimento ou recibo continua a gerar o
movimento automaticamente, **como já acontece**. Mas:

- a Contabilidade passa a ter uma **aba de diferidos**;
- a Contabilidade é **notificada** de que aquele movimento está pendente de
  indicação de fluxo de caixa.

**Estado: FEITO.**

**Porque é que isto importa**, e não é arrumação: a Demonstração de Fluxos de
Caixa é construída a partir da rubrica de cada linha que passa por caixa ou por
banco. Uma linha sem ela **não desaparece do balancete** — o dinheiro está lá —
mas **desaparece da demonstração**: o mapa fecha com um total que não bate com
a tesouraria real, e quem o lê não tem como saber o que ficou de fora.

O sistema não classifica sozinho e não deve adivinhar: o mesmo recebimento pode
ser operacional ou de financiamento conforme o que está por trás. O que garante
é que não se esquece.

**Onde está:** `backend/src/services/diferidos.py`, ecrã em
Contabilidade → Diferidos, ao lado dos Fluxos de Caixa — é o que falta
preencher para aquele mapa estar completo. Classifica-se na própria linha, sem
abrir o movimento. Cobertura em `tests/test_diferidos.py` (14 testes).

**O aviso é um só**, actualizado, e não um por documento: dez facturas com o
mesmo problema são um problema, não dez avisos. Desaparece sozinho quando a
última linha for classificada.

**Nota técnica:** o conceito já existe no modelo — `Lancamento.diferido`
(«pendente de integração: não entra em balancete, razão, extracto, fluxos,
apuramentos nem contas correntes até ser integrado») e `LancamentoLinha`
tem `fluxo_codigo`. O que falta é o ecrã, a notificação e a ligação entre os
dois.

---

## Estado

**Os cinco pontos estão feitos.** 1, 2, 3, 4 e 5.

Falta verificar no browser, que é a parte que não consigo fazer sozinho: o
painel de pré-visualização não está aberto e o `admin@demo.ao` tem segundo
factor real activo.
