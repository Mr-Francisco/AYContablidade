# Guia de instalação — do servidor limpo à aplicação a funcionar

Este documento leva alguém que nunca viu o projecto de um Ubuntu acabado de
instalar até ao SGD a responder num domínio, com HTTPS. Serve para **staging**
(servidor de teste) e para **produção** — a diferença está assinalada onde
existe.

Não descreve tecnologia que o projecto não use. Tudo o que aqui está
corresponde a ficheiros que existem no repositório.

**Antes de começar, leia a secção 16.** Há dois segredos que, se se perderem
depois de o sistema estar a ser usado, custam muito a recuperar.

---

## 1. Requisitos do servidor

| | Staging | Produção |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memória | 4 GB | 8 GB |
| Disco | 20 GB SSD | 40 GB SSD, com espaço para as cópias |
| Sistema | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

**Porquê Ubuntu 24.04:** traz Python 3.12 nos repositórios, que é a versão que
o backend usa. Noutra distribuição funciona, mas terá de resolver o Python à
mão.

O que consome recursos é o PostgreSQL e o build do frontend. O build é o pico:
com menos de 4 GB de memória, o `npm run build` pode ser morto pelo sistema. Se
o servidor for pequeno, construa noutra máquina e copie a pasta `.next`.

**Portas:** 80 e 443 abertas ao mundo. Mais nada. O backend (8001) e o frontend
(3000) só respondem em `127.0.0.1` — quem lhes chega é o proxy.

---

## 2. Preparar o servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw
```

Um utilizador próprio para a aplicação. Não corre como `root`, e assim um
problema na aplicação não é um problema na máquina:

```bash
sudo adduser --disabled-password --gecos "" aycontab
sudo mkdir -p /opt/aycontabilidade
sudo chown aycontab:aycontab /opt/aycontabilidade
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

O PostgreSQL (5432) **não** entra na lista: fica na máquina e ninguém de fora
lhe fala.

---

## 3. PostgreSQL 18

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
sudo systemctl enable --now postgresql
```

### Base de dados e utilizador

Gere a palavra-passe primeiro e guarde-a — vai precisar dela no `.env`:

```bash
openssl rand -base64 32
```

```bash
sudo -u postgres psql
```

```sql
CREATE USER aycontab WITH PASSWORD 'A_PALAVRA_PASSE_QUE_GEROU';
CREATE DATABASE aycontabilidade OWNER aycontab ENCODING 'UTF8'
  LC_COLLATE 'pt_PT.UTF-8' LC_CTYPE 'pt_PT.UTF-8' TEMPLATE template0;
\c aycontabilidade
-- `gen_random_uuid()` é usado nas migrações. Em PostgreSQL 13+ vem no core,
-- mas a extensão garante-o em qualquer instalação.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\q
```

Se `pt_PT.UTF-8` não existir, gere-o antes:

```bash
sudo locale-gen pt_PT.UTF-8 && sudo update-locale
```

Confirme que se liga:

```bash
psql "postgresql://aycontab:A_PALAVRA_PASSE@localhost:5432/aycontabilidade" -c "select version();"
```

---

## 4. Python 3.12 e Node 22

```bash
sudo apt install -y python3.12 python3.12-venv python3-pip libpq-dev build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
python3.12 --version   # 3.12.x
node --version         # v22.x
```

---

## 5. O código

```bash
sudo -iu aycontab
cd /opt/aycontabilidade
git clone <URL_DO_REPOSITORIO> .
```

Estrutura: `Producao/backend`, `Producao/frontend`, `Piloto/` (a versão antiga,
não é instalada), `docs/`.

---

## 6. Segredos

**Gere cada um com o seu próprio comando.** Nunca reutilize entre staging e
produção, e nunca copie o `.env` de desenvolvimento.

```bash
python3.12 -c "import secrets; print(secrets.token_urlsafe(48))"
```

São dois, e servem para coisas diferentes:

- **`JWT_SECRET_KEY`** assina as sessões. Rodá-la expulsa toda a gente e é uma
  operação normal.
- **`TOTP_CHAVE_CIFRA`** cifra os segredos de segundo factor guardados na base.
  **Guarde-a fora do servidor.** Perdê-la obriga todas as contas com 2FA a
  reconfigurá-lo — e como as contas de plataforma exigem 2FA, ficaria sem
  operador.

São separadas de propósito: derivar a segunda da primeira faria uma rotação de
rotina trancar toda a gente fora do 2FA.

---

## 7. Backend

```bash
cd /opt/aycontabilidade/Producao/backend
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
cp .env.producao.example .env
nano .env
```

Preencha:

```
AMBIENTE=producao
DATABASE_URL=postgresql+psycopg://aycontab:A_PALAVRA_PASSE@localhost:5432/aycontabilidade
JWT_SECRET_KEY=<o que gerou>
TOTP_CHAVE_CIFRA=<o outro que gerou>
CORS_ORIGINS=https://www.oseudominio.ao
PROXIES_CONFIAVEIS=127.0.0.1
PASSWORD_MIN_CARACTERES=10
OPENAI_API_KEY=<se quiser o assistente>
```

> **Em staging**, se ainda não tiver certificado, pode usar `AMBIENTE=teste`,
> que não aplica as guardas de produção. Assim que houver HTTPS, mude para
> `producao` — é essa a configuração que vai ser usada a sério.

**A aplicação recusa arrancar em `AMBIENTE=producao`** se o CORS apontar para
localhost ou http, se faltar a `TOTP_CHAVE_CIFRA`, se a base for local ou se a
política de palavras-passe estiver abaixo de 8. A mensagem diz qual. Não é um
aviso — é o arranque a falhar, de propósito: a instalação faz-se a copiar
ficheiros e ninguém relê documentos.

### Migrações

Criam as 39 tabelas e semeiam o registo de modelos de IA:

```bash
.venv/bin/alembic upgrade head
```

Confirmar:

```bash
psql "$DATABASE_URL" -c "\dt" | head -20
.venv/bin/alembic current
```

### Primeira conta

```bash
.venv/bin/python scripts/criar_superadmin.py
```

Pede nome, e-mail e palavra-passe na consola. **Não aceita a palavra-passe por
argumento** — o que passa num argumento fica no histórico da shell e na lista
de processos, onde outra sessão o lê.

**NUNCA corra `scripts/criar_demo.py` num servidor real.** Cria contas com
palavras-passe conhecidas. Com `AMBIENTE=producao` o próprio script se recusa.

### Testar à mão antes de criar o serviço

```bash
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8001 --no-proxy-headers
# noutra sessão:
curl http://127.0.0.1:8001/api/health
# {"estado":"ok","ambiente":"producao"}
```

---

## 8. Frontend

```bash
cd /opt/aycontabilidade/Producao/frontend
cp .env.producao.example .env.production.local
nano .env.production.local
```

```
NEXT_PUBLIC_API_URL=https://api.oseudominio.ao
NEXT_PUBLIC_SITE_URL=https://www.oseudominio.ao
```

**Estes valores entram no build, não no arranque.** Mudá-los depois obriga a
construir outra vez. E como começam por `NEXT_PUBLIC_`, ficam legíveis no
browser — nunca ponha um segredo aqui.

`NEXT_PUBLIC_SITE_URL` não é decorativo: sem ele, a etiqueta canónica da página
pública aponta para `localhost` e os motores de busca descartam-na.

```bash
npm ci
npm run build
```

O build produz `.next/standalone`, que corre sozinho sem a pasta
`node_modules`. Testar:

```bash
node .next/standalone/server.js
curl -I http://127.0.0.1:3000/
```

---

## 9. Manter os serviços a correr (systemd)

Duas unidades. `systemd` reinicia-as se caírem e arranca-as no arranque da
máquina.

```bash
sudo nano /etc/systemd/system/aycontab-backend.service
```

```ini
[Unit]
Description=AYContabilidade — backend (FastAPI)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=aycontab
WorkingDirectory=/opt/aycontabilidade/Producao/backend
# --no-proxy-headers NÃO É OPCIONAL: sem ele o uvicorn reescreve a origem do
# pedido a partir do X-Forwarded-For, que qualquer cliente forja, e a decisão
# sobre proxies de confiança em core/rede.py deixa de ter efeito.
ExecStart=/opt/aycontabilidade/Producao/backend/.venv/bin/python -m uvicorn main:app \
  --host 127.0.0.1 --port 8001 --no-proxy-headers --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo nano /etc/systemd/system/aycontab-frontend.service
```

```ini
[Unit]
Description=AYContabilidade — frontend (Next.js)
After=network.target aycontab-backend.service

[Service]
Type=simple
User=aycontab
WorkingDirectory=/opt/aycontabilidade/Producao/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node /opt/aycontabilidade/Producao/frontend/.next/standalone/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aycontab-backend aycontab-frontend
sudo systemctl status aycontab-backend aycontab-frontend
```

**Sobre `--workers 2`:** dois processos para que um pedido lento não bloqueie
os outros. Suba conforme os núcleos, mas note que cada worker abre a sua ligação
à base.

---

## 10. Domínio

Dois registos A a apontar para o IP do servidor:

| Nome | Tipo | Valor |
|---|---|---|
| `www` | A | IP do servidor |
| `api` | A | IP do servidor |

Confirme antes de pedir o certificado — o Let's Encrypt valida pelo DNS:

```bash
dig +short www.oseudominio.ao
dig +short api.oseudominio.ao
```

Pode servir tudo num só domínio com um caminho, mas dois subdomínios são mais
simples de separar e é o que a configuração de CORS assume.

---

## 11. Reverse proxy e HTTPS (Caddy)

**Caddy e não nginx:** obtém e renova o certificado sozinho, sem cron nem
certbot. Menos peças para falhar num servidor que ninguém vai vigiar todos os
dias.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

```bash
sudo nano /etc/caddy/Caddyfile
```

```
www.oseudominio.ao {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}

api.oseudominio.ao {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8001
}

# Quem escrever o domínio sem www vai parar ao mesmo sítio.
oseudominio.ao {
    redir https://www.oseudominio.ao{uri} permanent
}
```

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

O certificado é pedido no primeiro acesso e renovado sozinho. Se falhar, o
`journalctl -u caddy` diz porquê — quase sempre DNS que ainda não propagou.

### CORS

O `CORS_ORIGINS` do backend tem de ser **exactamente** o endereço do frontend,
com `https://` e sem barra no fim:

```
CORS_ORIGINS=https://www.oseudominio.ao
```

Errado aqui, o browser bloqueia todos os pedidos e a aplicação parece morta
sem dar erro visível. Confirme:

```bash
curl -I -H "Origin: https://www.oseudominio.ao" https://api.oseudominio.ao/api/health
# tem de vir: access-control-allow-origin: https://www.oseudominio.ao
```

### PROXIES_CONFIAVEIS

Com o Caddy à frente, ponha `PROXIES_CONFIAVEIS=127.0.0.1`. Sem isto, o IP que
fica no registo de auditoria é o do proxy e não o de quem fez o pedido.

---

## 12. Plano de contas e dados iniciais

**Não há seed de plano de contas a correr à mão.** O PGC-AR é semeado
automaticamente quando uma empresa é criada, dentro da mesma transacção da
activação da licença — uma empresa sem plano de contas não serviria para nada.

O caminho é este, e é todo pela aplicação:

1. Entre em `https://www.oseudominio.ao` — vê a página de apresentação.
2. **Entrar**, com a conta que criou. Deixe o campo da empresa vazio: as contas
   de plataforma não pertencem a nenhuma.
3. **Perfil → active o segundo factor.** A área de administração fica fechada
   até o fazer.
4. **Plataforma → Configurações**: confirme o modelo de IA e os preços contra a
   facturação real da OpenAI. O registo vem semeado com `gpt-4.1`,
   `gpt-4.1-mini` e `gpt-4o-mini`.
5. **Plataforma → Licenças → gerar**: indique NIF, nome, plano, duração,
   módulos e limites. **A chave é mostrada uma única vez** — a base guarda só o
   resumo criptográfico dela.
6. Entregue a chave. Quem a recebe activa-a em `/activar` e a empresa nasce com
   as ~500 contas do PGC-AR, os diários e os documentos prontos.

---

## 13. Cópias de segurança

**Uma cópia que nunca foi restaurada não é uma cópia.**

```bash
sudo -iu aycontab
mkdir -p /opt/aycontabilidade/backups
nano /opt/aycontabilidade/backup.sh
```

```bash
#!/bin/bash
set -euo pipefail
DESTINO=/opt/aycontabilidade/backups
DATA=$(date +%Y%m%d-%H%M)
export PGPASSWORD='A_PALAVRA_PASSE'
pg_dump -h localhost -U aycontab -d aycontabilidade -Fc \
  -f "$DESTINO/aycontab-$DATA.dump"
# Trinta dias no servidor. O que interessa mesmo é a cópia FORA dele.
find "$DESTINO" -name "aycontab-*.dump" -mtime +30 -delete
```

```bash
chmod +x /opt/aycontabilidade/backup.sh
crontab -e
```

```
0 3 * * * /opt/aycontabilidade/backup.sh >> /opt/aycontabilidade/backups/backup.log 2>&1
```

**Leve as cópias para fora do servidor.** Um disco que falha leva a base e as
cópias ao mesmo tempo.

**Ensaie a restauração** — num servidor de teste, não no de produção:

```bash
createdb -U aycontab ensaio
pg_restore -U aycontab -d ensaio /opt/aycontabilidade/backups/aycontab-XXXX.dump
psql -U aycontab -d ensaio -c "select count(*) from empresas;"
```

Guarde também, **fora do servidor**: a `TOTP_CHAVE_CIFRA` e a `JWT_SECRET_KEY`.
Sem a primeira, uma base restaurada tem os segredos de 2FA ilegíveis.

---

## 14. Registos (logs)

Os dois serviços escrevem para o journal:

```bash
sudo journalctl -u aycontab-backend -f
sudo journalctl -u aycontab-frontend -f
sudo journalctl -u caddy -f
sudo journalctl -u aycontab-backend --since "1 hour ago" | grep -i error
```

Em `AMBIENTE=producao` o SQL **não** é escrito no log — em `dev` é. Se vir
consultas SQL no journal de um servidor real, o `AMBIENTE` está errado.

Limitar o espaço que o journal ocupa:

```bash
sudo nano /etc/systemd/journald.conf   # SystemMaxUse=500M
sudo systemctl restart systemd-journald
```

---

## 15. Verificação final

Depois de instalar, corra isto. Se algum falhar, a secção 17 tem a causa.

```bash
# 1. Serviços de pé
sudo systemctl is-active aycontab-backend aycontab-frontend caddy postgresql

# 2. A API responde e diz que está em produção
curl -s https://api.oseudominio.ao/api/health
# {"estado":"ok","ambiente":"producao"}

# 3. A documentação da API está FECHADA
curl -s -o /dev/null -w "%{http_code}\n" https://api.oseudominio.ao/docs
# 404

# 4. A página pública responde e é indexável
curl -s -o /dev/null -w "%{http_code}\n" https://www.oseudominio.ao/
curl -s https://www.oseudominio.ao/robots.txt | head -3
curl -s https://www.oseudominio.ao/sitemap.xml | head -3

# 5. A canónica aponta para o domínio real, não para localhost
curl -s https://www.oseudominio.ao/ | grep -o '<link rel="canonical"[^>]*>'

# 6. A aplicação exige sessão
curl -s -o /dev/null -w "%{http_code}\n" https://www.oseudominio.ao/painel
# 307 (redirecciona para /entrar)

# 7. O CORS deixa passar o frontend
curl -s -I -H "Origin: https://www.oseudominio.ao" \
  https://api.oseudominio.ao/api/health | grep -i access-control

# 8. Sem sessão, os dados não saem
curl -s -o /dev/null -w "%{http_code}\n" https://api.oseudominio.ao/api/contabilidade/contas
# 401

# 9. HTTPS obrigatório
curl -s -o /dev/null -w "%{http_code}\n" http://www.oseudominio.ao/
# 308

# 10. A base tem as tabelas
psql "$DATABASE_URL" -c "select count(*) from pg_tables where schemaname='public';"
# 39
```

E na aplicação: entrar, activar o 2FA, gerar uma licença, activá-la noutra
janela, lançar um movimento, e conferir que o balancete equilibra.

---

## 16. Actualizar

```bash
sudo -iu aycontab
cd /opt/aycontabilidade

# Antes de tudo: uma cópia. É o que permite voltar atrás.
/opt/aycontabilidade/backup.sh

git pull

cd Producao/backend
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head

cd ../frontend
npm ci
npm run build

exit
sudo systemctl restart aycontab-backend aycontab-frontend
sudo systemctl status aycontab-backend aycontab-frontend
```

As migrações são cumulativas e correm sempre para a frente. **Nunca edite uma
migração já aplicada** — crie outra.

---

## 17. Voltar atrás (rollback)

### Só o código

```bash
cd /opt/aycontabilidade
git log --oneline -5
git checkout <commit_anterior>
cd Producao/frontend && npm ci && npm run build
sudo systemctl restart aycontab-backend aycontab-frontend
```

### Código e esquema

Se a versão nova trouxe migrações, tem de as desfazer **antes** de voltar ao
código antigo — o código antigo não conhece as tabelas novas:

```bash
cd /opt/aycontabilidade/Producao/backend
.venv/bin/alembic current          # onde está
.venv/bin/alembic history          # a sequência
.venv/bin/alembic downgrade <revisao_anterior>
cd /opt/aycontabilidade && git checkout <commit_anterior>
```

**Cuidado:** um `downgrade` que apaga colunas apaga os dados delas. Se a
migração destruiu informação, o caminho seguro é restaurar a cópia:

```bash
sudo systemctl stop aycontab-backend aycontab-frontend
dropdb -U aycontab aycontabilidade
createdb -U aycontab aycontabilidade
pg_restore -U aycontab -d aycontabilidade /opt/aycontabilidade/backups/aycontab-XXXX.dump
sudo systemctl start aycontab-backend aycontab-frontend
```

---

## 18. Problemas comuns

### O backend não arranca e diz «A aplicação não arranca em AMBIENTE=producao»

É a guarda a funcionar. A mensagem lista **todos** os problemas de uma vez.
Os mais frequentes:

- `CORS_ORIGINS` ainda com `localhost` → ponha o domínio público
- `CORS_ORIGINS` com `http://` → tem de ser `https://`
- `TOTP_CHAVE_CIFRA` vazia → gere-a
- `DATABASE_URL` com `localhost` → se a base é mesmo local, confirme que não é
  a de desenvolvimento; sendo, use o nome do host ou o IP interno

### A aplicação abre mas nenhum dado carrega

Quase sempre CORS. Abra a consola do browser: se disser *blocked by CORS
policy*, o `CORS_ORIGINS` não bate certo com o endereço. Tem de ser igual,
incluindo `www` e sem barra final.

Se não for CORS, confirme que o `NEXT_PUBLIC_API_URL` do build aponta para a
API certa — lembre-se que **entra no build**, não no arranque.

### `alembic upgrade head` falha com «relation already exists»

A base já tinha tabelas de uma tentativa anterior. Ou marca a revisão como
aplicada (se as tabelas estiverem certas):

```bash
.venv/bin/alembic stamp head
```

ou recomeça de vazio (**perde os dados**):

```bash
dropdb -U aycontab aycontabilidade && createdb -U aycontab aycontabilidade
.venv/bin/alembic upgrade head
```

### O `npm run build` é morto sem mensagem

Falta de memória. Confirme com `dmesg | tail`. Acrescente swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### O 2FA não activa

Falta a `TOTP_CHAVE_CIFRA`. Em produção a aplicação nem arranca sem ela; se
está a acontecer, o `AMBIENTE` não é `producao`.

### Não consigo entrar na área da plataforma

A conta de plataforma exige segundo factor. Entre, vá a **Perfil**, active-o.
Se perdeu o telemóvel, use um código de recuperação. Se perdeu os dois, outra
conta de plataforma pode limpar o 2FA em **Plataforma → Contas**.

### «Limite de utilização» ao entrar

O limite é de 5 tentativas por minuto por IP. É a protecção contra força bruta.
Espere um minuto.

Se estiver a acontecer a toda a gente ao mesmo tempo, o `PROXIES_CONFIAVEIS`
está mal: todos os pedidos aparecem como vindos do proxy e partilham o mesmo
contador.

### A página pública não aparece nas pesquisas

Confirme `NEXT_PUBLIC_SITE_URL` e reconstrua. Depois verifique que
`/robots.txt` e `/sitemap.xml` respondem 200 e não 307 — se redireccionarem
para o login, o `matcher` do `proxy.ts` foi alterado.

### O assistente responde «está desligado pela administração»

Alguém desligou o interruptor geral em **Plataforma → Configurações**. É
diferente de «falta a chave» e a mensagem distingue os dois.

### O IP na auditoria é sempre o mesmo

Falta `PROXIES_CONFIAVEIS=127.0.0.1`. Sem isso, o servidor vê o proxy como
origem de todos os pedidos.

---

## 19. Com Docker (alternativa)

O repositório traz `docker-compose.yml` (produção) e `docker-compose.dev.yml`
(desenvolvimento), com Dockerfiles para os dois serviços.

```bash
cp Producao/backend/.env.producao.example Producao/backend/.env
nano Producao/backend/.env
nano .env    # POSTGRES_USER, POSTGRES_PASSWORD, NEXT_PUBLIC_*
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/criar_superadmin.py
```

Os serviços ficam em `127.0.0.1:8001` e `127.0.0.1:3000` — o proxy da secção 11
continua a ser necessário. A base não expõe porta nenhuma.

---

## 20. Resumo dos comandos

```bash
# Estado
sudo systemctl status aycontab-backend aycontab-frontend caddy postgresql

# Reiniciar
sudo systemctl restart aycontab-backend aycontab-frontend

# Registos
sudo journalctl -u aycontab-backend -f

# Migrações
cd /opt/aycontabilidade/Producao/backend && .venv/bin/alembic upgrade head
.venv/bin/alembic current

# Cópia
/opt/aycontabilidade/backup.sh

# Actualizar
cd /opt/aycontabilidade && git pull \
  && cd Producao/backend && .venv/bin/pip install -r requirements.txt \
  && .venv/bin/alembic upgrade head \
  && cd ../frontend && npm ci && npm run build \
  && sudo systemctl restart aycontab-backend aycontab-frontend

# Saúde
curl -s https://api.oseudominio.ao/api/health
```
