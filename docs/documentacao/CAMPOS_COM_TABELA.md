# Campos com tabela e pesquisa por F4

## A regra

**Se um campo representa uma entidade que existe numa tabela, tem de ter uma
tabela por trás e pesquisa por F4.** Não uma lista de opções com meia dúzia de
nomes escritos à mão.

O padrão vem do Piloto (`assets/js/conta-picker.js`) e já existia aqui para as
contas (`CampoConta`): escreve-se o código e segue-se, ou carrega-se em **F4** e
procura-se. Quem lança todos os dias sabe o código de cor; quem não sabe precisa
de ver a tabela.

| Campo | Tabela | Rota |
|---|---|---|
| Conta | Plano de contas | já existia — `CampoConta` |
| Cliente | Clientes | `/api/comercial/clientes/tabela` |
| Vendedor | Vendedores | `/api/comercial/vendedores/tabela` |
| Artigo | Artigos / stock | `/api/logistica/artigos/tabela` |

O componente é **`components/ui/CampoEntidade.tsx`** e não sabe o que é um
cliente: recebe de onde ler, o que mostrar e por onde procurar. Cada entidade
traz a sua tabela — é a mesma experiência com dados diferentes, e não um plano
de contas disfarçado para tudo.

**A procura é do servidor.** Devolver tudo e filtrar no ecrã funciona com trinta
clientes e deixa de funcionar com três mil — e é com três mil que faz falta. O
formulário de venda deixou de pedir a lista inteira de clientes, de vendedores e
de artigos só para encher três caixas de opções.

**Teclado:** F4 ou duplo clique abrem; setas percorrem; Enter escolhe; Backspace
limpa. Um documento inteiro lança-se sem tirar as mãos do teclado.

---

## Criar um cliente sem sair da facturação

O caso é concreto: descobre-se a meio de uma factura que o cliente não está
registado. Mandar a pessoa a Comercial → Clientes é fazê-la perder o documento.

O cliente nasce com:

1. **Número sequencial** (001, 002…) por empresa, como na ficha completa;
2. **Conta corrente própria** — a próxima subconta da conta-mãe, `31121001`,
   `31121002`… — gravada na ficha para os documentos seguintes;
3. a conta-mãe escolhida pela **nacionalidade**.

## Nacional e estrangeiro

| | Conta-mãe |
|---|---|
| Nacional | `31121` · Clientes não grupo — Nacionais |
| Estrangeiro | `31122` · Clientes não grupo — Estrangeiros |

Sem ficha (consumidor final) conta como nacional, que é o caso normal ao balcão.
A conta dos estrangeiros é parametrizável; em branco, usa-se a dos nacionais —
melhor do que lançar numa conta que a empresa possa não ter no plano.

### O que o Piloto tem, e o que não tem

Fui verificar antes de escrever, e vale a pena ficar registado porque não é o
que se supunha:

**O Piloto TEM:**
- as duas contas no plano PGC-AR — `31121 Nacionais` e `31122 Estrangeiros`;
- o campo `país` na ficha do terceiro, com «Angola» por omissão;
- `contaCorrenteCliente()` a criar a subconta sequencial e a gravá-la na ficha.

**O Piloto NÃO TEM:**
- **a escolha entre as duas contas.** Usa sempre `cfg().contaCliente`, que é a
  dos nacionais, fosse o cliente de onde fosse;
- pesquisa por F4 em clientes, artigos ou vendedores — o `conta-picker.js` é só
  para o plano de contas;
- criação de cliente a partir da facturação.

Ou seja: os ingredientes estavam lá, a lógica não. Foi construída seguindo a
forma do que existe, não inventada de outra maneira.

**Porque é que importa:** um cliente estrangeiro lançado na conta dos nacionais
não dá erro nenhum. Dá um balancete que diz que a empresa não tem clientes
estrangeiros, e um SAF-T que declara o mesmo — e nada assinala a diferença.

### Uma diferença deliberada face ao Piloto

O Piloto cria a conta corrente **no acto da facturação**. O resultado é um
cliente que existe no comercial e não existe na contabilidade até alguém lhe
facturar alguma coisa — quem for ver o plano de contas não o encontra.

Aqui a conta nasce **com o cliente**. Um cliente é uma entidade contabilística
desde que nasce.

---

## Cobertura

`backend/tests/test_cliente_nacional_estrangeiro.py` — 13 testes, incluindo a
verificação de que as duas contas existem mesmo no plano PGC-AR da empresa.

## O que falta

A mesma regra deve chegar aos restantes campos que representam entidades:
fornecedores nas compras, colaboradores no RH, armazéns na logística, centros de
custo na analítica. O componente está feito e as rotas de tabela seguem o mesmo
molde — é repetir o padrão, não desenhá-lo outra vez.
