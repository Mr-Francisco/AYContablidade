# Planos de licenciamento

## O que estava mal

O campo `plano` da licença era uma **etiqueta**. Três nomes escritos à mão na
lista do ecrã — «Base», «Profissional», «Enterprise» — que o servidor guardava,
devolvia e mostrava, **sem nunca os ler para decidir nada**. Procurei todas as
leituras de `.plano`: escreviam-no, devolviam-no ou mostravam-no.

Pior do que inútil, era enganador: quem lesse «Enterprise» na lista supunha que
aquilo queria dizer alguma coisa.

E havia **duas falhas a sério**:

1. **O formulário de gerar licença não tinha campo para os módulos.** Como
   lista vazia significa «todos», toda a licença criada pela interface incluía
   todos os módulos — escolhesse-se «Base» ou «Enterprise». O mecanismo de
   limitar módulos estava construído e verificado no servidor, e não havia forma
   de o usar.
2. **O limite de utilizadores só era verificado na criação directa de contas.**
   Não corria ao aceitar um pedido de acesso — que é por onde a maior parte das
   contas entra. Uma empresa com licença para cinco pessoas passava dos cinco.

## Os planos agora

Definidos em **`backend/src/core/planos.py`** — um sítio só.

| | Essencial | Gestão | Completo |
|---|---|---|---|
| **Para quem** | Contabilidade e obrigações fiscais | Quem factura e tem stock | Gabinetes, RH e centros de custo |
| **Contabilidade** | sim | sim | sim |
| **Fiscalidade** | sim | sim | sim |
| **Contas Correntes** | sim | sim | sim |
| **Comercial** | — | sim | sim |
| **Logística** | — | sim | sim |
| **Imobilizados** | — | sim | sim |
| **Analítica** | — | — | sim |
| **Recursos Humanos** | — | — | sim |
| **Contas activas** | 3 | 10 | sem limite |
| **Assistente** | 100 000 tokens/mês · 5 USD | 400 000 · 20 USD | sem tecto |

**Os números são um ponto de partida, não uma decisão comercial.** Foram
escolhidos a partir do que o sistema tem, e revêem-se com quem vende. O que o
ficheiro garante é que a decisão fica num sítio só.

### Duas decisões que vale a pena conhecer

**O plano mais pequeno inclui Fiscalidade**, e não é generosidade: sem ela não
há apuramento de IVA nem SAF-T, e uma empresa angolana sem isso não cumpre a
lei. Vender um plano que não permite cumprir a lei não é vender um plano
pequeno — é vender um problema.

**O plano Completo usa lista vazia em vez dos oito nomes.** Lista vazia é como
a licença diz «todos», incluindo os módulos que vierem a existir. Listar os
oito à mão obrigaria a lembrar-se deste ficheiro ao acrescentar um módulo, e
ninguém se lembra.

## O plano preenche, não tranca

Escolher um plano preenche os módulos e os limites. **Cada licença continua a
poder ser ajustada**: uma empresa que precise de um módulo a mais ou de um tecto
diferente recebe-o na sua licença, e isso não obriga a inventar um plano novo
para um cliente só.

No formulário de **criação**, mudar de plano repõe módulos e limites — não há
nada a perder. No de **alteração** de um contrato já activo, mudar de plano
troca os módulos mas **deixa os limites à mão de quem decide**: a empresa pode
ter um limite ajustado de propósito, e trocá-lo em silêncio seria alterar um
contrato pelo lado.

## Os limites ficam GRAVADOS na licença

Não são lidos do plano a cada verificação. É o contrário do que se faz com a
certificação da AGT, e a diferença é de natureza:

| | Certificação da AGT | Plano |
|---|---|---|
| O que é | Um facto sobre o programa | Um contrato com um cliente |
| Como se resolve | À leitura, sempre | Gravado quando a licença nasce |
| Porquê | Renovar muda para todos de uma vez | Um contrato assinado não se reescreve à distância |

## As licenças antigas continuam a valer

«Base», «Profissional» e «Enterprise» continuam a ser reconhecidos e ligados a
Essencial, Gestão e Completo. Uma licença de um cliente não muda de nome porque
nós mudámos de ideias — e uma que deixasse de ser reconhecida deixava de abrir
a empresa. Os limites dessas licenças estão gravados nelas e não mudam.

## Cobertura

`backend/tests/test_planos.py` — 14 testes, incluindo os dois que fixam as
falhas corrigidas.
