# Aprender a lançar — o que foi feito, e porquê

Este documento explica, passo a passo, o que se fez para pôr o AYContabilidade
a correr na Internet. Não é uma lista de comandos para copiar às cegas: cada um
vem com **o que faz**, **porque é preciso** e **como se confirma que resultou**.

Escrito a partir do lançamento real de 16 de Agosto de 2026.

---

## 1. As três peças, e porque são três

Uma aplicação como esta não é um ficheiro que se põe num sítio. São três coisas
diferentes, que podem viver em sítios diferentes:

| Peça | O que é | Onde ficou |
|---|---|---|
| **Frontend** | O que se vê no browser. Next.js. | Render |
| **Backend** | Quem sabe as regras e fala com a base. FastAPI. | Render |
| **Base de dados** | Onde ficam os dados. PostgreSQL. | Neon |

**Porque não tudo no mesmo sítio:** porque cada um tem exigências diferentes. A
base de dados tem de guardar coisas para sempre e não pode ser reiniciada à
vontade; o frontend e o backend são descartáveis — apaga-se e volta a
construir-se do código. Misturá-los é o que faz com que um dia se perca a base
ao reinstalar a aplicação.

---

## 2. O código tem de estar num sítio que o servidor alcance

O Render não lê o disco da sua máquina. Lê o **GitHub**. Por isso o primeiro
passo é o código estar lá.

```bash
git remote -v
```

Mostra para onde o `git push` envia. Se aparecer o repositório errado:

```bash
git remote set-url origin https://github.com/UTILIZADOR/REPOSITORIO.git
```

E depois:

```bash
git push -u origin main
```

**Se falhar com `HTTP 408`** — foi o que aconteceu aqui — o envio é grande de
mais para o tamanho de bloco por omissão do git. Resolve-se uma vez:

```bash
git config http.postBuffer 524288000
git config http.version HTTP/1.1
```

E repete-se o `push`.

**Como se confirma:**

```bash
git ls-remote --heads origin
```

Se devolver uma linha com `refs/heads/main`, está lá. Se não devolver nada, o
repositório existe mas está vazio — o `push` não passou.

> **O repositório deve ser privado** se o código não é seu para publicar.
> GitHub → Settings → General → Danger Zone → Change visibility.

---

## 3. A base de dados primeiro, sempre

**Ordem:** base → migrações → primeira conta → serviços. Ao contrário, o
backend sobe e morre à procura de uma base que não existe.

No Neon: **New Project**, e três escolhas que importam:

- **Postgres 18** — é a versão para que o sistema foi feito.
- **Região igual à do backend.** Aqui, Frankfurt nos dois. Com a base em Oregon
  e o backend em Frankfurt, cada consulta atravessa o Atlântico duas vezes:
  ~150 ms em vez de ~2 ms. Um ecrã com dez consultas fica um segundo e meio
  mais lento, e há ecrãs com mais de dez.
- **Neon Auth desligado** — a aplicação já tem contas, sessões e segundo
  factor. Ligar aquilo era pôr lá um segundo sistema de contas sem uso.

No fim, o Neon dá a **connection string**:

```
postgresql://utilizador:PALAVRA_PASSE@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

---

## 4. Onde se guarda uma linha destas (e onde NÃO se guarda)

Aquela linha tem a palavra-passe da base lá dentro. Quem a tiver, tem os dados.

**Onde não vai:** não vai para o código, não vai para o git, não se cola numa
conversa, e é melhor não ir para o histórico da shell.

**O que se fez aqui:** um ficheiro próprio, que o git ignora.

```bash
# Producao/backend/.env.neon
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
```

Confirma-se que o git o ignora mesmo:

```bash
git check-ignore -v Producao/backend/.env.neon
```

Se responder com a linha do `.gitignore` que o apanha, está seguro. Se não
responder nada, **o ficheiro ia para o GitHub** — pare e corrija o
`.gitignore` antes de continuar.

Para usar o ficheiro sem o escrever no ecrã:

```bash
set -a && . ./.env.neon && set +a
```

`set -a` faz com que tudo o que se defina a seguir seja exportado para os
programas que se chamem; o `.` (ponto) lê o ficheiro; `set +a` volta ao normal.
A partir daqui, os comandos nesta janela do terminal conhecem a `DATABASE_URL`
sem ela aparecer em lado nenhum.

---

## 5. Criar as tabelas — migrações

A base nasce vazia. As tabelas são criadas pelas **migrações**: ficheiros
numerados que descrevem cada alteração à estrutura desde o princípio do
projecto.

```bash
cd Producao/backend
set -a && . ./.env.neon && set +a
./.venv/Scripts/python.exe -m alembic upgrade head
```

`head` significa «até à última». O Alembic vê em que ponto a base está,
compara com os ficheiros que existem, e aplica só o que falta. Correr isto duas
vezes não faz mal nenhum: da segunda não tem nada a fazer.

**Como se confirma** — 41 tabelas e a migração no topo:

```bash
./.venv/Scripts/python.exe -c "
from sqlalchemy import create_engine, text
from src.db.base import url_do_motor
import os
e = create_engine(url_do_motor(os.environ['DATABASE_URL']))
with e.connect() as c:
    n = c.execute(text(\"select count(*) from information_schema.tables where table_schema='public'\")).scalar()
    v = c.execute(text('select version_num from alembic_version')).scalar()
    print('tabelas:', n, '| migração:', v)
"
```

---

## 6. A primeira conta

Não há nenhuma. A aplicação não traz contas de fábrica de propósito: uma conta
com palavra-passe conhecida numa instalação real é uma porta aberta.

```bash
cd Producao/backend
set -a && . ./.env.neon && set +a
./.venv/Scripts/python.exe scripts/criar_superadmin.py
```

Pede nome, e-mail e palavra-passe **na consola**. Não aceita a palavra-passe
por argumento, e é de propósito: o que se passa num argumento fica no histórico
da shell e na lista de processos, onde qualquer outra sessão da máquina o vê.

**Este comando é o único que tem mesmo de correr você.** Ninguém deve saber
essa palavra-passe além de si.

> **Nunca corra o `criar_demo.py` numa base a sério.** Ele recusa-se em
> produção, e faz bem: cria contas com palavras-passe conhecidas.

---

## 7. Os serviços no Render

O ficheiro `render.yaml`, na raiz do repositório, descreve os dois serviços.
No Render é **New → Blueprint** → escolher o repositório. Ele lê o ficheiro.

O que o ficheiro diz, por serviço:

| Campo | Backend | Frontend |
|---|---|---|
| `rootDir` | `Producao/backend` | `Producao/frontend` |
| `buildCommand` | `pip install -r requirements.txt` | `npm ci && npm run build && cp -r …` |
| `startCommand` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `node .next/standalone/server.js` |
| `healthCheckPath` | `/api/health` | `/entrar` |

Três coisas que se aprendem à custa de as errar:

**`$PORT` não se inventa.** O Render escolhe a porta e diz-a nesta variável.
Fixar 8001 faz o serviço subir e nunca receber um pedido.

**A sonda de saúde tem de devolver 200.** Estava apontada a `/docs` — que
*fecha* em produção e devolve 404. O Render leria «serviço doente» e
reiniciava-o em ciclo. `/api/health` é a única rota sem autenticação, e existe
para isto.

**O Next standalone atende no nome do contentor.** O `server.js` faz
`process.env.HOSTNAME || '0.0.0.0'`, e o Render — como qualquer plataforma
sobre Kubernetes — define `HOSTNAME` com o nome do pod. O Next passa a atender
só nesse nome, o encaminhador não lhe chega, e o site responde **502 com os
registos a dizer «Ready»**. Daí o `HOSTNAME=0.0.0.0` no `startCommand`.

Como se reconhece sem adivinhar: `curl -D- https://…` e olhar para o
`x-render-origin-server`. Se disser o nome do servidor da aplicação (`uvicorn`,
`Next.js`), é a aplicação a responder; se disser `Render`, não há nada a
atender e o problema é de arranque ou de ligação, não de código.

**O `output: standalone` do Next não copia tudo.** Faltam o `.next/static` e a
`public/`, e sem as duas cópias no build o site sobe sem CSS nenhum e os
ficheiros de `public/` dão 404. Daí as duas linhas de `cp` no `buildCommand`.

---

## 8. O nó que apanha toda a gente: os dois endereços

O backend só aceita pedidos do frontend se souber o endereço dele
(`CORS_ORIGINS`). O frontend só sabe falar com o backend se souber o endereço
dele (`NEXT_PUBLIC_API_URL`). E nenhum dos dois existe antes de estarem criados.

Faz-se assim:

1. Criar os dois com os endereços **previstos**
   (`https://aycontabilidade-api.onrender.com` e `…-web.onrender.com`).
2. Depois de criados, **confirmar os endereços reais**. Se o nome já estivesse
   ocupado, o Render acrescenta um sufixo e o que se pôs está errado.
3. Corrigir as duas variáveis e **reconstruir o frontend**.

A reconstrução não é opcional: tudo o que começa por `NEXT_PUBLIC_` é lido
**quando se constrói**, não quando se arranca. Reiniciar o serviço mantém o
endereço antigo lá dentro.

**Sintomas, para reconhecer sem adivinhar:**

- Ecrã carrega mas nada tem dados, e a consola do browser diz *CORS* →
  `CORS_ORIGINS` errado no backend.
- Ecrã carrega e os pedidos vão para `localhost:8001` → `NEXT_PUBLIC_API_URL`
  errado, ou o frontend não foi reconstruído depois de o corrigir.
- Backend nem arranca, e o registo diz que não arranca em `AMBIENTE=producao`
  → é a rede de segurança da aplicação. A mensagem diz qual das condições
  falhou; não se contorna, corrige-se.

---

## 9. O que o plano gratuito custa

- **Adormece** com 15 minutos sem pedidos. O primeiro pedido a seguir demora
  cerca de **um minuto**. Não é avaria.
- **750 horas de serviço por mês** por conta, somando os serviços.
- O Neon adormece em 5 minutos e acorda em menos de um segundo.
- **Não há cópias de segurança.** Numa avaliação com dados de uma empresa a
  sério, uma cópia por semana é o mínimo:

```bash
pg_dump "postgresql://...neon.tech/neondb?sslmode=require" -Fc -f copia-2026-08-16.dump
```

---

## 10. A ordem, em nove linhas

```
1. Código no GitHub (privado)         git push -u origin main
2. Base no Neon                       Postgres 18, mesma região do backend
3. Ligação num ficheiro ignorado      .env.neon
4. Tabelas                            alembic upgrade head
5. Primeira conta                     scripts/criar_superadmin.py
6. Serviços                           Render → Blueprint
7. Endereços reais                    corrigir CORS_ORIGINS e NEXT_PUBLIC_API_URL
8. Reconstruir o frontend             obrigatório após mudar NEXT_PUBLIC_*
9. Entrar, activar o 2FA, criar a licença e a empresa
```

Guarde à parte, fora do Render, a `TOTP_CHAVE_CIFRA`. Se se perder, todas as
contas com segundo factor têm de o configurar outra vez — e a administração da
plataforma exige segundo factor.

---

## 11. As migrações — hoje automáticas, e porquê

**Já não é preciso fazer nada.** O `render.yaml` corre `alembic upgrade head`
na construção do backend, a cada envio. Esta secção fica para se perceber
porque é que lá está, e para o dia em que for preciso fazer o passo à mão.

### O acidente, duas vezes

O Render reconstrói e reinicia sozinho a cada `git push`. **A base de dados
não.** O código sobe com colunas novas, a base fica como estava, e o resultado
não se parece nada com o problema: o `entrar` devolve 500, o 500 vai sem
cabeçalhos de CORS, o browser bloqueia a resposta e o ecrã diz «não foi
possível contactar o servidor». Passa-se meia hora a olhar para a rede quando
o que falta é uma coluna.

Aconteceu duas vezes. Da primeira, três migrações por aplicar e a coluna `eac`
em falta rebentava **todas** as consultas que tocavam em `Empresa` — ou seja, a
entrada na aplicação. Da segunda, uma migração só, e **já com esta secção
escrita**: foi o que provou que documentar não chegava.

### Porque é que está no `buildCommand`

O sítio certo seria o `preDeployCommand` — corre depois de construir, antes de
a versão nova entrar ao serviço, e se falhar o Render não troca. Mas **exige
plano pago**, e uma linha que não corre não protege ninguém.

No `buildCommand` corre sempre. O que se perde: se a construção passar e o
arranque falhar, a base fica migrada com o código antigo de pé. Para migrações
que só **acrescentam** não faz diferença — o código antigo ignora colunas que
não conhece. Numa migração que **apague ou renomeie**, fazer à mão e pela ordem
certa.

### À mão, quando for preciso

Com o `.env.neon` carregado, ver onde está a base e onde está o código:

```bash
./.venv/Scripts/python.exe -m alembic current
```

```bash
./.venv/Scripts/python.exe -m alembic heads
```

Se os dois não derem o mesmo identificador, a base está atrasada. Aplica-se:

```bash
./.venv/Scripts/python.exe -m alembic upgrade head
```

**Se der «não foi possível contactar o servidor» a seguir a um envio**, é aqui
que se olha primeiro. O sintoma parece de rede e quase nunca é.
