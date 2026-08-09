# Fidelidade ao Piloto

A Regra 9 do `CLAUDE.md` diz que a Produção tem de preservar integralmente as
funcionalidades do Piloto, e a Regra 11 que deve ser uma réplica fiel em
comportamento e regras de negócio.

Este documento diz onde está e onde não está. Foi levantado em 2026-08-09,
página a página (61 do Piloto) e regra a regra (`Piloto/assets/js/*.js` contra
`Producao/backend/src/services/**`).

**Resumo: as regras de negócio estão fiéis. As funcionalidades não estão todas.**
Nenhuma página do Piloto ficou sem rota — o que falta são operações dentro de
páginas que existem.

---

## 1. Regras de negócio — fiéis

Verificado valor a valor, não por semelhança de nomes.

| Área | Estado |
|---|---|
| **IRT** | Os 11 escalões batem certo, incluindo as fixas e o «excesso de». Mesma versão declarada: `2026-oficial-v2`. |
| **IRPS 2027** | Isenção 150.000, 6 escalões, fixas e taxas iguais; retenções 6,5% / 10% ou 15% / 25% / 10%. |
| **INSS** | 3% trabalhador, 8% entidade patronal. |
| **Honorários** | Retenção de 6,5%. |
| **Recibo de vencimento** | Fórmulas iguais, incluindo as duas subtilezas que mais custam: o INSS incide sobre o salário base já descontado de faltas (não sobre o bruto), e a matéria colectável do IRT é `bruto − INSS`. Faltas a base 30 dias. |
| **Mapa A2.1** | As 5 rubricas não sujeitas e as 10 sujeitas, e as bases de SS e de IRT. |
| **IVA** | Taxas 14 / 7 / 0 por regime; simplificado 7% sobre recebimentos − 10% do IVA suportado; geral 14% − dedutível; II 25% e provisório 2%. Contas do apuramento todas iguais (3453, 3452, 3454, 34551, 34561, 34571), diário 34, documento 341, período 13. |
| **Apuramento de resultados** | Categorias iguais prefixo a prefixo; imposto 871+872 → 885 doc 821; fecho 88x → 8111 doc 822; diário 81; período 14. |
| **Lançamentos** | Nº de operação `PP/DOC.NNN`; períodos 00–15; as validações de diário, documento, mínimo de duas linhas, conta integradora, equilíbrio e período fechado. |
| **Balanço e DR** | Linha a linha, incluindo o `equilibrado` por igualdade exacta. |
| **Comercial** | `calcTotais` = Σ(qtd × preço) com IVA sobre o subtotal do documento; os 11 tipos de documento com os mesmos atributos; lançamento contabilístico por tipo; comissões fixo/percentagem. |
| **Logística** | Custo médio ponderado; contas todas iguais (2611, 7111, 32121, 34521111, 90x, 6804, 78041). |
| **Imobilizados** | Coeficientes degressivos 1,5 / 2 / 2,5; quota anual e mensal. |

### Diferenças deliberadas, com justificação

Estas são as únicas divergências de comportamento, e todas endurecem o
sistema em vez de o mudar:

1. **Conta fora do plano.** O Piloto deixava passar um código de conta que não
   existe (`contabilidade.js:449` só valida se a conta for encontrada); a
   Produção recusa. Um lançamento com conta órfã não aparece em balancete
   nenhum e só se descobre no fecho.

2. **Reprocessar a folha do mês.** O Piloto substituía o registo mas **voltava a
   lançar** na contabilidade — o custo com pessoal ficava contado duas vezes
   (`rh.js:218-221`). A Produção recusa reprocessar sem reabrir.

3. **Período do RH.** O Piloto usava o mês como texto livre, único em toda a
   história, o que impedia processar o mesmo mês de outro ano. A Produção
   normaliza o período e associa-o ao exercício.

4. **Transferência entre armazéns.** O Piloto, com origem igual ao destino,
   fazia sair sem entrar e o valor desaparecia (`logistica.js:105-107`). A
   Produção recusa a operação antes de a fazer.

5. **Precisão do custo médio.** O Piloto arredondava a 2 casas a cada
   movimento; a Produção acumula e arredonda só no fim. A diferença aparece em
   artigos com muitos movimentos, e é a favor da Produção.

6. **Numeração de documentos.** O Piloto usava o **ano do sistema** e um
   contador que nunca reiniciava (`comercial.js:65`). A Produção usa o **ano do
   documento** e reinicia o contador todos os anos, com unicidade garantida por
   `(empresa, prefixo, ano)`. É o comportamento que uma série documental
   fiscal exige — uma factura datada de 2025 emitida em Janeiro de 2026 tem de
   ser `FT 2025/xxxx`, e não `FT 2026/0101`.
   **Esta é a única com efeito visível na numeração e merece confirmação.**

### Corrigido nos dois lados

- O catálogo de fiscalidade dizia «IRT — isenção até 100.000 Kz» quando a
  tabela isenta até 150.000. Erro de texto que existia no Piloto e tinha sido
  copiado; corrigido em `Piloto/assets/js/fiscalidade.js` e em
  `Producao/backend/src/core/data/fiscalidade.json`.

### Não transposto, sem efeito

`retencaoConta()` e `taxaClasseIVA()` (`contabilidade.js:1115-1163`) existem no
Piloto mas **nunca são chamadas** em lado nenhum. O `mapaRetencoes`, que usa as
mesmas contas 3413/3431/3432/3471, esse está transposto e fiel.

---

## 2. Funcionalidades em falta

Estas são as lacunas reais face ao Piloto. Nenhuma impede o sistema de
funcionar, mas todas são coisas que o Piloto faz e a Produção ainda não.

### 2.1 Mestres sem editar nem eliminar

O Piloto permite editar e apagar; a Produção só criar.

| Mestre | Falta no backend | Falta no frontend |
|---|---|---|
| Colaboradores | — (`PATCH` e `DELETE` já existem) | ligar os botões |
| Artigos | `PATCH`, `DELETE` | tudo |
| Armazéns | `PATCH`, `DELETE` | tudo |
| Clientes | `PATCH`, `DELETE` | tudo |
| Fornecedores | `PATCH`, `DELETE` | tudo |
| Vendedores | `PATCH`, `DELETE` | tudo |
| Centros de custo | `POST`, `PATCH`, `DELETE` | tudo |
| Plano de contas | — (`POST` já existe) | criar/editar conta, subconta, importar |
| Diários | `POST`, `PATCH`, `DELETE` | tudo |
| Documentos contabilísticos | `POST`, `PATCH`, `DELETE` | tudo |

### 2.2 Endpoints prontos sem interface

O trabalho de servidor está feito; falta o botão. São os ganhos mais baratos.

- `POST /api/contabilidade/lancamentos/{id}/integrar` — **um lançamento
  diferido fica preso sem isto.** É a lacuna mais importante da lista.
- `DELETE /api/contabilidade/lancamentos/{id}`
- `POST /api/contabilidade/contas` e `POST /api/contabilidade/plano/importar`
- `POST` e `DELETE /api/contabilidade/fechos` (fechar e reabrir período)
- `PUT /api/rh/config` (taxas de INSS), `PUT /api/logistica/config`,
  `PUT /api/comercial/config`

### 2.3 Configurações da empresa

`empresa.html` tem 9 separadores; `/configuracoes` tem 3. Sem equivalente em
lado nenhum: Facturação e Comunicação (incluindo exportar SAF-T), integração
AGT para consulta de NIF, Tesouraria (bancos e caixa), parametrizações de
CMVMC, séries de documentos, e políticas de permissões.

### 2.4 Impressão

O Piloto imprime 16 páginas; a Produção tinha três botões e **nenhuma regra de
impressão** — o que saía do browser era a fotografia do ecrã, com cabeçalho,
navegação e botões à volta.

**Resolvido:** `globals.css` passou a ter um bloco `@media print` que esconde a
moldura da aplicação, força preto sobre branco, repete o cabeçalho das tabelas
em todas as folhas e impede que uma linha se parta entre páginas. Falta apenas
acrescentar o botão nas restantes páginas.

### 2.5 Documento legal de venda

`fatura-doc.js` produz a factura em A4 e o talão POS de 80 mm, com QR, valor
por extenso e impressão. A Produção mostra um modal de detalhe genérico.

### 2.6 Pormenores de utilização

- Exportar CSV em balancete, mapa de custos, existências, amortizações e folha.
- Drill-down do balancete (duplo clique na linha → extracto da conta).
- Picker de contas com F4 (`conta-picker.js`).
- Criar uma conta em falta a meio de um lançamento.
- Filtro por cliente na consulta de facturas.

---

## 3. O que a Produção tem a mais

Não faz parte da fidelidade, mas conta para a decisão de avançar:

multiempresa com isolamento verificado no servidor, licenciamento com chave e
activação, estados de empresa (suspender/reactivar/cancelar), verificação em
dois passos com bloqueio por tentativas, registo de auditoria, perfis e
permissões por módulo e por acção verificados no servidor, assistente de IA com
pseudonimização e quotas por empresa, e a página pública de apresentação.

---

## 4. Veredicto

**As regras de negócio podem ir para produção.** Os números que a aplicação
calcula são os mesmos do Piloto, e as diferenças que existem são correcções.

**As funcionalidades ainda não são uma réplica completa.** A lista de 2.1 a 2.6
é o que falta para a Regra 9 estar cumprida. A mais urgente é a integração de
lançamentos diferidos (2.2): sem ela, um diferido criado na Produção não tem
como ser integrado.
