# Deployment e Ambiente de Produção

## Containerização (Docker)
A stack completa é orquestrada via `docker-compose.yml` com os seguintes serviços:
- **postgres:** Base de dados PostgreSQL.
- **backend:** API FastAPI (porta 8001).
- **frontend:** Aplicação Next.js (porta 3000).

## Comandos Principais
- Iniciar stack: `docker compose up -d`
- Desenvolvimento (com hot-reload): Usar servidores de dev fora dos containers.

## Configuração
- As variáveis de ambiente sensíveis (ex: `JWT_SECRET_KEY`) devem ser definidas no ficheiro `.env` e injetadas nos containers.