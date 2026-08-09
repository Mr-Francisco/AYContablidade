# Como testar em desenvolvimento

Guia prático para pôr o sistema a correr na sua máquina e experimentar tudo:
os perfis de utilizador, a verificação em dois passos, a área da plataforma, o
ciclo de uma licença e o assistente.

Tudo o que aqui está foi verificado contra o ambiente real.

---

## 1. Arrancar

Precisa de **duas consolas** — uma para o backend, outra para o frontend.

### Consola 1 — backend

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe -m uvicorn main:app --port 8001 --no-proxy-headers
```

> **`--no-proxy-headers` não é opcional.** Sem ele, o uvicorn reescreve a origem
> do pedido a partir de um cabeçalho que qualquer cliente forja, e a lógica de
> proxies de confiança deixa de ter efeito.

Confirmar:

```bash
curl http://127.0.0.1:8001/api/health
# {"estado":"ok","ambiente":"dev"}
```

### Consola 2 — frontend

```bash
cd C:/GitHub/AYContablidade/Producao/frontend
npm run dev
```

O primeiro arranque demora — o Turbopack compila tudo. Espere pelo `Ready`.

Abrir: **http://localhost:3000**

### Se alguma coisa não responder

```bash
# Ver quem está nas portas
netstat -ano | findstr ":8001 :3000"

# Matar o processo (PowerShell)
Stop-Process -Id <PID> -Force
```

O backend **não recarrega sozinho** com este comando: depois de alterar código
Python, pare e volte a arrancar. Para recarga automática, acrescente `--reload`.

O frontend recarrega sozinho. Se der 404 numa rota que existe, é cache do
Turbopack — pare, apague `.next` e arranque outra vez.

---

## 2. Dados de demonstração

Se a base estiver vazia, ou quiser recomeçar:

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe scripts/criar_demo.py

# Do zero, apagando o que existir:
.venv/Scripts/python.exe scripts/criar_demo.py --recriar
```

Cria a empresa **Demo Contabilidade, Lda.** (código `DC001`, NIF `5000000001`)
com plano de contas, movimentos, artigos, clientes, vendas e funcionários.

> Este script **recusa-se a correr** com `AMBIENTE=producao`. É deliberado:
> cria contas com palavras-passe conhecidas.

Se as migrações ainda não correram:

```bash
.venv/Scripts/alembic upgrade head
```

---

## 3. Contas para testar

**Todas com a palavra-passe `demo12345`.**

### Empresa `DC001` — Demo Contabilidade, Lda.

| E-mail | Perfil | O que consegue fazer |
|---|---|---|
| `admin@demo.ao` | Administrador | Tudo dentro da empresa: criar utilizadores, todos os módulos |
| `contab@demo.ao` | Contabilista | Contabilidade (lançar, plano, fechar), analítica, imobilizados |
| `comercial@demo.ao` | Comercial | Vendas, clientes, vendedores |
| `logistica@demo.ao` | Logística | Artigos, armazéns, stocks, compras |
| `rh@demo.ao` | RH | Funcionários, processamento, recibos |
| `consulta@demo.ao` | Consulta | **Só vê.** Não lança, não altera, não apaga |

### Plataforma

| E-mail | Perfil | Nota |
|---|---|---|
| `super@plataforma.ao` | Superadministrador | **Campo da empresa VAZIO.** Exige 2FA |

### Como entrar

No ecrã de login há três campos:

1. **Empresa** — `DC001` **ou** `Demo Contabilidade, Lda.` (aceita os dois).
   **Deixe vazio** para a conta de plataforma.
2. **E-mail**
3. **Palavra-passe** — `demo12345`

---

## 4. Testar os perfis e as permissões

O melhor teste é **abrir duas janelas** (uma normal e uma anónima) e entrar com
perfis diferentes ao mesmo tempo.

### O que confirmar em cada perfil

**`consulta@demo.ao`** — o que mais revela:

- Consegue abrir Contabilidade → Movimentos e ver a lista ✅
- **Não** vê o botão «Novo movimento» ✅
- Não vê os botões de alterar/eliminar nas tabelas mestras ✅
- Não vê «Plataforma» no menu ✅

**`rh@demo.ao`**:

- Vê RH no menu, e mais nada de negócio
- **Não** consegue abrir Comercial nem Logística

**`comercial@demo.ao`**:

- Vê Comercial
- **Não** vê salários — abrir `/rh/funcionarios` dá erro de permissão

### Provar que a restrição é do servidor, não do menu

Este é o teste que interessa. Com a sessão de `comercial@demo.ao` aberta, cole
na consola do browser (F12):

```js
fetch('http://localhost:8001/api/rh/colaboradores', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('aycontab_token') }
}).then(r => console.log('estado:', r.status))
```

Tem de dar **403**. Se desse 200, o menu estaria a esconder dados que o servidor
entrega — que é exactamente o problema que o Piloto tinha.

---

## 5. Testar a verificação em dois passos (2FA)

### Activar numa conta

1. Entre com qualquer conta (ex.: `admin@demo.ao` / `DC001`)
2. Clique no seu nome (canto superior direito) → **O meu perfil**
3. **Activar verificação em dois passos**
4. Aparece um **QR code** e o **segredo em texto**

### Obter os códigos

**Opção A — telemóvel:** leia o QR com o Google Authenticator, Microsoft
Authenticator ou Authy.

**Opção B — sem telemóvel (mais prático a testar):** copie o segredo mostrado
no ecrã e gere os códigos na consola:

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe -c "import pyotp; print(pyotp.TOTP('COLE_O_SEGREDO_AQUI').now())"
```

O código muda de 30 em 30 segundos. Gere-o e use-o logo.

5. Escreva o código para confirmar
6. **Guarde os códigos de recuperação** que aparecem — vai precisar deles no
   passo seguinte

### Testar o login em dois passos

1. Saia da sessão
2. Entre com a mesma conta
3. Depois da palavra-passe, aparece o **segundo ecrã** a pedir o código
4. Gere um código novo e escreva-o

### Testes que valem a pena

| O que testar | Como | O que tem de acontecer |
|---|---|---|
| **Código errado** | Escreva `000000` | Recusa, sem dizer se a palavra-passe estava certa |
| **Bloqueio** | Erre o código **3 vezes** | A conta bloqueia **15 minutos** |
| **Código de recuperação** | Use um dos códigos guardados | Entra, e o código é gasto — não serve outra vez |
| **Palavra-passe errada numa conta com 2FA** | Escreva mal a palavra-passe | Pede o código na mesma. É de propósito: impede que o formulário sirva para confirmar palavras-passe |

### Desbloquear uma conta bloqueada (sem esperar 15 minutos)

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe -c "
from src.db.base import engine
from sqlalchemy import text
with engine.begin() as c:
    c.execute(text('UPDATE users SET totp_falhas=0, totp_bloqueado_ate=NULL WHERE email=:e'), {'e':'admin@demo.ao'})
print('desbloqueado')
"
```

### Desligar o 2FA de uma conta (recomeçar do zero)

```bash
.venv/Scripts/python.exe -c "
from sqlalchemy import text
from src.db.base import engine
sql=('UPDATE users SET totp_ativo=false, totp_segredo=NULL, '
     \"totp_codigos_recuperacao='[]'::jsonb, totp_falhas=0, \"
     'totp_bloqueado_ate=NULL, totp_ativado_em=NULL, totp_ultimo_contador=NULL '
     'WHERE email=:e')
with engine.begin() as c:
    c.execute(text(sql), {'e': 'admin@demo.ao'})
print('2FA desligado')
"
```

Troque o e-mail. Para limpar **todas** as contas, tire o `WHERE email=:e` do
fim do SQL e o `{'e': ...}` do `execute`.

---

## 6. Testar o superadministrador

A conta `super@plataforma.ao` **é obrigada a ter 2FA**. Enquanto não o activar,
a área da plataforma mostra um aviso a explicar e não deixa entrar.

### Atalho para testar: pôr um segredo conhecido

Assim não precisa de ler QR nenhum. O segredo abaixo é fixo e serve só para
desenvolvimento:

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe -c "
import pyotp
from sqlalchemy import text
from src.db.base import engine
from src.auth.totp import cifrar_segredo
SEG='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
sql='UPDATE users SET totp_ativo=true, totp_segredo=:s, totp_falhas=0, totp_bloqueado_ate=NULL, totp_ultimo_contador=NULL WHERE email=:e'
with engine.begin() as c:
    c.execute(text(sql), {'s': cifrar_segredo(SEG), 'e': 'super@plataforma.ao'})
print('codigo agora:', pyotp.TOTP(SEG).now())
"
```

> O SQL vai **numa linha** e o e-mail entra como **parâmetro**. Escrito em
> várias linhas com aspas triplas, o `.ao'` fecha a cadeia antes do fim e o
> comando rebenta — foi o que aconteceu ao testá-lo.

Guarde o comando. Sempre que precisar de um código novo:

```bash
.venv/Scripts/python.exe -c "import pyotp; print(pyotp.TOTP('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP').now())"
```

### Entrar

1. Campo da empresa: **vazio**
2. `super@plataforma.ao` / `demo12345`
3. Código gerado acima

Cai directamente em **/plataforma** — a conta não tem empresa, por isso o menu
só lhe mostra a área da plataforma.

### O que testar lá

| Página | O que experimentar |
|---|---|
| **Empresas** | Suspender a `DC001` e tentar entrar com `admin@demo.ao` → recusa. Reactivar → volta a entrar |
| **Licenças** | Gerar uma licença nova (ver secção 7) |
| **Contas** | Criar uma segunda conta de plataforma (o limite são 3) |
| **Consumo de IA** | Tokens e custo por empresa |
| **Configurações** | Trocar o modelo de IA, o tecto de tokens, os prazos de retenção, ligar/desligar o assistente |
| **Auditoria** | Cada acção acima aparece aqui, com antes e depois |

### Testes que valem a pena

- **O admin da empresa não vê a plataforma.** Com `admin@demo.ao`, abrir
  `/plataforma` → recusa.
- **A chave da licença só aparece uma vez.** Gere uma e feche a janela sem
  copiar — não há forma de a recuperar. É de propósito.
- **Desligar o assistente** em Configurações e depois tentar perguntar com
  `admin@demo.ao` → recusa com mensagem que distingue «desligado» de «sem
  chave».

---

## 7. Testar o ciclo completo de uma empresa nova

O fluxo real, de ponta a ponta.

1. **Com o superadmin**, em **Plataforma → Licenças → Gerar**:
   - NIF: `5000000999` (invente um que ainda não exista)
   - Nome: `Empresa de Teste, Lda`
   - Plano, duração, módulos, limite de utilizadores
   - **Copie a chave** — só aparece agora

2. **Saia da sessão** e vá a **http://localhost:3000/activar**

3. Preencha a chave, o **mesmo NIF** e o mesmo nome, e os dados do
   administrador (a palavra-passe tem de ser forte: `Teste@2026!x` serve)

4. A empresa nasce com o **plano de contas em PGC-AR** já feito. Anote o código
   que aparece (ex.: `ET001`)

5. Entre com a conta que criou e confirme: Contabilidade → Plano de Contas tem
   ~500 contas

### O que também vale testar

- **NIF errado na activação** → recusa
- **A mesma chave duas vezes** → recusa
- **Palavra-passe fraca** (`123`) → recusa
- **Passar o limite de utilizadores** da licença → recusa com mensagem

---

## 8. Testar o fluxo contabilístico

Com `admin@demo.ao` ou `contab@demo.ao`:

### Um lançamento normal

1. **Contabilidade → Movimentos → Novo movimento**
2. Escolha diário e documento
3. Duas linhas: uma a débito, outra a crédito, **com o mesmo valor**
4. Repare que o botão **Gravar** só acende quando os totais batem certo
5. Tente gravar com valores diferentes → mostra a diferença e não deixa

### Um lançamento diferido (o que fica pendente)

1. Novo movimento, marque **«Gravar como diferido»**
2. Grave
3. **Contabilidade → Balancete**: o total **não** mexeu
4. Volte a Movimentos e ligue **«Incluir diferidos»** — lá está, com o selo
5. Clique na linha → abre o detalhe com o aviso **«Pendente de integração»**
6. **Integrar**
7. Volte ao balancete: **agora subiu exactamente o valor lançado**

### Fecho de período

Faz-se pela API (ainda não há botão):

```bash
# Com a sessão aberta, cole na consola do browser (F12):
fetch('http://localhost:8001/api/contabilidade/fechos', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + localStorage.getItem('aycontab_token')
  },
  body: JSON.stringify({ diario_codigo: '10', mes: '08' })
}).then(r => r.json()).then(console.log)
```

Depois tente lançar nesse diário e mês → recusa a explicar porquê.

### Processamento salarial

**RH → Processamento**: vê a folha antes de processar, com IRT e INSS
calculados. Processe e repare que **reprocessar o mesmo mês é recusado** — no
Piloto lançava outra vez e o custo com pessoal ficava a dobrar.

---

## 9. Testar o assistente de IA

Precisa da `OPENAI_API_KEY` no `.env` do backend. **Sem ela, o Diagnóstico
continua a funcionar** — corre inteiramente no servidor, por regras.

1. **Assistente → Perguntas e Respostas**
2. Antes de perguntar, clique em **«Ver o que é enviado»** — mostra o pacote
   exacto que vai sair, já pseudonimizado. **Confirme que não há nomes nem
   NIFs.**
3. Pergunte: *«Qual foi o resultado do exercício?»*
4. Em baixo aparece o modelo usado, os tokens e a duração

### Testes que valem a pena

- **Diagnóstico** (o outro separador) — corre local, sem API. Desligue a
  internet e confirme que continua a funcionar.
- **Consumo** — com o superadmin, em **Plataforma → Consumo de IA**, confirme
  que a pergunta foi registada na empresa certa.
- **Interruptor geral** — desligue em Configurações e volte a perguntar.

---

## 10. Correr os testes automáticos

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe -m pytest -q
# 389 passed
```

Um ficheiro só:

```bash
.venv/Scripts/python.exe -m pytest tests/test_diferidos.py -q
.venv/Scripts/python.exe -m pytest tests/test_login_2fa.py -q
```

Frontend:

```bash
cd C:/GitHub/AYContablidade/Producao/frontend
npm run lint          # Biome
npx tsc --noEmit      # tipos
npm run build         # build de produção
```

---

## 11. Problemas frequentes

### «Limite de utilização: 5 por minuto» ao entrar

O limite são **5 tentativas de login por minuto por IP**. É a protecção contra
força bruta e está a funcionar. Espere um minuto.

A testar vários perfis seguidos, é fácil apanhá-lo. Para o desligar
**temporariamente em desenvolvimento**, ponha no `.env` do backend:

```
RATE_LIMIT_LOGIN=1000/minute
```

E reinicie o backend. **Volte a pôr `5/minute` quando acabar.**

### O 2FA não activa e diz que falta uma chave

Falta `TOTP_CHAVE_CIFRA` no `.env`. Gere-a:

```bash
.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Ponha no `.env` e **reinicie o backend** — as definições são lidas uma vez, ao
arrancar.

### Alterei o `.env` e não fez diferença

O backend lê o `.env` **ao arrancar**. Pare e volte a arrancar.

### Uma rota que existe dá 404 no browser

Cache do Turbopack:

```bash
cd C:/GitHub/AYContablidade/Producao/frontend
# parar o npm run dev primeiro
rm -rf .next
npm run dev
```

### Alterei código Python e não fez diferença

O backend só recarrega com `--reload`. Sem isso, pare e volte a arrancar.
Confirme que matou o processo antigo:

```bash
netstat -ano | findstr ":8001"
```

### A aplicação abre mas não carrega dados

Confirme que o backend está de pé (`curl http://127.0.0.1:8001/api/health`) e
veja a consola do browser (F12). Se disser CORS, confirme
`CORS_ORIGINS=http://localhost:3000` no `.env`.

### Quero recomeçar do zero

```bash
cd C:/GitHub/AYContablidade/Producao/backend
.venv/Scripts/python.exe scripts/criar_demo.py --recriar
```

Base completamente limpa (**apaga tudo**):

```bash
.venv/Scripts/alembic downgrade base
.venv/Scripts/alembic upgrade head
.venv/Scripts/python.exe scripts/criar_demo.py
```

---

## 12. Comandos de consulta rápida

```bash
cd C:/GitHub/AYContablidade/Producao/backend

# Que contas existem e quais têm 2FA
.venv/Scripts/python.exe -c "
from src.db.base import engine
from sqlalchemy import text
with engine.begin() as c:
    for r in c.execute(text('select email, perfil, ativo, totp_ativo from users order by perfil')): print(r)
"

# Que empresas existem
.venv/Scripts/python.exe -c "
from src.db.base import engine
from sqlalchemy import text
with engine.begin() as c:
    for r in c.execute(text('select codigo, nome, nif, estado from empresas')): print(r)
"

# Repor todas as palavras-passe para demo12345
.venv/Scripts/python.exe -c "
from src.db.base import engine
from sqlalchemy import text
from src.auth.security import hash_password
with engine.begin() as c:
    c.execute(text('UPDATE users SET password_hash=:h, ativo=true'), {'h': hash_password('demo12345')})
print('reposto')
"

# Últimas acções na auditoria
.venv/Scripts/python.exe -c "
from src.db.base import engine
from sqlalchemy import text
with engine.begin() as c:
    for r in c.execute(text('select criado_em, accao, alvo_desc from auditoria order by criado_em desc limit 10')): print(r)
"
```

---

## 13. Resumo para colar num papel

```
Frontend  http://localhost:3000
Backend   http://127.0.0.1:8001
API docs  http://127.0.0.1:8001/docs   (só em dev)

Palavra-passe de todas as contas: demo12345

Empresa DC001 — Demo Contabilidade, Lda.
  admin@demo.ao       Administrador
  contab@demo.ao      Contabilista
  comercial@demo.ao   Comercial
  logistica@demo.ao   Logística
  rh@demo.ao          RH
  consulta@demo.ao    Só leitura

Plataforma (campo da empresa VAZIO)
  super@plataforma.ao Superadministrador — exige 2FA

Código TOTP do superadmin (depois do atalho da secção 6):
  .venv/Scripts/python.exe -c "import pyotp; print(pyotp.TOTP('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP').now())"
```
