# Regras de Desenvolvimento

## Código e Estilo
1. **Língua:** Todo o texto visível deve estar em Português (PT-PT).
2. **Componentes:** Usar Radix UI como base. Criar componentes customizados apenas se não houver equivalente no Radix.
3. **Estilização:** Usar exclusivamente Tailwind CSS e a função `cn()`.
4. **Imports:** Usar o alias `@/` para referenciar a partir de `frontend/src/`.
5. **Segurança:** Todas as variáveis de ambiente e segredos devem residir em ficheiros `.env`.
6. **Referência:** Ler o código existente na pasta `Piloto/` antes de criar ou modificar qualquer funcionalidade.

## Backend
1. **Autenticação:** Sessão/JWT obrigatório em todas as rotas de dados.
2. **RBAC:** Respeitar os 8 perfis do Piloto (`superadmin`, `admin`, `contabilista`, `financeiro`, `comercial`, `logistica`, `rh`, `consulta`) e a matriz de capacidades `CAPS`; novas rotas devem declarar a capacidade exigida (ex.: `contab.lancar`).
3. **Palavras-passe:** hash bcrypt, mínimo 8 caracteres (desvio justificado ao Piloto — ver `docs/SECURITY.md`).
3. **IA:** Funcionamento local por defeito; OpenAI permitido apenas para o módulo de Q&A autorizado.

## Migração Piloto -> Produção
- Preservar integralmente funcionalidades, regras de negócio, fluxos e comportamentos.
- Qualquer remoção ou modificação de comportamento do Piloto necessita de justificação técnica explícita.