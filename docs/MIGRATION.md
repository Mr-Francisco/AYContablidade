# Processo de Migração (Piloto → Produção)

## Regra Fundamental
A versão de Produção deve ser uma réplica fiel do Piloto em termos de comportamento, regras de negócio e fluxos, modernizando apenas a arquitetura e a base de código.

## Checklist de Migração
1. **Análise do Piloto:** Compreender totalmente uma funcionalidade no código-fonte original (HTML/CSS/JS) antes de a implementar.
2. **Implementação Fiel:** Codificar a funcionalidade na nova stack, garantindo a paridade de comportamento.
3. **Justificação de Alterações:** Qualquer desvio ao comportamento original (remoção ou modificação) tem de ser documentado com uma justificação técnica válida.