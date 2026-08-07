# Modelo de Empresas, Licenças e Gestão de Acessos

A versão Produção deve funcionar como uma plataforma SaaS multiempresa.

A versão Piloto não possui este modelo, pois foi desenvolvida como uma aplicação única. Na versão Produção deve ser implementado um sistema onde diferentes empresas possam utilizar a plataforma de forma independente, com separação dos seus dados e permissões.

## Processo de entrada da empresa

1. A empresa acede à página inicial da plataforma.
2. Solicita uma licença de utilização do sistema.
3. Após validação comercial e administrativa, a licença é aprovada.
4. A empresa recebe as credenciais ou autorização para criar o seu acesso.
5. O administrador inicial configura os dados da empresa e inicia a utilização do sistema.

## Configuração inicial da empresa

Após o primeiro acesso, o administrador deve configurar:

- Dados gerais da empresa;
- Informações contabilísticas necessárias;
- Configurações do sistema;
- Utilizadores e perfis;
- Permissões de acesso.

## Gestão de funcionários e utilizadores

Cada empresa terá um administrador responsável pela gestão dos seus utilizadores.

No cadastro de funcionários deve ser possível:

- Criar utilizadores associados à empresa;
- Definir cargos ou perfis;
- Configurar módulos disponíveis;
- Definir permissões específicas;
- Controlar operações permitidas no sistema.

## Gestão de módulos e permissões

O acesso dos funcionários deve ser baseado em permissões.

Exemplo:

Funcionário A:
- Facturação ✓
- Clientes ✓
- Relatórios ✓
- Configurações ✕

Funcionário B:
- Contabilidade ✓
- Auditoria ✓
- Administração ✕

O sistema deve permitir controlar o acesso por:

- Perfil;
- Módulo;
- Acção específica (visualizar, criar, editar, eliminar, exportar).

## Segurança e isolamento dos dados

Cada empresa deve ter os seus dados isolados.

Um utilizador de uma empresa nunca deve conseguir visualizar ou aceder aos dados de outra empresa.

Todas as operações devem validar:

- Empresa associada ao utilizador;
- Permissões do utilizador;
- Estado da licença;
- Regras de segurança do sistema.
