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

## 6. Preços da OpenAI no código, e não em configuração

**Estado:** parcial.

O registo de consumo já guarda o essencial — `modelo`, `tokens_entrada`,
`tokens_saida`, `custo` ([ia.py](../Producao/backend/src/db/models/ia.py)).

Falta o resto do que foi pedido:

- A tabela `PRECOS` está **escrita no código**
  ([consumo.py:40](../Producao/backend/src/services/ia/consumo.py:40)); pediu
  configuração centralizada.
- O registo guarda o custo mas **não os preços aplicados**. Quando os preços da
  OpenAI mudarem, deixa de ser possível reconstruir como se chegou aos custos
  antigos — e a facturação histórica passa a ser inauditável.

**Falta:** preços em configuração e duas colunas (`preco_entrada`,
`preco_saida`) gravadas em cada registo, com o valor em vigor no momento.

---

## 7. Rotação da chave da OpenAI

**Estado:** por fazer, à espera da revisão de segurança final.

Ficou combinado: revogar a chave actual, gerar uma nova e guardá-la
exclusivamente em variáveis de ambiente ou num gestor de segredos. A chave que
esteve num commit local nunca chegou a ser publicada — verifiquei os 28 commits
antes do push — mas continua a ser uma chave que passou por um ficheiro.

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

## Como esta lista se mantém

Quando algo do que foi pedido não ficar feito na altura, entra aqui em vez de
ficar por dizer — com o que falta, porque importa e como se confirma. Se algo
sair daqui sem estar verificado a correr, volta a entrar.
