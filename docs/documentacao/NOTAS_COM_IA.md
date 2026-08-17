# Notas com IA — análise de viabilidade

Pedido: avaliar, **antes de implementar**, duas hipóteses para as Notas às
Demonstrações Financeiras — gerar o texto por IA, e explicar uma nota já
escrita — «sem comprometer segurança, custos, desempenho ou os dados
contabilísticos».

Conclusão à cabeça: **as duas são viáveis, com naturezas de risco muito
diferentes.** A segunda faz-se sem tocar em nada. A primeira exige uma regra
que o sistema ainda não tem, e é dessa regra que depende ser boa ideia.

---

## O que já existe, e que isto reaproveita

Nada disto precisa de arquitectura nova:

| Peça | Onde | O que faz |
|---|---|---|
| Chamada à OpenAI | `services/ia/qa.py` | Único ponto de saída para fora |
| Pseudonimização | `services/ia/redaccao.py` | Nomes viram pseudónimos; NIF, IBAN, e-mail, telefone e morada são removidos |
| Segunda verificação | antes do envio | Se escapar um identificador, **cancela** em vez de enviar |
| Contabilização | `services/ia/consumo.py` | Tokens e custo estimado, por empresa, com tecto mensal |
| Interruptor | `Plataforma → Configurações` | A plataforma desliga a IA para todas as empresas |
| Registo | `ia_consultas` | Pergunta, pacote enviado, resposta, modelo, custo |

Uma funcionalidade nova que passe por aqui herda tudo isto. Uma que não passe
tem de reconstruir tudo isto — e é aí que estas coisas correm mal.

---

## Hipótese A — explicar uma nota já escrita

**O que é:** um botão «Explicar» que pega no texto da nota e nos números a que
ela se refere e devolve uma explicação em linguagem corrente.

**Risco: baixo.** É exactamente o que o assistente já faz, com outro contexto.
Não escreve nada na contabilidade, não altera a nota, não decide nada. Se a
resposta for má, perde-se um clique.

**Custo:** uma nota tem entre 200 e 800 palavras. Com o contexto, cerca de
1 500 a 3 000 tokens de entrada e 400 de saída — na ordem de **0,01 USD por
explicação**, dentro do tecto mensal que já existe.

**Desempenho:** dois a cinco segundos, num pedido que a pessoa iniciou e está
à espera. Não bloqueia nada.

**Dados:** as notas falam de saldos e políticas, não de pessoas. A
pseudonimização que já existe cobre o que possa aparecer.

**Veredicto: fazer.** É o assistente com outro botão.

---

## Hipótese B — gerar o texto da nota

**O que é:** o sistema escreve a nota a partir dos números do exercício.

Aqui há uma diferença de natureza que não se resolve com melhor prompt:

> **Uma nota às Demonstrações Financeiras é uma declaração da empresa.** Vai
> assinada, é entregue à AGT e ao auditor, e responde por ela quem a assina —
> não quem a gerou. Um número inventado numa resposta do assistente é um
> incómodo; o mesmo número numa nota entregue é uma declaração falsa.

Não é argumento para não fazer. É argumento para **como** fazer:

1. **Rascunho, nunca texto final.** O que a IA produz entra num campo de
   rascunho identificado como tal, e só passa a nota quando uma pessoa o
   aceitar. Sem este passo, a assinatura deixa de significar o que significa.
2. **Os números não vêm do modelo.** Vêm da base, e são injectados no texto
   depois. Ao modelo pede-se a redacção — a estrutura, a linguagem, a ordem —
   não a aritmética. É a diferença entre um redactor e uma calculadora, e
   modelos de linguagem são bons no primeiro papel e não garantem o segundo.
3. **Fica registado que foi gerado.** Quem rever a nota daqui a um ano tem de
   poder saber como ela nasceu. Uma coluna na nota, e o registo em
   `ia_consultas` que já existe.
4. **Só com `contab.fechar`.** Quem não pode fechar o exercício não devia
   poder escrever a nota que o acompanha.

**Custo:** gerar uma nota são 3 000 a 6 000 tokens de entrada e 800 de saída —
**0,02 a 0,04 USD**. Um jogo completo de notas, 0,30 a 0,50 USD por exercício.
Irrelevante ao lado do tempo que poupa.

**Desempenho:** a mesma ordem de grandeza da hipótese A.

**Veredicto: fazer, com as quatro condições acima.** Sem elas, não — e a razão
não é técnica.

---

## O que NÃO se deve fazer

- **Gerar e gravar sem revisão.** Já está dito, mas é o erro que faria isto
  ser uma má ideia inteira.
- **Deixar o modelo calcular.** Se o texto disser «o activo cresceu 12%», os
  12% saem da base. Um modelo que faz contas acerta quase sempre — e o «quase»
  aqui é uma declaração fiscal.
- **Gerar as notas todas de uma vez sem ninguém a ver.** Multiplica por doze o
  que ninguém reviu.
- **Uma segunda porta para fora.** Tudo passa por `services/ia/qa.py`. Uma
  chamada directa à OpenAI noutro sítio salta a pseudonimização, a verificação
  e a contabilização de custo — as três coisas que fazem isto ser aceitável.

---

## Se avançar, por onde

1. **Hipótese A primeiro.** É pequena, é útil, e põe à prova o contexto das
   notas com risco nulo.
2. **Hipótese B a seguir**, começando pelo campo de rascunho e pela marca de
   origem — a parte aborrecida antes da parte visível, porque é a que faz a
   diferença entre uma ajuda e um problema.

Nada disto precisa de alterações na base além de duas colunas na nota
(`rascunho_ia`, `origem`), e de nenhuma alteração no motor contabilístico.
