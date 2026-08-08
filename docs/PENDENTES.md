# Pendentes

O que foi pedido e **ainda não está feito**. Cada entrada diz o que falta, porque
importa e como se confirma que ficou resolvido. Uma entrada só sai daqui quando
o comportamento existir e estiver verificado — não quando o código foi escrito.

Última verificação contra o código: 2026-08-08.

---

## 1. Estado das empresas — FEITO

`PATCH /api/licencas/empresas/{id}/estado` permite ao superadministrador
suspender, reactivar e cancelar, com motivo e auditoria. Suspender e cancelar
sobem a `token_version` de todos os utilizadores da empresa, o que corta as
sessões abertas no pedido seguinte — sem isso, suspender só travava logins
novos. Na interface, botões por linha com diálogo de confirmação.

Confirmado a correr: um utilizador com sessão aberta apanha 401 imediatamente
após a suspensão, e não apenas no login seguinte.

---

## 2. Contas: administradores das empresas e da plataforma — FEITO

O superadministrador passa a ver e a gerir as contas de cada empresa: listar,
promover a administrador, gerar palavra-passe temporária e repor o 2FA de quem
perdeu o telemóvel. Resolve o caso em que o administrador de uma empresa perde
o acesso e não tem ninguém acima dele lá dentro.

A fronteira mantém-se: gerem-se **contas e acessos**, nunca dados de negócio. A
promoção a superadministrador está bloqueada — seria uma porta lateral para a
administração da plataforma através de uma conta de empresa.

E a plataforma deixa de ter uma conta única: podem existir até
`MAX_SUPERADMINS` (três), cada uma com dono conhecido, para que a inicial não
seja a de todos os dias. Criar exige a palavra-passe de quem cria; a inicial é
gerada e mostrada uma vez. O que impede o sistema de ficar sem operador é
ninguém poder mexer na própria conta.

**Fica em aberto, e é honesto dizê-lo:** quem gera uma palavra-passe temporária
fica a sabê-la até o dono a mudar. Sem um canal de e-mail não há como evitar —
a alternativa (deixar escolher a palavra-passe) seria pior. Fica auditado. Uma
mudança forçada no primeiro acesso resolveria o resto; ver o ponto 9.

---

## 3. Sessão própria do superadministrador — FEITO

A sessão de quem administra a plataforma dura 2 horas e o token 15 minutos,
contra 12 horas e 30 minutos das restantes. O que mais expõe essa conta não é
o ataque remoto — é um portátil deixado aberto com a sessão viva o dia inteiro.

O token leva um `escopo` próprio que as rotas de administração exigem. Não
substitui a verificação do perfil: o perfil diz quem a pessoa é hoje, o escopo
diz o que aquela sessão foi emitida para fazer.

---

## 4. Segundo factor (2FA/TOTP) — FEITO

As seis etapas estão fechadas e verificadas.

- [x] **Etapa 1** — primitivas: segredo, cifra em repouso, verificação com
      janela de ±30 s, anti-repetição, QR, códigos de recuperação.
- [x] **Etapa 2** — activar e desactivar por utilizador: QR, confirmação por
      código, códigos de recuperação mostrados uma única vez.
- [x] **Etapa 3** — login em dois passos. O campo `tipo` no JWT impede que o
      desafio abra sessão; o desafio-isco não denuncia qual dos factores falhou.
- [x] **Etapa 4** — bloqueio da conta ao fim de 3 falhas, por 15 minutos, com
      auditoria. O bloqueio recusa com a MESMA mensagem de sempre: uma
      mensagem própria daria, ao fim de três tentativas, a confirmação de que
      a palavra-passe estava certa.
- [x] **Etapa 5** — interface: a configuração em `/perfil`, o segundo passo no
      `/entrar`, e o aviso na área da plataforma.
- [x] **Etapa 6** — obrigatório para administrar a plataforma, por inscrição
      forçada e não por bloqueio: o superadmin sem 2FA entra e chega ao perfil,
      mas as rotas da plataforma recusam até activar.

---

## 5. Recuperação de palavra-passe por e-mail

**Estado:** adiado por sua decisão. Precisa de SMTP.

A especificação diz que "o utilizador pode recuperar a senha através de um
processo seguro de recuperação por e-mail". Enquanto não existir, um utilizador
que se esqueça da palavra-passe depende do administrador da empresa — e o
administrador da empresa não depende de ninguém (ver ponto 2).

Quando se fizer: token de uso único, com validade curta, guardado em hash, e a
resposta tem de ser igual quer o e-mail exista ou não — senão o formulário passa
a servir para descobrir quem tem conta.

---

## 6. Preços da OpenAI — FEITO

A tabela vive em `backend/config/precos_ia.json`: os preços mudam sem aviso e
não devem obrigar a um deploy. Não é segredo — os preços são públicos — por
isso está versionado. Se o ficheiro faltar ou estiver mal formado, usa-se a
tabela embutida e regista-se o aviso: um ficheiro de preços partido não pode
desligar o módulo de IA.

Cada consulta guarda `preco_entrada` e `preco_saida`. O custo de uma consulta
antiga reproduz-se ao cêntimo pelos preços que lhe ficaram gravados, mesmo
depois de a tabela mudar.

O ficheiro declara a data em que os preços foram confirmados, e a interface
mostra-a a quem confere a factura. **Confirme-a contra a facturação real da
OpenAI e actualize `_confirmado_em`** — é a única parte que depende de si.

---

## 7. Rotação da chave da OpenAI — À SUA ESPERA

**Só o Yuri pode fazer isto:** exige o painel da OpenAI, ao qual não tenho
acesso.

Numa altura anterior a chave esteve escrita no `.env.example`. Verifiquei os
28 commits e **nunca chegou a ser publicada** — mas passou por um ficheiro
dentro de uma pasta de repositório, o que significa que pode ter ficado em
cópias de segurança, cache do editor, histórico da consola ou noutro clone. Uma
chave que tocou num ficheiro versionado conta como exposta.

Três passos:

1. `platform.openai.com` → API keys → revogar a chave actual;
2. criar uma nova;
3. colá-la só em `Producao/backend/.env`, na linha `OPENAI_API_KEY=` — esse
   ficheiro está no `.gitignore` e nunca é versionado.

Nada no código precisa de mudar: a chave já é lida só de variável de ambiente,
e as empresas nunca lhe tocam — todas as chamadas passam pelo backend.

---

## 8. Login por código ou nome da empresa — DECIDIDO

**Os dois.** O login aceita o código (`BE001`) e o nome, sem distinguir
maiúsculas nem espaços.

A empresa é um factor de IDENTIFICAÇÃO e não um segredo: está no papel
timbrado, no site e nas facturas. Quem entra todos os dias sabe o nome da casa
onde trabalha e não decora `BE001`. O que guarda a conta é a palavra-passe e o
segundo factor.

---

## 9. Aviso de palavra-passe provisória — FEITO

Decidiu-se **avisar e não forçar**: forçar a mudança punha um obstáculo em
frente a quem acabou de recuperar o acesso.

Uma marca `password_provisoria` assinala as contas cuja palavra-passe foi
definida por outra pessoa. No acesso seguinte aparece um aviso a sugerir que a
mude e que active a verificação em dois passos. Limpa-se sozinha quando a
pessoa muda a palavra-passe.

---

## 10. `permissoes_accao` não é aplicada em lado nenhum

**Estado:** por fazer. Encontrado na revisão de 2026-08-08.

Os módulos passaram a ser aplicados no servidor, mas `permissoes_accao` —
o mapa `{módulo: [ver, criar, editar, eliminar, exportar]}` — continua a ser
gravado, devolvido pela API e editável em `/gestao/utilizadores` sem que nada
o leia. `pode_accao` existe e só era chamada pela `exigir_accao`, que nenhum
router usava.

**O que isto significa hoje:** dar a alguém `{"comercial": ["ver"]}` para o
tornar só de leitura não impede nada — `POST /api/comercial/vendas` exige
`comercial.gerir`, que vem da matriz por perfil, e ele emite facturas na mesma.

**Falta:** fazer `exigir_cap` consultar também `pode_accao`, traduzindo o
sufixo da capacidade (`ver`/`gerir`) para a acção. É o mesmo sítio onde a
verificação de módulo ficou.

**Confirma-se assim:** dar `{"comercial": ["ver"]}` a um utilizador do perfil
comercial e verificar que `POST /api/comercial/vendas` passa a dar 403.

---

## 11. `X-Forwarded-For` é aceite sem lista de proxies de confiança

**Estado:** por fazer. Encontrado na mesma revisão.

`src/services/auditoria.py` grava o primeiro valor de `X-Forwarded-For` sem
verificar de onde veio o pedido. Qualquer pedido autenticado com um cabeçalho
forjado grava o IP que quiser na auditoria — quem quisesse apagar o rasto da
origem das suas acções conseguia-o.

Há aqui uma incoerência a resolver de uma vez: o rate limiting usa
`request.client.host` (não falsificável, mas errado atrás de um proxy, onde o
limite de 5/min passaria a ser global). Os dois lados discordam.

**Falta:** uma definição de proxies de confiança usada pelos dois — só aceitar
`X-Forwarded-For` quando o pedido vem de um proxy conhecido.

---

## 12. Ler `Exercicio` de outra empresa por UUID adivinhado

**Estado:** por fazer. Baixo, mas é uma regra quebrada.

Três sítios fazem `db.get(Exercicio, ...)` sem filtrar por empresa:
`services/ia/contexto.py`, `services/contabilidade.py` e
`services/demonstracoes.py`. O que se expõe é o nome e as datas do exercício
("Exercício 2026"), não valores — confirmei que as consultas de dados a jusante
filtram sempre por `empresa_id`. E exige adivinhar um UUIDv4.

**Falta:** acrescentar `Exercicio.empresa_id == empresa_id` aos três, como já
faz `services/apuramentos.py`. E validar `exercicio_id` em
`contabilidade.exercicio_efetivo`, que hoje devolve o que vier do cliente sem
verificar posse.

---

## Como esta lista se mantém

Quando algo do que foi pedido não ficar feito na altura, entra aqui em vez de
ficar por dizer — com o que falta, porque importa e como se confirma. Se algo
sair daqui sem estar verificado a correr, volta a entrar.
