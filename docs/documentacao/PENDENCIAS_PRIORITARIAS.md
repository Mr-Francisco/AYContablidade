# Pendências prioritárias

**Data do levantamento:** 9 de Agosto de 2026
**Estado:** análise e documentação. **Nada aqui foi implementado.**

Três frentes que ficam por fazer, por ordem de prioridade. Cada uma foi
verificada contra o código do Piloto e da Produção — o que está escrito como
«existe» foi lido no código, não presumido.

O ponto 2 da lista original (Exercícios e fechos de período) **foi
implementado** e não consta deste documento. Ver `PILOTO_VS_PRODUCAO.md`.

| # | Pendência | Prioridade | Bloqueia |
|---|---|---|---|
| 1 | [Factura legal](#1-factura-legal) | **ALTA** | Facturar a clientes reais |
| 3 | [Configurações da empresa](#3-configurações-da-empresa) | MÉDIA/ALTA | Parametrização por empresa |
| 4 | [Recuperação de palavra-passe](#4-recuperação-de-palavra-passe-por-e-mail) | POSTERIOR | Nada — há alternativa manual |

---

## 1. Factura legal

### O aviso que vem primeiro

O Piloto **não emite documentos fiscalmente válidos**. Emite documentos com o
*aspecto* de válidos. Isto foi verificado no código e muda o que significa
«transpor o Piloto» nesta funcionalidade:

| Elemento | O que o Piloto faz | O que é |
|---|---|---|
| Código QR | `pseudoQR()` em `assets/js/fatura-doc.js:9` desenha rectângulos a partir de um hash FNV do número do documento | **Não é um QR.** Nenhum leitor o lê. É decoração |
| «Código de validação AGT» | `codigoValidacao()` em `assets/js/comercial.js:67` — `hash32(numero\|total\|cliente\|data)` truncado a 4 caracteres, mais 4 do hash do id | **Inventado localmente.** A AGT não o emitiu nem o conhece |
| «Processado por programa validado» | Texto livre de `config.faturacao.software` + `versao` + `certificado` | **Declaração não verificada.** Os campos são escritos à mão nas configurações |
| Exportação SAF-T | `empresa.html:150` gera um **CSV** com o cabeçalho `"SAF-T (AO) — SGD (demonstração)"` | **Não é SAF-T.** O SAF-T é XML com esquema definido |

**Consequência para o planeamento:** a regra 11 do projecto («réplica fiel do
Piloto») não se pode aplicar aqui sem transformar uma maqueta num documento que
se entrega a um cliente e se apresenta à administração fiscal. Copiar estes
quatro elementos seria pior do que não ter a funcionalidade: um documento que
*parece* certificado e não é expõe a empresa emitente, não o fornecedor do
software.

Recomendação: tratar a factura legal como **funcionalidade nova**, com os
requisitos confirmados junto da AGT e de um contabilista certificado, e usar o
Piloto apenas como referência de **layout e conteúdo comercial** (o que é
genuinamente bom e reaproveitável).

### 1.1 O que já existe na Produção

Verificado no código:

- **Modelo de dados de venda completo** — documento, linhas, cliente, artigo,
  quantidade, preço, IVA, totais, estado.
- **Numeração sequencial segura** — `SequenciaDocumento`
  (`db/models/contabilidade.py:296`), com `SELECT … FOR UPDATE` e
  `UniqueConstraint(empresa_id, documento_codigo, exercicio_id)` com
  `nulls_not_distinct`. Dois utilizadores em simultâneo não recebem o mesmo
  número. **Esta é a peça difícil e está feita.**
- **Tipos de documento** configuráveis por empresa (FT, FR, NC, ND…), com
  indicação de quais movimentam IVA.
- **Emissão contabilística** — emitir uma venda gera o lançamento em partidas
  dobradas, com as contas do módulo comercial.
- **Consulta de facturas** com filtros e histórico paginado.
- **Regras de impressão** — `globals.css` tem o bloco `@media print` que
  esconde a moldura da aplicação e força preto sobre branco.
- **Cálculo de totais** em `Numeric(18,2)` no servidor.

### 1.2 O que existia no Piloto

`assets/js/fatura-doc.js` (112 linhas) produz:

- **A4 completo** — cabeçalho da empresa, dados do cliente, tabela de linhas
  numeradas (`001`, `002`…), subtotal, IVA, total.
- **Talão POS 80 mm** — a mesma factura em formato de rolo térmico.
- **Valor por extenso** — `valorExtenso()`, algoritmo completo em português
  (unidades, dezenas, centenas, milhares, milhões). **Reaproveitável tal e
  qual** — é código correcto e não tem nada de fiscal.
- **Dados bancários** no rodapé, vindos da Tesouraria (ver pendência 3).
- **Nome do operador** e hora de emissão.
- **Escolha de formato na impressão** — `imprimir("a4" | "pos")`.

### 1.3 O que falta na Produção

A Produção mostra **um modal de detalhe genérico**. Não há documento
imprimível, nem A4 nem talão.

Em falta:

1. Modelo de impressão A4 com identidade da empresa.
2. Modelo de talão 80 mm.
3. Valor por extenso (porte directo do Piloto).
4. Escolha de formato na impressão.
5. Dados bancários no rodapé — depende da Tesouraria (pendência 3).
6. Segunda via / duplicado com marcação de reimpressão.

### 1.4 Trabalho técnico necessário

**Parte não-fiscal** (fazer-se independentemente das confirmações legais):

| Tarefa | Onde | Notas |
|---|---|---|
| Componente `DocumentoVenda` A4 | `frontend/src/components/comercial/` | Server-side ou client-side; usar as regras `@media print` já existentes |
| Componente talão 80 mm | idem | `@page { size: 80mm auto }` |
| `valorExtenso()` em TypeScript | `frontend/src/lib/texto.ts` | Porte directo de `fatura-doc.js:21` |
| Botão «Imprimir» com escolha de formato | página de vendas | Reutilizar `AccoesDoMapa` |
| Marcação de segunda via | modelo `Venda` + impressão | Contador de impressões |

**Parte fiscal** (bloqueada até às confirmações de 1.8):

| Tarefa | Notas |
|---|---|
| QR real | Biblioteca de QR **no backend** (o Python já tem `segno`, usado no 2FA) — o conteúdo do QR é que tem de ser o formato que a AGT define |
| Assinatura digital dos documentos | Cadeia de hash encadeada entre documentos da mesma série; chave privada por empresa |
| SAF-T (AO) em XML | Esquema oficial; validação contra XSD |
| Comunicação à AGT | Endpoint, autenticação, tratamento de falhas e reenvio |
| Número de certificação do software | Emitido pela AGT ao **fornecedor**, não à empresa |

### 1.5 Requisitos fiscais e legais — **a confirmar**

Não estão aqui afirmados como factos. São as perguntas a fazer, porque a
resposta muda a arquitectura:

1. Que **menções obrigatórias** deve conter uma factura em Angola (designação
   exacta do documento, NIF do emitente e do adquirente, regime de IVA, motivo
   de isenção quando aplicável, data de emissão vs data da operação)?
2. A numeração tem de ser **sequencial, contínua e sem lacunas por série**? Se
   sim, o que fazer com um documento anulado — nota de crédito obrigatória, ou
   anulação com registo?
3. Que **prazo de conservação** dos documentos e em que formato?
4. Quais os **tipos de documento** legalmente reconhecidos e quais movimentam
   IVA?
5. Uma factura emitida pode ser **alterada**? (A resposta habitual é não —
   corrige-se com nota de crédito. Isto tem de ficar travado no backend.)

### 1.6 Requisitos AGT — **a confirmar**

1. Esta empresa está obrigada a **facturação electrónica**, a **SAF-T
   periódico**, ou a ambos? O Piloto oferece as três opções como configuração,
   o que sugere que depende do regime/dimensão.
2. Se há comunicação em tempo real: **qual o endpoint**, que autenticação, que
   resposta devolve, e **o que fazer quando falha** — a factura fica retida ou
   emite-se e comunica-se depois?
3. Qual o **conteúdo exacto do QR**? (Em Portugal é uma cadeia de campos
   separados por `*`; em Angola tem de ser confirmado.)
4. Ambiente de **homologação** disponível para testes?

Nota: a Produção já tem estrutura para a integração AGT de **consulta de NIF**
(`AGT_ATIVO`, `AGT_ENDPOINT`, `AGT_USERNAME`, `AGT_PASSWORD` no
`.env.producao.example`), desligada por omissão. É um ponto de partida, mas é
uma API diferente da de facturação.

### 1.7 Certificação

- A certificação de software de facturação é concedida ao **produto**, não a
  cada instalação. Tem de ser pedida pelo fornecedor do SGD.
- Enquanto não houver número de certificação, **a factura não deve dizer
  «Processado por programa validado»**. O Piloto diz — e não é verdade.
- O processo tem custo, prazo e implica submeter o software a análise. **A
  confirmar junto da AGT**: requisitos, custo, prazo, e se há um regime
  transitório.

### 1.8 O que confirmar antes de implementar

Por ordem — a primeira resposta condiciona todas as outras:

1. **A plataforma vai ser certificada?** Se não, não pode emitir documentos
   fiscais e a funcionalidade limita-se a documentos internos (pró-forma,
   nota de encomenda, recibo não fiscal), o que é perfeitamente utilizável e
   muito mais barato.
2. Se sim: obter o **caderno de requisitos técnicos** da AGT.
3. Confirmar o formato do **QR** e da **assinatura**.
4. Confirmar o **esquema XML do SAF-T (AO)** e a periodicidade.
5. Decidir a política de **séries** (ver pendência 3, que é pré-requisito).

### 1.9 Estimativa

| Fase | Esforço | Depende de |
|---|---|---|
| A4 + talão + extenso + impressão | 2–3 dias | Nada. **Pode começar já** |
| Séries de documentos | 2 dias | Pendência 3 |
| QR + assinatura | 3–5 dias | Especificação AGT |
| SAF-T XML | 5–8 dias | Esquema oficial |
| Comunicação à AGT | 5–10 dias | Endpoint + homologação |
| Certificação | Indeterminado | Processo externo |

---

## 3. Configurações da empresa

`empresa.html` do Piloto tem **9 separadores**. A Produção tem **3**.

### 3.1 Quadro-resumo

| Separador | Piloto | Produção | Estado |
|---|---|---|---|
| Empresa | ✅ | ✅ | **Feito** |
| Módulos | ✅ | ✅ | **Feito** |
| Licença | — | ✅ | Só na Produção (não existe no Piloto) |
| Exercícios Económicos | ✅ | ✅ | **Feito no ponto 2** — vive em Contabilidade → Exercícios |
| Faturação e Comunicação | ✅ | ❌ | Em falta |
| Integração AGT | ✅ | Parcial | Modelo existe, sem interface |
| Tesouraria | ✅ | ❌ | Em falta |
| Parametrizações (CMVMC) | ✅ | Parcial | Modelo existe, sem interface |
| Séries de Documentos | ✅ | Parcial | Numeração existe, gestão de séries não |
| Permissões e Políticas | ✅ | ❌ | Em falta |

**Boa notícia estrutural:** `ConfigEmpresa`
(`db/models/tenancy.py:170`) já tem os campos JSONB `modulos`,
`parametrizacoes` e `agt`. A maioria do que falta é **interface sobre um modelo
que já existe** — o mesmo padrão do ponto 2.

### 3.2 Faturação e Comunicação

- **Estado actual:** não existe.
- **No Piloto:** modo de comunicação (electrónica / SAF-T / ambos), nome e
  versão do software, número de certificado, ambiente (produção/testes), série
  por omissão, periodicidade do SAF-T, e um botão «Exportar SAF-T (demo)» que
  produz **CSV, não XML**.
- **Falta:** o separador todo.
- **Dependências:** pendência 1. Não vale a pena um ecrã para configurar
  certificação enquanto não se souber se vai haver certificação.
- **Trabalho:** 1 dia para o ecrã; a exportação SAF-T real é da pendência 1.
- **Risco:** **alto se for feito como no Piloto.** Um campo livre onde se
  escreve um número de certificado que ninguém valida faz a factura declarar
  uma certificação inexistente. Se este separador for feito, o número de
  certificado deve ser gerido pelo **superadministrador da plataforma**, não
  pela empresa cliente.

### 3.3 Séries de Documentos

- **Estado actual:** a numeração sequencial existe e é robusta
  (`SequenciaDocumento`, com bloqueio e restrição de unicidade). O que **não**
  existe é o conceito de **série** — hoje a sequência é por
  `(empresa, documento, exercício)`.
- **No Piloto:** tabela de séries com código (`2026/A`), nome, tipo de
  documento, ambiente (produção/testes), nº actual editável e estado
  activa/inactiva.
- **Falta:** modelo `Serie`, ligação da venda à série, e o ecrã de gestão.
- **Dependências:** decisão fiscal sobre se a numeração tem de ser contínua por
  série (ver 1.5, pergunta 2).
- **Trabalho:** 2 dias — modelo, migração, rotas, ecrã.
- **Riscos:**
  - **O «nº atual» editável do Piloto é perigoso.** Permite recuar o contador e
    reemitir números já usados. Na Produção deve ser de leitura, ou exigir
    justificação registada em auditoria.
  - Migração de dados: as vendas existentes não têm série. É preciso uma série
    por omissão para as antigas.

### 3.4 Tesouraria

- **Estado actual:** não existe.
- **No Piloto:** lista de contas bancárias e caixa — tipo (banco/caixa), nome,
  IBAN, conta contabilística associada. Usada no rodapé da factura.
- **Falta:** modelo, rotas e ecrã.
- **Dependências:** nenhuma. **É a mais fácil das três e desbloqueia o rodapé
  da factura.**
- **Trabalho:** 1–2 dias.
- **Risco:** baixo. Atenção ao IBAN — é dado da empresa, não segredo, mas
  aparece em documentos enviados a terceiros.

### 3.5 Parametrizações (CMVMC)

- **Estado actual:** `ConfigEmpresa.parametrizacoes` existe em JSONB e é lido
  pelos serviços de logística e comercial. **Sem interface** — altera-se pela
  API.
- **No Piloto:** movimento automático de stock sim/não, contas de existências,
  de custo, armazém por omissão, regularizações, diário e documento usados,
  contas de ganho e de quebra.
- **Falta:** o ecrã.
- **Dependências:** nenhuma.
- **Trabalho:** 1 dia.
- **Risco:** médio. Mudar a conta de CMVMC a meio de um exercício faz os
  lançamentos novos ir para outra conta e o mapa de custos deixa de comparar.
  Devia avisar e ficar registado em auditoria.

### 3.6 Integração AGT (consulta de NIF)

- **Estado actual:** `ConfigEmpresa.agt` existe; as credenciais estão em
  variáveis de ambiente (`AGT_*`), como manda a regra 6. Desligada por omissão.
  **Sem interface.**
- **No Piloto:** activo, ambiente, endpoint, proxy, utilizador e **palavra-passe
  num campo do formulário** — guardados no localStorage.
- **Falta:** o ecrã, para ligar/desligar e escolher o ambiente.
- **Dependências:** credenciais AGT.
- **Trabalho:** meio dia.
- **Risco:** **não repetir o Piloto.** Utilizador e palavra-passe não podem
  voltar a um formulário do lado do cliente. O ecrã só deve mostrar
  ligado/desligado e ambiente; as credenciais ficam no `.env` do servidor.

### 3.7 Permissões e Políticas

- **Estado actual:** não existe este separador. A gestão de utilizadores e
  perfis está em Gestão → Utilizadores, e a matriz de capacidades (`CAPS`) é
  fixa no código, como no Piloto.
- **No Piloto:** um único interruptor — «comissões restritas».
- **Falta:** pouco. É o separador mais pequeno dos nove.
- **Dependências:** nenhuma.
- **Trabalho:** 2 horas, se for só o interruptor.
- **Risco:** baixo, desde que não se transforme em edição livre da matriz de
  capacidades — isso é uma funcionalidade muito maior e com implicações de
  segurança.

### 3.8 Ordem sugerida

1. **Tesouraria** — sem dependências, desbloqueia o rodapé da factura.
2. **Parametrizações** — sem dependências, modelo já existe.
3. **Integração AGT** — meio dia, e corrige um risco do Piloto.
4. **Séries** — depende de decisão fiscal.
5. **Faturação e Comunicação** — depende da pendência 1.
6. **Permissões** — pequeno, sem urgência.

---

## 4. Recuperação de palavra-passe por e-mail

### 4.1 Estado actual

Verificado: **não existe nada.** Nem fluxo, nem SMTP, nem envio de e-mail em
lado nenhum da Produção. Uma pesquisa por `smtp` no backend não devolve
resultados.

Quem perde a palavra-passe hoje: o administrador da empresa define uma nova
(fica marcada como provisória e é obrigatório mudá-la ao entrar). Para o
superadministrador, existe `scripts/criar_superadmin.py`.

**Isto funciona.** É por isso que esta pendência é a última: há alternativa, e
a alternativa tem uma propriedade que o e-mail não tem — alguém confirma a
identidade de quem pede.

### 4.2 Fluxo previsto

1. Em `/entrar`, ligação «Esqueci-me da palavra-passe».
2. Pede-se **empresa + e-mail** (o mesmo par do login, porque o e-mail sozinho
   não identifica a conta num sistema multi-empresa).
3. O servidor responde **sempre a mesma coisa**, exista ou não a conta: «Se
   houver conta com esse e-mail, enviámos uma mensagem.» Uma resposta
   diferenciada transforma o formulário num verificador de contas.
4. Existindo conta: gera-se um token, guarda-se o **hash**, envia-se a ligação.
5. A ligação abre `/repor-palavra-passe?token=…`, que pede a nova palavra-passe
   duas vezes.
6. Ao repor: valida-se a política de complexidade, incrementa-se
   `token_version` (termina todas as sessões abertas), marca-se o token como
   usado e regista-se em auditoria.

**Ponto por decidir:** uma conta com 2FA activo deve poder repor a
palavra-passe só com o e-mail? Repor por e-mail contorna o segundo factor e
anula-o. A resposta correcta é **exigir também o código TOTP ou um código de
recuperação** — caso contrário o 2FA vale o que valer a caixa de correio.

### 4.3 Segurança do token

| Propriedade | Como |
|---|---|
| Aleatoriedade | `secrets.token_urlsafe(32)` — 256 bits |
| Armazenamento | **Só o hash SHA-256.** Já há este padrão nas chaves de licença e nos códigos de recuperação do 2FA |
| Expiração | 30 a 60 minutos |
| Uso único | Marcado como usado na primeira utilização; um segundo pedido falha |
| Um por conta | Pedir de novo invalida o anterior |
| Limite de pedidos | O `SlowAPI` já existe; aplicar o mesmo limite do login (5/min) |
| Enumeração | Resposta idêntica exista ou não a conta; tempo de resposta semelhante |
| Conteúdo do e-mail | Sem palavra-passe, sem dados da empresa. Só a ligação e o prazo |

### 4.4 SMTP e domínio

**Necessário:**

- Servidor SMTP ou serviço de envio transaccional.
- Domínio próprio (já é preciso para a instalação — ver `DEPLOYMENT_GUIDE.md`).
- **SPF, DKIM e DMARC** no DNS. Sem isto, a mensagem vai para spam — e um
  e-mail de recuperação no spam é o mesmo que não existir.
- Endereço remetente dedicado (`nao-responder@dominio.ao`).

**Configuração nova no `.env`:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_UTILIZADOR`,
`SMTP_PALAVRA_PASSE`, `SMTP_REMETENTE`, `SMTP_TLS`. Segredos só em variáveis de
ambiente (regra 6). E a guarda de produção deve recusar arrancar com SMTP
configurado pela metade, tal como já faz para o CORS e a chave do 2FA.

### 4.5 Custos

Não confirmado — a verificar com o fornecedor escolhido. Ordens de grandeza:

- Serviços transaccionais têm escalões gratuitos (tipicamente alguns milhares
  de mensagens por mês) que cobrem folgadamente a recuperação de palavra-passe.
- SMTP do próprio alojamento: sem custo adicional, mas maior risco de entrega
  em spam e de o IP ficar em lista negra.
- Custo real provável: **zero neste volume**. O custo é de configuração de DNS
  e de manutenção, não de subscrição.

### 4.6 Dependências

1. Domínio e DNS.
2. Escolha do fornecedor de envio.
3. Decisão sobre 2FA (ver 4.2).
4. Modelo de e-mail em Português (PT-PT).

### 4.7 Trabalho

| Tarefa | Esforço |
|---|---|
| Modelo `TokenRecuperacao` + migração | 2 h |
| Serviço de envio de e-mail | 3 h |
| Rotas `/auth/recuperar` e `/auth/repor` | 3 h |
| Páginas `/recuperar` e `/repor-palavra-passe` | 3 h |
| Testes (expiração, uso único, enumeração, limite) | 3 h |
| DNS, SPF/DKIM/DMARC e verificação de entrega | 2 h |

**Total: 2 dias**, mais o tempo de propagação de DNS.

### 4.8 Riscos

- **Um fluxo de recuperação é uma porta de entrada.** Passa a haver forma de
  tomar uma conta sem saber a palavra-passe, bastando acesso à caixa de
  correio. É por isso que a decisão sobre o 2FA importa.
- Sem SPF/DKIM/DMARC, a funcionalidade parece implementada e não funciona.
- Um token que não expira ou que serve duas vezes é pior do que não ter
  recuperação nenhuma. Os testes de 4.7 não são opcionais.

---

## 5. «Progresso Equipa» — o separador do administrador da empresa

**Pedido pelo utilizador em 2026-08-14. Ainda não implementado.**

Um separador **só para o administrador da empresa** — não para o
superadministrador da plataforma, que já tem o seu, e não para os restantes
perfis. Chama-se **Progresso Equipa**.

**O que deve mostrar:** o resumo de tudo o que se passa na empresa, bloco a
bloco — contabilidade, contas correntes, comercial, logística, imobilizados,
RH e fiscalidade — para que o administrador veja num ecrã só em que pé está
cada área, sem ter de entrar em sete módulos.

**Como deve ser feito:** o mesmo layout dos painéis do Piloto —
`dash-hero` com a faixa e os valores, `grid-4` de KPIs, e os cartões de
gráfico (`chart-card`) por baixo. Não inventar um desenho novo: o Piloto tem
sete painéis por módulo em `assets/js/dashboards.js`, e este é a soma deles.

**Por decidir antes de começar:**

- Que três a quatro números representam cada bloco. Um painel com quarenta
  números não se lê — e o pedido foi «de forma resumida».
- Se «progresso» quer dizer estado das áreas (o que está feito e o que
  falta) ou actividade da equipa (quem lançou o quê). São dois painéis
  diferentes; o nome sugere o segundo, a descrição sugere o primeiro.
- Se cada bloco respeita as licenças e módulos da empresa — um bloco de RH
  numa empresa sem RH deve desaparecer, não mostrar zeros.

**Estimativa:** 2 a 3 dias depois de as três perguntas acima terem resposta.
A maior parte dos números já existe em serviços (`resumo_resultado`,
`balanco`, `contas_correntes`, os mapas de cada módulo); o trabalho é de
agregação e interface.

---

## 6. Ícones: fora os emojis, dentro os ícones de linha ✅ FEITO

**Pedido em 2026-08-14. Feito no mesmo dia.**

Não sobrou um único emoji em `Producao/frontend/src`. Verificado por varrimento
dos intervalos Unicode de emoji e de símbolos, e no browser.

| Onde | Estava | Ficou |
|---|---|---|
| Explorador — 13 cartões | ✍️ 📄 📗 ⚖️ 📘 🏛️ 📈 📝 💧 🧾 📚 🗂️ 📅 | traçados do `iconesNav`, 19px, numa moldura de 36 |
| Faixa do login — 3 módulos | 📒 💳 👥 | `livro`, `wallet`, `users` |
| Plano de Contas | `⊞` `⊟` | `ChevronsUpDown` / `ChevronsDownUp` |
| Selo de estado dos Movimentos | `⚠` `✓` `✗` **dentro do texto** | ícone no selo, texto limpo |
| Campo de conta | `✓` `✕` | `Check` / `X` |
| Etiqueta do exercício, KPIs, totais | `⚠ verificar`, `✓ Equilibrado` | palavras: «por verificar», «Equilibrado» |

**Uma decisão que mudou mais do que o desenho:** nos Movimentos o `⚠` estava
colado ao texto do selo — `"⚠ Indica o diário"` — e esse mesmo texto ia para o
`title` do botão «Gravar», que tinha de o limpar com uma expressão regular. O
símbolo passou para o selo e o texto ficou limpo. A expressão regular
desapareceu.

**Ficou um componente:** `components/layout/IconeDeLinha.tsx`, que desenha
qualquer traçado do `iconesNav` sempre com a mesma espessura (1.7) e a mesma
grelha (24). Havia três sítios a desenhá-los à mão, e a espessura já divergia.

---

## 7. Contactos obrigatórios por utilizador

**Pedido pelo utilizador em 2026-08-14.**

Hoje o utilizador tem um único campo `telefone`, opcional, e nem sequer é
pedido ao criar a conta. Passa a ser:

- **Pelo menos um contacto, obrigatório no acto da criação.** Sem ele não se
  cria a conta.
- **Um segundo, opcional**, se o utilizador quiser.
- **CRUD completo** — acrescentar, alterar e remover, com a regra de que o
  último não se remove.

**O que é preciso decidir antes de começar:**

- **Que tipos de contacto.** Telemóvel e telefone fixo? E-mail alternativo?
  WhatsApp? A resposta muda o modelo: um campo `tipo` com uma lista fechada,
  ou dois campos fixos.
- **Se é para recuperação de acesso.** Se um contacto vier a servir para
  recuperar a palavra-passe ou receber códigos, precisa de **verificação** —
  um número que ninguém confirmou não serve para provar identidade. Isso liga
  à pendência 4 (recuperação de palavra-passe).
- **Se o próprio utilizador os pode editar.** Hoje `/perfil` é só de leitura,
  por decisão registada em `CLAUDE.md`. Contactos são dados pessoais do
  próprio; faz sentido serem a excepção, mas é uma decisão a tomar de
  propósito e não por acidente.
- **Formato e validação.** Angola usa +244 com nove dígitos. Validar? Aceitar
  estrangeiros? Um campo que aceita tudo acaba com «não sei» lá dentro.

**Trabalho:** 1 a 2 dias — modelo `ContactoUtilizador` com migração, validação
no `UtilizadorCriar`, CRUD nas rotas, e os campos no diálogo de criação e no
ecrã de perfil.

**Nota de dados:** as contas que já existem não têm contacto nenhum. A
obrigatoriedade só pode valer para as **novas**, ou é preciso uma campanha
para preencher as antigas — senão o primeiro administrador a gravar uma conta
antiga fica bloqueado por um campo que nunca existiu.

---

## Resumo para decisão

**Pode começar já, sem depender de ninguém:**

- Factura A4 e talão 80 mm **sem elementos fiscais** (pendência 1, parte
  não-fiscal) — 2 a 3 dias.
- Tesouraria (3.4) — 1 a 2 dias.
- Parametrizações (3.5) — 1 dia.
- Integração AGT, só o interruptor (3.6) — meio dia.

**Precisa de resposta externa antes de começar:**

- Tudo o que é fiscal na pendência 1 — depende da AGT e da decisão sobre
  certificação.
- Séries (3.3) — depende da regra de numeração.
- Recuperação por e-mail (4) — depende do domínio e da decisão sobre 2FA.

**A pergunta que destranca mais coisas:** a plataforma vai ser submetida a
certificação junto da AGT? Um sim ou um não fecha ou abre metade deste
documento.
