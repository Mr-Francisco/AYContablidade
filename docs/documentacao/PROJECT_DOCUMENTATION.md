# SGD — Documentação do projecto

Descreve o sistema **como ele está**, não como se gostaria que estivesse. O que
não está feito aparece marcado **[PENDENTE]**.

Levantado em 2026-08-09, contra o código: 141 rotas de API, 39 tabelas, 67
páginas, 389 testes.

---

## 1. Objectivo

Um ERP de contabilidade para empresas em Angola, em conformidade com o
**PGC-AR** (Plano Geral de Contabilidade — Angola Revisto).

O problema que resolve: em quase todas as empresas deste tamanho, o mês fecha-se
duas vezes — uma no sistema e outra numa folha de cálculo. A facturação está
num lado, os salários noutro, o stock numa terceira folha, e alguém passa dias
a juntar tudo. O SGD junta contabilidade, IVA, salários, facturação, stocks e
imobilizados no mesmo sítio: **lança-se uma vez e os mapas saem do que já foi
lançado**.

É **multiempresa**: uma instalação serve muitas empresas, cada uma com os seus
dados isolados, os seus utilizadores e a sua licença. É vendido por licença,
com limites por empresa.

---

## 2. Arquitectura

```
                       ┌──────────────────────────┐
   browser ──https──►  │  Proxy (Caddy / nginx)   │
                       └───┬──────────────────┬───┘
                           │                  │
              ┌────────────▼──────┐    ┌──────▼────────────┐
              │ Next.js 16        │    │ FastAPI           │
              │ React 19 + TS     │    │ Python 3.12       │
              │ :3000             │    │ :8001             │
              └───────────────────┘    └──────┬────────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │ PostgreSQL 18     │
                                    │ 39 tabelas        │
                                    └───────────────────┘
                                              │
                                    ┌─────────▼─────────┐
                                    │ OpenAI (só o      │
                                    │ assistente)       │
                                    └───────────────────┘
```

Três decisões que atravessam tudo:

1. **O frontend não é a fronteira de segurança.** Toda a autorização é
   verificada no servidor, em cada pedido. O menu que esconde um módulo é
   conveniência; quem manda é o `exigir_cap` do backend.
2. **O dinheiro é `Numeric(18,2)` na base, `Decimal` em Python e `string` no
   JSON.** No browser usa-se `big.js`. Um `float` num campo de dinheiro é erro.
3. **A separação entre empresas está no servidor.** Toda a tabela de negócio
   tem `empresa_id` e nenhuma consulta corre sem esse filtro.

---

## 3. Frontend

**Next.js 16.3 (App Router), React 19.2, TypeScript 5, Tailwind CSS 4.**

| Peça | Uso |
|---|---|
| `radix-ui` 1.6 | Diálogos, tabs, switches, radios — acessibilidade feita |
| `framer-motion` 13 | Reveals on-scroll, stagger. Só `transform`/`opacity` |
| `recharts` 3 | Gráficos do painel |
| `swr` 2.5 | Dados do servidor, cache e revalidação |
| `big.js` 7 | Aritmética de dinheiro no browser |
| `@biomejs/biome` 2.4 | Lint e formatação |

### Estrutura

```
frontend/src/
├── app/
│   ├── page.tsx              → apresentação PÚBLICA (SEO, sem JS de cliente)
│   ├── sitemap.ts, robots.ts → SEO técnico
│   ├── entrar/ registar/ activar/  → públicas
│   └── (app)/                → aplicação, 67 páginas, exige sessão
│       ├── painel/ contabilidade/ analitica/ contas-correntes/
│       ├── comercial/ logistica/ imobilizados/ rh/ fiscalidade/
│       ├── assistente/ gestao/ configuracoes/ perfil/
│       └── plataforma/       → só superadministrador
├── components/ui/            → sistema de design
├── components/plataforma/    → área da plataforma
├── contexts/                 → AuthContext, TemaContext
├── lib/                      → api, hooks, navegacao, dinheiro, institucional
├── types/                    → tipos da API, escritos à mão
└── proxy.ts                  → guarda de rotas (era middleware.ts no Next 15)
```

### A página pública

`app/page.tsx` é um **componente de servidor sem JavaScript de cliente**:
pré-renderizada como estática, chega pronta. Traz metadata própria, canónica,
Open Graph, dados estruturados (SoftwareApplication + FAQPage), `sitemap.xml` e
`robots.txt`. Os dados institucionais vivem em `lib/institucional.ts`, vazios
por omissão — a página só mostra os campos preenchidos.

### O guarda de rotas

`proxy.ts` verifica apenas a **presença** do cookie de sessão, para não mostrar
um instante de página protegida a quem não tem sessão. Não é segurança: o
backend valida o token, a versão de sessão, a licença e as permissões em cada
pedido. Um cookie forjado aqui não dá acesso a dado nenhum.

O `robots.txt` e o `sitemap.xml` estão excluídos do `matcher` — apanhados pela
guarda, respondiam com redireccionamento e a página deixava de ser indexável.

---

## 4. Backend

**FastAPI (Python 3.12), SQLAlchemy 2.0, Alembic, Pydantic 2, PyJWT, SlowAPI.**

```
backend/
├── main.py                   → entry point; re-exporta src/api/main.py
├── src/
│   ├── api/
│   │   ├── main.py           → app, CORS, limites, handlers
│   │   ├── deps.py           → utilizador_atual, exigir_cap, exigir_superadmin
│   │   ├── mestres.py        → peças partilhadas de alterar/eliminar
│   │   ├── limites.py        → SlowAPI
│   │   └── routers/          → 15 routers, um por domínio
│   ├── auth/                 → security.py, totp.py, permissions.py
│   ├── core/                 → config, constants, pgc, rh, fiscalidade, rede
│   ├── db/
│   │   ├── base.py           → Base, mixins, sessão
│   │   ├── models/           → 39 tabelas
│   │   └── schemas/          → Pydantic
│   └── services/             → regras de negócio
│       ├── contabilidade.py  → motor de lançamentos
│       ├── apuramentos.py    → IVA e resultados
│       ├── demonstracoes.py  → balanço, DR, fluxos, notas
│       ├── rh.py             → IRT, INSS, folha, recibos
│       ├── comercial.py logistica.py compras.py imobilizados.py
│       ├── licenciamento.py auditoria.py seed.py empresa.py
│       └── ia/               → qa, contexto, diagnostico, precos, consumo,
│                               config, modelos, pseudonimizacao
├── alembic/versions/         → 18 migrações
├── scripts/
│   │   criar_demo.py         → dados de demonstração (RECUSA em produção)
│   └── criar_superadmin.py   → primeira conta real
└── tests/                    → 389 testes
```

### Rotas

141 no total. Por área:

| Prefixo | Nº | O que faz |
|---|---:|---|
| `/api/contabilidade` | 23 | Contas, diários, documentos, centros, lançamentos, exercícios, fechos |
| `/api/licencas` | 21 | Licenças, empresas, contas da plataforma, auditoria, IA |
| `/api/rh` | 14 | Colaboradores, processamento, pagamentos, recibos, tabelas |
| `/api/comercial` | 12 | Clientes, vendedores, vendas, comissões |
| `/api/relatorios` | 11 | Balancete, balanço, DR, razão, extractos, fluxos, notas |
| `/api/auth` | 11 | Login, 2FA, refresh, perfil |
| `/api/logistica` | 9 | Artigos, armazéns, movimentos, existências |
| `/api/ia` | 9 | Âmbitos, contexto, perguntar, histórico, diagnóstico |
| `/api/compras` | 7 | Fornecedores, compras |
| `/api/users` | 6 | Utilizadores da empresa |
| `/api/imobilizados` | 6 | Activos, amortizações |
| `/api/empresa` | 4 | Ficha e configuração |
| `/api/apuramentos` | 4 | IVA e resultados |
| `/api/fiscalidade` | 3 | Impostos, obrigações, calendário |
| `/api/health` | 1 | Sonda — a **única** rota sem autenticação |

Métodos: 92 GET, 51 POST, 24 DELETE, 19 PATCH, 6 PUT.

---

## 5. Base de dados

**PostgreSQL 18**, 39 tabelas, esquema gerido por **Alembic** (18 migrações).

Todas as tabelas de negócio herdam de `EmpresaScopedMixin`, que impõe
`empresa_id` — é o que sustenta o isolamento.

| Área | Tabelas |
|---|---|
| Plataforma | `empresas`, `licencas`, `users`, `config_empresa`, `config_plataforma`, `exercicios`, `auditoria` |
| Contabilidade | `contas`, `diarios`, `documentos_contabilisticos`, `centros_custo`, `fluxos`, `lancamentos`, `lancamento_linhas`, `diario_fechos`, `notas_texto` |
| Comercial | `terceiros`, `vendedores`, `vendas`, `venda_linhas`, `sequencias_venda` |
| Compras/Logística | `compras`, `compra_linhas`, `artigos`, `armazens`, `movimentos_stock`, `sequencias_documento` |
| RH | `colaboradores`, `rh_processamentos`, `rh_alteracoes`, `rh_pagamentos`, `rh_independentes`, `rh_honorarios`, `rh_mapa_irt` |
| Imobilizados | `ativos`, `processos_amortizacao` |
| IA | `ia_consultas`, `ia_modelos` |

### Dinheiro

`Numeric(18,2)` na base, `Decimal` em Python, **`string` no JSON**, `big.js` no
browser. Os preços de IA usam `Numeric(12,6)` porque há modelos abaixo de um
cêntimo por milhão de tokens.

---

## 6. Autenticação e autorização

### Login em três factores

1. **Empresa** — código (`DC001`) **ou** nome. Vazio para contas de plataforma.
2. **E-mail e palavra-passe** — bcrypt com pré-hash SHA-256.
3. **Segundo factor**, se a conta o tiver.

### JWT

Reivindicações: `sub`, `emp` (empresa), `perfil`, `tv` (versão de sessão),
`tipo`, `iat`, `exp`, `sa` (fim absoluto), e `escopo: "plataforma"` nas contas
de plataforma.

- Token de acesso: **30 min** (15 para plataforma)
- Sessão absoluta: **12 h** (2 h para plataforma)
- `POST /auth/refresh` renova sem ultrapassar o limite absoluto
- `token_version` revoga sessões em mudança de palavra-passe, perfil ou estado

**O `tipo` sustenta o 2FA**: o primeiro passo devolve um desafio, não um token;
`utilizador_atual` recusa qualquer token cujo `tipo` não seja `acesso`.

### Segundo factor (TOTP)

RFC 6238 via `pyotp`, QR por `segno`. O segredo é cifrado em repouso com Fernet
(`TOTP_CHAVE_CIFRA`). Códigos de recuperação em SHA-256. Bloqueio ao fim de 3
tentativas, 15 minutos. **Obrigatório para contas de plataforma.**

Uma palavra-passe errada numa conta com 2FA devolve um **desafio isco** — um
JWT assinado com uma chave aleatória que se perde. Sem isto, o formulário
servia para confirmar palavras-passe.

### Três camadas de acesso

Um pedido a uma rota de negócio passa por todas:

1. **Licença** — o módulo está no plano contratado?
2. **Módulo** — está activo para esta empresa e permitido a este utilizador?
3. **Capacidade** — o perfil tem a acção? (`contab.lancar`, `rh.gerir`, …)

Tudo em `exigir_cap`, um sítio só: nenhum router se pode esquecer.

### Perfis

`superadmin` e `admin` têm `*`. Os outros:

| Perfil | Capacidades |
|---|---|
| contabilista | contab.ver/lancar/plano/fechar, financeiro.ver, imob.*, analitica.*, empresa.ver |
| financeiro | financeiro.ver/gerir, contab.ver, comercial.ver, logistica.ver |
| comercial | comercial.ver/gerir, financeiro.ver |
| logistica | logistica.ver/gerir, imob.ver |
| rh | rh.ver, rh.gerir |
| consulta | só `.ver` em todos os módulos |

Por cima, cada utilizador pode ter `modulos_permitidos` (restringe) e
`permissoes_accao` (restringe por acção). **Ambos verificados no servidor.**

---

## 7. Segurança

| Medida | Como |
|---|---|
| Palavras-passe | bcrypt + pré-hash SHA-256 |
| Chaves de licença | SHA-256 (indexável; a chave nunca é recuperável) |
| Segredos de 2FA | Fernet (AES-128-CBC + HMAC) |
| Limite de pedidos | 5 logins/min, 120 pedidos/min (SlowAPI) |
| Origem do pedido | `core/rede.py`; `X-Forwarded-For` só de proxies configurados |
| Auditoria | Autor, momento, alvo, antes e depois |
| Isolamento | `empresa_id` verificado no servidor |
| Períodos fechados | Diário+mês; um `exercicio_id` inventado é recusado |
| CORS | Lista explícita |
| Cabeçalhos | HSTS, X-Frame-Options, nosniff, Permissions-Policy |
| Guardas de arranque | Recusa arrancar em produção com definições de dev |
| Segredos | Só em `.env` — nunca no código |

**`--no-proxy-headers` não é opcional.** O uvicorn reescreve a origem do pedido
a partir do `X-Forwarded-For` antes de a aplicação a ver, e qualquer cliente
forja esse cabeçalho.

---

## 8. Empresas e utilizadores

### Ciclo de vida

```
superadmin gera licença → chave (mostrada UMA vez)
        ↓
alguém activa em /activar (NIF e nome confirmados)
        ↓
empresa criada + PGC-AR semeado + admin criado    [uma transacção]
        ↓
admin cria a equipa (limite da licença)
        ↓
estados: activa ⇄ suspensa → cancelada
```

Suspender bloqueia o login **e** invalida sessões abertas.

### Contas de plataforma

Até **3** (`MAX_SUPERADMINS`) — uma só é ponto único de falha, muitas
multiplicam a superfície de ataque. Não pertencem a empresa nenhuma, exigem 2FA,
e o menu só lhes mostra a área da plataforma.

---

## 9. Módulos

Todos construídos, todos com páginas:

| Módulo | O que tem |
|---|---|
| **Contabilidade** | Movimentos, plano de contas, balancetes geral e do razão, balanço, DR, notas, fluxos de caixa, apuramento de IVA, retenções, extractos, razão, diários, documentos |
| **Analítica** | Centros de custo, mapa de custos |
| **Contas correntes** | Clientes e fornecedores, saldos, antiguidade |
| **Comercial** | Vendas (11 tipos de documento), consulta de facturas, clientes, vendedores, comissões |
| **Logística** | Artigos, compras, recepção, expedição, transferências, acertos, existências, armazéns |
| **Imobilizados** | Ficha de activos, amortizações (quotas constantes e degressivas) |
| **RH** | Funcionários, alterações mensais, processamento (IRT+INSS), pagamentos, recibos, simulação, independentes, tabelas |
| **Fiscalidade** | Impostos, regimes de IVA, obrigações, calendário, mapa de remunerações |
| **Assistente** | Perguntas e respostas, diagnóstico local |
| **Gestão** | Utilizadores, auditoria |
| **Plataforma** | Empresas, licenças, consumo de IA, contas, auditoria, configurações |

---

## 10. Funcionalidades contabilísticas

### Motor de lançamentos

`services/contabilidade.py:postar()`. Sete validações, e nenhuma se salta:

1. O diário existe
2. O documento existe e pertence ao diário
3. Pelo menos duas linhas
4. Todas as contas existem no plano
5. Nenhuma conta é integradora (só as de movimento recebem lançamentos)
6. **Débito = crédito**, ao cêntimo
7. O período não está fechado

O nº de operação é `PP/DOC.NNN` — período, documento, sequência — igual ao
Piloto.

### Exercícios

Um exercício tem nome, início, fim, estado e a marca de activo. **Vários podem
estar activos ao mesmo tempo** (transição de ano) — `ativo` é um interruptor,
não uma escolha exclusiva.

Gerem-se em **Contabilidade → Exercícios** (`contab.ver` para ver,
`contab.fechar` para alterar): criar, fechar, reabrir, activar e desactivar.
Um exercício **fechado não aceita lançamentos em nenhum diário**, e reabre-se a
qualquer momento.

Nasce sempre aberto — `estado` não é campo do pedido de criação. O nome e as
datas não se alteram depois de criado: os lançamentos guardam o **id** do
exercício, e mover as datas por baixo deles mudava o período a que pertencem
sem lhes tocar.

Não há rota para **eliminar** um exercício. É deliberado: um exercício com
lançamentos não se deve apagar, e a alternativa é fechá-lo.

### Diários e fechos

Cada diário tem código, nome e categoria (a categoria determina em que módulos
é oferecido). O **fecho é por diário e mês**, como no Piloto: fechado o diário
10 para Agosto, nenhum lançamento novo entra nesse par. Reabrir é `DELETE` do
fecho.

A gestão faz-se na página dos Diários: escolhe-se o exercício na barra de
filtros, e cada linha mostra quantos períodos estão fechados e abre a janela
«Gerir fechos» com os 16 períodos do PGC-AR (00 abertura, 01–12 meses, 13–15
rectificação e apuramento).

CRUD completo, com uma regra: **um diário com movimentos ou documentos não se
apaga** — desactiva-se.

### Plano de contas

PGC-AR, ~500 contas semeadas na criação da empresa. Tipos: **R** (raiz), **I**
(integradora), **M** (movimento). Só as de movimento recebem lançamentos.

Criar, alterar, criar subcontas (com o código sugerido pelo servidor) e
importar um plano externo. O **código nunca se altera** — é o que os movimentos
guardam.

### Lançamentos diferidos

Um lançamento gravado como **diferido** fica pendente: **não entra no
balancete, no razão, no extracto, nos fluxos nem nos apuramentos**. Aparece na
listagem só com «Incluir diferidos».

**Integrar** (`POST /lancamentos/{id}/integrar`) passa-o a contar em todos,
regista quem integrou e quando. Integrar duas vezes não duplica. O botão está
no detalhe do movimento, para quem tem `contab.lancar`.

### Apuramentos

- **IVA**: liquidado (C−D), dedutível (D−C), regularizações; período 13, diário
  34, documento 341, contas 3453/3452/3454/34551/34561/34571.
- **Resultados**: imposto (871+872 → 885, doc 821) e fecho (88x → 8111, doc
  822); diário 81, período 14. Idempotente por reabertura.

### Demonstrações

Balancete geral e do razão, balanço, demonstração de resultados, fluxos de
caixa e notas — todos na estrutura PGC-AR, linha a linha igual ao Piloto. O
balanço traz `equilibrado` por igualdade exacta.

### RH

Tabela de IRT com 11 escalões (`2026-oficial-v2`), IRPS 2027, INSS 3%
trabalhador / 8% entidade patronal, retenção de honorários 6,5%.

Duas subtilezas que a folha respeita: o **INSS incide sobre o salário base já
descontado de faltas**, não sobre o bruto; e a **matéria colectável do IRT é
`bruto − INSS`**. Faltas a base 30 dias.

Reprocessar um mês já processado é **recusado** — no Piloto voltava a lançar e
o custo com pessoal ficava contado duas vezes.

---

## 11. Auditoria

`services/auditoria.py`. Cada registo tem autor, momento, IP, acção, tipo e id
do alvo, descrição, e **antes/depois** em JSONB.

Acções registadas: `licenca.gerar`, `licenca.activar`, `empresa.estado`,
`utilizador.criar`, `utilizador.alterar`, `plataforma.config_ia`,
`plataforma.modelo_ia_criar/alterar/padrao/eliminar`, e as de contas de
plataforma.

A activação de licença é o único registo **sem autor** — quem activa ainda não
tem conta.

**[PENDENTE]** Nem todas as operações de negócio são auditadas; a auditoria
cobre administração de plataforma e de utilizadores.

---

## 12. Inteligência artificial

**A IA é ferramenta de consulta. Não substitui processo contabilístico nenhum.**

### O que faz

- Responde sobre os dados da empresa em linguagem corrente
- **Diagnóstico local**: corre inteiramente no servidor, por regras, **sem
  contactar API nenhuma**. Continua a funcionar com o assistente desligado.

### O que nunca faz

- Não envia nomes nem identificadores pessoais
- Não executa SQL nem altera dados
- As empresas não têm acesso às credenciais — tudo passa pelo backend

### O caminho de uma pergunta

```
consultar a base (só a empresa da sessão)
    → agregar
    → pseudonimizar (nomes e identificadores substituídos)
    → VERIFICAR (se escapa um identificador, ABORTA)
    → enviar à API
    → repor os nomes na resposta
    → gravar consulta, tokens, preços e custo
```

A verificação antes do envio é deliberadamente redundante: é preferível falhar
a consulta a deixar sair um dado pessoal.

### Configuração dos modelos

Registo `ia_modelos`, gerido em **Plataforma → Configurações**. Cada linha tem
nome, identificador técnico, preço de entrada, preço da entrada em cache, preço
de saída, nota, estado e a marca de **padrão**.

Semente: `gpt-4.1`, `gpt-4.1-mini` (padrão) e `gpt-4o-mini`.

- **Só existe um padrão** — garantido por índice único parcial no PostgreSQL,
  não por código: duas escritas em paralelo passariam por qualquer verificação
  em Python.
- **O modelo é imposto pelo servidor.** O pedido de pergunta não tem campo por
  onde o escolher.
- **Só entram modelos com preço.** Sem preço não há custo estimado, e sem custo
  as quotas por empresa não travam nada.
- Um identificador escrito à mão é confirmado junto da API; não poder confirmar
  **avisa** mas não impede.

### Controlo de tokens

`max_tokens_saida` (200–4000, por omissão 800) é enviado como `max_tokens` no
pedido à API — **o corte é imposto pela API**, não pedido ao modelo no prompt.
A instrução no prompt existe para a resposta acabar bem, mas é secundária.

### Controlo de custos

Cada consulta grava: modelo, tokens de entrada, tokens servidos de cache,
tokens de saída, **os preços aplicados nesse momento** e o custo calculado.

Corrigir um preço hoje **não** reescreve o custo de ontem.

Fórmula: `(entrada−cache)×preço_entrada + cache×preço_cache + saída×preço_saída`,
por milhão. Sem preço de cache configurado, essa parte paga como entrada normal
— sobrestimar é seguro.

Limites por empresa (tokens e custo/mês) vivem na licença e são verificados
**antes** de a chamada ser feita. Há um **interruptor geral** que desliga o
assistente para toda a plataforma.

### Retenção

Dois prazos: descartar o pacote enviado (7–365 dias, por omissão 30) e apagar a
consulta (90–3650, por omissão 365). A limpeza corre depois de cada consulta,
sem agendador. **Nunca apaga o mês corrente** — é dele que saem os totais que
travam quem passa da quota.

---

## 13. Configurações importantes

### Ambiente (backend, `.env`)

| Variável | Por omissão | Nota |
|---|---|---|
| `AMBIENTE` | `dev` | `producao` liga as guardas, fecha `/docs`, cala o SQL |
| `DATABASE_URL` | — | Obrigatória |
| `JWT_SECRET_KEY` | — | Mínimo 32 caracteres |
| `TOTP_CHAVE_CIFRA` | — | Obrigatória em produção |
| `CORS_ORIGINS` | localhost:3000 | Em produção tem de ser https e não-local |
| `PROXIES_CONFIAVEIS` | vazio | Vazio = ignora `X-Forwarded-For` |
| `RATE_LIMIT_LOGIN` | 5/minute | |
| `MAX_SUPERADMINS` | 3 | |
| `OPENAI_API_KEY` | — | Sem ela, só o diagnóstico |
| `OPENAI_MODELO` | gpt-4o | **Só recurso** — o modelo vem do registo |

### Frontend

`NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL`. **Entram no build**, ficam
legíveis no browser — nunca um segredo.

### Geridas na aplicação, sem deploy

Modelo de IA e preços, tecto de tokens, prazos de retenção, interruptor do
assistente, limites por licença, módulos por empresa e por utilizador.

---

## 14. Integrações externas

| Serviço | Estado | Onde |
|---|---|---|
| **OpenAI** | Activo | Só o assistente. Chave só no `.env` |
| **AGT (consulta de NIF)** | Desligado por omissão | `AGT_ATIVO=false`. **[PENDENTE]** sem interface |
| E-mail (SMTP) | **[PENDENTE]** | Recuperação de palavra-passe depende disto |

---

## 15. Fluxos principais

### Nova empresa

```
superadmin → Plataforma → Licenças → gerar
    (chave mostrada UMA vez)
        → cliente activa em /activar (NIF + nome confirmados)
            → empresa + PGC-AR + admin criados numa transacção
                → admin cria a equipa
```

### Do documento ao balancete

```
venda emitida → lançamento automático (conta de proveito por tipo)
                       ↓
            balancete · balanço · DR · IVA · conta corrente
```

### Fecho do mês

```
lançar → conferir balancete → apurar IVA (período 13)
       → fechar diários do mês → apuramento de resultados (período 14)
```

### Pergunta ao assistente

```
escolher âmbitos → «ver o que é enviado» (opcional)
    → perguntar → quota verificada → pacote pseudonimizado e verificado
        → API → resposta com nomes repostos → consumo registado
```

---

## 16. Funcionamento geral

Uma instalação serve muitas empresas. Cada pedido traz um JWT que diz **quem** e
**de que empresa**; o servidor confirma a licença, o módulo e a capacidade, e
filtra por `empresa_id`. O que o utilizador vê é consequência disso, não a causa.

Os dados entram uma vez — num documento comercial, numa folha de salários, num
movimento manual — e os mapas são calculados a partir deles. Não há segunda
digitação, e por isso não há dois números para a mesma coisa.

O que se pode afinar sem parar o sistema: modelo de IA e preços, tecto de
tokens, retenção, limites por empresa, módulos, utilizadores e permissões.

---

## 17. Pendentes

| O que | Onde |
|---|---|
| Recuperação de palavra-passe por e-mail | `PENDENCIAS_PRIORITARIAS.md` §4 |
| Documento legal de venda (A4 + talão POS, QR) | `PENDENCIAS_PRIORITARIAS.md` §1 |
| Separadores de `empresa.html` | 5 dos 9 — `PENDENCIAS_PRIORITARIAS.md` §3 |
| Exportar CSV em vários mapas | |
| Drill-down do balancete | |
| Picker de contas com F4 | |
| Auditoria das operações de negócio | Hoje só administração |
| Integração AGT | Backend preparado, sem interface |

Detalhe em `docs/FIDELIDADE_AO_PILOTO.md`.
