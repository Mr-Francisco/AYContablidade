# Pendentes — 24 de Agosto de 2026

Quatro pedidos do cliente. Este ficheiro é a memória do trabalho: o que foi
pedido, pelas palavras de quem pediu, o que já está feito e o que ficou por
decidir.

## Estado

| | Pedido | Estado |
|---|---|---|
| 1 | Janelas que não se fecham sozinhas e levam os dados | **FEITO** |
| 2 | Imobilizados em Curso com separador próprio | **FEITO** |
| 3 | F4 em todos os campos de escolha com tabela por trás | **FEITO** |
| 4 | Documentos: subclasses, conta de reflexão e sistema de inventariação | **FEITO** |

**A ordem é esta e não a do pedido.** A 1 vem primeiro porque é uma peça que
as outras duas usam: o separador dos imobilizados em curso e o formulário dos
documentos são ambos janelas com dados lá dentro. Feita uma vez, herdam-na.

---

# 1. Janelas que não se fecham sozinhas

> «Todas as telas popup que já tenham informação não se pode simplesmente sair
> ou desaparecer. Se tiver informações, antes de sair pergunta se deseja mesmo
> sair e as informações vão se perder. Os clientes estão a dizer que não estão
> a ter uma boa experiência: sempre que clicam em outro campo que não seja na
> tela, a tela de popup desaparece e os dados também.»

**É uma obrigação de todo o projecto**, não de uma janela.

## O que se passa

O Radix fecha um diálogo em três gestos: clique fora, tecla `Esc`, e o botão
de fechar. Os três estão certos numa janela que só mostra coisas. Numa janela
onde se **escreveu** alguma coisa, os dois primeiros são acidentes: ninguém
carrega fora de uma janela com a intenção de deitar fora o que escreveu.

## O que se faz

Uma peça só, usada por todas as janelas com formulário:

1. A janela sabe se está **suja** — se algum campo mudou desde que abriu.
2. Limpa, fecha como sempre.
3. Suja, o clique fora e o `Esc` **não fecham**: aparece a pergunta.
4. A pergunta diz o que se perde e dá duas saídas claras: continuar a
   preencher, ou sair e perder.

O botão de fechar e o «Cancelar» também passam pela pergunta — são
deliberados, mas quem carrega neles com um formulário meio preenchido merece
o mesmo aviso.

## Onde se aplica

`components/ui/GuardaDeSaida.tsx` — o `useGuardaDeSaida` e a pergunta.

Ligado em **40 janelas**: as 23 que usam o `DialogoMestre` partilhado
(herdaram-no sem uma linha de mudança) e mais 17 com formulário próprio. As que
só mostram — o documento legal, os selectores de conta e de cliente — ficaram
como estavam: não há lá nada para perder.

## Verificado no browser, seis cenários

| Gesto | O que acontece |
|---|---|
| Janela limpa + clique fora | Fica aberta |
| Com dados + clique fora | Fica aberta, o que estava escrito mantém-se |
| Com dados + `Esc` | Pergunta |
| «Continuar a preencher» | Volta ao formulário com tudo lá |
| Com dados + X | Pergunta |
| Janela limpa + «Cancelar» | Fecha, sem perguntar |

---

# 2. Imobilizados em Curso com separador próprio

> «Em imobilizado, o cliente disse para criar mesmo uma aba para os
> imobilizados em curso, tal como a ficha de imobilizados.»

## O que existe hoje

`components/imobilizados/ObraEmCurso.tsx` existe e funciona, mas está
**dentro** da página dos activos (`imobilizados/ativos/page.tsx:286`), como uma
janela que se abre a partir de um activo. Não tem entrada própria no menu nem
lista própria.

## O que se fez

`app/(app)/imobilizados/em-curso/page.tsx`, entre «Ficha de Ativos» e
«Amortizações» no menu. Traz o que faltava a quem trata de obras:

- **Quatro indicadores**: investido em curso, obras a decorrer, despesas
  lançadas, obras já transferidas.
- **A lista das obras** com a conta própria de cada uma (`141001`), quantas
  despesas a formam e quanto já custou.
- **As já transferidas**, em baixo e discretas — para conferir que a
  transferência aconteceu e para onde foi, sem ir procurar à Ficha de Ativos
  entre bens que nunca foram obras.
- **«Nova obra»** abre a ficha já com o interruptor de obra em curso ligado e
  o título a dizer «Nova obra em curso», e não «Novo activo».

### Duas coisas que foi preciso fazer por baixo

**A ficha do activo saiu da página.** `FormularioAtivo` e `BarraProgresso`
viviam dentro de `ativos/page.tsx` e passaram a ser precisos nos dois ecrãs.
Estão agora em `components/imobilizados/FichaAtivo.tsx`. Copiá-los garantia que
os dois divergiam à primeira correcção.

**A listagem passou a trazer o acumulado.** O total de uma obra é a soma dos
seus itens, e ir buscá-lo ficha a ficha eram duas consultas por linha. É uma
soma agrupada só, e só para as que estão em curso — uma ficha fechada já tem o
valor no `valor_aquisicao`.

### A Ficha de Ativos continua a mostrá-las

É de propósito. É o registo completo do imobilizado, e uma obra em curso é uma
ficha como as outras. O que muda é que agora há também a porta certa para quem
vem tratar de obras.

### Verificado no browser, de ponta a ponta

Criada a obra «Armazém de Viana — construção» pelo botão do separador: nasceu
com a conta `141001` própria, recebeu três despesas (terreno 4 500 000,
empreitada 12 000 000, instalação eléctrica 1 850 000) e a lista passou a
mostrar **3 despesas · 18 350 000,00 Kz**, com os indicadores a acompanhar.

---

# 3. F4 em todos os campos de escolha

> «Todo o campo, os famosos combo box ou os select, que traz grandes
> informações não podem ficar apenas no select. Sempre que apertado o F4 deve
> trazer a tabela deles. Um exemplo: todo o campo, tanto na facturação,
> logística, comercial, contabilidade, que é para seleccionar um cliente, se
> apertar no F4 deve obrigatoriamente trazer a tabela de clientes. Ou mesmo
> para fornecedores, ou mesmo para documentos, ou mesmo para todos os campos
> que estão em um combobox ou select. Isso melhora a experiência do usuário: o
> usuário não tem que fazer scroll no select infinito, e permite que o usuário
> possa pesquisar também.»

## O que já existe

`components/ui/CampoEntidade.tsx` faz exactamente isto, e já é usado em treze
sítios (vendas, documentos, extracto, movimentos, activos, recibos, compras,
stock, ficha de terceiro, parametrizações).

## O que se fez

Passados a pente fino os 120 campos de escolha do projecto, com este critério:
**se o que está na lista vem de uma tabela da base de dados e pode crescer,
leva F4.** Se é uma lista fechada e curta — «Sim/Não», «Devedora/Credora», os
doze meses, os três tipos de imobilizado —, fica como está: abrir uma tabela
para escolher entre duas opções seria pior do que a caixa.

Convertidos oito campos, os que tinham mesmo tabela por trás:

| Onde | Campo | O que era |
|---|---|---|
| Razão | Conta | **1600 contas** numa caixa de opções — o «select infinito» |
| Artigos | Existências, custo, proveito | A mesma lista de 1600, três vezes |
| Documentos | Diário | Todos os diários da empresa |
| Amortizações | Diário e Documento | Duas listas, a segunda a mudar com a primeira |
| Configurações | Armazém de saída | Todos os armazéns |
| RH · Honorários | Independente | Todos os prestadores |

As contas usam o `CampoConta`, que já existia e mostra a **árvore** do plano
com procura — melhor do que uma lista plana. As restantes usam o
`CampoEntidade`.

### Três tabelas novas no servidor

`/api/contabilidade/diarios/tabela`, `/api/contabilidade/documentos/tabela` e
`/api/rh/independentes/tabela`. A dos documentos aceita `?diario=`: quem está a
lançar num diário não quer ver os documentos dos outros, e mostrá-los era
convidar ao engano. O detalhe de cada linha diz para onde o documento manda o
lançamento — `diario 21 · D 21121 · C 32121` —, que é o que se precisa de ver
para escolher.

### Verificado no browser

Na Razão, F4 abre a árvore do plano com procura; escrever `31121001`
directamente valida para «AS Imagem, Lda.» e carrega a conta. Os três
endpoints novos respondem: 20 diários, 50 documentos.

---

# 4. Documentos da contabilidade

Tudo isto é em **Contabilidade → Documentos**, tanto ao criar como ao editar.

## 4.1 Subclasses

> «Nos documentos eu criei o 211, que eu chamei de VFA. Basicamente essa é a
> classe principal, mas eu gostaria que desse também para criar subclasses da
> classe principal. Por exemplo, o 211 é a classe principal, o 211.1 é a
> subclasse. Essas subclasses devem estar dentro de uma classe, e continuam a
> pedir tudo o que uma classe pede mesmo. Isso é mais por questão de
> organização. Mas já a conta de débito, na subclasse, já especificar uma
> conta — deve ter essa possibilidade. E toda a vez que o camarada usar aquele
> documento vai cair já naquela conta, que eu já especifiquei que vai se
> movimentar lá.»

- Um documento pode ter **subclasses**: `211` é a classe, `211.1` a subclasse.
- A subclasse pede o mesmo que a classe.
- A subclasse pode fixar a **conta de débito**; quem usa o documento cai
  directamente nela.

## 4.2 Conta de reflexão

> «Adicionar isso tanto na classe como na subclasse: a possibilidade de
> adicionar uma conta de reflexão. Essa é uma novidade apenas do nosso
> software.»

Nas palavras do cliente, sobre o que ela é:

> «Estou a comprar mercadoria, ele tem que passar pela conta 21, mas dependendo
> do método que eu estou a utilizar, essa mercadoria tem que ser transferida
> para uma conta 26. Então eu posso colocar aqui o sistema de inventário: se eu
> habilitar permanente, a mercadoria tem que fluir automaticamente.»

## 4.3 Sistema de inventariação

> «Depois dos textbox que nós temos, a conta de débito e a conta de crédito,
> depois desses dois campos, antes da expressão "sujeito à retenção", adicionar
> mais uma espécie de subtema ou uma área que será chamada sistema de
> inventariação. E nesse sistema de inventariação teremos que ter duas opções:
> sistema permanente ou sistema periódico.»
>
> «Dependendo do sistema que habilitar, essas caixas vão ser activadas. O que é
> que vai acontecer? No sistema permanente, o custo é reconhecido no momento em
> que ele ocorre. Esta informação que vive nessa primeira caixa vamos passar a
> creditar o mesmo número de conta que tiver aqui — vai passar a crédito na
> segunda caixa que vamos ter aqui —, e a débito vai ter a conta de destino,
> que é uma conta 26 ou 22, dependendo do tipo de inventário que a empresa usa.»

Lido em contabilidade, é a **reflexão do inventário permanente**: a compra
entra na 21, e no mesmo momento reflecte-se — credita-se a 21 e debita-se a
conta de existências (26 ou 22). No sistema periódico não há reflexão: o custo
só se apura no fim do período.

### O que fica por confirmar com o cliente

Estas ficam anotadas e **não bloqueiam** o trabalho — implementa-se pela
leitura acima, que é a que a contabilidade suporta, e corrige-se se o cliente
disser outra coisa.

**A.** No sistema permanente, a conta creditada na reflexão é **sempre a mesma
conta de débito do documento**, ou pode ser outra? A frase «vamos passar a
creditar o mesmo número de conta que tiver aqui» diz que é a mesma. Fica a ser
a mesma, mostrada e não editável, com o campo da conta de destino ao lado.

**B.** A conta de destino (26 ou 22) é fixa por documento, ou vem de uma
definição da empresa? O cliente diz «dependendo do tipo de inventário que a
empresa usa», o que aponta para uma definição da empresa — mas também diz para
a pôr no documento. Fica **no documento**, que é onde ele a pediu, com o valor
da empresa como sugestão inicial.

**C.** Uma subclasse herda o sistema de inventariação da classe, ou define o
seu? Fica a herdar, com possibilidade de o redefinir — é o mesmo critério da
conta de débito, que ele pediu explicitamente que a subclasse pudesse fixar.

**D.** O que se faz aos documentos que já existem? Ficam todos sem sistema de
inventariação, que é o comportamento de hoje. Nenhum lançamento já feito muda.

## O que o Piloto tem disto

**Nada.** Procurado em todo o `Piloto/`: não há subclasses de documento, não há
conta de reflexão, não há sistema de inventariação. O documento do Piloto tem
código, descrição, diário, conta de débito, conta de crédito e retenção — é o
que a Produção já replicou. O cliente confirmou-o: «essa é uma novidade apenas
do nosso software».

Não há por isso nada a copiar; há a acrescentar, sem mexer no que existe.

---

# O que se fez no ponto 4

## No servidor

Três colunas em `documentos_contabilisticos`, todas opcionais e todas a nascer
vazias — migração `a4c92e17b053`. **Nenhum documento que já existe muda de
comportamento, e nenhum lançamento já feito é tocado.**

| Coluna | O que guarda |
|---|---|
| `pai_codigo` | A classe principal. O `211.1` guarda aqui `211` |
| `sistema_inventario` | `permanente`, `periodico`, ou vazio |
| `conta_reflexao` | A conta de destino da reflexão |

**O outro lado da reflexão não se guarda.** É a própria `conta_debito` do
documento, creditada — não é uma escolha, e guardar as duas deixava-as
divergir. É também o que o cliente disse: «vamos passar a creditar o mesmo
número de conta que tiver aqui».

### As regras que se verificam ao gravar

- **Um só nível de subclasse.** Sem isto o `211.1.1` era aceite e a listagem
  passava a ter de desenhar uma árvore de profundidade desconhecida.
- **Uma classe com filhas não pode virar subclasse** — as filhas ficavam a um
  nível que não existe e desapareciam da listagem sem ninguém as apagar.
- **A classe principal tem de existir**, e um documento não é subclasse de si
  próprio.
- **No permanente a conta de destino é obrigatória**: sem ela não há para onde
  reflectir, e ficava um sistema ligado que não fazia nada — o pior dos dois
  mundos, porque quem o configurou fica a pensar que reflecte.

Onze ensaios guardam estas regras
(`tests/test_documento_subclasse_e_inventario.py`).

## No ecrã

**No formulário**, pela ordem que o cliente pediu: «Subclasse de» junto ao
código, e o bloco **Sistema de inventariação** depois das duas contas e antes
do «sujeito a retenção». Escolhido o permanente, aparecem duas caixas: a que
**credita**, preenchida sozinha com a conta de débito do documento e bloqueada,
e a que **debita**, onde se indica o destino. Com o periódico não aparece caixa
nenhuma — explica-se que o custo só se apura no fim do período.

**Na listagem**, as subclasses ficam debaixo da sua classe, com um traço a
marcá-lo, e há uma coluna nova que diz `Permanente · reflecte na 2611` sem ser
preciso abrir o documento.

**Ao lançar**, escolher um documento que reflecte prepara **quatro linhas** em
vez de duas: a compra e o fornecedor, e a seguir a reflexão — debita as
existências, credita as compras. Vêm preparadas e não impostas, como as duas
que o documento já preparava.

## Verificado no browser

Criado o `211.1` «Compras VFA — Mercadoria para revenda» como subclasse do
`211`, com sistema permanente e destino `2611`:

- a caixa «Credita» preencheu-se sozinha com `21121`;
- a listagem mostra-o dentro do `211`, com `Permanente · reflecte na 2611`;
- tentar criar um `211.1.1` é recusado com «uma subclasse fica dentro de uma
  classe, e não dentro de outra subclasse»;
- escolher `211.1` num lançamento prepara `21121 / 32121` e a reflexão
  `2611 / 21121`.

## Uma falha do ponto 3 que só apareceu aqui

A varredura dos campos de escolha procurou os `Selector` do projecto e **não
apanhou os `<select>` nativos**. O do **Documento no editor de lançamentos** era
um deles — a caixa mais longa do ecrã que mais se usa. Passou a F4, com a
tabela restringida ao diário escolhido.

## O que fica anotado para confirmar com o cliente

As quatro perguntas de cima (A a D) continuam válidas. Implementou-se pela
leitura que a contabilidade suporta, e altera-se se ele disser outra coisa.

## Dados de demonstração criados

Ficaram na base de dados de desenvolvimento, e servem de exemplo do que foi
pedido: o documento `211.1` e a obra `IM-0002 Armazém de Viana — construção`,
com três despesas. Digo-me se os quer apagar.
