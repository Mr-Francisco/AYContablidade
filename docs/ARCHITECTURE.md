# Arquitetura Técnica

O sistema segue uma arquitetura cliente-servidor com separação clara entre frontend e backend.

## Diagrama Conceptual

`Navegador` -> `Next.js (Frontend)` -> `FastAPI (Backend)` -> `PostgreSQL`

## Frontend (Next.js)

- Framework React com App Router.
- Renderização do lado do cliente (CSR) para dashboards interativos.
- Proxy interno (`proxy.ts`) para proteger rotas verificando o JWT.
- Componentização baseada em Radix UI e Tailwind CSS.

## Backend (FastAPI)

- API RESTful.
- Autenticação via JWT com renovação de sessão.
- Controlo de acessos baseado em funções (RBAC): `admin`, `executive`, `tecnico`.(Se necesario com base no Piloto)
- ORM SQLAlchemy para interação com a base de dados.
- Migrações de esquema com Alembic.

## Base de Dados

- PostgreSQL 16.
- ORM principal: SQLAlchemy + Alembic (Backend FastAPI).
- Prisma: Utilizado apenas quando necessário no frontend ou ferramentas auxiliares.