# Linguagem — falar com quem usa, não com quem programou

Regra transversal a toda a Produção. Vale para **tudo o que o utilizador lê**:
erros, avisos, confirmações, validações, notificações, bloqueios, estados,
mensagens informativas, mensagens de sucesso, dicas e instruções.

---

## A forma

Uma mensagem responde a três coisas, por esta ordem:

1. **O que está a acontecer** — dito de forma directa.
2. **Qual é o impacto** — o que isto significa para o trabalho da pessoa.
3. **O que fazer a seguir** — a acção concreta.

## O que evitar

Não é só apagar `backend`, `API`, `endpoint`, `HTTP 500`, `exception` ou nomes
de ficheiros. É também evitar:

- **linguagem interna do sistema** — nomes de tabelas, de funções, de estados
  internos, jargão da implementação;
- **explicar o mecanismo** em vez de explicar o problema do ponto de vista de
  quem o encontrou;
- **frases burocráticas ou abstractas** que estão correctas e não se percebem;
- **subentendidos** que só quem conhece a lógica interna consegue desfazer.

## Duas audiências, duas mensagens

O detalhe técnico **não desaparece** — muda de sítio. Vai para os registos do
servidor e para a área de administração, onde quem o pode resolver o procura.

Isto resolve o falso dilema entre «claro» e «diagnosticável»: são coisas
diferentes, para pessoas diferentes.

---

## O que foi corrigido, e porquê

### O exemplo que originou a regra

❌ «Mudar estas contas a meio de um exercício faz os lançamentos novos irem
para outro sítio — os que já estão lançados não se movem, e o mapa de custos
deixa de comparar o mesmo. Se for mesmo preciso, convém que aconteça no início
de um período.»

✅ «Alterar estas contas durante o exercício pode afectar a forma como os
custos são apresentados e comparados. Para evitar diferenças nos resultados,
faça esta alteração no início de um novo período.»

A primeira não tem um único termo de programação e está correcta. Continua a
ser má: descreve o mecanismo interno («os lançamentos novos vão para outro
sítio») em vez de dizer o efeito e o que fazer.

### O pior caso: o validador do SAF-T

Ia isto, tal e qual, para o ecrã de quem exporta:

```
linha 14674: Element '{urn:OECD:StandardAuditFile-Tax:AO_1.01_01}CreditLine':
No match found for key-sequence ['4321'] of keyref
'{urn:OECD:StandardAuditFile-Tax:AO_1.01_01}GeneralLedgerEntriesCreditLine
AccountIDConstraint'.
```

Quem exporta o SAF-T é um contabilista com prazo no dia 20. Aquela linha não
lhe diz o que está mal nem o que fazer, e o prazo continua a correr. Passa a
ler:

> **A conta 4321 é usada em lançamentos mas não existe no plano de contas.
> Acrescente a conta ao plano ou corrija os lançamentos que a usam.**

O texto original não se perdeu: fica em **«Detalhe técnico»**, fechado, para
quem der apoio. A tradução está em `services/facturacao/saft.py` (`explicar`).

### Outros

| Antes | Depois |
|---|---|
| «O limite é imposto pelo servidor no pedido à API, e não apenas sugerido ao modelo» | «As respostas nunca ultrapassam este tamanho — o limite é sempre cumprido.» |
| «não contacta nenhuma API externa e funciona sem chave de IA configurada» | «Nenhuma informação é enviada para fora, e continua a funcionar mesmo com o assistente desligado.» |
| «As credenciais estão no servidor, em variáveis de ambiente — não passam pelo browser» | «O acesso ao serviço da AGT é configurado pelo fornecedor da plataforma e não pode ser alterado aqui.» |
| «A base guarda apenas o seu hash, para que uma leitura da base não entregue licenças» | «Por segurança, não fica guardada de forma legível. Copie-a agora e entregue-a ao cliente.» |
| «No Piloto esta política era um interruptor que se podia desligar. Aqui é permanente — a rota que altera vendedores exige a capacidade no servidor» | «Esta política não pode ser desligada. Só quem tem permissão para gerir vendedores os consegue alterar.» |
| «A margem é calculada dos dois preços, não se grava.» | «É calculada a partir dos preços indicados e não fica guardada.» |
| «o servidor não tem a variável TOTP_CHAVE_CIFRA definida» | «essa verificação ainda não está disponível nesta instalação. Contacte o fornecedor da plataforma.» — e `TOTP_CHAVE_CIFRA` passa para o registo do servidor |
| «Defina OPENAI_API_KEY no ficheiro .env.» | «O assistente ainda não está disponível nesta instalação. Contacte o fornecedor da plataforma.» |
| «702030 bytes» | «686 KB» |

### Um teste que estava a exigir o contrário

`test_sem_chave_de_cifra_falha_fechado` exigia que a mensagem **nomeasse a
variável de ambiente**. A intenção era boa — que ninguém ficasse preso sem
saber como sair — mas a conclusão estava errada: quem administra a plataforma
não é necessariamente quem instalou o servidor, e mandá-lo definir uma
variável a que não tem acesso não o ajuda.

O teste passou a exigir as duas coisas:

- que a mensagem **não** contenha o nome da variável, e diga a quem se dirigir;
- que o **registo** contenha o nome da variável, para quem a pode definir.

---

## A verificação, antes de escrever

Ler em voz alta e perguntar: *uma pessoa que nunca viu o código percebe o que
aconteceu e o que fazer a seguir?* Se for preciso conhecer a arquitectura, o
texto está errado.

## Como encontrar as que faltam

O varrimento que produziu esta lista procurou, no texto visível:

- termos de implementação: `servidor`, `API`, `token`, `hash`, `rota`, nomes de
  variáveis de ambiente, `bytes`;
- referências ao **Piloto** ou a decisões internas de desenho;
- mensagens com mais de 110 caracteres **sem um verbo de acção** para o
  utilizador (indique, corrija, contacte, verifique…).

Foram revistas 165 mensagens no frontend e 154 no backend.
