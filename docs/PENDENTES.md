# Pendentes

O que foi pedido e **ainda não está feito**. Cada entrada diz o que falta, porque
importa e como se confirma que ficou resolvido. Uma entrada só sai daqui quando
o comportamento existir e estiver verificado — não quando o código foi escrito.

Última verificação contra o código: 2026-08-08.

---

## 1. O estado da empresa não pode ser alterado por ninguém

**Estado:** por fazer. É a lacuna mais séria desta lista.

`EstadoEmpresa` tem `activa`, `suspensa` e `cancelada`
([constants.py:152](../Producao/backend/src/core/constants.py:152)), e o login
recusa a entrada a quem pertence a uma empresa que não esteja activa
([auth_router.py:128](../Producao/backend/src/api/routers/auth_router.py:128)).

Só que **nenhuma rota escreve nesse campo**. Uma empresa fica `activa` no
momento da activação da licença e nunca mais muda. A verificação no login é uma
porta trancada sem ninguém que lhe possa mexer na chave.

Consequência prática: não há forma de suspender uma empresa que deixe de pagar,
ou de cortar o acesso a uma empresa comprometida, a não ser mexendo à mão na
base de dados.

A especificação pede "estado das empresas" na área do superadmin.

**Falta:** rota do superadmin para suspender/reactivar/cancelar uma empresa, com
auditoria. Suspender tem de expulsar quem já está dentro — subir o
`token_version` de todos os utilizadores da empresa, senão as sessões abertas
continuam a funcionar até expirarem.

**Confirma-se assim:** suspender uma empresa com um utilizador com sessão
aberta; o pedido seguinte desse utilizador tem de falhar, e não só o login.

---

## 2. O superadmin não vê nem gere os administradores das empresas

**Estado:** por fazer.

A área do superadmin tem empresas, licenças, contratos, limites, planos, consumo
e auditoria. Não tem utilizadores: as rotas em
[licenca_router.py](../Producao/backend/src/api/routers/licenca_router.py) são
`POST /licencas`, `GET /licencas`, `GET /licencas/empresas`,
`GET /licencas/auditoria`, `GET /licencas/consumo-ia`, `PATCH` e `DELETE` de uma
licença.

A especificação pede "administradores das empresas" na área do superadmin.

Isto interessa sobretudo num caso concreto: o administrador de uma empresa perde
o acesso (esquece a palavra-passe, sai da empresa, perde o segundo factor). Hoje
não há caminho nenhum para resolver isso sem tocar na base de dados.

**Falta:** listagem dos utilizadores por empresa e, no mínimo, poder promover
outro membro a administrador. Qualquer acção destas sobre a conta de outra
pessoa tem de ficar auditada com o autor.

**Nota de desenho:** o superadmin não deve poder ler dados de negócio de uma
empresa — só gerir contas e acessos. A fronteira entre "administrar a
plataforma" e "ver os dados dos clientes" tem de continuar de pé.

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

## Como esta lista se mantém

Quando algo do que foi pedido não ficar feito na altura, entra aqui em vez de
ficar por dizer — com o que falta, porque importa e como se confirma. Se algo
sair daqui sem estar verificado a correr, volta a entrar.
