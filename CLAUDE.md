# AYContablidade

Este projeto contém duas versões: **Piloto** e **Produção**. A versão **Piloto** é um ERP de Contabilidade totalmente funcional, desenvolvido em HTML, CSS e JavaScript puro, utilizando Local Storage para armazenamento dos dados. O objetivo não é criar um novo sistema, mas migrar e reestruturar toda a aplicação para uma arquitetura moderna, utilizando **Next.js (React + TypeScript)** no frontend e **Python com FastAPI** no backend, substituindo o Local Storage por uma base de dados. Durante a migração, a versão Piloto deve ser utilizada como referência, preservando todas as funcionalidades, regras de negócio, fluxos e comportamentos existentes, apenas modernizando a arquitetura, a organização do código e a escalabilidade do sistema.
 Interface em **Português (Portugal)**.
Tudo deve ser com base em Piloto/

## Stack

Frontend:
Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Radix UI, Framer Motion, Recharts, SWR, Leaflet, Prisma

Backend:
FastAPI (Python 3.12), SQLAlchemy 2.x, Alembic, Pydantic 2.x, JWT (PyJWT), SlowAPI (Rate Limiting)

Serviços:
Integração com a API da OpenAI (modelo mais recente disponível) para funcionalidades de perguntas e respostas sobre os dados do sistema.
Infra:
PostgreSQL 18.x

## Estrutura

```
frontend/src/{app,components,contexts,lib,types}   → Next.js App Router
frontend/src/proxy.ts                          → Guarda de rotas (verifica o mesmo JWT do backend)
backend/main.py                                     → Entry point (re-exporta src/api/main.py)
backend/
└── src/
    ├── api/            # Routers, endpoints e dependências
    ├── auth/           # Autenticação, JWT e permissões
    ├── db/             # Modelos, schemas, repositories e migrations
    ├── services/       # Regras de negócio
    ├── core/           # Configuração, constantes e utilitários
    ├── ingestion/      # Importação e processamento de documentos
    └── tests/          # Testes
backend/scripts/automation/                         
backend/tests/                                      → pytest (auth, JWT, users)
docker-compose.yml                                  → PRODUÇÃO: postgres (sem porta exposta),
                                                       backend (8001), frontend (3000)
docker-compose.dev.yml                              → DESENVOLVIMENTO: postgres em 5432,
                                                       código montado, recarga ao gravar
backend/.env  /  .env.example  /  .env.producao.example
frontend/.env.local  /  .env.example  /  .env.producao.example
```

Dois ficheiros de compose e não um com condições: um ficheiro único acaba por
ser copiado com a condição mal resolvida. Ver `docs/PRODUCAO.md`.

## Comandos

```bash
# --- Desenvolvimento ---
cd frontend && npm run dev                 # Frontend dev (3000, Turbopack)
cd backend && uvicorn main:app --port 8001 --no-proxy-headers  # Backend dev
cd frontend && npm run lint                # Biome + TypeScript
cd backend && pytest                       # Testes backend
python scripts/criar_demo.py               # Dados de demonstração (recusa-se em produção)
docker compose -f docker-compose.dev.yml up -d

# --- Produção (ver docs/PRODUCAO.md) ---
alembic upgrade head                       # Migrações
python scripts/criar_superadmin.py         # Primeira conta, sem valores por omissão
cd frontend && npm run build               # Build (output standalone)
docker compose up -d --build
```

Com `AMBIENTE=producao` o backend RECUSA ARRANCAR se o CORS apontar para
localhost ou http, se faltar `TOTP_CHAVE_CIFRA`, ou se a política de
palavras-passe estiver abaixo do mínimo. A mensagem diz qual.


## Regras Obrigatórias

1. Todo o texto visível ao utilizador em **Português (PT-PT)

2. Componentes interactivos: Utilizar Radix UI sempre que existir componente adequado. Componentes personalizados podem ser criados apenas quando não existir alternativa compatível.

3. Styling via Tailwind + cn() de @/lib/utils — sem inline styles

4. Imports com alias @/ → frontend/src/*

5. Backend: sessão/JWT obrigatório em todas as rotas de dados — nenhum endpoint novo sem Depends de auth

6. Segredos só em `.env` / variáveis de ambiente — nunca em `config.ini` nem no código

7. **Ler código existente** antes de criar ficheiros novos — vericica na pasta Piloto na raiz e em cada pasta dentro dele 

8. Inteligência Artificial:

O sistema deve funcionar localmente por padrão.

Não utilizar APIs externas de IA para processamento interno.

A integração com OpenAI é permitida exclusivamente no módulo de perguntas e respostas autorizado.

Nenhum dado sensível ou deve ser enviado para serviços externos sem validação.

9. Regra de Migração: A versão Produção deve preservar integralmente funcionalidades, regras de negócio, fluxos e comportamentos existentes. Antes de remover ou modificar qualquer comportamento existente no Piloto, deve existir uma justificação técnica.

10. Ler código existente antes de criar ficheiros novos — verifica na pasta Piloto na raiz e em cada pasta dentro dele

11. A versão de Produção deve ser uma réplica fiel do Piloto em termos de comportamento, regras de negócio e fluxos, modernizando apenas a arquitetura e a base de código.

## Regra de Design — Premium UI/UX

Tudo deve ser com base em Piloto/assets/css/style.css
Actua como designer UI/UX premium: layout editorial forte, tipografia refinada, espaçamento generoso, interacções elegantes — coerente com um produto enterprise para uma ERP de contabilidade.

- **Motion**: Framer Motion (já instalado) por defeito. Reveals on-scroll, stagger em cards e KPIs, transições discretas. Animar apenas `transform`/`opacity`, respeitar `prefers-reduced-motion`.
- **Dados**: dashboards com Recharts (já instalado), mapas com Leaflet se necessario — nunca adicionar outra lib de charts/mapas.
- **Verificação obrigatória pós-alteração de UI**: inspeccionar no browser e corrigir erros de consola, overflow, glitches de animação e responsividade em desktop, tablet e mobile.

## Regra de Listagens e Históricos

**Nenhum histórico é infinito no ecrã.** Vale para todo o projecto, em todos os
módulos, e aplica-se antes de se escrever qualquer listagem nova.

1. **Paginação obrigatória** em tudo o que possa crescer sem limite —
   históricos, registos, movimentos, lançamentos, auditoria, notificações.
2. **O scroll é DO COMPONENTE, não da página.** Cada histórico tem a sua
   própria área de conteúdo com altura máxima e scroll interno. A página não
   pode ficar mais comprida à medida que os dados crescem.
3. **Nunca carregar centenas ou milhares de registos de uma vez.** O servidor
   recebe `offset` e `limite` e devolve o `total`; o cliente pede uma página
   de cada vez.
4. **Comportamento consistente** em todos os módulos: mesma barra de
   paginação, mesmas palavras, mesmo sítio.

Usar `ListaPaginada` / `usePaginacao` (`components/ui/Paginacao.tsx`). Não
reimplementar por página — foi assim que as listagens divergiram antes.

## Regra de Botões Bloqueados

**`disabled` nunca significa «o botão simplesmente não funciona».** Vale para
todo o projecto, em todos os módulos.

1. Um botão bloqueado **diz porquê** ao passar o rato: `motivoBloqueio` no
   `Botao` (`components/ui/Botao.tsx`).
2. Para casos sensíveis, além do tooltip, um **aviso no ecrã** com o motivo e,
   quando aplicável, o que fazer para desbloquear.
3. **Nunca usar o `disabled` nativo quando há motivo a explicar**: um
   `<button disabled>` não dispara eventos de rato na maioria dos browsers, e o
   tooltip nunca apareceria. O `Botao` trata disto — passa a `aria-disabled`,
   mantém o aspecto de bloqueado e ignora o clique.
4. O `title` nativo também não serve num botão com `disabled` nativo, pela
   mesma razão. Já lá estava um em Diários e nunca ninguém o viu.

## Regra de Aprendizagem

When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule em docs/LESSONS.md so it never happens again — or, if the situation is recurring and complex enough, create a skill in .claude/skills/ to reuse.

Antes de alterar código, consultar: docs/LESSONS.md

## Decisões de Desenho

Renovação de sessão sem refresh token separado: POST /auth/refresh preserva uma expiração absoluta; token_version revoga sessões em mudanças de password/perfil/estado.

Página de perfil (/perfil): só de leitura — perfil de acesso e estado da conta continuam a ser geridos pelo admin.

## Integração de Inteligência Artificial na Produção

A versão Piloto não possui nenhum módulo ou página de Inteligência Artificial.

Na versão Produção deve ser adicionado um módulo específico de assistência inteligente, mantendo a regra de que a IA não substitui os processos contabilísticos do sistema, servindo apenas como ferramenta de consulta e análise.

