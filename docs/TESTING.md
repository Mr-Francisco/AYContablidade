# Estratégia de Testes

## Backend
- **Framework:** pytest
- **Âmbito:** Testes unitários e de integração para autenticação, JWT, RBAC, utilizadores e modelos de IA (LLM).
- **Execução:** `cd backend && pytest`

## Frontend
- **Verificação Estática:** TypeScript (`tsc --noEmit`) e linter (`npm run lint`).
- **Verificação Manual:** Revisão obrigatória de UI no browser após alterações.

## CI/CD
- Testes e lint devem passar antes da integração de novo código.
- Assegurar que o build de produção (`npm run build`) é bem-sucedido.