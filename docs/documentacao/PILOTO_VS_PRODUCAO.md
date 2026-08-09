# Piloto vs Produção

Comparação entre a versão original (`Piloto/`) e a nova (`Producao/`),
levantada contra o código em 2026-08-09.

O Piloto **não é** um protótipo descartável: é um ERP de contabilidade completo,
com 61 páginas e as regras de negócio todas, que funcionou. O que a Produção
faz é pegar nessas regras — verificadas uma a uma — e pô-las numa arquitectura
que aguenta muitas empresas, muitos utilizadores e dinheiro real.

---

## 1. Tecnologias

### Piloto

| Camada | O quê |
|---|---|
| Interface | HTML, CSS e JavaScript puro — 61 ficheiros `.html` |
| Lógica | 18 ficheiros `.js` em `assets/js/` |
| Dados | **`localStorage` do browser** |
| Servidor | Nenhum. Ficheiros estáticos |
| Build | Nenhum |
| Dependências | Nenhuma |

### Produção

| Camada | O quê |
|---|---|
| Frontend | Next.js 16.3, React 19.2, TypeScript 5, Tailwind 4 |
| Componentes | Radix UI, Framer Motion, Recharts, SWR, big.js |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0, Pydantic 2 |
| Base de dados | **PostgreSQL 18**, 39 tabelas, 18 migrações |
| Autenticação | PyJWT, bcrypt, pyotp, cryptography (Fernet) |
| Limites | SlowAPI |
| IA | OpenAI, só o assistente |
| Testes | pytest — 359 |
| Qualidade | Biome, TypeScript strict |

---

## 2. Arquitectura

### Piloto

```
browser
   └── HTML + JS
         └── localStorage  ← tudo vive aqui
```

Tudo corre no browser. Abrir um ficheiro `.html` é usar a aplicação. Não há
servidor, não há rede, não há instalação.

**Consequência:** os dados estão no browser de quem os escreveu. Outro
computador, outro browser, ou limpar o histórico — são outros dados, ou nenhuns.

### Produção

```
browser ──https──► proxy ──► Next.js (:3000)
                        └──► FastAPI (:8001) ──► PostgreSQL
                                              └─► OpenAI (só o assistente)
```

Três camadas separadas. O browser mostra; o servidor decide; a base guarda.

---

## 3. Funcionalidades em ambas

As **61 páginas** do Piloto têm rota na Produção. Os módulos são os mesmos:

Contabilidade (movimentos, plano de contas, balancetes, balanço, DR, notas,
fluxos, IVA, retenções, extractos, razão, diários, documentos) · Analítica ·
Contas correntes · Comercial · Logística · Imobilizados · RH · Fiscalidade ·
Utilizadores · Configurações.

E as regras de negócio são **as mesmas**, verificadas valor a valor:

| Área | Verificação |
|---|---|
| IRT | 11 escalões, fixas e taxas idênticas (`2026-oficial-v2`) |
| IRPS 2027 | Isenção 150.000, 6 escalões, retenções 6,5/10/15/25/10% |
| INSS | 3% trabalhador, 8% entidade patronal |
| Honorários | Retenção 6,5% |
| Recibo | INSS sobre a base descontada de faltas; IRT sobre `bruto − INSS` |
| Mapa A2.1 | 5 rubricas não sujeitas, 10 sujeitas |
| IVA | 14 / 7 / 0; simplificado 7% − 10%; geral 14% − dedutível |
| Apuramento de IVA | Contas 3453/3452/3454/34551/34561/34571, diário 34, doc 341, período 13 |
| Apuramento de resultados | 871+872 → 885 (doc 821); 88x → 8111 (doc 822); diário 81, período 14 |
| Nº de operação | `PP/DOC.NNN` |
| Comercial | Σ(qtd×preço), IVA sobre o subtotal; 11 tipos de documento |
| Logística | Custo médio ponderado; contas 2611/7111/32121/34521111/90x |
| Imobilizados | Coeficientes 1,5 / 2 / 2,5 |

---

## 4. O que a Produção acrescenta

### Multiempresa e licenciamento

Uma instalação serve muitas empresas. Cada uma com dados isolados, utilizadores
próprios e uma licença com módulos, limites de utilizadores e limites de IA.

A licença gera-se, entrega-se uma chave (mostrada **uma vez**; a base guarda o
SHA-256), e quem a recebe activa-a — o NIF e o nome são confirmados contra o que
foi emitido. A activação cria a empresa, semeia o PGC-AR e cria o administrador
**numa transacção**.

Estados: activa ⇄ suspensa → cancelada. Suspender bloqueia o login **e**
invalida sessões abertas.

No Piloto não existe nada disto: há uma instalação e um conjunto de dados.

### Autenticação a sério

| | Piloto | Produção |
|---|---|---|
| Palavras-passe | **Texto simples no localStorage**, mínimo 4 caracteres | bcrypt + pré-hash SHA-256, mínimo 8 |
| Sessão | Objecto no localStorage | JWT assinado, 30 min + 12 h absolutas |
| Segundo factor | Não existe | TOTP, QR, códigos de recuperação, bloqueio |
| Revogação | Não existe | `token_version` |
| Força bruta | Nada | 5 tentativas/min por IP |
| Confirmar palavra-passe pelo formulário | Possível | Desafio isco impede-o |

### Autorização verificada no servidor

No Piloto, os perfis e os módulos existem — mas quem os aplica é o menu do
browser. **Quem soubesse o endereço via tudo.**

Na Produção, cada pedido passa por três camadas: licença → módulo → capacidade.
E há restrições por utilizador (`modulos_permitidos`, `permissoes_accao`),
também verificadas no servidor.

### Assistente de IA

Não existe no Piloto.

Responde sobre os dados da empresa em linguagem corrente, e traz um
**diagnóstico local** que corre inteiramente no servidor, por regras, sem
contactar API nenhuma.

Com limites explícitos: não envia dados pessoais (pseudonimiza e **verifica**
antes de enviar; se escapar um identificador, aborta), não executa SQL, não
altera dados, e as empresas não têm acesso às credenciais.

### Página pública

Componente de servidor sem JavaScript de cliente, pré-renderizada como
estática, com SEO técnico completo. O Piloto abre directamente no login.

---

## 5. Segurança

| | Piloto | Produção |
|---|---|---|
| Onde vivem os dados | localStorage, legível por qualquer script | PostgreSQL, atrás do servidor |
| Palavras-passe | Texto simples | bcrypt |
| Isolamento entre empresas | Não aplicável | `empresa_id` verificado no servidor |
| Segundo factor | — | TOTP, obrigatório na plataforma |
| Auditoria | — | Autor, momento, IP, antes/depois |
| Limite de pedidos | — | SlowAPI |
| Origem do pedido | — | Só proxies configurados |
| Fecho de período | Verificado no browser | Verificado no servidor; UUID inventado recusado |
| Segredos | — | Só `.env`; app recusa arrancar mal configurada |
| Cabeçalhos | — | HSTS, X-Frame-Options, nosniff |

**O ponto que resume tudo:** no Piloto, abrir a consola do browser dá acesso a
tudo — ler, alterar, apagar. Não é defeito de implementação: é o que
`localStorage` é.

---

## 6. Desempenho

| | Piloto | Produção |
|---|---|---|
| Filtrar 1.619 contas | Percorre o array todo em JS | `WHERE` com índice |
| Balancete | Percorre todos os lançamentos | Agregação em SQL |
| Limite de dados | ~5–10 MB (localStorage) | Sem limite prático |
| Carregamento | Tudo ao abrir a página | Sob procura, com cache SWR |
| Página pública | — | Estática, zero JS |

Em pequeno, o Piloto é mais rápido — não há rede. A diferença aparece com
volume: um exercício com dezenas de milhares de lançamentos deixa de caber no
localStorage muito antes de ser lento.

---

## 7. Escalabilidade

| | Piloto | Produção |
|---|---|---|
| Utilizadores em simultâneo | 1 (por browser) | Muitos |
| Empresas | 1 | Muitas |
| Vários dispositivos | Não — dados presos ao browser | Sim |
| Trabalho em equipa | Não | Sim |
| Escalar | Não aplicável | Mais workers, réplicas de leitura |

---

## 8. Persistência

| | Piloto | Produção |
|---|---|---|
| Guardar | `localStorage` (JSON em texto) | PostgreSQL |
| Transacções | Não | Sim |
| Integridade referencial | Não | Chaves estrangeiras |
| Unicidade | Verificada em JS | Restrições na base |
| Dinheiro | `Number` (vírgula flutuante) | `Numeric(18,2)` / `Decimal` / string |
| Cópias | Exportar à mão | `pg_dump` agendado |
| Evolução do esquema | Editar objectos JS | Alembic, 18 migrações |

**O dinheiro é o ponto mais sério.** O Piloto soma em vírgula flutuante, onde
`0.1 + 0.2 ≠ 0.3`. A Produção usa `Decimal` de ponta a ponta, e os valores
viajam como texto no JSON precisamente para nenhuma camada os converter para
`float`.

---

## 9. Auditoria

O Piloto não tem. Alterou-se um contrato, um acesso ou um estado — não há
registo de quem, quando ou o quê.

A Produção regista autor, momento, IP, acção, alvo e **antes/depois** em JSONB.
A activação de licença é o único registo sem autor — quem activa ainda não tem
conta.

**[PENDENTE]** A auditoria cobre administração de plataforma e utilizadores,
não ainda todas as operações de negócio.

---

## 10. Manutenção

| | Piloto | Produção |
|---|---|---|
| Tipos | JavaScript sem tipos | TypeScript strict + Pydantic |
| Testes | Nenhum | 359 |
| Lint | Nenhum | Biome |
| Migrações | — | Alembic |
| Documentação da API | — | OpenAPI (fechada em produção) |
| Separação de camadas | Lógica e interface no mesmo ficheiro | Routers / serviços / modelos |

Os testes não são cobertura por cobertura: fixam as **regressões que já
aconteceram** — o módulo que só o menu protegia, a conta apagada com
movimentos, o diferido que ficava preso, o preço que reescrevia o histórico.

---

## 11. Experiência do utilizador

O Piloto tem uma interface competente. A Produção mantém a mesma identidade
visual (as variáveis de cor são as mesmas) e acrescenta:

- Componentes acessíveis (Radix): foco, teclado, leitores de ecrã
- Movimento discreto, que respeita `prefers-reduced-motion`
- Tema claro e escuro
- Responsivo em telemóvel, tablet e desktop
- Impressão: regras `@media print` que tiram a moldura da aplicação
- Mensagens de erro que dizem o que fazer a seguir
- Confirmação antes de apagar, com o efeito explicado

---

## 12. Inteligência artificial

Só existe na Produção.

| | |
|---|---|
| Perguntas e respostas | Sobre os dados da empresa, em linguagem corrente |
| Diagnóstico | Por regras, **inteiramente local**, sem API externa |
| Pseudonimização | Nomes e identificadores substituídos antes de sair |
| Verificação | Se escapar um identificador, a consulta **aborta** |
| Modelo | Escolhido pelo superadmin; imposto pelo servidor |
| Preços | Geridos na aplicação; guardados por consulta |
| Tecto de resposta | `max_tokens` imposto pela API |
| Quotas | Por empresa, verificadas antes da chamada |
| Interruptor geral | Desliga para toda a plataforma |
| Retenção | Dois prazos; nunca apaga o mês corrente |

---

## 13. Gestão multiempresa

| | Piloto | Produção |
|---|---|---|
| Empresas | 1 | Muitas |
| Login | E-mail + palavra-passe | Empresa + e-mail + palavra-passe (+ 2FA) |
| Isolamento | — | `empresa_id` em todas as tabelas, verificado no servidor |
| Contratos | — | Licenças com módulos e limites |
| Estados | — | Activa / suspensa / cancelada |
| Administração central | — | Área da plataforma, até 3 contas |
| Custos por empresa | — | Consumo de IA com tokens e custo |

---

## 14. Fluxo contabilístico: o que muda

Na substância, quase nada — e é esse o objectivo. As diferenças:

| Situação | Piloto | Produção |
|---|---|---|
| Conta fora do plano | Passa; movimento fica órfão | **Recusado** |
| Reprocessar folha do mês | Volta a lançar; custo em dobro | **Recusado** |
| Transferência origem = destino | Sai sem entrar; valor desaparece | **Recusado** |
| Apagar conta/artigo/cliente com histórico | Apaga; ficam referências mortas | **Recusado** (409); desactiva-se |
| Numeração de documentos | Ano do sistema, contador nunca reinicia | **Ano do documento**, reinicia por ano |
| Período do RH | Texto livre, único na história | Período + exercício |
| Custo médio | Arredonda a cada movimento | Acumula, arredonda no fim |
| Fecho de período | Verificado no browser | **Verificado no servidor** |
| Lançamento diferido | Integra-se na página | Integra-se na página |

Todas endurecem o sistema. A que merece confirmação antes de facturar a sério é
a **numeração**: uma factura datada de 2025 emitida em Janeiro de 2026 fica
`FT 2025/0001` na Produção e ficava `FT 2026/0101` no Piloto. A regra da
Produção é a que uma série documental fiscal exige.

---

## 15. Vantagens e limitações

### Piloto

**A favor:** zero instalação — abre-se um ficheiro. Zero dependências. Zero
custo de operação. Funciona sem rede. Ideal para demonstrar ou ensinar.

**Contra:** os dados vivem no browser e vão-se com ele; palavras-passe em texto
simples; qualquer pessoa com a consola aberta lê e altera tudo; uma empresa por
instalação; um utilizador de cada vez; sem auditoria; sem cópias; dinheiro em
vírgula flutuante; sem testes.

### Produção

**A favor:** dados num servidor com transacções e cópias; palavras-passe
cifradas e 2FA; autorização verificada no servidor; muitas empresas isoladas;
trabalho em equipa; auditoria; dinheiro exacto; 359 testes; assistente de IA
com custos controlados; página pública indexável; guardas que impedem uma
instalação mal configurada de arrancar.

**Contra:** exige servidor, base de dados, domínio e certificado; exige quem
saiba operar; custo de infraestrutura; o assistente tem custo por utilização;
e ainda há funcionalidades do Piloto por migrar (secção 16).

---

## 16. O que ainda falta concluir

Estado real, verificado no código:

| O que | Situação |
|---|---|
| Recuperação de palavra-passe por e-mail | Falta SMTP |
| Interface de exercícios (criar/fechar/reabrir) | Backend só tem `GET` |
| Interface de fechos de período | `POST`/`DELETE` existem, sem botão |
| Documento legal de venda (A4 + talão POS 80 mm, QR) | Não migrado |
| Separadores de `empresa.html` | 6 dos 9 sem equivalente: facturação e comunicação (SAF-T), integração AGT, tesouraria, CMVMC, séries, políticas |
| Exportar CSV em vários mapas | Parcial |
| Drill-down do balancete | Não migrado |
| Picker de contas com F4 | Não migrado |
| Auditoria das operações de negócio | Só administração |

**Já concluído nesta ronda:** integração de lançamentos diferidos, CRUD do
plano de contas, diários, documentos e centros de custo, e editar/eliminar em
artigos, armazéns, clientes, fornecedores, vendedores e colaboradores.

---

## 17. Conclusão

A Produção é tecnicamente superior por uma razão que resume as outras: **no
Piloto, a aplicação e a segurança são a mesma coisa — o browser.** Perfis,
módulos e períodos fechados existem, mas quem os aplica é o JavaScript que
qualquer pessoa pode contornar com a consola aberta. Não é um defeito de
implementação; é o que uma aplicação sem servidor pode oferecer.

Os problemas do Piloto que ficam resolvidos:

1. **Dados presos ao browser** → base de dados partilhada, com transacções e
   cópias.
2. **Palavras-passe em texto simples** → bcrypt, com 2FA por cima.
3. **Autorização decorativa** → verificada no servidor, em três camadas.
4. **Uma empresa por instalação** → muitas, isoladas e verificadas.
5. **Dinheiro em vírgula flutuante** → `Decimal` de ponta a ponta.
6. **Sem rasto** → auditoria com antes e depois.
7. **Fecho de período contornável** → imposto no servidor.
8. **Apagar sem consequências** → o que tem histórico não se apaga.
9. **Sem testes** → 359, a fixar as regressões que já aconteceram.

E o que é novo: multiempresa com licenciamento, verificação em dois passos,
assistente de IA com pseudonimização e custos controlados, e uma página pública
que permite encontrar o produto.

**O que não mudou, e não podia mudar:** as regras. Os escalões do IRT, as taxas
de INSS, as contas do apuramento de IVA, as fórmulas do recibo, o custo médio,
os coeficientes de amortização — tudo verificado valor a valor. As seis
diferenças de comportamento que existem são correcções de defeitos, e cada uma
tem a sua justificação escrita em `docs/FIDELIDADE_AO_PILOTO.md`.

A Produção não é um sistema novo. É o mesmo sistema, num sítio onde pode ser
usado por várias pessoas, em várias empresas, com dinheiro a sério.
