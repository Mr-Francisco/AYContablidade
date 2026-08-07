# Base de Dados

## Tecnologia Principal
- **Motor:** PostgreSQL 18.
- **ORM Principal:** SQLAlchemy + Alembic (Backend FastAPI).
- **ORM Auxiliar:** Prisma (Apenas para tarefas específicas de frontend ou scripts auxiliares, se necessário).

## Modelos e Migrações
- Os modelos de dados são definidos no backend usando SQLAlchemy.
- As migrações de esquema são geridas pelo Alembic.
- Ao modificar o esquema, assegurar que as migrações são criadas e testadas.