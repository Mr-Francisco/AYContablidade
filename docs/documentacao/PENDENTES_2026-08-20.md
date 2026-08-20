# Pendentes — 20 de Agosto de 2026

Quatro pontos indicados pelo cliente. Ficam aqui para não se perderem, e
fazem-se por esta ordem.

---

## 1. Fluxo de Caixa: duplo clique abre o extracto

**O que se pede:** o mesmo comportamento do Balancete. Duplo clique num valor
do Fluxo de Caixa abre o extracto com os movimentos que originaram aquele
valor.

Vale para **todas** as informações apresentadas — recebimentos de clientes e
restantes movimentos — e também no **fluxo de conta**, onde o duplo clique deve
gerar o extracto detalhado do item seleccionado.

**O padrão já existe:** valor → duplo clique → extracto. Está no Balancete e no
Mapa de Custos, e agora também no Extracto (que abre o movimento).

**Estado: FEITO.**

Uma rubrica de fluxo **não é uma conta**, e o extracto pedia uma conta. Foi
preciso um caminho novo: `GET /api/contabilidade/extrato-fluxo/{codigo}`,
que devolve **a mesma forma** do razão de propósito — é o mesmo ecrã a mostrar
as duas coisas, e duas formas diferentes obrigariam a dois ecrãs.

O ecrã do extracto aceita agora `?fluxo=RO1` além de `?conta=`. O duplo clique
está nas **duas** tabelas do Fluxo de Caixa: a agrupada (onde estão os
recebimentos de clientes) e o mapa por rubrica. Nas rubricas de agregação não
está, porque somam outras e não têm movimentos próprios.

O saldo corrido acumula **entrada menos saída**: uma rubrica de fluxo não tem
natureza devedora nem credora — tem sentido de tesouraria.

---

## 2. Grelhas com filtro e ordenação por coluna, estilo Primavera

**O que se pede**, a partir das imagens enviadas:

- uma **primeira coluna reservada aos filtros**;
- menu do rato na coluna com **Ordenar ascendente** / **Ordenar descendente**;
- **filtro inline por coluna**: clicar no campo de filtro e começar a escrever
  filtra imediatamente, sem abrir janela separada;
- comportamento semelhante às grelhas do Primavera na forma de interagir
  directamente com as colunas;
- **eficiente e nativo** em Next.js + React, fluido com muitos registos —
  paginação ou virtualização conforme for preciso.

O menu das imagens tem: Ordenar Ascendente, Ordenar Descendente, Limpar
ordenação, Agrupar por este Campo, Caixa de Agrupamento, Lista de Colunas,
Melhor Ajuste, Melhor Ajuste (Todas as colunas), Fixar a coluna, Remover
Filtro, Editar Filtro, Expandir Todos, Fechar Todos, Procurar.

**Estado: FEITO.** O componente é `components/ui/Grelha.tsx`, e está nas oito
tabelas.

O que faz: linha de filtros sempre à vista por baixo dos títulos, a filtrar à
medida que se escreve; clique no título alterna a ordenação; menu com Ordenar
ascendente, Ordenar descendente, Limpar ordenação e Remover filtro; rodapé com
«X de Y registos» e atalhos para limpar.

**Três decisões:**

- **O filtro fica sempre à vista.** Escondê-lo atrás de um ícone poupa trinta
  pixels e custa um clique em cada utilização — e isto usa-se o dia inteiro.
- **Filtra sem botão**, com `useDeferredValue`: o que se escreve aparece já e o
  recálculo vem a seguir, sem prender o teclado.
- **Ordena por tipo.** `1000` vem depois de `999` num número e antes num texto;
  a coluna diz o que é.

**Aplicado em TODAS as oito:** Artigos, Clientes, Fornecedores, Existências,
Consulta de Facturas, Licenças, Diferidos e o Mapa de Remunerações.

**Três coisas que a aplicação obrigou a resolver, e que não se viam de início:**

**1. Clientes e Fornecedores eram o mesmo ficheiro de 210 linhas com os nomes
trocados.** Declarar as colunas duas vezes garantia que, à segunda melhoria,
uma delas ficava para trás. Passaram a partilhar `GrelhaTerceiros`, como já
partilhavam a ficha. O que muda entre elas — «na 1.ª facturação» contra «na 1.ª
recepção» — é uma propriedade, não um ficheiro.

**2. Metade das listagens vem paginada do servidor**, e a grelha filtra as
linhas que tem. Numa lista paginada isso é a página visível e mais nenhuma:
procurar uma factura que está na página seguinte não devolvia nada, sem dizer
porquê. Uma grelha que filtra sem o dizer parece funcionar e esconde registos —
é pior do que não filtrar. Daí `soEstaPagina`: os campos passam a dizer «nesta
página» e o rodapé indica onde procurar em tudo.

**3. Filtrar e ordenar não são a mesma chave.** Escreve-se `21/08` porque é o
que está à vista, mas `21/08/2026` ordenado como texto punha Agosto antes de
Janeiro. As colunas de data filtram pelo que se lê e ordenam pela data
verdadeira (`ordem`). O mesmo serve o `∞` das Licenças: filtra-se pelo símbolo,
ordena-se pelo número.

**O Mapa de Remunerações foi o caso difícil, e ganhou capacidades novas na
grelha:** é um documento que se imprime e se entrega à AGT, com bandas de grupo
por cima das colunas e uma linha de TOTAIS. Achatá-lo destruía o cabeçalho do
modelo oficial. A grelha aprendeu `grupos` (a linha de bandas), `rodapeTabela`
(os totais, em `tfoot`, fora do que se filtra e ordena) e `classeTabela` (as
cores das bandas e as regras de impressão).

E ganhou um aviso: **filtrar um mapa que se vai imprimir é perigoso** — ficava
um documento com menos linhas do que os totais declaram. Com filtro activo, a
grelha di-lo e pede que se limpe antes de imprimir ou exportar.

**Gestos preservados:** a Consulta de Facturas abria ao primeiro clique e
continua a abrir — trocar-lhe o gesto por duplo clique não trazia nada e
desfazia um hábito de quem passa o dia ali. As restantes usam duplo clique,
como o Piloto.

**O Plano de Contas fica de fora, e é deliberado:** é uma ÁRVORE, com classes
que abrem e contas com filhas. Achatá-lo numa grelha destruía a hierarquia, que
é o que ali serve para navegar. Continua com o filtro por código que já tinha.

---

## 3. Tabela de IRT igual ao modelo enviado

**Ficheiro:** `Template_IRT_A2.1_-_Mapa_de_Remunerações.xlsx`

**Estado: analisado. A tabela já corresponde ao modelo.**

Comparei o ficheiro que enviou com o que está no projecto
(`frontend/public/modelos/mapa-irt-a2.1.xlsx`): **mesma estrutura** — três
folhas, 1005 linhas por 32 colunas. Diferem só em bytes, de uma gravação nova
do Excel.

E o ecrã já espelha o modelo: os mesmos grupos com as mesmas cores
(Identificação do Trabalhador, Não Sujeito a IRT, Sujeito a IRT, Segurança
Social, IRT) e as mesmas colunas. As rubricas em `RubricasDoMapa.tsx` batem
certo com as do modelo, uma a uma.

**Uma diferença encontrada e corrigida:** tínhamos «Subsídio de At**á**vio» e o
modelo da AGT diz «Subsídio de Atavio», sem acento. Alinhado.

**A GRELHA já lá está** — filtro e ordenação por coluna, com as bandas de grupo
e a linha de TOTAIS preservadas, e o aviso para limpar os filtros antes de
imprimir. Ver o ponto 2.

---

## 4. Consulta de NIF: <https://ayobras.com/clientes> consegue, nós não

**O que se observa:** naquele site — do próprio cliente, e livre — a consulta
de NIF devolve o nome. Aqui não está a conseguir.

**Estado: DIAGNOSTICADO. Não é um defeito — faltam credenciais.**

O que se mediu:

1. A nossa consulta devolve `fonte: "formato"` e diz-se a si própria: *«A
   consulta à AGT não está configurada»*. O `.env` não tem `AGT_USERNAME` nem
   `AGT_PASSWORD`, e `AGT_ATIVO` está a `false`.
2. Os endereços da AGT respondem **401 Unauthorized** com
   `Www-authenticate: Basic realm=owsm` — **nos dois ambientes**, testes e
   produção. Não há consulta anónima.

Ou seja: o `ayobras.com` consegue porque tem credenciais; nós não temos.

**O que é preciso:** pôr o utilizador e a palavra-passe da AGT em
`backend/.env` (`AGT_ATIVO=true`, `AGT_USERNAME`, `AGT_PASSWORD`) e, no Render,
nas variáveis do serviço — já estão declaradas no `render.yaml`.

**Como se obtêm:** por e-mail para `produtores.dfe.dcrr.agt@minfin.gov.ao`, com
o nome e o NIF da empresa. O passo a passo está em
[`docs/facturacao/06-CREDENCIAIS-DA-AGT.md`](../facturacao/06-CREDENCIAIS-DA-AGT.md),
e há um guião para as testar mal cheguem: `python scripts/testar_nif.py`.

**E uma correcção:** o `.env.producao.example` apontava para `sifphml`, que é o
ambiente de **testes**. Passou a `sifp`. São dois serviços diferentes e as
credenciais de um não servem no outro.

---

## Estado

| | |
|---|---|
| 1. Fluxo de Caixa | **Feito** |
| 2. Grelhas | **Feito** — nas oito tabelas |
| 3. Tabela de IRT | **Feito** — já correspondia ao modelo; agora com grelha |
| 4. NIF | **Bloqueado por credenciais**, não por código — ver abaixo |

O ponto 4 é o único que não depende de nós: o código está escrito e correcto, e
espera um utilizador e uma palavra-passe da AGT. Pedem-se por e-mail a
`produtores.dfe.dcrr.agt@minfin.gov.ao`, e há um guião para os testar mal
cheguem — `python scripts/testar_nif.py`.
