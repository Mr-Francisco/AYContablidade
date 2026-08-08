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

## 3. O superadmin autentica-se como um utilizador normal

**Estado:** por fazer. Já assinalado por si.

`exigir_superadmin` protege todas as rotas da plataforma, e isso funciona. Mas o
**token é do mesmo tipo** que o de um utilizador comum: mesma duração, mesmas
condições de emissão. A separação existe na autorização, não na autenticação.

O pedido foi explícito: sessão própria e mais curta para o superadmin, **imposta
no backend e não apenas na interface**.

**Falta:** distinguir a sessão de superadmin no próprio token (por exemplo, um
`escopo` que as rotas da plataforma exijam), com expiração mais curta.

**Já feito desde então:** o 2FA passou a ser obrigatório para administrar a
plataforma, e o token ganhou um campo `tipo`. O que falta é a duração própria e
o escopo — a metade que resta desta resposta.

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

## 8. Ponto por decidir: o login aceita o código **ou** o nome da empresa

**Não é uma falha — é uma divergência que precisa de uma decisão sua.**

Hoje o login aceita qualquer um dos dois, sem distinguir maiúsculas
([auth_router.py:67](../Producao/backend/src/api/routers/auth_router.py:67)).
A primeira versão da especificação dizia "o código da empresa **ou o Nome da
Empresa**"; a segunda diz só "o código da empresa".

Aceitar o nome é mais simpático para quem entra todos os dias e não decora
`BE001`. Aceitar só o código é mais restrito e não deixa adivinhar empresas pelo
nome. **Diga qual prefere** e alinho a implementação e a especificação.

---

## 9. Mudança de palavra-passe forçada no primeiro acesso

**Estado:** por fazer. Nasceu do ponto 2.

Quem gera uma palavra-passe temporária — para um administrador de empresa ou
para uma conta de plataforma nova — fica a sabê-la. Enquanto o dono não a
mudar, há duas pessoas com acesso àquela conta.

**Falta:** uma marca na conta que obrigue a definir palavra-passe nova antes de
fazer qualquer outra coisa, tal como o 2FA obrigatório fecha a área da
plataforma sem trancar a entrada.

**Confirma-se assim:** gerar uma palavra-passe temporária, entrar com ela, e
verificar que nenhuma rota de dados responde até a palavra-passe ser mudada.

---

## Como esta lista se mantém

Quando algo do que foi pedido não ficar feito na altura, entra aqui em vez de
ficar por dizer — com o que falta, porque importa e como se confirma. Se algo
sair daqui sem estar verificado a correr, volta a entrar.
