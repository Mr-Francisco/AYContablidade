# Integração de Inteligência Artificial

## Princípios Base
- O processamento do sistema é **local por defeito**.
- Não são permitidas chamadas a APIs de IA externas para processamento interno de dados.

## Módulo de Perguntas e Respostas
- É permitida a integração com a API da OpenAI (modelo ChatGPT mais recente) **exclusivamente** para funcionalidades de perguntas e respostas.
- **Dados sensíveis proibidos:** Nenhuma  dados pessoais podem ser enviados para a API externa. O módulo deve funcionar de forma isolada e segura.

## Integração de Inteligência Artificial na Produção

A versão Piloto não possui nenhum módulo ou página de Inteligência Artificial.

Na versão Produção deve ser adicionado um módulo específico de assistência inteligente, mantendo a regra de que a IA não substitui os processos contabilísticos do sistema, servindo apenas como ferramenta de consulta e análise e detector de erros com base nos regras a da operacao .

O funcionamento esperado:

- O utilizador selecciona um contexto contabilístico ou de qualquer modulo específico (ex.: empresa, módulo, contas, documentos ou outro âmbito disponível no sistema).
- O utilizador define o período de análise (ex.: mês, trimestre ou ano).
- O sistema deve interpretar a pergunta do utilizador dentro desse contexto seleccionado.
- Antes de enviar qualquer informação para a IA, o backend deve realizar as consultas necessárias na base de dados, utilizando apenas os dados relacionados com o contexto e período escolhido.
- A IA deve receber apenas os dados relevantes já filtrados pelo sistema, nunca tendo acesso directo à base de dados.

Objectivo:

Permitir que o utilizador faça perguntas sobre os seus dados contabilísticos ou modulo específico , como análises, resumos, comparações e explicações, garantindo que as respostas sejam baseadas exclusivamente nos dados existentes no sistema.

A implementação deve considerar grandes volumes de dados, utilizando uma camada intermédia responsável por:
- identificar os dados necessários;
- executar queries optimizadas;
- preparar e resumir os dados quando necessário;
- enviar o contexto adequado para o modelo de IA.

A IA não deve executar SQL directamente nem alterar dados do sistema. O acesso aos dados deve ser sempre controlado pelo backend através das permissões e regras de segurança existentes.