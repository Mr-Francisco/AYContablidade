# Segurança

## Autenticação e Autorização
- **JWT:** PyJWT para criação e validação de tokens de acesso.
- **Renovação:** `POST /auth/refresh` mantém a sessão ativa.
- **Revogação:** `token_version` no backend permite invalidar tokens em caso de alteração de perfil.
- **RBAC:** Controlo de acessos com três níveis se necessario : `admin`, `executive`, `tecnico` (De Acordo ao Piloto ).

## Práticas Obrigatórias
- Segredos e chaves apenas em variáveis de ambiente (`.env`).
- Jamais incluir segredos em `config.ini` ou hard-coded no código-fonte.
- Sem endpoints de dados públicos; todas as rotas requerem autenticação.

## Proteção de Dados
- Dados sensíveis nunca devem ser enviados para APIs externas sem validação explícita.
- A integração com a API da OpenAI é restrita ao módulo de Q&