/* SGD — Módulo de Contabilidade (framework estilo Primavera V10).
 * Tabelas: Plano de Contas (PGC Angola), Diários, Documentos, Fluxos de Caixa.
 * Movimentos em partidas dobradas (Data → Diário → Documento → linhas), Extratos, Razão e Balancete.
 * Expõe AY.contab para outros módulos lançarem automaticamente. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("contabilidade.js: AY (app.js) não carregado."); return; }
  const { read, write, uid, round2, hoje, hojeData, escapeHtml } = AY;

  const K = {
    contas: AY.PREFIX + "ct_contas",
    diarios: AY.PREFIX + "ct_diarios",
    documentos: AY.PREFIX + "ct_documentos",
    fluxos: AY.PREFIX + "ct_fluxos",
    centros: AY.PREFIX + "ct_centros",
    lanc: AY.PREFIX + "ct_lancamentos",
    seq: AY.PREFIX + "ct_seq",
    docSeq: AY.PREFIX + "ct_docseq",   // sequência por documento e exercício (nº da operação)
    notasTxt: AY.PREFIX + "ct_notas_txt", // textos manuais das notas (override do automático)
    diarioFechos: AY.PREFIX + "ct_diario_fechos", // fechos mensais de diário (diário × exercício × período)
    seeded: AY.PREFIX + "ct_seeded_v3",
  };

  // ---------- Classes do PGC (Angola) ----------
  const CLASSES = {
    "1": { nome: "Meios Fixos e Investimentos", natureza: "D" },
    "2": { nome: "Existências", natureza: "D" },
    "3": { nome: "Terceiros", natureza: "M" },
    "4": { nome: "Disponibilidades", natureza: "D" },
    "5": { nome: "Capital e Reservas", natureza: "C" },
    "6": { nome: "Proveitos e Ganhos por Natureza", natureza: "C" },
    "7": { nome: "Custos e Perdas por Natureza", natureza: "D" },
    "8": { nome: "Resultados", natureza: "M" },
    "9": { nome: "Contabilidade Analítica", natureza: "M" },
  };
  function classeDe(codigo) { return String(codigo || "")[0] || ""; }
  function classeNome(codigo) { return (CLASSES[classeDe(codigo)] || {}).nome || ""; }
  // Natureza esperada da conta (para apresentação do saldo): C = credora, D = devedora, M = mista
  function naturezaConta(codigo) {
    const c = String(codigo || "");
    if (/^18/.test(c) || /^19/.test(c) || /^28/.test(c) || /^32/.test(c) || /^33/.test(c) || /^36/.test(c) || /^37/.test(c)) return "C";
    return (CLASSES[classeDe(c)] || {}).natureza || "D";
  }

  // ---------- Plano de Contas por omissão (PGC-AR Angola, com subcontas usadas nos documentos) ----------
  const PLANO_DEFAULT = [
    // Classe 1 — Meios Fixos e Investimentos
    ["11", "Imobilizações Corpóreas"], ["111", "Terrenos e recursos naturais"], ["112", "Edifícios e outras construções"],
    ["113", "Equipamento básico"], ["114", "Equipamento de transporte"], ["115", "Equipamento administrativo"], ["118", "Outras imobilizações corpóreas"],
    ["12", "Imobilizações Incorpóreas"], ["121", "Trespasses"], ["122", "Despesas de instalação"],
    ["13", "Investimentos Financeiros"], ["14", "Imobilizações em Curso"],
    ["18", "Amortizações Acumuladas"], ["181", "Amort. de imobilizações corpóreas"], ["182", "Amort. de imobilizações incorpóreas"],
    ["19", "Provisões para Investimentos"],
    // Classe 2 — Existências
    ["21", "Compras"], ["211", "Compras de mercadorias"], ["21121", "Compras de mercadorias — nacionais"],
    ["217", "Devoluções de compras"], ["21721", "Devoluções de compras"], ["218", "Descontos e abatimentos em compras"], ["21821", "Descontos comerciais em compras"],
    ["22", "Matérias-primas, subsidiárias e de consumo"], ["23", "Produtos e trabalhos em curso"], ["24", "Produtos acabados e intermédios"],
    ["26", "Mercadorias"], ["28", "Adiantamentos por conta de compras"],
    // Classe 3 — Terceiros
    ["31", "Clientes"], ["311", "Clientes c/ corrente"], ["31121", "Clientes nacionais c/c"], ["318", "Adiantamentos de clientes"], ["319", "Clientes de cobrança duvidosa"],
    ["32", "Fornecedores"], ["321", "Fornecedores c/ corrente"], ["32121", "Fornecedores nacionais c/c"], ["32122", "Fornecedores estrangeiros c/c"], ["328", "Adiantamentos a fornecedores"],
    ["33", "Empréstimos"],
    ["34", "Estado"], ["341", "IVA"], ["3411", "IVA — a pagar"], ["3412", "IVA — a recuperar"], ["342", "Retenções de impostos (IRT)"], ["343", "Imposto Industrial"],
    ["36", "Pessoal"], ["361", "Remunerações a pagar"], ["365", "Segurança Social (INSS)"],
    ["37", "Fornecedores de Imobilizado"], ["371", "Fornecedores de imobilizado c/c"],
    ["38", "Outros devedores e credores"], ["39", "Provisões para cobranças duvidosas"],
    // Classe 4 — Meios Monetários
    ["41", "Títulos negociáveis"], ["42", "Depósitos a prazo"],
    ["43", "Depósitos à ordem (Bancos)"], ["431", "Banco — Conta principal"], ["43101", "Banco — Conta cheques"],
    ["45", "Caixa"], ["451", "Caixa"], ["4511", "Caixa AKZ"], ["4512", "Caixa USD"],
    // Classe 5 — Capital e Reservas
    ["51", "Capital"], ["55", "Reservas"], ["56", "Resultados transitados"], ["59", "Resultado líquido do exercício"],
    // Classe 6 — Proveitos e Ganhos por Natureza
    ["61", "Vendas"], ["611", "Vendas de mercadorias"], ["612", "Prestações de serviços"], ["613", "Vendas — outros mercados"],
    ["66", "Outros proveitos operacionais"], ["68", "Proveitos e ganhos financeiros"], ["69", "Proveitos e ganhos extraordinários"],
    // Classe 7 — Custos e Perdas por Natureza
    ["71", "Custo das existências vendidas e consumidas"], ["72", "Fornecimentos e serviços de terceiros"],
    ["721", "Subcontratos"], ["722", "Electricidade, água e combustíveis"], ["723", "Rendas e alugueres"], ["725", "Comunicação"], ["726", "Deslocações e transportes"],
    ["73", "Custos com o pessoal"], ["731", "Remunerações dos órgãos sociais"], ["732", "Remunerações do pessoal"], ["735", "Encargos sobre remunerações (INSS)"],
    ["74", "Amortizações do exercício"], ["75", "Provisões do exercício"], ["76", "Custos e perdas financeiras"], ["77", "Impostos"], ["79", "Custos e perdas extraordinárias"],
    // Classe 8 — Resultados
    ["81", "Resultados operacionais"], ["82", "Resultados financeiros"], ["84", "Resultados extraordinários"], ["85", "Resultado antes de impostos"], ["88", "Resultado líquido do exercício"],
  ];

  // ---------- Diários (do modelo Primavera / Angola) ----------
  // [código, nome, categoria] — a categoria diz a que módulo o diário está afeto (usada para filtrar
  // os seletores de diário em Compras, Imobilizados, etc. — só mostram os diários relevantes).
  const CATEGORIAS_DIARIO = [
    ["compras", "Compras"], ["vendas", "Vendas"], ["caixa_bancos", "Tesouraria / Caixa e Bancos"],
    ["imobilizado", "Imobilizado"], ["rh", "Recursos Humanos"], ["outros", "Outros / Diversos"],
  ];
  const DIARIOS_DEFAULT = [
    ["10", "Abertura", "outros"], ["21", "Compras", "compras"], ["22", "Compras (Internacional)", "compras"], ["23", "Compras (Notas de Crédito)", "compras"],
    ["24", "Compras (Notas de Débito)", "compras"], ["34", "Apuramento do IVA", "outros"], ["36", "Salários", "rh"], ["37", "Imobilizado (Compras/Vendas)", "imobilizado"],
    ["43", "Bancos", "caixa_bancos"], ["45", "Caixa", "caixa_bancos"], ["51", "Vendas — Acertos", "vendas"], ["56", "Vendas a Dinheiro", "vendas"], ["60", "Vendas OM", "vendas"],
    ["61", "Vendas / Prestação de Serviços", "vendas"], ["63", "Regularizações", "outros"], ["69", "Reavaliações", "outros"], ["71", "Regularizações (Custos Diferidos)", "imobilizado"],
    ["81", "Apuramento de Resultados", "outros"], ["82", "Apuramento de Resultados (Imposto)", "outros"], ["90", "Operações Diversas", "outros"],
  ];

  // ---------- Documentos afetos a diários (do 01.xlsx) ----------
  // [documento, descrição, diário, contaDébito, contaCrédito, retençãoFonte]
  const DOCUMENTOS_DEFAULT = [
    ["101", "Abertura", "10", "", "", 0],
    ["455", "Caixa AKZ — Pagamentos", "45", "", "4511", 0],
    ["456", "Caixa AKZ — Recebimentos", "45", "4511", "", 0],
    ["457", "Caixa USD — Pagamentos", "45", "", "4512", 0],
    ["458", "Caixa USD — Recebimentos", "45", "4512", "", 0],
    ["431", "Bancos — Depósitos", "43", "43101", "", 0],
    ["432", "Bancos — Cheques", "43", "", "43101", 0],
    ["433", "Bancos — Pag. Automáticos", "43", "", "43101", 0],
    ["434", "Bancos — Pag. Pessoal", "43", "", "43101", 0],
    ["435", "Outros Docs. Bancários", "43", "", "", 0],
    ["211", "Compras VFA — Vossa Fatura a Crédito", "21", "21121", "32121", 0],
    ["212", "Compras VFC — Vossa Fatura de Custos FST", "21", "", "32121", 0],
    ["213", "Compras VFO — Vossa Fatura de Outros Materiais", "21", "21121", "", 0],
    ["214", "Compras VFS — Vossa Fatura de Serviço", "21", "72", "32121", 0],
    ["215", "Compras VFI — Vossa Fatura Internacional", "22", "21121", "32122", 0],
    ["216", "Compras — Nota de Crédito", "23", "", "32121", 0],
    ["217", "Compras — Devolução", "23", "", "21721", 0],
    ["218", "Compras — Desconto Comercial", "23", "", "21821", 0],
    ["219", "Compras — Nota de Débito", "24", "32121", "", 0],
    ["220", "Receção / Entrada de Stock (Logística)", "21", "2611", "32121", 0],
    ["371", "Compra de Imobilizados VFE", "37", "114", "371", 1],
    ["611", "Vendas MN — n/Fatura", "61", "311", "611", 0],
    ["612", "Prest. Serviços MN — n/Fatura", "61", "311", "612", 1],
    ["613", "Vendas MN — n/Nota de Crédito", "61", "611", "311", 0],
    ["614", "Vendas MN — n/Nota de Débito", "61", "311", "611", 0],
    ["631", "Vendas OM — n/Fatura", "60", "311", "613", 0],
    ["372", "Imobilizado MN — n/Fatura", "37", "311", "114", 0],
    ["561", "Venda a Dinheiro MN — n/V.D.", "56", "4511", "611", 0],
    ["511", "Vendas — Acertos", "51", "", "", 0],
    ["361", "Salários — Vencimentos", "36", "732", "361", 0],
    ["362", "Salários — Subsídio de Férias", "36", "732", "361", 0],
    ["363", "Salários — Subsídio de Natal", "36", "732", "361", 0],
    ["364", "Salários — Vencimentos Extraordinários", "36", "732", "361", 0],
    ["621", "Apuramento do IVA", "34", "3411", "3412", 0],
    ["632", "Regularizações Mensais", "63", "", "", 0],
    ["691", "Reavaliações", "69", "", "", 0],
    ["711", "Reg. — Custos Diferidos c/ Pessoal", "71", "", "", 0],
    ["712", "Reg. — Outros Custos Diferidos", "71", "", "", 0],
    ["713", "Reg. — Amortizações", "71", "74", "18", 0],
    ["714", "Reg. — CVMC", "71", "71", "26", 0],
    ["715", "Outras Regularizações", "71", "", "", 0],
    ["811", "Ap. Resultados — Operacionais", "81", "", "", 0],
    ["812", "Ap. Resultados — Financeiros", "81", "", "", 0],
    ["813", "Ap. Resultados — Correntes", "81", "", "", 0],
    ["814", "Ap. Resultados — Extraordinários", "81", "", "", 0],
    ["815", "Ap. Resultados — Antes de Impostos", "81", "", "", 0],
    ["816", "Ap. Resultados — Filiais e Associadas", "81", "", "", 0],
    ["817", "Ap. Resultados — Não Operacionais", "81", "", "", 0],
    ["821", "Apuramento de Imposto", "82", "", "", 0],
    ["822", "Ap. Resultados — Líquidos", "82", "", "", 0],
    ["921", "Operações Diversas", "90", "", "", 0],
    ["901", "Saída de Stock — CMVMC (Logística)", "90", "7111", "2611", 0],
    ["902", "Ajuste de Inventário (Logística)", "90", "2611", "7111", 0],
    ["903", "Acerto de Stock — Positivo (Logística)", "90", "2611", "6804", 0],
    ["904", "Acerto de Stock — Negativo (Logística)", "90", "78041", "2611", 0],
  ];

  // ---------- Fluxos de Caixa (Demonstração de Fluxos — do Fluxos de caixa.xlsx) ----------
  // [código, descrição, tipo] — tipo: R=raiz/atividade, I=intermédio, M=movimento (imputável)
  const FLUXOS_DEFAULT = [
    ["1", "ACTIVIDADES OPERACIONAIS", "R"],
    ["11", "Operacionais", "I"], ["1100", "Recebimento de Clientes", "M"], ["1101", "Pagamentos a Fornecedores", "M"], ["1102", "Pagamentos a Pessoal", "M"],
    ["12", "Outras operações", "I"], ["1200", "Juros", "M"], ["1202", "Impostos", "M"],
    ["13", "Rúbricas extraordinárias", "I"], ["1300", "Recebimentos Rúbricas Extraord.", "M"], ["1302", "Pagamentos Rúbricas Extraord.", "M"],
    ["2", "ACTIVIDADES DE INVESTIMENTO", "R"],
    ["21", "Recebimentos", "I"], ["2100", "Imobilizações corpóreas", "M"], ["2101", "Imobilizações incorpóreas", "M"], ["2102", "Investimentos Financeiros", "M"], ["2103", "Subsídios de Investimento", "M"], ["2104", "Juros e Proveitos Similares", "M"], ["2105", "Dividendos ou lucros recebidos", "M"],
    ["22", "Pagamentos", "I"], ["2200", "Imobilizações corpóreas", "M"], ["2201", "Imobilizações incorpóreas", "M"], ["2202", "Investimentos financeiros", "M"],
    ["3", "ACTIVIDADES DE FINANCIAMENTO", "R"],
    ["31", "Recebimentos", "I"], ["3100", "Aumentos de Capital / Prest. Sup.", "M"], ["3102", "Cobertura de Prejuízos", "M"], ["3103", "Empréstimos obtidos", "M"], ["3104", "Subsídios à exploração e doações", "M"],
    ["32", "Pagamentos", "I"], ["3200", "Reduções de Capital / Prest. Sup.", "M"], ["3201", "Compras de acções ou quotas próprias", "M"], ["3202", "Dividendos ou lucros pagos", "M"], ["3204", "Amort. de contratos de locação financeira", "M"], ["3205", "Juros e custos similares pagos", "M"],
  ];

  // ---------- Centros de Custo (Contabilidade Analítica) ----------
  // [código, nome, tipo] — tipo: custo | proveito | misto
  const CENTROS_DEFAULT = [
    ["ADM", "Administração e Gestão", "custo"],
    ["COM", "Comercial e Marketing", "custo"],
    ["PROD", "Produção / Operações", "custo"],
    ["LOG", "Logística e Armazém", "custo"],
    ["RH", "Recursos Humanos", "custo"],
    ["FIN", "Financeiro e Tesouraria", "custo"],
  ];

  // ---------- Seeds ----------
  function seedTudo() {
    if (read(K.seeded, false)) return;
    if (AY.seed) AY.seed();
    // Plano de contas: usa o do Primavera do utilizador (plano-primavera.js) se disponível; senão o base.
    const fonte = (global.AY_PLANO_PRIMAVERA && global.AY_PLANO_PRIMAVERA.length)
      ? global.AY_PLANO_PRIMAVERA.map(([codigo, nome, tipo, classeIVA]) => [codigo, nome, tipo, classeIVA])
      : PLANO_DEFAULT.map(([codigo, nome]) => [codigo, nome, null, null]);
    write(K.contas, fonte.map(([codigo, nome, tipo, classeIVA]) => ({ id: uid("ct"), codigo, nome, tipo: tipo || null, classeIVA: classeIVA || "", natureza: naturezaConta(codigo), ativa: true, criadoEm: hoje() })));
    write(K.diarios, DIARIOS_DEFAULT.map(([codigo, nome, categoria]) => ({ id: uid("di"), codigo, nome, categoria: categoria || "outros", ativo: true })));
    write(K.documentos, DOCUMENTOS_DEFAULT.map(([codigo, descricao, diario, cd, cc, ret]) => ({ id: uid("doc"), codigo, descricao, diario, contaDebito: cd || "", contaCredito: cc || "", retencao: !!ret, ativo: true })));
    write(K.fluxos, FLUXOS_DEFAULT.map(([codigo, descricao, tipo]) => ({ id: uid("fx"), codigo, descricao, tipo })));
    write(K.centros, CENTROS_DEFAULT.map(([codigo, nome, tipo]) => ({ id: uid("cc"), codigo, nome, tipo, responsavel: "", estado: "activo" })));
    write(K.docSeq, {}); write(K.seq, 0);
    write(K.seeded, true);
    seedDemoLancamentos();
  }
  function seedDemoLancamentos() {
    if (read(K.lanc, []).length) return;
    const ano = new Date().getFullYear();
    const post = (data, diario, documento, descricao, doc, linhas, mes) => { try { postar({ data: ano + "-" + data, diario, documento, descricao, documentoRef: doc, origem: "demo", mes, linhas }); } catch (e) { console.warn(e); } };
    // Contas reais do plano do Primavera (usa fallback se o plano base estiver ativo)
    const A = (global.AY_PLANO_PRIMAVERA && global.AY_PLANO_PRIMAVERA.length)
      ? { banco: "43101", caixa: "4511", cliente: "31121", fornecedor: "32121", vendas: "6111", servicos: "6211", pessoal: "7211", remun: "36121", irt: "3413", inss: "3492", capital: "511", viatura: "1141" }
      : { banco: "43101", caixa: "4511", cliente: "311", fornecedor: "321", vendas: "611", servicos: "612", pessoal: "732", remun: "361", irt: "342", inss: "365", capital: "51", viatura: "114" };
    post("01-02", "10", "101", "Abertura — realização de capital", "AB-001", [
      { codigo: A.banco, debito: 20000000, credito: 0, descricao: "Depósito inicial" },
      { codigo: A.capital, debito: 0, credito: 20000000, descricao: "Capital subscrito" },
    ], "00");
    post("01-10", "37", "371", "Compra de viatura", "VFE 120", [
      { codigo: A.viatura, debito: 8500000, credito: 0, descricao: "Viatura" },
      { codigo: A.fornecedor, debito: 0, credito: 8500000, descricao: "Fornecedor" },
    ]);
    post("01-20", "61", "612", "Prestação de serviços a cliente", "FT 2026/1", [
      { codigo: A.cliente, debito: 4000000, credito: 0, descricao: "Cliente c/c" },
      { codigo: A.servicos, debito: 0, credito: 4000000, descricao: "Serviços" },
    ]);
    post("01-25", "43", "431", "Recebimento de cliente", "DEP-001", [
      { codigo: A.banco, debito: 4000000, credito: 0, descricao: "Depósito", fluxo: "1100" },
      { codigo: A.cliente, debito: 0, credito: 4000000, descricao: "Liquidação FT 2026/1" },
    ]);
    post("01-31", "36", "361", "Processamento de salários de Janeiro", "SAL-01", [
      { codigo: A.pessoal, debito: 3200000, credito: 0, descricao: "Ordenados" },
      { codigo: A.remun, debito: 0, credito: 2720000, descricao: "Líquido a pagar" },
      { codigo: A.irt, debito: 0, credito: 320000, descricao: "IRT retido" },
      { codigo: A.inss, debito: 0, credito: 160000, descricao: "INSS" },
    ]);
  }

  // ---------- Contas ----------
  function contas() { seedTudo(); return read(K.contas, []); }
  function conta(id) { return contas().find(c => c.id === id) || null; }
  function contaPorCodigo(codigo) { return contas().find(c => c.codigo === String(codigo)) || null; }
  // Movimento (folha) = tipo "M" quando o plano o indica (Primavera); senão infere por prefixo.
  function ehMovimento(c, todas) { if (c.tipo) return c.tipo === "M"; todas = todas || contas(); return !todas.some(o => o.id !== c.id && o.codigo.length > c.codigo.length && o.codigo.startsWith(c.codigo)); }
  function contasMovimento() { const all = contas(); return all.filter(c => c.ativa !== false && ehMovimento(c, all)); }
  function saveConta(c) {
    const l = contas();
    if (!c.id) c.id = uid("ct");
    c.codigo = String(c.codigo || "").trim();
    c.natureza = c.natureza || naturezaConta(c.codigo);
    const i = l.findIndex(x => x.id === c.id);
    if (i >= 0) l[i] = Object.assign(l[i], c); else { c.criadoEm = hoje(); l.push(c); }
    l.sort((a, b) => a.codigo.localeCompare(b.codigo)); // string: subcontas nascem sob a mãe (3431 sob 343)
    write(K.contas, l);
    return c;
  }
  function removeConta(id) {
    const c = conta(id); if (!c) return;
    const temMov = lancamentos().some(l => (l.linhas || []).some(x => x.codigo === c.codigo));
    if (temMov) { c.ativa = false; saveConta(c); return { desativada: true }; }
    write(K.contas, contas().filter(x => x.id !== id));
    return { eliminada: true };
  }
  function contaLabel(codigo) { const c = contaPorCodigo(codigo); return c ? (c.codigo + " · " + c.nome) : (codigo || "—"); }

  // Próximo código de subconta sequencial (…001, …002, …) para uma conta-mãe.
  function proximaSubconta(parentCodigo) {
    const diretos = contas().filter(c => c.codigo.length === parentCodigo.length + 3 && c.codigo.startsWith(parentCodigo));
    let max = 0;
    diretos.forEach(c => { const suf = parseInt(c.codigo.slice(parentCodigo.length), 10); if (!isNaN(suf) && suf > max) max = suf; });
    return parentCodigo + String(max + 1).padStart(3, "0");
  }
  // Move todos os movimentos (linhas de lançamento) de uma conta para outra.
  function moverMovimentos(de, para) {
    const list = read(K.lanc, []); const nomePara = (contaPorCodigo(para) || {}).nome; let n = 0; // lista bruta: inclui diferidos
    list.forEach(l => (l.linhas || []).forEach(x => { if (x.codigo === de) { x.codigo = para; if (nomePara) x.nome = nomePara; n++; } }));
    if (n) write(K.lanc, list);
    return n;
  }
  // Cria uma subconta de uma conta de movimento (estilo Primavera):
  // a 1.ª subconta torna a mãe INTEGRADORA e recebe todos os movimentos dela; as seguintes são só novas contas de movimento.
  function criarSubconta(parentCodigo, dados) {
    dados = dados || {};
    const parent = contaPorCodigo(parentCodigo);
    if (!parent) throw new Error("Conta-mãe " + parentCodigo + " não existe.");
    const codigo = String(dados.codigo || "").trim();
    if (!codigo.startsWith(parentCodigo) || codigo.length <= parentCodigo.length) throw new Error("A subconta tem de estender o código " + parentCodigo + " (ex.: " + proximaSubconta(parentCodigo) + ").");
    if (contaPorCodigo(codigo)) throw new Error("Já existe a conta " + codigo + ".");
    const semFilhos = !contas().some(c => c.codigo !== parentCodigo && c.codigo.startsWith(parentCodigo));
    saveConta({ codigo, nome: dados.nome || (semFilhos ? parent.nome : parent.nome + " " + codigo.slice(parentCodigo.length)), tipo: "M", natureza: parent.natureza });
    if (semFilhos) {
      const movidos = moverMovimentos(parentCodigo, codigo); // movimentos da mãe passam para a 1.ª subconta
      parent.tipo = "I"; saveConta(parent);                    // mãe passa a integradora
      return { criada: codigo, tornouIntegradora: true, movidos };
    }
    return { criada: codigo, tornouIntegradora: false, movidos: 0 };
  }

  // REGRA GERAL de criação de conta: se o código estende uma conta de MOVIMENTO existente,
  // essa mãe passa a integradora e os seus movimentos migram para a nova conta (via criarSubconta);
  // caso contrário cria-se uma conta de movimento normal. Assim uma integradora nunca fica com movimentos.
  function criarConta(codigo, nome, natureza) {
    codigo = String(codigo || "").trim();
    if (!codigo) throw new Error("Código obrigatório.");
    if (contaPorCodigo(codigo)) throw new Error("Já existe a conta " + codigo + ".");
    const todas = contas();
    const parentMov = todas.filter(c => codigo.startsWith(c.codigo) && c.codigo.length < codigo.length && ehMovimento(c, todas)).sort((a, b) => b.codigo.length - a.codigo.length)[0];
    if (parentMov) return criarSubconta(parentMov.codigo, { codigo, nome });
    saveConta({ codigo, nome, natureza: natureza || naturezaConta(codigo), tipo: "M" });
    return { criada: codigo, tornouIntegradora: false, movidos: 0 };
  }

  // Conta corrente de uma entidade: devolve/cria a subconta de movimento sob `base` com o nome dado
  // (reutiliza se já existir com esse nome; senão cria a próxima sequência — a 1.ª torna a base integradora).
  function contaCorrente(base, nome) {
    const baseConta = contaPorCodigo(base); if (!baseConta) return base;
    const norm = s => String(s || "").trim().toLowerCase();
    const existe = contas().find(c => c.codigo !== base && c.codigo.startsWith(base) && ehMovimento(c) && norm(c.nome) === norm(nome));
    if (existe) return existe.codigo;
    const cod = proximaSubconta(base);
    try { criarSubconta(base, { codigo: cod, nome: nome || ("Conta " + cod) }); }
    catch (e) { try { criarConta(cod, nome, naturezaConta(base)); } catch (_) { return base; } }
    return cod;
  }

  // Importa um plano de contas (ex.: exportação do Primavera). linhas: [{codigo, nome, natureza?, tipo?}].
  // opts.substituir = true substitui todo o plano; caso contrário funde (atualiza existentes por código, adiciona novos).
  function importarPlano(linhas, opts) {
    opts = opts || {};
    seedTudo();
    const limpas = (linhas || []).map(l => ({
      codigo: String(l.codigo == null ? "" : l.codigo).trim(),
      nome: String(l.nome == null ? "" : l.nome).trim(),
      natureza: l.natureza || null,
      tipo: l.tipo || null,
    })).filter(l => l.codigo && /\d/.test(l.codigo));
    let base = opts.substituir ? [] : contas().slice();
    const idx = {}; base.forEach((c, i) => idx[c.codigo] = i);
    let novas = 0, atualizadas = 0;
    limpas.forEach(l => {
      const conta = { codigo: l.codigo, nome: l.nome || (contaPorCodigo(l.codigo) || {}).nome || l.codigo, natureza: l.natureza || naturezaConta(l.codigo), ativa: true };
      if (l.tipo) conta.tipoImport = l.tipo;
      if (idx[l.codigo] != null) { base[idx[l.codigo]] = Object.assign(base[idx[l.codigo]], conta); atualizadas++; }
      else { conta.id = uid("ct"); conta.criadoEm = hoje(); idx[l.codigo] = base.length; base.push(conta); novas++; }
    });
    base.sort((a, b) => a.codigo.localeCompare(b.codigo)); // string: hierarquia correta (3431 sob 343)
    write(K.contas, base);
    return { total: limpas.length, novas, atualizadas, substituido: !!opts.substituir };
  }

  // ---------- Diários ----------
  // Migração pontual: atribui categoria aos diários já gravados antes de esta classificação existir
  // (pelos códigos por omissão; os diários criados manualmente ficam em "outros").
  function migrarCategoriaDiarios() {
    const marcador = AY.PREFIX + "ct_migrado_categoria_diario_v1";
    if (localStorage.getItem(marcador)) return;
    const l = read(K.diarios, []);
    if (l.length) {
      const porCodigo = {}; DIARIOS_DEFAULT.forEach(([codigo, , categoria]) => porCodigo[codigo] = categoria || "outros");
      l.forEach(d => { if (!d.categoria) d.categoria = porCodigo[d.codigo] || "outros"; });
      write(K.diarios, l);
    }
    localStorage.setItem(marcador, "1");
  }
  function diarios() { seedTudo(); migrarCategoriaDiarios(); return read(K.diarios, []); }
  function diario(codigo) { return diarios().find(d => d.codigo === String(codigo)) || null; }
  function diarioNome(codigo) { const d = diario(codigo); return d ? d.nome : (codigo || "—"); }
  function saveDiario(d) { const l = read(K.diarios, []); if (!d.id) d.id = uid("di"); const i = l.findIndex(x => x.id === d.id); if (i >= 0) l[i] = Object.assign(l[i], d); else l.push(d); l.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), undefined, { numeric: true })); write(K.diarios, l); return d; }
  function removeDiario(id) { write(K.diarios, read(K.diarios, []).filter(d => d.id !== id)); }

  // Fecho mensal de diário: bloqueia novos lançamentos num diário, num exercício e período (mês)
  // concretos — o utilizador decide fechar/reabrir a qualquer momento, diário a diário.
  function fechoKey(diarioCod, exId, mes) { return String(diarioCod || "") + "|" + (exId || "-") + "|" + String(mes || "00").padStart(2, "0"); }
  function diarioFechado(diarioCod, exId, mes) { return !!read(K.diarioFechos, {})[fechoKey(diarioCod, exId, mes)]; }
  function fecharDiarioMes(diarioCod, exId, mes) {
    const map = read(K.diarioFechos, {}); const u = AY.currentUser();
    map[fechoKey(diarioCod, exId, mes)] = { fechado: true, em: hoje(), por: u ? u.nome : "sistema" };
    write(K.diarioFechos, map);
  }
  function reabrirDiarioMes(diarioCod, exId, mes) { const map = read(K.diarioFechos, {}); delete map[fechoKey(diarioCod, exId, mes)]; write(K.diarioFechos, map); }
  // Todos os fechos de um diário num exercício, por período (para desenhar a grelha 00-15).
  function fechosDoDiario(diarioCod, exId) {
    const map = read(K.diarioFechos, {}); const out = {};
    PERIODOS.forEach(([cod]) => { const v = map[fechoKey(diarioCod, exId, cod)]; if (v) out[cod] = v; });
    return out;
  }

  // ---------- Documentos ----------
  function documentos() { seedTudo(); return read(K.documentos, []); }
  function documento(id) { return documentos().find(d => d.id === id) || null; }
  function documentosDoDiario(codigoDiario) { return documentos().filter(d => d.diario === String(codigoDiario) && d.ativo !== false); }
  function saveDocumento(d) { const l = read(K.documentos, []); if (!d.id) d.id = uid("doc"); const i = l.findIndex(x => x.id === d.id); if (i >= 0) l[i] = Object.assign(l[i], d); else l.push(d); write(K.documentos, l); return d; }
  function removeDocumento(id) { write(K.documentos, read(K.documentos, []).filter(d => d.id !== id)); }

  // ---------- Fluxos de Caixa ----------
  function fluxos() { seedTudo(); return read(K.fluxos, []); }
  function fluxo(codigo) { return fluxos().find(f => f.codigo === String(codigo)) || null; }
  function fluxosMovimento() { return fluxos().filter(f => f.tipo === "M"); }

  // ---------- Centros de Custo (Contabilidade Analítica) ----------
  function centros() { seedTudo(); return read(K.centros, []); }
  function centro(id) { return centros().find(c => c.id === id) || null; }
  function centroPorCodigo(codigo) { return centros().find(c => c.codigo === String(codigo)) || null; }
  function centrosAtivos() { return centros().filter(c => c.estado !== "inactivo"); }
  function saveCentro(c) {
    const l = read(K.centros, []);
    c.codigo = String(c.codigo || "").trim().toUpperCase();
    if (!c.id) { c.id = uid("cc"); c.criadoEm = hoje(); }
    const dup = l.find(x => x.codigo === c.codigo && x.id !== c.id);
    if (dup) throw new Error("Já existe um centro com o código " + c.codigo + ".");
    const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = Object.assign(l[i], c); else l.push(c);
    l.sort((a, b) => a.codigo.localeCompare(b.codigo));
    write(K.centros, l); return c;
  }
  function removeCentro(id) { write(K.centros, read(K.centros, []).filter(c => c.id !== id)); }

  // ---------- Lançamentos (partidas dobradas) ----------
  // Lançamentos "diferidos" ficam pendentes de integração: não entram no balancete/razão/extrato/
  // fluxos/apuramentos nem nas contas correntes até serem integrados (ver integrarLancamento).
  // Por omissão só devolve os já integrados; passa {incluirDiferidos:true} para listagens/gestão.
  function lancamentos(opts) {
    const l = read(K.lanc, []);
    return (opts && opts.incluirDiferidos) ? l : l.filter(x => !x.diferido);
  }
  function lancamentosDoExercicio(exId) { exId = exId || (AY.exercicioAtivo() || {}).id; return lancamentos().filter(l => !exId || l.exercicioId === exId); }
  // Procura por id na lista bruta (inclui diferidos) — para permitir abrir/editar/integrar um pendente.
  function lancamento(id) { return read(K.lanc, []).find(l => l.id === id) || null; }
  function nextNum() { const seq = read(K.seq, 0) + 1; write(K.seq, seq); return seq; }
  // Sequência do documento por exercício (para o nº da operação MM/DOC.NNN)
  function proximoNumeroDoc(docCod, exId) {
    const map = read(K.docSeq, {}); const key = (exId || "-") + "|" + docCod;
    const n = (map[key] || 0) + 1; map[key] = n; write(K.docSeq, map); return n;
  }
  function mesDe(data) { return (String(data || "").slice(5, 7)) || "00"; }
  // Períodos contabilísticos 00–15 (00=abertura, 01-12=meses, 13=regularizações, 14/15=apuramentos)
  const PERIODOS = [
    ["00", "Abertura"], ["01", "Janeiro"], ["02", "Fevereiro"], ["03", "Março"], ["04", "Abril"], ["05", "Maio"],
    ["06", "Junho"], ["07", "Julho"], ["08", "Agosto"], ["09", "Setembro"], ["10", "Outubro"], ["11", "Novembro"], ["12", "Dezembro"],
    ["13", "Regularizações"], ["14", "Apuramento de Resultados"], ["15", "Apuramento de Imposto e Resultado Líquido"],
  ];
  function periodoLabel(mm) { const p = PERIODOS.find(x => x[0] === String(mm)); return p ? p[1] : (mm || ""); }
  // Nº da operação: PP/DOC.NNN (período 00-15 / código do documento / sequência)
  function numeroOperacao(mm, docCod, nnn) { return String(mm || "00") + "/" + docCod + "." + String(nnn).padStart(3, "0"); }
  function somaLinhas(linhas) { return (linhas || []).reduce((a, x) => { a.debito = round2(a.debito + (Number(x.debito) || 0)); a.credito = round2(a.credito + (Number(x.credito) || 0)); return a; }, { debito: 0, credito: 0 }); }
  function estaEquilibrado(linhas) { const s = somaLinhas(linhas); return s.debito === s.credito && s.debito > 0; }

  function saveLancamento(l) {
    l.linhas = (l.linhas || []).map(x => {
      const c = x.contaId ? conta(x.contaId) : contaPorCodigo(x.codigo);
      return { codigo: c ? c.codigo : (x.codigo || ""), nome: c ? c.nome : (x.nome || ""), descricao: x.descricao || "", debito: round2(x.debito), credito: round2(x.credito), entidade: x.entidade || "", ivaPerc: Number(x.ivaPerc) || 0, percNaoDed: Number(x.percNaoDed) || 0, ivaAutoliq: round2(x.ivaAutoliq), tipoEntidade: x.tipoEntidade || "", moeda: x.moeda || "AKZ", cambio: Number(x.cambio) || 1, centro: x.centro || "", fluxo: x.fluxo || "" };
    }).filter(x => (x.debito || x.credito) && x.codigo);
    if (!l.diario) throw new Error("Indica o diário do movimento.");
    if (!l.documento) throw new Error("Indica o documento do movimento.");
    if (l.linhas.length < 2) throw new Error("Um lançamento precisa de pelo menos duas linhas (débito e crédito).");
    // Regra: uma conta integradora nunca recebe lançamentos (só contas de movimento)
    for (const x of l.linhas) { const c = contaPorCodigo(x.codigo); if (c && !ehMovimento(c)) throw new Error("A conta " + x.codigo + " é integradora — só contas de movimento recebem lançamentos."); }
    if (!estaEquilibrado(l.linhas)) { const s = somaLinhas(l.linhas); throw new Error("Lançamento não equilibrado: débito " + AY.formatMoeda2(s.debito) + " ≠ crédito " + AY.formatMoeda2(s.credito) + "."); }
    const u = AY.currentUser();
    const list = read(K.lanc, []); // lista bruta: preserva os diferidos que não vêm no filtro por omissão
    l.data = l.data || hojeData();
    l.mes = l.mes || mesDe(l.data); // período contabilístico 00-15
    l.diferido = !!l.diferido;
    // Exercício efetivo deste lançamento (novo: o indicado ou o ativo por omissão; edição: o já gravado)
    // — usado para verificar se o exercício ou o diário/período estão fechados.
    const exIdEfetivo = l.id ? ((list.find(x => x.id === l.id) || {}).exercicioId) : (l.exercicioId || (AY.exercicioAtivo() || {}).id || null);
    const exEfetivo = exIdEfetivo ? AY.exercicios().find(e => e.id === exIdEfetivo) : null;
    if (exEfetivo && exEfetivo.estado === "fechado") throw new Error("O exercício " + exEfetivo.nome + " está fechado — reabre-o em Configurações antes de lançar.");
    if (diarioFechado(l.diario, exIdEfetivo, l.mes)) throw new Error("O diário " + l.diario + " está fechado para o período " + l.mes + " (" + periodoLabel(l.mes) + ") — reabre-o em Diários antes de lançar.");
    if (!l.id) {
      l.id = uid("lanc"); l.numero = nextNum(); l.criadoEm = hoje(); l.criadoPor = u ? u.nome : "sistema";
      l.exercicioId = l.exercicioId || (AY.exercicioAtivo() || {}).id || null;
      // Nº da operação automático: PP/DOC.NNN (período/documento/sequência)
      const docCod = docCodigo(l.documento);
      l.docNum = proximoNumeroDoc(docCod, l.exercicioId);
      l.numeroOp = numeroOperacao(l.mes, docCod, l.docNum);
      list.push(l);
    } else {
      const i = list.findIndex(x => x.id === l.id); l.atualizadoEm = hoje();
      if (i >= 0) list[i] = Object.assign(list[i], l); else list.push(l);
    }
    write(K.lanc, list);
    return l;
  }
  function removeLancamento(id) { write(K.lanc, read(K.lanc, []).filter(l => l.id !== id)); }
  // Integra um lançamento diferido: passa a contar no balancete/razão/extrato/apuramentos.
  function integrarLancamento(id) {
    const list = read(K.lanc, []);
    const l = list.find(x => x.id === id);
    if (!l) throw new Error("Movimento não encontrado.");
    if (!l.diferido) return l; // já integrado
    l.diferido = false; l.integradoEm = hoje(); l.integradoPor = (AY.currentUser() || {}).nome || "sistema";
    write(K.lanc, list);
    return l;
  }

  // Hook de integração para outros módulos
  function postar(dados) {
    return saveLancamento({
      data: dados.data || hojeData(), diario: dados.diario || "90", documento: dados.documento || "", mes: dados.mes,
      descricao: dados.descricao || "", documentoRef: dados.documentoRef || dados.documento || "",
      origem: dados.origem || "modulo", exercicioId: dados.exercicioId, linhas: dados.linhas || [],
    });
  }

  // ---------- Razão / Extrato ----------
  // Resolve o código do documento a partir do id guardado (ou devolve tal como está se já for código).
  function docCodigo(ref) { if (!ref) return ""; const d = documentos().find(x => x.id === ref); return d ? d.codigo : String(ref); }
  // N.º de lançamento no diário (estilo Primavera): mês×10000 + sequência no mês (por exercício).
  let __ndCache = null, __ndKey = null;
  function numeroDiario(l) {
    const key = read(K.lanc, []).length + "|" + (l.exercicioId || "");
    if (__ndKey !== key) {
      __ndKey = key; __ndCache = {};
      const porEx = {};
      lancamentos().forEach(x => { (porEx[x.exercicioId || "-"] = porEx[x.exercicioId || "-"] || []).push(x); });
      Object.values(porEx).forEach(arr => {
        arr.sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.numero - b.numero));
        const seqMes = {};
        arr.forEach(x => { const mes = Number((x.data || "").slice(5, 7)) || 0; seqMes[mes] = (seqMes[mes] || 0) + 1; __ndCache[x.id] = mes * 10000 + seqMes[mes]; });
      });
    }
    return __ndCache[l.id] || l.numero;
  }
  function razao(codigo, opts) {
    opts = opts || {};
    const cod = String(codigo);
    const de = opts.de, ate = opts.ate, exId = opts.exercicioId;
    const linhas = [];
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (de && l.data < de) return;
      if (ate && l.data > ate) return;
      (l.linhas || []).forEach(x => {
        const bate = opts.incluirSub ? String(x.codigo).startsWith(cod) : x.codigo === cod;
        if (!bate) return;
        if (opts.entidade && (x.entidade || "").toLowerCase().indexOf(opts.entidade.toLowerCase()) < 0) return;
        linhas.push({ lancId: l.id, numero: l.numero, numeroOp: l.numeroOp || "", docNum: l.docNum, nDiario: numeroDiario(l), data: l.data, diario: l.diario, documento: docCodigo(l.documento), documentoRef: l.documentoRef || "", descricao: x.descricao || l.descricao, entidade: x.entidade || "", contraparte: contraparteDe(l, x), ivaPerc: Number(x.ivaPerc) || 0, debito: Number(x.debito) || 0, credito: Number(x.credito) || 0 });
      });
    });
    linhas.sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.numero - b.numero));
    let saldo = 0; const natD = naturezaConta(cod) !== "C";
    linhas.forEach(x => { saldo = round2(saldo + (natD ? (x.debito - x.credito) : (x.credito - x.debito))); x.saldo = saldo; });
    const tot = somaLinhas(linhas);
    return { codigo: cod, linhas, totalDebito: tot.debito, totalCredito: tot.credito, saldoFinal: saldo, natureza: natD ? "D" : "C" };
  }
  function contraparteDe(l, linhaAtual) {
    const outras = (l.linhas || []).filter(x => x !== linhaAtual && ((linhaAtual.debito > 0) ? x.credito > 0 : x.debito > 0));
    if (!outras.length) return "";
    if (outras.length === 1) return outras[0].codigo;
    return "Diversas";
  }

  // ---------- Balancete ----------
  function balancete(opts) {
    opts = opts || {};
    const de = opts.de, ate = opts.ate, exId = opts.exercicioId;
    const map = {};
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (opts.excluirApuramento && l.origem === "apuramento") return;
      if (opts.mes && String(l.mes || "00") > opts.mes) return;
      if (de && l.data < de) return;
      if (ate && l.data > ate) return;
      (l.linhas || []).forEach(x => {
        const g = map[x.codigo] = map[x.codigo] || { codigo: x.codigo, nome: x.nome || (contaPorCodigo(x.codigo) || {}).nome || "", debito: 0, credito: 0 };
        g.debito = round2(g.debito + (Number(x.debito) || 0));
        g.credito = round2(g.credito + (Number(x.credito) || 0));
      });
    });
    const linhas = Object.values(map).map(g => {
      const liq = round2(g.debito - g.credito);
      g.saldoDevedor = liq > 0 ? liq : 0; g.saldoCredor = liq < 0 ? -liq : 0; g.classe = classeDe(g.codigo);
      return g;
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totais = linhas.reduce((a, g) => ({ debito: round2(a.debito + g.debito), credito: round2(a.credito + g.credito), saldoDevedor: round2(a.saldoDevedor + g.saldoDevedor), saldoCredor: round2(a.saldoCredor + g.saldoCredor) }), { debito: 0, credito: 0, saldoDevedor: 0, saldoCredor: 0 });
    return { linhas, totais };
  }

  // ---------- Contabilidade Analítica (Mapa de Custos por Centro) ----------
  // Agrega as linhas de lançamento com centro de custo atribuído. Linhas com conta de custo/proveito
  // (classes 6/7) mas sem centro caem em "(Sem centro)" — visibilidade sobre o que falta classificar.
  const SEM_CENTRO = "—";
  function analiticaMapa(opts) {
    opts = opts || {};
    const de = opts.de, ate = opts.ate, exId = opts.exercicioId;
    const map = {};
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (de && l.data < de) return;
      if (ate && l.data > ate) return;
      (l.linhas || []).forEach(x => {
        if (!/^[67]/.test(String(x.codigo))) return; // só custos (7) e proveitos (6) entram na analítica
        const cod = x.centro || SEM_CENTRO;
        const g = map[cod] = map[cod] || { codigo: cod, nome: cod === SEM_CENTRO ? "(Sem centro)" : ((centroPorCodigo(cod) || {}).nome || cod), debito: 0, credito: 0, n: 0 };
        g.debito = round2(g.debito + (Number(x.debito) || 0));
        g.credito = round2(g.credito + (Number(x.credito) || 0));
        g.n++;
      });
    });
    const linhas = Object.values(map).map(g => { g.saldo = round2(g.debito - g.credito); return g; })
      .sort((a, b) => (a.codigo === SEM_CENTRO ? 1 : 0) - (b.codigo === SEM_CENTRO ? 1 : 0) || a.codigo.localeCompare(b.codigo));
    const totais = linhas.reduce((a, g) => ({ debito: round2(a.debito + g.debito), credito: round2(a.credito + g.credito), saldo: round2(a.saldo + g.saldo) }), { debito: 0, credito: 0, saldo: 0 });
    return { linhas, totais };
  }
  // Detalhe (drill-down) dos lançamentos de um centro de custo — mesma forma de linha do razão().
  function analiticaDetalhe(codigoCentro, opts) {
    opts = opts || {};
    const de = opts.de, ate = opts.ate, exId = opts.exercicioId;
    const linhas = [];
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (de && l.data < de) return;
      if (ate && l.data > ate) return;
      (l.linhas || []).forEach(x => {
        if (!/^[67]/.test(String(x.codigo))) return;
        const cod = x.centro || SEM_CENTRO;
        if (cod !== codigoCentro) return;
        linhas.push({ lancId: l.id, numeroOp: l.numeroOp || "", nDiario: numeroDiario(l), data: l.data, diario: l.diario, documento: docCodigo(l.documento), documentoRef: l.documentoRef || "", conta: x.codigo, contaNome: x.nome || (contaPorCodigo(x.codigo) || {}).nome || "", descricao: x.descricao || l.descricao, debito: Number(x.debito) || 0, credito: Number(x.credito) || 0 });
      });
    });
    linhas.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const tot = somaLinhas(linhas);
    return { linhas, totalDebito: tot.debito, totalCredito: tot.credito, saldo: round2(tot.debito - tot.credito) };
  }

  // ---------- Contas Correntes (clientes / fornecedores) ----------
  // Lista as contas de movimento sob um prefixo (ex.: "31" clientes, "32" fornecedores) com
  // total débito/crédito e saldo. natureza: "D" = a receber (devedora), "C" = a pagar (credora).
  function contasCorrentes(prefixo, opts) {
    opts = opts || {};
    const exId = opts.exercicioId || (AY.exercicioAtivo() || {}).id;
    const natD = (opts.natureza || "D") !== "C";
    const map = {};
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (opts.de && l.data < opts.de) return; if (opts.ate && l.data > opts.ate) return;
      (l.linhas || []).forEach(x => {
        if (!String(x.codigo).startsWith(String(prefixo))) return;
        const g = map[x.codigo] = map[x.codigo] || { codigo: x.codigo, nome: x.nome || (contaPorCodigo(x.codigo) || {}).nome || "", debito: 0, credito: 0, ents: {}, mov: 0 };
        g.debito = round2(g.debito + (Number(x.debito) || 0)); g.credito = round2(g.credito + (Number(x.credito) || 0)); g.mov++;
        if (x.entidade) g.ents[x.entidade] = true;
      });
    });
    const linhas = Object.values(map).map(g => {
      g.saldo = round2(natD ? (g.debito - g.credito) : (g.credito - g.debito));
      g.entidade = Object.keys(g.ents).join(", "); delete g.ents;
      return g;
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const totais = linhas.reduce((a, g) => ({ debito: round2(a.debito + g.debito), credito: round2(a.credito + g.credito), saldo: round2(a.saldo + g.saldo) }), { debito: 0, credito: 0, saldo: 0 });
    return { linhas, totais, natureza: natD ? "D" : "C", comSaldo: linhas.filter(g => Math.abs(g.saldo) > 0.005).length };
  }

  // Balancete no MODELO Primavera: Anterior (< de) · Período ([de,ate]) · Acumulado (<= ate),
  // hierárquico (contas de integração agregam as folhas), subtotais por raiz (2 díg.) e total geral.
  function balanceteModelo(opts) {
    opts = opts || {};
    const exId = opts.exercicioId, de = opts.de || null, ate = opts.ate || null;
    // buckets por conta-folha (código que aparece nas linhas dos lançamentos)
    const leaf = {};
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (opts.excluirApuramento && l.origem === "apuramento") return;
      // Mês/período contabilístico (00 Abertura · 01-12 meses · 13 Regularizações · 14 Apuramento de
      // Resultados · 15 Apuramento de Imposto e Resultado Líquido) — "até este período" (cumulativo),
      // já que os códigos são strings de 2 díg. e comparam-se corretamente por ordem alfabética.
      if (opts.mes && String(l.mes || "00") > opts.mes) return;
      if (ate && l.data > ate) return; // fora do acumulado
      (l.linhas || []).forEach(x => {
        const g = leaf[x.codigo] = leaf[x.codigo] || { antD: 0, antC: 0, perD: 0, perC: 0 };
        const d = Number(x.debito) || 0, c = Number(x.credito) || 0;
        if (de && l.data < de) { g.antD += d; g.antC += c; } else { g.perD += d; g.perC += c; }
      });
    });
    const leafCodes = Object.keys(leaf);
    const planoCodes = new Set(contas().map(c => c.codigo));
    const nomes = {}; contas().forEach(c => nomes[c.codigo] = c.nome);
    // códigos a mostrar = folhas + ancestrais existentes no plano (+ raiz 2 díg.)
    const mostrar = new Set();
    leafCodes.forEach(cod => {
      mostrar.add(cod);
      for (let i = 2; i < cod.length; i++) { const p = cod.slice(0, i); if (planoCodes.has(p)) mostrar.add(p); }
      if (cod.length >= 2) mostrar.add(cod.slice(0, 2));
    });
    function agg(cod) {
      const r = { antD: 0, antC: 0, perD: 0, perC: 0 };
      leafCodes.forEach(lc => { if (lc === cod || lc.startsWith(cod)) { const g = leaf[lc]; r.antD += g.antD; r.antC += g.antC; r.perD += g.perD; r.perC += g.perC; } });
      return finaliza(r);
    }
    function finaliza(r) {
      ["antD", "antC", "perD", "perC"].forEach(k => r[k] = round2(r[k]));
      r.antS = round2(r.antD - r.antC); r.perS = round2(r.perD - r.perC);
      r.acuD = round2(r.antD + r.perD); r.acuC = round2(r.antC + r.perC); r.acuS = round2(r.acuD - r.acuC);
      return r;
    }
    const codigos = [...mostrar].sort((a, b) => a.localeCompare(b)); // string: 343 < 3431 < 345 (hierarquia)
    const roots = [...new Set(codigos.map(c => c.slice(0, 2)))].sort((a, b) => a.localeCompare(b));
    const linhas = [];
    roots.forEach(root => {
      const doGrupo = codigos.filter(c => c.slice(0, 2) === root);
      doGrupo.forEach(cod => {
        const v = agg(cod);
        const nivel = doGrupo.filter(o => o !== cod && cod.startsWith(o)).length; // nº de ancestrais mostrados
        const ehMov = !doGrupo.some(o => o !== cod && o.startsWith(cod)); // folha = ninguém a estende
        linhas.push(Object.assign({ tipo: "conta", codigo: cod, nome: nomes[cod] || cod, nivel, ehMov, classe: classeDe(cod) }, v));
      });
      linhas.push(Object.assign({ tipo: "subtotal", codigo: root, nome: "Sub Total " + root }, agg(root)));
    });
    const tot = finaliza(leafCodes.reduce((a, lc) => { const g = leaf[lc]; a.antD += g.antD; a.antC += g.antC; a.perD += g.perD; a.perC += g.perC; return a; }, { antD: 0, antC: 0, perD: 0, perC: 0 }));
    return { linhas, total: tot, de, ate };
  }

  // Balancete do Razão: contas do razão (2 díg.) agrupadas por classe, com Saldo Débito/Crédito por período.
  function balanceteRazao(opts) {
    const mod = balanceteModelo(opts);
    const dc = s => ({ d: s > 0 ? s : 0, c: s < 0 ? -s : 0 });
    const razao = mod.linhas.filter(l => l.tipo === "conta" && l.codigo.length === 2)
      .map(c => ({ codigo: c.codigo, nome: c.nome, classe: c.codigo[0], ant: dc(c.antS), per: dc(c.perS), acu: dc(c.acuS) }));
    const somaVazia = () => ({ ant: { d: 0, c: 0 }, per: { d: 0, c: 0 }, acu: { d: 0, c: 0 } });
    const acumula = (dest, c) => ["ant", "per", "acu"].forEach(p => { dest[p].d = round2(dest[p].d + c[p].d); dest[p].c = round2(dest[p].c + c[p].c); });
    const mapa = {};
    razao.forEach(c => { const g = mapa[c.classe] = mapa[c.classe] || { classe: c.classe, nome: (CLASSES[c.classe] || {}).nome || "", contas: [], soma: somaVazia() }; g.contas.push(c); acumula(g.soma, c); });
    const classes = Object.values(mapa).sort((a, b) => a.classe.localeCompare(b.classe));
    const total = somaVazia(); razao.forEach(c => acumula(total, c));
    return { classes, total };
  }

  // Saldos líquidos acumulados por conta de movimento (para as demonstrações financeiras)
  function saldosAcum(opts) {
    const mod = balanceteModelo(opts); const map = {};
    mod.linhas.filter(l => l.tipo === "conta" && l.ehMov).forEach(l => { map[l.codigo] = l.acuS; });
    return map;
  }
  function somaPref(saldos, prefs) { let s = 0; for (const cod in saldos) { if (prefs.some(p => cod.startsWith(p))) s += saldos[cod]; } return round2(s); }

  // ---------- Demonstração de Resultados (por naturezas, PGC-Angola) ----------
  function demonstracaoResultados(opts) {
    // exclui os lançamentos do próprio apuramento: a DR mostra sempre a atividade real do ano,
    // mesmo depois de apurado (o fecho só se reflete no balancete/razão, não neste relatório).
    const sal = saldosAcum(Object.assign({}, opts, { excluirApuramento: true }));
    const prov = (...p) => round2(-somaPref(sal, p)); // crédito (proveito) → valor positivo
    const cust = (...p) => round2(somaPref(sal, p));  // débito (custo) → valor positivo
    const vendas = prov("61"), servicos = prov("62"), outrosProv = prov("63"), variacoes = prov("64"), trabProp = prov("65");
    const provOper = round2(vendas + servicos + outrosProv + variacoes + trabProp);
    const cmvmc = cust("71"), pessoal = cust("72"), amort = cust("73"), outrosCustos = cust("75");
    const custOper = round2(cmvmc + pessoal + amort + outrosCustos);
    const resOper = round2(provOper - custOper);
    const resFin = round2(prov("66") - cust("76"));
    const resFiliais = round2(prov("67") - cust("77"));
    const resNaoOper = round2(prov("68") - cust("78"));
    const antesImp = round2(resOper + resFin + resFiliais + resNaoOper);
    const imposto = cust("87");
    const resExtraord = round2(prov("69") - cust("79"));
    const liquido = round2(antesImp - imposto + resExtraord);
    const L = (designacao, nota, valor, tipo) => ({ designacao, nota: nota || "", valor: round2(valor), tipo: tipo || "linha" });
    return {
      linhas: [
        L("Vendas", 22, vendas), L("Prestação de Serviços", 23, servicos), L("Outros Proveitos Operacionais", 24, outrosProv),
        L("Variações nos Produtos Acabados e em Curso", 25, variacoes), L("Trabalhos para a Própria Empresa", 26, trabProp),
        L("Custo das Mercad. Vendidas e Mat.-Primas Consumidas", 27, -cmvmc), L("Custos com o Pessoal", 28, -pessoal),
        L("Amortizações", 29, -amort), L("Outros Custos e Perdas Operacionais", 30, -outrosCustos),
        L("RESULTADOS OPERACIONAIS", "", resOper, "subtotal"),
        L("Resultados Financeiros", 31, resFin), L("Resultados de Filiais e Associadas", 32, resFiliais), L("Resultados Não Operacionais", 33, resNaoOper),
        L("RESULTADOS ANTES DE IMPOSTOS", "", antesImp, "subtotal"),
        L("Imposto Sobre o Rendimento", 35, -imposto), L("Resultados Extraordinários", 34, resExtraord),
        L("RESULTADOS LÍQUIDOS DO EXERCÍCIO", "", liquido, "total"),
      ], liquido,
    };
  }

  // ---------- Apuramento de Resultados (fecho automático de Custos/Proveitos) ----------
  // Fecha as contas de movimento das classes 6 (Proveitos) e 7 (Custos) por categoria, transferindo
  // o líquido de cada uma para a respetiva subconta de Resultados (classe 8: 881..887) e, por fim,
  // o Resultado Líquido do Exercício para 8111 (Resultados Transitados). Data: por omissão o último
  // dia do exercício, mas o utilizador pode indicar outra (opts.data) — o período contabilístico é
  // sempre 14 (Apuramento de Resultados), independentemente da data escolhida. Idempotente: reabre
  // um apuramento anterior do mesmo exercício antes de gerar um novo, para poder ser corrido de novo
  // em segurança após correções.
  const APURAMENTO_CATS = [
    { chave: "op", nome: "Resultados Operacionais", documento: "811", destino88: "881", prefixos: ["61", "62", "63", "64", "65", "71", "72", "73", "75"] },
    { chave: "fin", nome: "Resultados Financeiros", documento: "812", destino88: "882", prefixos: ["66", "76"] },
    { chave: "fil", nome: "Resultados de Filiais e Associadas", documento: "816", destino88: "883", prefixos: ["67", "77"] },
    { chave: "nop", nome: "Resultados Não Operacionais", documento: "817", destino88: "884", prefixos: ["68", "78"] },
    { chave: "ext", nome: "Resultados Extraordinários", documento: "814", destino88: "886", prefixos: ["69", "79"] },
  ];
  function fechoLinha(codigo, v, descricao) { return v > 0 ? { codigo, debito: 0, credito: v, descricao } : { codigo, debito: -v, credito: 0, descricao }; }
  function exigirConta(codigo) { if (!contaPorCodigo(codigo)) throw new Error("A conta " + codigo + " (Resultados) não existe no plano — verifica o plano de contas antes de apurar."); }
  function apurarResultados(opts) {
    opts = opts || {};
    const exId = opts.exercicioId || (AY.exercicioAtivo() || {}).id;
    if (!exId) throw new Error("Indica o exercício a apurar.");
    const exs = AY.exercicios(); const ex = exs.find(e => e.id === exId);
    if (!ex) throw new Error("Exercício não encontrado.");
    reabrirApuramento(exId); // idempotente: remove um apuramento anterior deste exercício antes de gerar o novo
    // Data do apuramento: a indicada pelo utilizador, ou por omissão o último dia do exercício.
    const ate = opts.data || ex.fim;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ate || "")) throw new Error("Indica uma data de apuramento válida (ou define o fim do exercício em Configurações).");
    const sal = saldosAcum({ exercicioId: exId, ate });
    const gerados = []; const saldos88 = {};
    APURAMENTO_CATS.forEach(cat => {
      const linhas = []; let somaCat = 0;
      Object.keys(sal).forEach(cod => {
        if (!cat.prefixos.some(p => cod.startsWith(p))) return;
        const v = sal[cod]; if (!v) return;
        linhas.push(fechoLinha(cod, v, "Apuramento — fecho do exercício"));
        somaCat = round2(somaCat + v);
      });
      if (!linhas.length) return;
      exigirConta(cat.destino88);
      linhas.push(fechoLinha(cat.destino88, -somaCat, cat.nome));
      saldos88[cat.destino88] = round2((saldos88[cat.destino88] || 0) + somaCat);
      const lanc = postar({ data: ate, diario: "81", documento: cat.documento, mes: "14", // período 14 (Apuramento de Resultados), independente da data escolhida
        descricao: "Apuramento de Resultados — " + cat.nome, documentoRef: "APUR-" + cat.chave.toUpperCase(),
        origem: "apuramento", exercicioId: exId, linhas });
      gerados.push({ categoria: cat.chave, nome: cat.nome, lancamentoId: lanc.id, resultado: round2(-somaCat) });
    });
    // Imposto sobre os Resultados: fecha diretamente 871+872 (já lançados durante o ano) → 885
    {
      const linhas = []; let somaImp = 0;
      ["871", "872"].forEach(cod => { const v = sal[cod]; if (!v) return; linhas.push(fechoLinha(cod, v, "Apuramento — fecho do exercício")); somaImp = round2(somaImp + v); });
      if (linhas.length) {
        exigirConta("885");
        linhas.push(fechoLinha("885", -somaImp, "Imposto sobre os Resultados"));
        saldos88["885"] = round2((saldos88["885"] || 0) + somaImp);
        const lanc = postar({ data: ate, diario: "81", documento: "821", mes: "14", // período 14 (Apuramento de Resultados), independente da data escolhida
          descricao: "Apuramento de Resultados — Imposto sobre os Resultados", documentoRef: "APUR-IMP",
          origem: "apuramento", exercicioId: exId, linhas });
        gerados.push({ categoria: "imp", nome: "Imposto sobre os Resultados", lancamentoId: lanc.id, resultado: round2(-somaImp) });
      }
    }
    // Fecho final: soma das subcontas 88x → Resultado Líquido do Exercício (8111, Resultados Transitados)
    let resultadoLiquido = 0;
    const chaves88 = Object.keys(saldos88).filter(k => saldos88[k]);
    if (chaves88.length) {
      const linhas = []; let liquidoDC = 0;
      chaves88.forEach(cod => { const v = saldos88[cod]; linhas.push(fechoLinha(cod, v, "Apuramento — fecho do exercício")); liquidoDC = round2(liquidoDC + v); });
      exigirConta("8111");
      linhas.push(fechoLinha("8111", -liquidoDC, "Resultado Líquido do Exercício"));
      resultadoLiquido = round2(-liquidoDC);
      const lanc = postar({ data: ate, diario: "81", documento: "822", mes: "14", // período 14 (Apuramento de Resultados), independente da data escolhida
        descricao: "Apuramento de Resultados — Resultado Líquido do Exercício", documentoRef: "APUR-LIQ",
        origem: "apuramento", exercicioId: exId, linhas });
      gerados.push({ categoria: "liq", nome: "Resultado Líquido do Exercício", lancamentoId: lanc.id, resultado: resultadoLiquido });
    }
    if (!gerados.length) throw new Error("Sem movimentos de custos/proveitos para apurar neste exercício.");
    ex.apuramento = { em: hoje(), ate, resultado: resultadoLiquido, lancamentoIds: gerados.map(g => g.lancamentoId), detalhe: gerados };
    AY.saveExercicio(ex);
    return ex.apuramento;
  }
  // Remove os lançamentos de um apuramento anterior do exercício (para corrigir e apurar de novo).
  function reabrirApuramento(exId) {
    exId = exId || (AY.exercicioAtivo() || {}).id;
    const ex = AY.exercicios().find(e => e.id === exId);
    if (!ex || !ex.apuramento) return false;
    (ex.apuramento.lancamentoIds || []).forEach(id => removeLancamento(id));
    delete ex.apuramento;
    AY.saveExercicio(ex);
    return true;
  }

  // ---------- Balanço (PGC-Angola) ----------
  function balanco(opts) {
    const sal = saldosAcum(opts);
    const p = (...pr) => somaPref(sal, pr);
    // reparte classe 3 (terceiros) em devedores (a receber) e credores (a pagar)
    let receber = 0, pagar = 0;
    for (const cod in sal) { if (/^3/.test(cod)) { const v = sal[cod]; if (v >= 0) receber += v; else pagar += -v; } }
    receber = round2(receber); pagar = round2(pagar);
    // classe 4: positivos = disponibilidades; negativos = descobertos (passivo)
    let disp = 0, descob = 0;
    for (const cod in sal) { if (/^4/.test(cod)) { const v = sal[cod]; if (v >= 0) disp += v; else descob += -v; } }
    disp = round2(disp); descob = round2(descob);
    // Activo
    const imobCorp = round2(p("11") + p("181"));
    const imobIncorp = round2(p("12") + p("182"));
    const investim = round2(p("13"));
    const outrosNaoCorr = round2(p("14") + p("19"));
    const existencias = round2(p("2"));
    const totalActivo = round2(imobCorp + imobIncorp + investim + outrosNaoCorr + existencias + receber + disp);
    // Capital próprio
    const capital = round2(-p("51"));
    const reservas = round2(-p("55", "57", "58"));
    const transitados = round2(-p("56", "81"));
    const resultado = round2(-p("6") - p("7")); // proveitos − custos
    const totalCP = round2(capital + reservas + transitados + resultado);
    // Passivo
    const emprestimos = round2(-p("33"));
    const totalPassivo = round2(pagar + emprestimos + descob);
    const totalCPPassivo = round2(totalCP + totalPassivo);
    const L = (designacao, nota, valor, tipo) => ({ designacao, nota: nota || "", valor: round2(valor), tipo: tipo || "linha" });
    return {
      activo: [
        L("ACTIVO", "", null, "cabecalho"), L("Activos Não Correntes", "", null, "grupo"),
        L("Imobilizações Corpóreas", 4, imobCorp), L("Imobilizações Incorpóreas", 5, imobIncorp),
        L("Investimentos Financeiros", 6, investim), L("Outros Activos Não Correntes", 7, outrosNaoCorr),
        L("Activos Correntes", "", null, "grupo"),
        L("Existências", 8, existencias), L("Contas a Receber", 9, receber), L("Disponibilidades", 10, disp),
        L("TOTAL DO ACTIVO", "", totalActivo, "total"),
      ],
      passivo: [
        L("CAPITAL PRÓPRIO E PASSIVO", "", null, "cabecalho"), L("Capital Próprio", "", null, "grupo"),
        L("Capital", 12, capital), L("Reservas", 13, reservas), L("Resultados Transitados", 14, transitados), L("Resultado do Exercício", "", resultado),
        L("Total do Capital Próprio", "", totalCP, "subtotal"),
        L("Passivo", "", null, "grupo"),
        L("Empréstimos", 15, emprestimos), L("Contas a Pagar", 19, pagar), L("Descobertos Bancários / Outros", 20, descob),
        L("Total do Passivo", "", totalPassivo, "subtotal"),
        L("TOTAL DO CAPITAL PRÓPRIO E PASSIVO", "", totalCPPassivo, "total"),
      ],
      totalActivo, totalCPPassivo, resultado, equilibrado: totalActivo === totalCPPassivo,
    };
  }

  // ---------- Notas às Contas (composição de cada rubrica do Balanço / DR) ----------
  // sinal: 1 = saldo devedor positivo (activos/custos); -1 = saldo credor positivo (proveitos/capital/passivo); 0 = resultado (proveito+ / custo−)
  const NOTAS_DEF = [
    { n: 1, grupo: "BL", titulo: "Identificação da Empresa e Atividade", texto: e => (e.nome || "A empresa") + " (NIF " + (e.nif || "—") + "), com sede em " + (e.morada || e.localizacao || "Angola") + ", tem por atividade principal a atividade comercial e de prestação de serviços. As presentes demonstrações financeiras são expressas em " + (e.moeda || "Kwanzas") + "." },
    { n: 2, grupo: "BL", titulo: "Referencial Contabilístico de Preparação", texto: () => "As demonstrações financeiras foram preparadas de acordo com o Plano Geral de Contabilidade de Angola (PGC-AR), no pressuposto da continuidade das operações e segundo o regime do acréscimo (especialização dos exercícios)." },
    { n: 3, grupo: "BL", titulo: "Principais Políticas Contabilísticas", texto: () => "As imobilizações são registadas ao custo de aquisição e amortizadas pelo método das quotas constantes. As existências são valorizadas ao custo. As contas a receber e a pagar são registadas pelo valor nominal. Os proveitos e custos são reconhecidos no período a que respeitam." },
    { n: 4, grupo: "BL", titulo: "Imobilizações Corpóreas", prefixos: ["11"], amort: ["181"], sinal: 1 },
    { n: 5, grupo: "BL", titulo: "Imobilizações Incorpóreas", prefixos: ["12"], amort: ["182"], sinal: 1 },
    { n: 6, grupo: "BL", titulo: "Investimentos em Subsidiárias e Associadas", prefixos: ["13"], sinal: 1 },
    { n: 7, grupo: "BL", titulo: "Outros Activos Financeiros", prefixos: ["14", "19"], sinal: 1 },
    { n: 8, grupo: "BL", titulo: "Existências", prefixos: ["21", "22", "23", "24", "25", "26", "27"], sinal: 1 },
    { n: 9, grupo: "BL", titulo: "Contas a Receber", prefixos: ["31"], sinal: 1, soPositivos: true },
    { n: 10, grupo: "BL", titulo: "Disponibilidades", prefixos: ["41", "42", "43", "44", "45"], sinal: 1 },
    { n: 11, grupo: "BL", titulo: "Outros Activos Correntes", prefixos: ["28", "34", "35", "38"], sinal: 1, soPositivos: true },
    { n: 12, grupo: "BL", titulo: "Capital", prefixos: ["51"], sinal: -1 },
    { n: 13, grupo: "BL", titulo: "Reservas", prefixos: ["55", "57", "58"], sinal: -1 },
    { n: 14, grupo: "BL", titulo: "Resultados Transitados", prefixos: ["56", "81"], sinal: -1 },
    { n: 15, grupo: "BL", titulo: "Empréstimos de Médio e Longo Prazo", prefixos: ["33"], sinal: -1 },
    { n: 16, grupo: "BL", titulo: "Impostos Diferidos", prefixos: ["276"], sinal: -1 },
    { n: 17, grupo: "BL", titulo: "Provisões para Pensões", prefixos: ["291"], sinal: -1 },
    { n: 18, grupo: "BL", titulo: "Provisões para Outros Riscos e Encargos", prefixos: ["39"], sinal: -1 },
    { n: 19, grupo: "BL", titulo: "Contas a Pagar (Fornecedores e Outros)", prefixos: ["32", "37"], sinal: -1, soNegativos: true },
    { n: 20, grupo: "BL", titulo: "Empréstimos de Curto Prazo", prefixos: ["331"], sinal: -1 },
    { n: 21, grupo: "BL", titulo: "Outros Passivos Correntes", prefixos: ["34", "36", "38"], sinal: -1, soNegativos: true },
    { n: 22, grupo: "DR", titulo: "Vendas", prefixos: ["61"], sinal: -1 },
    { n: 23, grupo: "DR", titulo: "Prestações de Serviços", prefixos: ["62"], sinal: -1 },
    { n: 24, grupo: "DR", titulo: "Outros Proveitos Operacionais", prefixos: ["63"], sinal: -1 },
    { n: 25, grupo: "DR", titulo: "Variações nos Produtos Acabados e em Curso", prefixos: ["64"], sinal: -1 },
    { n: 26, grupo: "DR", titulo: "Trabalhos para a Própria Empresa", prefixos: ["65"], sinal: -1 },
    { n: 27, grupo: "DR", titulo: "Custo das Mercadorias Vendidas e Matérias Consumidas", prefixos: ["71"], sinal: 1 },
    { n: 28, grupo: "DR", titulo: "Custos com o Pessoal", prefixos: ["72"], sinal: 1 },
    { n: 29, grupo: "DR", titulo: "Amortizações", prefixos: ["73"], sinal: 1 },
    { n: 30, grupo: "DR", titulo: "Outros Custos e Perdas Operacionais", prefixos: ["75"], sinal: 1 },
    { n: 31, grupo: "DR", titulo: "Resultados Financeiros", prefixos: ["66", "76"], sinal: 0 },
    { n: 32, grupo: "DR", titulo: "Resultados de Filiais e Associadas", prefixos: ["67", "77"], sinal: 0 },
    { n: 33, grupo: "DR", titulo: "Resultados Não Operacionais", prefixos: ["68", "78"], sinal: 0 },
    { n: 34, grupo: "DR", titulo: "Resultados Extraordinários", prefixos: ["69", "79"], sinal: 0 },
    { n: 35, grupo: "DR", titulo: "Imposto Sobre o Rendimento", prefixos: ["87"], sinal: 1 },
  ];
  // Categoria da nota para o tom da análise textual
  function categoriaNota(def) {
    if (def.grupo === "BL") { if (def.sinal === 1) return "activo"; if (def.n >= 12 && def.n <= 14) return "capital"; return "passivo"; }
    if (def.sinal === -1) return "proveito"; if (def.sinal === 1) return "custo"; return "resultado";
  }
  // Gera um comentário profissional que acompanha a tabela da nota (só quando há valores)
  function gerarAnaliseNota(def, rubricas, total, opts) {
    const reais = rubricas.filter(r => !r.amort);
    if (!reais.length || round2(total) === 0) return "";
    const moeda = AY.moeda();
    const ex = AY.exercicioAtivo();
    const ano = (opts && opts.ano) || (ex ? (ex.inicio || "").slice(0, 4) : new Date().getFullYear());
    const fmt = v => AY.formatMoeda2(Math.abs(v)) + " " + moeda;
    const cat = categoriaNota(def);
    const verbo = {
      activo: "representa o valor dos activos afectos a esta rubrica",
      capital: "traduz os fundos próprios da empresa nesta rubrica",
      passivo: "reflecte as responsabilidades da empresa nesta rubrica",
      proveito: "reflecte os proveitos reconhecidos no exercício",
      custo: "reflecte os custos incorridos no exercício",
      resultado: "apura o resultado líquido desta natureza",
    }[cat];
    let t = "No exercício de " + ano + ", a rubrica «" + def.titulo + "» " + verbo + ", ascendendo a " + fmt(total) + ".";
    const ord = reais.slice().sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    const denom = Math.abs(total) || 1;
    if (ord.length === 1) {
      t += " Este montante corresponde integralmente a " + ord[0].nome + (ord[0].codigo ? " (conta " + ord[0].codigo + ")" : "") + ".";
    } else {
      const top = ord.slice(0, 3).map(r => r.nome + " com " + fmt(r.valor) + " (" + Math.round(Math.abs(r.valor) / denom * 100) + "%)");
      t += " Decompõe-se essencialmente em " + top.join("; ") + (ord.length > 3 ? ", entre outras contas." : ".");
      const maior = ord[0]; const pctMaior = Math.round(Math.abs(maior.valor) / denom * 100);
      if (pctMaior >= 60) t += " A rubrica " + maior.nome + " concentra a maior parte do saldo (" + pctMaior + "%).";
    }
    const amort = rubricas.find(r => r.amort);
    if (amort) { const bruto = round2(reais.reduce((s, r) => s + r.valor, 0)) + Math.abs(amort.valor); t += " O valor líquido resulta de um custo de aquisição de " + fmt(bruto) + ", deduzido de amortizações acumuladas de " + fmt(amort.valor) + " (" + Math.round(Math.abs(amort.valor) / (bruto || 1) * 100) + "% de depreciação)."; }
    if (cat === "proveito") t += " Não existe comparativo do exercício anterior.";
    return t;
  }

  // Textos manuais das notas (override do texto automático), por exercício e nº de nota
  function notaTxtKey(n, exId) { return (exId || (AY.exercicioAtivo() || {}).id || "-") + "|" + n; }
  function getNotaTexto(n, exId) { const m = read(K.notasTxt, {}); const v = m[notaTxtKey(n, exId)]; return v == null ? null : v; }
  function saveNotaTexto(n, exId, texto) { const m = read(K.notasTxt, {}); m[notaTxtKey(n, exId)] = String(texto == null ? "" : texto); write(K.notasTxt, m); }
  function limparNotaTexto(n, exId) { const m = read(K.notasTxt, {}); delete m[notaTxtKey(n, exId)]; write(K.notasTxt, m); }

  function notas(opts) {
    const sal = saldosAcum(opts); // notas do Balanço: refletem o fecho (comportamento inalterado)
    const salDR = saldosAcum(Object.assign({}, opts, { excluirApuramento: true })); // notas da DR: sempre a atividade real do ano
    const emp = AY.getEmpresa();
    const exId = (opts && opts.exercicioId) || (AY.exercicioAtivo() || {}).id;
    const aplicarOverride = (nota, campo, auto) => { const ov = getNotaTexto(nota.n, exId); if (ov != null) { nota[campo] = ov; nota.editada = true; nota.automatico = auto; } return nota; };
    const nome = {}; contas().forEach(c => nome[c.codigo] = c.nome);
    return NOTAS_DEF.map(def => {
      if (def.texto) { const auto = (typeof def.texto === "function" ? def.texto(emp) : def.texto); return aplicarOverride({ n: def.n, grupo: def.grupo, titulo: def.titulo, texto: auto, rubricas: [], total: 0, narrativa: true, automatico: auto }, "texto", auto); }
      const rubricas = [];
      const salNota = def.grupo === "DR" ? salDR : sal;
      Object.keys(salNota).sort((a, b) => a.localeCompare(b)).forEach(cod => {
        if (!def.prefixos.some(p => cod.startsWith(p))) return;
        if (def.amort && def.amort.some(p => cod.startsWith(p))) return; // amort tratada à parte
        const net = salNota[cod];
        if (def.soPositivos && net < 0) return;
        if (def.soNegativos && net >= 0) return;
        const valor = round2(def.sinal === 1 ? net : -net);
        if (valor === 0) return;
        rubricas.push({ codigo: cod, nome: nome[cod] || cod, valor });
      });
      let amort = 0;
      if (def.amort) { Object.keys(sal).forEach(cod => { if (def.amort.some(p => cod.startsWith(p))) amort += -sal[cod]; }); amort = round2(amort); if (amort) rubricas.push({ codigo: "", nome: "Amortizações acumuladas", valor: -amort, amort: true }); }
      const total = round2(rubricas.reduce((s, r) => s + r.valor, 0));
      const auto = gerarAnaliseNota(def, rubricas, total, opts);
      return aplicarOverride({ n: def.n, grupo: def.grupo, titulo: def.titulo, rubricas, total, analise: auto, automatico: auto }, "analise", auto);
    });
  }

  function resumoResultado(opts) {
    // exclui o próprio apuramento: o resumo do painel mostra sempre a atividade real do ano
    const b = balancete(Object.assign({}, opts, { excluirApuramento: true }));
    let custos = 0, proveitos = 0;
    b.linhas.forEach(g => { if (g.classe === "7") custos = round2(custos + g.debito - g.credito); if (g.classe === "6") proveitos = round2(proveitos + g.credito - g.debito); });
    return { custos, proveitos, resultado: round2(proveitos - custos) };
  }

  // ---------- Demonstração de Fluxos de Caixa ----------
  function mapaFluxos(opts) {
    opts = opts || {};
    const exId = opts.exercicioId, de = opts.de, ate = opts.ate;
    const valores = {}; // codigoFluxo -> valor líquido (entradas +, saídas -)
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (de && l.data < de) return; if (ate && l.data > ate) return;
      (l.linhas || []).forEach(x => {
        if (!x.fluxo) return;
        const v = (Number(x.debito) || 0) - (Number(x.credito) || 0); // débito em caixa/banco = entrada
        valores[x.fluxo] = round2((valores[x.fluxo] || 0) + v);
      });
    });
    // Agrega até às raízes
    const list = fluxos();
    function valorDe(f) {
      if (f.tipo === "M") return valores[f.codigo] || 0;
      // intermédio/raiz: soma dos filhos (código começa por este e é mais longo)
      return round2(list.filter(o => o.codigo !== f.codigo && o.codigo.startsWith(f.codigo)).reduce((s, o) => s + (o.tipo === "M" ? (valores[o.codigo] || 0) : 0), 0));
    }
    return list.map(f => ({ codigo: f.codigo, descricao: f.descricao, tipo: f.tipo, valor: valorDe(f) }));
  }

  // ---------- Demonstração de Fluxos de Caixa AUTOMÁTICA ----------
  // Todos os movimentos que envolvem contas de caixa (45) e banco (43) alimentam o fluxo de caixa,
  // categorizados pela contraparte. Entrada = débito na conta monetária; saída = crédito.
  const CASH_RE = /^4[35]/;
  function categoriaFluxo(cod) {
    const c = String(cod || "");
    if (/^1[0-7]/.test(c)) return { grupo: "Investimento", rubrica: "Aquisição de imobilizado" };
    if (/^18|^19/.test(c)) return { grupo: "Investimento", rubrica: "Amortizações/Provisões" };
    if (/^1/.test(c)) return { grupo: "Investimento", rubrica: "Investimentos financeiros" };
    if (/^33/.test(c)) return { grupo: "Financiamento", rubrica: "Empréstimos" };
    if (/^5/.test(c)) return { grupo: "Financiamento", rubrica: "Capital / Suprimentos" };
    if (/^31/.test(c)) return { grupo: "Operacional", rubrica: "Recebimentos de clientes" };
    if (/^32/.test(c)) return { grupo: "Operacional", rubrica: "Pagamentos a fornecedores" };
    if (/^36/.test(c)) return { grupo: "Operacional", rubrica: "Pagamentos ao pessoal" };
    if (/^34/.test(c)) return { grupo: "Operacional", rubrica: "Impostos e Estado" };
    if (/^6/.test(c)) return { grupo: "Operacional", rubrica: "Recebimentos de exploração" };
    if (/^7/.test(c)) return { grupo: "Operacional", rubrica: "Pagamentos de exploração" };
    if (/^2/.test(c)) return { grupo: "Operacional", rubrica: "Existências / compras" };
    return { grupo: "Operacional", rubrica: "Outros recebimentos/pagamentos" };
  }
  // Categoria a partir da rúbrica de fluxo indicada manualmente na linha (código da tabela de Fluxos,
  // ex.: "1100" Recebimento de Clientes) — os 3 grupos correspondem ao 1º dígito (1 Operacional /
  // 2 Investimento / 3 Financiamento), tal como em FLUXOS_DEFAULT.
  function categoriaFluxoDe(fluxoCod) {
    const f = fluxo(fluxoCod);
    if (!f) return null;
    const grupo = f.codigo[0] === "2" ? "Investimento" : f.codigo[0] === "3" ? "Financiamento" : "Operacional";
    return { grupo, rubrica: f.descricao };
  }
  function saldoMonetario(ate, exId) {
    let s = 0; lancamentos().forEach(l => { if (exId && l.exercicioId !== exId) return; if (ate && l.data > ate) return; (l.linhas || []).forEach(x => { if (CASH_RE.test(x.codigo)) s = round2(s + (Number(x.debito) || 0) - (Number(x.credito) || 0)); }); }); return s;
  }
  function demonstracaoFluxos(opts) {
    opts = opts || {}; const exId = opts.exercicioId || (AY.exercicioAtivo() || {}).id, de = opts.de, ate = opts.ate;
    const grupos = { Operacional: {}, Investimento: {}, Financiamento: {} }; let variacao = 0;
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return; if (de && l.data < de) return; if (ate && l.data > ate) return;
      const linhas = l.linhas || [], cash = linhas.filter(x => CASH_RE.test(x.codigo));
      if (!cash.length) return;
      const counter = linhas.filter(x => !CASH_RE.test(x.codigo)).sort((a, b) => ((b.debito || 0) + (b.credito || 0)) - ((a.debito || 0) + (a.credito || 0)));
      cash.forEach(cx => {
        const val = round2((Number(cx.debito) || 0) - (Number(cx.credito) || 0)); if (!val) return;
        variacao = round2(variacao + val);
        // Rúbrica indicada manualmente na linha (obrigatória em 43/45 desde os Movimentos) tem
        // prioridade sobre a categorização automática pela contraparte — usada como reserva para
        // lançamentos antigos ou gerados por outros módulos que ainda não a indicam.
        const cat = (cx.fluxo && categoriaFluxoDe(cx.fluxo)) || (counter.length ? categoriaFluxo(counter[0].codigo) : { grupo: "Operacional", rubrica: "Outros recebimentos/pagamentos" });
        grupos[cat.grupo][cat.rubrica] = round2((grupos[cat.grupo][cat.rubrica] || 0) + val);
      });
    });
    const saldoInicial = de ? saldoMonetario(anteriorA(de), exId) : 0;
    const subtotais = {}; Object.keys(grupos).forEach(g => subtotais[g] = round2(Object.values(grupos[g]).reduce((s, v) => s + v, 0)));
    return { grupos, subtotais, variacao, saldoInicial, saldoFinal: round2(saldoInicial + variacao) };
  }
  function anteriorA(data) { const d = new Date(data); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

  // ---------- Apuramento do IVA (alimentado pela Classe IVA das contas) ----------
  // Contas do plano: 3452 IVA Dedutível · 3453 IVA Liquidado · 3454 Regularizações · 34551 Apuramento · 34561 a pagar · 34571 a recuperar
  const CFG_IVA = { prefLiquidado: "3453", prefDedutivel: "3452", prefRegulariz: "3454", contaApuramento: "34551", contaAPagar: "34561", contaRecuperar: "34571", diario: "34", documento: "341" };
  function nomeConta(cod) { const c = contaPorCodigo(cod); return c ? c.nome : cod; }
  // Taxa da Classe IVA de uma conta (para cálculo automático nos movimentos)
  function taxaClasseIVA(codigo) {
    const c = contaPorCodigo(codigo); if (!c || !c.classeIVA) return null;
    const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(c.classeIVA); if (m) return { taxa: Number(m[1].replace(",", ".")), cativo: /cativo/i.test(c.classeIVA), classe: c.classeIVA };
    if (/isento|não sujeito|nao sujeito/i.test(c.classeIVA)) return { taxa: 0, isento: true, classe: c.classeIVA };
    return null;
  }
  function apuramentoIVA(opts) {
    opts = opts || {}; const exId = opts.exercicioId || (AY.exercicioAtivo() || {}).id, mes = opts.mes;
    const liqLeaves = {}, dedLeaves = {}, regLeaves = {};
    let liquidado = 0, dedutivel = 0, regulariz = 0;
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (mes && (l.mes || mesDe(l.data)) !== mes) return;
      if (opts.de && l.data < opts.de) return; if (opts.ate && l.data > opts.ate) return;
      (l.linhas || []).forEach(x => {
        const cod = String(x.codigo || ""), d = Number(x.debito) || 0, cr = Number(x.credito) || 0;
        if (cod.startsWith(CFG_IVA.prefLiquidado)) { const v = round2(cr - d); liquidado = round2(liquidado + v); (liqLeaves[cod] = liqLeaves[cod] || { codigo: cod, nome: x.nome || nomeConta(cod), valor: 0 }).valor = round2(liqLeaves[cod].valor + v); }
        else if (cod.startsWith(CFG_IVA.prefDedutivel)) { const v = round2(d - cr); dedutivel = round2(dedutivel + v); (dedLeaves[cod] = dedLeaves[cod] || { codigo: cod, nome: x.nome || nomeConta(cod), valor: 0 }).valor = round2(dedLeaves[cod].valor + v); }
        else if (cod.startsWith(CFG_IVA.prefRegulariz)) { const v = round2(cr - d); regulariz = round2(regulariz + v); (regLeaves[cod] = regLeaves[cod] || { codigo: cod, nome: x.nome || nomeConta(cod), valor: 0 }).valor = round2(regLeaves[cod].valor + v); }
      });
    });
    const resultado = round2(liquidado + regulariz - dedutivel);
    return { mes, exId, liquidado, dedutivel, regulariz, resultado, aPagar: resultado > 0 ? resultado : 0, aRecuperar: resultado < 0 ? -resultado : 0,
      liquidadoLinhas: Object.values(liqLeaves), dedutivelLinhas: Object.values(dedLeaves), regularizLinhas: Object.values(regLeaves) };
  }
  function apurarIVA(opts) {
    opts = opts || {}; const a = apuramentoIVA(opts); const c = CFG_IVA;
    if (a.liquidado === 0 && a.dedutivel === 0 && a.regulariz === 0) return { erro: "Sem IVA no período." };
    const linhas = [];
    a.liquidadoLinhas.forEach(g => { if (g.valor !== 0) linhas.push({ codigo: g.codigo, debito: g.valor > 0 ? g.valor : 0, credito: g.valor < 0 ? -g.valor : 0, descricao: "Apuramento IVA liquidado" }); });
    a.dedutivelLinhas.forEach(g => { if (g.valor !== 0) linhas.push({ codigo: g.codigo, debito: g.valor < 0 ? -g.valor : 0, credito: g.valor > 0 ? g.valor : 0, descricao: "Apuramento IVA dedutível" }); });
    a.regularizLinhas.forEach(g => { if (g.valor !== 0) linhas.push({ codigo: g.codigo, debito: g.valor > 0 ? g.valor : 0, credito: g.valor < 0 ? -g.valor : 0, descricao: "Apuramento regularizações" }); });
    if (a.resultado > 0) linhas.push({ codigo: c.contaAPagar, debito: 0, credito: a.resultado, descricao: "IVA a pagar (apuramento)" });
    else if (a.resultado < 0) linhas.push({ codigo: c.contaRecuperar, debito: -a.resultado, credito: 0, descricao: "IVA a recuperar (apuramento)" });
    const lanc = postar({ data: opts.data || hojeData(), diario: c.diario, documento: c.documento, mes: opts.mes || "13",
      descricao: "Apuramento do IVA — " + (periodoLabel(opts.mes) || ""), documentoRef: "IVA-" + (opts.mes || ""), origem: "apuramento", linhas });
    return { apuramento: a, lancamento: lanc };
  }

  // ---------- Retenções na fonte (alimentadas pela Retenção na Fonte das contas) ----------
  const RET_MAP = { "imposto industrial": { taxa: 6.5, sigla: "II", conta: "3413" }, "irt": { taxa: null, sigla: "IRT", conta: "3431" }, "iac": { taxa: 10, sigla: "IAC", conta: "3413" }, "imposto de selo": { taxa: null, sigla: "IS", conta: "3471" } };
  // Retenção configurada numa conta (via campo retencaoFonte da ficha)
  function retencaoConta(codigo) {
    const c = contaPorCodigo(codigo); if (!c || !c.retencaoFonte || /nenhuma/i.test(c.retencaoFonte)) return null;
    const key = Object.keys(RET_MAP).find(k => c.retencaoFonte.toLowerCase().includes(k)); if (!key) return null;
    const base = RET_MAP[key]; const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(c.retencaoFonte);
    return { sigla: base.sigla, taxa: m ? Number(m[1].replace(",", ".")) : base.taxa, conta: base.conta, descricao: c.retencaoFonte };
  }
  // Mapa de retenções efetuadas no período (linhas que creditam contas de retenção)
  function mapaRetencoes(opts) {
    opts = opts || {}; const exId = opts.exercicioId || (AY.exercicioAtivo() || {}).id, mes = opts.mes;
    const CONTAS_RET = { "3413": "Imposto Industrial / IAC", "3431": "IRT", "3432": "IRT (Lei 7/97)", "3471": "Imposto de Selo" };
    const linhas = [];
    lancamentos().forEach(l => {
      if (exId && l.exercicioId !== exId) return;
      if (mes && (l.mes || mesDe(l.data)) !== mes) return;
      (l.linhas || []).forEach(x => {
        const cod = String(x.codigo || ""); const tipo = Object.keys(CONTAS_RET).find(k => cod.startsWith(k));
        if (!tipo) return; const valor = round2((Number(x.credito) || 0) - (Number(x.debito) || 0));
        if (valor <= 0) return;
        linhas.push({ data: l.data, numeroOp: l.numeroOp || "", tipo: CONTAS_RET[tipo], conta: cod, entidade: x.entidade || "", descricao: x.descricao || l.descricao, valor, lancId: l.id });
      });
    });
    linhas.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const total = round2(linhas.reduce((s, r) => s + r.valor, 0));
    const porTipo = {}; linhas.forEach(r => porTipo[r.tipo] = round2((porTipo[r.tipo] || 0) + r.valor));
    return { linhas, total, porTipo };
  }

  AY.contab = {
    K, CLASSES, classeDe, classeNome, naturezaConta,
    seedTudo, contas, conta, contaPorCodigo, contasMovimento, ehMovimento, saveConta, removeConta, contaLabel, importarPlano,
    proximaSubconta, moverMovimentos, criarSubconta, criarConta, contaCorrente,
    diarios, diario, diarioNome, saveDiario, removeDiario, CATEGORIAS_DIARIO,
    diarioFechado, fecharDiarioMes, reabrirDiarioMes, fechosDoDiario,
    documentos, documento, documentosDoDiario, saveDocumento, removeDocumento,
    fluxos, fluxo, fluxosMovimento, mapaFluxos, demonstracaoFluxos, categoriaFluxo, categoriaFluxoDe, saldoMonetario,
    centros, centro, centroPorCodigo, centrosAtivos, saveCentro, removeCentro,
    lancamentos, lancamentosDoExercicio, lancamento, saveLancamento, removeLancamento, integrarLancamento, postar,
    PERIODOS, periodoLabel, mesDe,
    somaLinhas, estaEquilibrado, razao, balancete, balanceteModelo, balanceteRazao, analiticaMapa, analiticaDetalhe, resumoResultado, demonstracaoResultados, apurarResultados, reabrirApuramento, balanco, notas, getNotaTexto, saveNotaTexto, limparNotaTexto, contasCorrentes,
    CFG_IVA, taxaClasseIVA, apuramentoIVA, apurarIVA, retencaoConta, mapaRetencoes,
    // compat
    get DIARIOS() { const o = {}; diarios().forEach(d => o[d.codigo] = { label: d.nome }); return o; },
  };

  // Migração: aplica a Classe de IVA do plano do Primavera às contas já semeadas (uma vez).
  function migrarClasseIVA() {
    const FLAG = AY.PREFIX + "ct_ivaclasses_v1";
    if (read(FLAG, false)) return;
    const fonte = global.AY_PLANO_PRIMAVERA;
    if (fonte && fonte.length) {
      const mapa = {}; fonte.forEach(x => { if (x[3]) mapa[x[0]] = x[3]; });
      const l = read(K.contas, []); let n = 0;
      l.forEach(c => { if (mapa[c.codigo] && !c.classeIVA) { c.classeIVA = mapa[c.codigo]; n++; } });
      if (n) write(K.contas, l);
    }
    write(FLAG, true);
  }

  // Migração: acrescenta os documentos de Entrada/Saída/Ajuste de Stock (Logística) às instalações
  // já semeadas antes de estes existirem — sem apagar diários/documentos já criados pelo utilizador.
  function migrarDocsStock() {
    const FLAG = AY.PREFIX + "ct_docsstock_v1";
    if (read(FLAG, false)) return;
    const l = read(K.documentos, []);
    const existentes = new Set(l.map(d => d.codigo));
    const novos = DOCUMENTOS_DEFAULT.filter(([codigo]) => ["220", "901", "902"].includes(codigo) && !existentes.has(codigo));
    if (novos.length) {
      novos.forEach(([codigo, descricao, diario, cd, cc, ret]) => l.push({ id: uid("doc"), codigo, descricao, diario, contaDebito: cd || "", contaCredito: cc || "", retencao: !!ret, ativo: true }));
      write(K.documentos, l);
    }
    write(FLAG, true);
  }

  // Migração: cria os Centros de Custo por omissão (Contabilidade Analítica) nas instalações
  // já semeadas antes de este módulo existir.
  function migrarCentros() {
    const FLAG = AY.PREFIX + "ct_centros_v1";
    if (read(FLAG, false)) return;
    if (!read(K.centros, []).length) write(K.centros, CENTROS_DEFAULT.map(([codigo, nome, tipo]) => ({ id: uid("cc"), codigo, nome, tipo, responsavel: "", estado: "activo" })));
    write(FLAG, true);
  }
  // Migração: acrescenta os documentos de Apuramento — Filiais/Associadas e Não Operacionais,
  // usados pelo apuramento de resultados automático, às instalações já semeadas.
  function migrarDocsApuramento() {
    const FLAG = AY.PREFIX + "ct_docsapur_v1";
    if (read(FLAG, false)) return;
    const l = read(K.documentos, []);
    const existentes = new Set(l.map(d => d.codigo));
    const novos = DOCUMENTOS_DEFAULT.filter(([codigo]) => ["816", "817"].includes(codigo) && !existentes.has(codigo));
    if (novos.length) {
      novos.forEach(([codigo, descricao, diario, cd, cc, ret]) => l.push({ id: uid("doc"), codigo, descricao, diario, contaDebito: cd || "", contaCredito: cc || "", retencao: !!ret, ativo: true }));
      write(K.documentos, l);
    }
    write(FLAG, true);
  }
  // Migração: acrescenta os documentos de Acerto de Stock Positivo/Negativo (Logística) às
  // instalações já semeadas antes de estes existirem.
  function migrarDocsAcerto() {
    const FLAG = AY.PREFIX + "ct_docsacerto_v1";
    if (read(FLAG, false)) return;
    const l = read(K.documentos, []);
    const existentes = new Set(l.map(d => d.codigo));
    const novos = DOCUMENTOS_DEFAULT.filter(([codigo]) => ["903", "904"].includes(codigo) && !existentes.has(codigo));
    if (novos.length) {
      novos.forEach(([codigo, descricao, diario, cd, cc, ret]) => l.push({ id: uid("doc"), codigo, descricao, diario, contaDebito: cd || "", contaCredito: cc || "", retencao: !!ret, ativo: true }));
      write(K.documentos, l);
    }
    write(FLAG, true);
  }
  try { seedTudo(); migrarClasseIVA(); migrarDocsStock(); migrarCentros(); migrarDocsApuramento(); migrarDocsAcerto(); } catch (e) { console.warn("seedTudo:", e); }

})(window);
