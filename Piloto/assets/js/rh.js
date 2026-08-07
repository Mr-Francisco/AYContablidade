/* SGD — Módulo de Recursos Humanos (pessoal, carreiras, processamento salarial).
 * Cálculo de INSS e IRT (Angola) e integração com a contabilidade (documento de salários). */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("rh.js: AY não carregado."); return; }
  const { read, write, uid, round2, hoje, hojeData } = AY;

  const K = { colab: AY.PREFIX + "rh_colab", cfg: AY.PREFIX + "rh_cfg", proc: AY.PREFIX + "rh_proc",
    alter: AY.PREFIX + "rh_alter", pag: AY.PREFIX + "rh_pag", indep: AY.PREFIX + "rh_indep", hon: AY.PREFIX + "rh_hon",
    mapairt: AY.PREFIX + "rh_mapairt", seeded: AY.PREFIX + "rh_seeded_v1" };

  // Tabela IRT Angola (Grupo A) — matéria coletável mensal: {ate, fixa, taxa%, excessoDe}. Editável em config.
  // Atualizada: Lei n.º 14/25, de 30 de Dezembro (OGE 2026) — isenção até 150.000 Kz. IRT = fixa + taxa × (matéria − de).
  const IRT_VERSAO = "2026-oficial-v2";
  // Tabela Mensal do IRT (oficial). IRT = Parcela Fixa + Taxa × (matéria coletável − Excesso de).
  const IRT_DEFAULT = [
    { ate: 150000, fixa: 0, taxa: 0, de: 0 },
    { ate: 200000, fixa: 12500, taxa: 16, de: 150000 },
    { ate: 300000, fixa: 31250, taxa: 18, de: 200000 },
    { ate: 500000, fixa: 49250, taxa: 19, de: 300000 },
    { ate: 1000000, fixa: 87250, taxa: 20, de: 500000 },
    { ate: 1500000, fixa: 187250, taxa: 21, de: 1000000 },
    { ate: 2000000, fixa: 292250, taxa: 22, de: 1500000 },
    { ate: 2500000, fixa: 402250, taxa: 23, de: 2000000 },
    { ate: 5000000, fixa: 517250, taxa: 24, de: 2500000 },
    { ate: 10000000, fixa: 1117250, taxa: 24.5, de: 5000000 },
    { ate: Infinity, fixa: 2342250, taxa: 25, de: 10000000 },
  ];
  // Novo IRPS (Imposto sobre o Rendimento das Pessoas Singulares) — entra em vigor 01-01-2027 (informativo).
  // Confirmado: isenção 150.000 Kz, 6 escalões, taxa marginal até 25%, deduções (educação/saúde/renda), retenções 6,5%/10%/15%/25%.
  // ESCALÕES INTERMÉDIOS INDICATIVOS — confirmar valores no Código do IRPS aprovado.
  const IRPS_INFO = {
    vigor: "01-01-2027", isencao: 150000, indicativo: false,
    // Tabela Mensal do IRPS (oficial) — Rendimento do Trabalho Dependente. IRPS = Parcela Fixa + Taxa × (rendimento − Excesso de).
    escaloes: [
      { de: 0, ate: 150000, taxa: 0, fixa: 0 },
      { de: 150000, ate: 500000, taxa: 16, fixa: 0 },
      { de: 500000, ate: 1500000, taxa: 19, fixa: 56000 },
      { de: 1500000, ate: 2500000, taxa: 22, fixa: 246000 },
      { de: 2500000, ate: 20000000, taxa: 25, fixa: 466000 },
      { de: 20000000, ate: null, taxa: 30, fixa: 4841000 },
    ],
    retencoes: [
      { tipo: "Rendimentos empresariais e profissionais", taxa: "6,5%" },
      { tipo: "Rendimentos de capitais", taxa: "10% ou 15%" },
      { tipo: "Rendimentos prediais", taxa: "25%" },
      { tipo: "Incrementos patrimoniais (geral)", taxa: "10%" },
    ],
    deducoes: ["Despesas de educação", "Despesas de saúde", "Renda de habitação"],
  };
  function cfgDefault() {
    return { inssTrab: 3, inssEmpr: 8, irtVersao: IRT_VERSAO, irt: IRT_DEFAULT.map(b => ({ ate: b.ate === Infinity ? null : b.ate, fixa: b.fixa, taxa: b.taxa, de: b.de })),
      contaCusto: "7211", contaPagar: "36121", contaIRT: "3413", contaINSS: "3492", diario: "36", documento: "361",
      // Pagamento de salários (banco)
      contaBanco: "43101", diarioPag: "43", documentoPag: "434",
      // Honorários / trabalhadores independentes
      contaCustoHon: "752341", contaPagarHon: "32121", contaIRTHon: "3413", taxaRetHon: 6.5, diarioHon: "21", documentoHon: "214" };
  }
  function cfg() {
    const c = read(K.cfg, null); if (!c) return cfgDefault();
    const merged = Object.assign(cfgDefault(), c);
    // Migração: se a tabela do IRT for de versão anterior, atualiza para a oficial atual (Lei 14/25)
    if (c.irtVersao !== IRT_VERSAO) { merged.irt = cfgDefault().irt; merged.irtVersao = IRT_VERSAO; write(K.cfg, merged); }
    return merged;
  }
  function saveCfg(c) { write(K.cfg, c); return c; }
  function irps() { return IRPS_INFO; }

  function seed() {
    if (read(K.seeded, false)) return;
    write(K.colab, [
      { id: uid("cb"), numero: "001", nome: "António Manuel", categoria: "Administrativo", salarioBase: 250000, subsidios: 70000, dataAdmissao: "2024-03-01", iban: "", estado: "activo" },
      { id: uid("cb"), numero: "002", nome: "Maria João", categoria: "Técnico", salarioBase: 180000, subsidios: 50000, dataAdmissao: "2024-06-15", iban: "", estado: "activo" },
    ]);
    write(K.indep, [
      { id: uid("ind"), nome: "Carlos Consultor", nif: "1000000000", atividade: "Consultoria contabilística", taxaRet: 6.5, estado: "activo" },
    ]);
    write(K.seeded, true);
  }
  function colaboradores() { seed(); return read(K.colab, []); }
  function colaborador(id) { return colaboradores().find(c => c.id === id) || null; }
  function saveColaborador(c) {
    const l = colaboradores();
    if (!c.id) { c.id = uid("cb"); c.criadoEm = hoje(); if (!c.numero) c.numero = proximoNumero(); }
    c.salarioBase = round2(c.salarioBase); c.subsidios = round2(c.subsidios || 0);
    const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = Object.assign(l[i], c); else l.push(c);
    write(K.colab, l); return c;
  }
  function removeColaborador(id) { write(K.colab, colaboradores().filter(c => c.id !== id)); }
  function proximoNumero() { let m = 0; colaboradores().forEach(c => { const n = parseInt(c.numero, 10); if (!isNaN(n)) m = Math.max(m, n); }); return String(m + 1).padStart(3, "0"); }

  // ---------- Cálculo IRT / INSS ----------
  function calcIRT(materia) {
    const tab = cfg().irt || [];
    for (const b of tab) { const ate = (b.ate == null ? Infinity : b.ate); if (materia <= ate) return round2((b.fixa || 0) + (materia - (b.de || 0)) * (b.taxa || 0) / 100); }
    const last = tab[tab.length - 1] || { fixa: 0, taxa: 0, de: 0 }; return round2(last.fixa + (materia - last.de) * last.taxa / 100);
  }
  // ---------- Alterações mensais (variáveis do processamento) ----------
  // {id, colabId, mes, faltas(dias), abonos:[{desc,valor}], descontos:[{desc,valor}]}
  function alteracoes(mes) { const l = read(K.alter, []); return mes ? l.filter(a => a.mes === mes) : l; }
  function alteracaoDe(colabId, mes) { return read(K.alter, []).find(a => a.colabId === colabId && a.mes === mes) || { colabId, mes, faltas: 0, abonos: [], descontos: [] }; }
  function saveAlteracao(a) {
    const l = read(K.alter, []); a.faltas = Number(a.faltas) || 0;
    a.abonos = (a.abonos || []).filter(x => x.desc || x.valor).map(x => ({ desc: x.desc || "", valor: round2(x.valor) }));
    a.descontos = (a.descontos || []).filter(x => x.desc || x.valor).map(x => ({ desc: x.desc || "", valor: round2(x.valor) }));
    const i = l.findIndex(x => x.colabId === a.colabId && x.mes === a.mes);
    if (i >= 0) l[i] = Object.assign(l[i], a); else { a.id = uid("alt"); l.push(a); }
    write(K.alter, l); return a;
  }

  // ---------- Mapa de Remunerações — IRT Modelo A2.1 (AGT) ----------
  // Detalhe itemizado por colaborador×mês, exatamente nas rubricas do modelo oficial da AGT
  // (Template_IRT_A2.1_-_Mapa_de_Remunerações.xlsx), para o mapa poder ser gerado e anexado tal-e-qual.
  const SUBS_NAO_SUJEITOS = ["subAlimentacao", "subTransporte", "abonoFamilia", "reembolsoDespesas", "outrosNaoSujeitos"];
  const SUBS_SUJEITOS = ["abonoFalhas", "subRendaCasa", "compensacaoRescisao", "subFerias", "horasExtras", "subAtavio", "subRepresentacao", "premios", "subNatal", "outrosSujeitos"];
  const MAPAIRT_FLAGS = ["calcManualExcesso", "registoManualSS", "naoSujeitoSS", "isentoIRT"];
  function mapaIrtDefault(c, mes) {
    const r = recibo(c, mes);
    const d = { colabId: c.id, mes };
    SUBS_NAO_SUJEITOS.forEach(k => d[k] = 0);
    SUBS_SUJEITOS.forEach(k => d[k] = 0);
    // Arranque razoável a partir do que já existe na ficha/processamento — o utilizador reclassifica se preciso.
    d.outrosNaoSujeitos = round2(Number(c.subsNaoSujeitos) || 0);
    d.subFerias = round2(Number(c.subsidioFerias) || 0);
    d.subNatal = round2(Number(c.subsidioNatal) || 0);
    d.outrosSujeitos = round2(Math.max(0, (Number(c.subsidios) || 0) - d.subFerias - d.subNatal) + (r.abonosExtra || 0));
    d.calcManualExcesso = "N"; d.excessoSubsidiosNaoSujeitos = 0;
    d.registoManualSS = "N"; d.baseTributavelSSManual = 0;
    d.naoSujeitoSS = "N"; d.isentoIRT = "N";
    return d;
  }
  function mapaIrtLinha(colabId, mes) {
    const g = read(K.mapairt, []).find(x => x.colabId === colabId && x.mes === mes);
    const c = colaborador(colabId);
    const def = c ? mapaIrtDefault(c, mes) : {};
    return g ? Object.assign({}, def, g) : def;
  }
  function saveMapaIrtLinha(d) {
    const l = read(K.mapairt, []);
    SUBS_NAO_SUJEITOS.concat(SUBS_SUJEITOS, ["excessoSubsidiosNaoSujeitos", "baseTributavelSSManual"]).forEach(k => d[k] = round2(Number(d[k]) || 0));
    MAPAIRT_FLAGS.forEach(k => d[k] = d[k] === "S" ? "S" : "N");
    const i = l.findIndex(x => x.colabId === d.colabId && x.mes === d.mes);
    if (i >= 0) l[i] = Object.assign(l[i], d); else l.push(d);
    write(K.mapairt, l); return d;
  }
  // Linha completa do mapa (identificação + itemizado + apuramentos calculados), pronta a mostrar/exportar.
  function mapaIrtCalcular(c, mes) {
    const c2 = cfg(); const it = mapaIrtLinha(c.id, mes); const r = recibo(c, mes);
    const subNaoSuj = round2(SUBS_NAO_SUJEITOS.reduce((s, k) => s + (Number(it[k]) || 0), 0));
    const subSuj = round2(SUBS_SUJEITOS.reduce((s, k) => s + (Number(it[k]) || 0), 0));
    const salarioBase = round2(Number(c.salarioBase) || 0), descontosFalta = r.descFaltas;
    const excesso = it.calcManualExcesso === "S" ? round2(Number(it.excessoSubsidiosNaoSujeitos) || 0) : 0;
    const salarioIliquido = round2(salarioBase - descontosFalta + subSuj + subNaoSuj);
    const baseSS = it.registoManualSS === "S" ? round2(Number(it.baseTributavelSSManual) || 0) : round2(salarioBase - descontosFalta);
    const contribSS = it.naoSujeitoSS === "S" ? 0 : round2(baseSS * (c2.inssTrab || 0) / 100);
    const baseIRT = it.isentoIRT === "S" ? 0 : round2(Math.max(0, salarioBase - descontosFalta + subSuj + excesso - contribSS));
    const irt = it.isentoIRT === "S" ? 0 : calcIRT(baseIRT);
    return Object.assign({}, it, {
      colaborador: c, nif: c.nif || "", nome: c.nome, numSS: c.numSS || "", provincia: c.provincia || "", municipio: c.municipio || "",
      salarioBase, descontosFalta, subNaoSuj, subSuj, salarioIliquido, baseSS, contribSS, baseIRT, irt,
    });
  }
  function mapaIrt(mes, opts) {
    opts = opts || {};
    return colaboradores().filter(c => !opts.soAtivos || c.estado === "activo").map(c => mapaIrtCalcular(c, mes));
  }

  // Recibo de um colaborador (opcional: com as alterações do mês). bruto, INSS, IRT, líquido, INSS empresa.
  function recibo(c, mes) {
    const c2 = cfg();
    const base0 = round2(Number(c.salarioBase) || 0), subsBase = round2(Number(c.subsidios) || 0);
    const alt = mes ? alteracaoDe(c.id, mes) : null;
    const faltas = alt ? (Number(alt.faltas) || 0) : 0;
    const descFaltas = round2(base0 / 30 * faltas);                  // desconto por faltas (dias, base 30)
    const abonosExtra = alt ? round2((alt.abonos || []).reduce((s, x) => s + (Number(x.valor) || 0), 0)) : 0;
    const descExtra = alt ? round2((alt.descontos || []).reduce((s, x) => s + (Number(x.valor) || 0), 0)) : 0;
    const base = round2(base0 - descFaltas);
    const subs = round2(subsBase + abonosExtra);
    const bruto = round2(base + subs);
    const inss = round2(base * (c2.inssTrab || 0) / 100);            // INSS trabalhador s/ salário base
    const materia = round2(bruto - inss);                            // matéria coletável IRT
    const irt = calcIRT(materia);
    const liquido = round2(bruto - inss - irt - descExtra);
    const inssEmpresa = round2(base * (c2.inssEmpr || 0) / 100);
    return { colaborador: c, base, subs, bruto, inss, materia, irt, descExtra, descFaltas, faltas, abonosExtra, liquido, inssEmpresa };
  }
  function folha(opts) {
    opts = opts || {};
    const linhas = colaboradores().filter(c => !opts.soAtivos || c.estado === "activo").map(c => recibo(c, opts.mes));
    const t = linhas.reduce((a, r) => ({ bruto: round2(a.bruto + r.bruto), inss: round2(a.inss + r.inss), irt: round2(a.irt + r.irt), liquido: round2(a.liquido + r.liquido), inssEmpresa: round2(a.inssEmpresa + r.inssEmpresa) }),
      { bruto: 0, inss: 0, irt: 0, liquido: 0, inssEmpresa: 0 });
    return { linhas, totais: t };
  }

  // Processa a folha de um mês e lança na contabilidade (um lançamento agregado).
  function processarMes(mes, opts) {
    opts = opts || {}; const c2 = cfg();
    const f = folha({ soAtivos: true, mes });
    if (f.totais.bruto <= 0) return { erro: "Sem valores a processar." };
    let lancado = false, msgErro = "";
    if (AY.contab && !opts.semLancamento) {
      try {
        // Débito remunerações (bruto) · crédito líquido POR COLABORADOR (subconta própria de 36121) · IRT · INSS
        const linhas = [{ codigo: c2.contaCusto, debito: f.totais.bruto, credito: 0, descricao: "Remunerações do pessoal" }];
        f.linhas.forEach(r => {
          const aPagar = round2(r.bruto - r.irt - r.inss); if (aPagar <= 0) return;
          const conta = AY.contab.contaCorrente ? AY.contab.contaCorrente(c2.contaPagar, r.colaborador.nome) : c2.contaPagar;
          linhas.push({ codigo: conta, debito: 0, credito: aPagar, entidade: r.colaborador.nome, descricao: "Líquido " + r.colaborador.nome });
        });
        linhas.push({ codigo: c2.contaIRT, debito: 0, credito: f.totais.irt, descricao: "IRT retido" });
        linhas.push({ codigo: c2.contaINSS, debito: 0, credito: f.totais.inss, descricao: "INSS (3%)" });
        AY.contab.postar({ data: opts.data || hojeData(), diario: c2.diario, documento: c2.documento, mes: mes,
          descricao: "Processamento salarial — " + (AY.contab.periodoLabel ? AY.contab.periodoLabel(mes) : mes), documentoRef: "SAL-" + mes, origem: "rh", linhas });
        lancado = true;
      } catch (e) { msgErro = e.message; }
    }
    const hist = read(K.proc, []); const antigo = hist.findIndex(h => h.mes === mes);
    const reg = { id: uid("proc"), mes, em: hoje(), totais: f.totais, lancado };
    if (antigo >= 0) hist[antigo] = reg; else hist.push(reg);
    write(K.proc, hist);
    return { totais: f.totais, colaboradores: f.linhas.length, lancado, erro: msgErro };
  }
  function processamentos() { return read(K.proc, []); }
  function mesProcessado(mes) { return read(K.proc, []).some(h => h.mes === mes); }

  // ---------- Pagamentos (salários líquidos → banco) ----------
  function pagamentos() { return read(K.pag, []); }
  function mesPago(mes) { return read(K.pag, []).some(p => p.mes === mes); }
  function estadoMes(mes) { return mesPago(mes) ? "pago" : (mesProcessado(mes) ? "processado" : "por_processar"); }
  function pagarMes(mes, opts) {
    opts = opts || {}; const c2 = cfg();
    if (mesPago(mes)) return { erro: "Este mês já foi pago." };
    if (!mesProcessado(mes)) return { erro: "Processa a folha deste mês antes de pagar." };
    const f = folha({ soAtivos: true, mes });
    const liquido = f.totais.liquido;
    if (liquido <= 0) return { erro: "Sem líquido a pagar." };
    const conta = opts.conta || c2.contaBanco;
    let lancado = false, lancId = null, numeroOp = "", msg = "";
    if (AY.contab && !opts.semLancamento) {
      try {
        // Débito da conta de cada colaborador (subconta própria de 36121) pelo líquido · crédito banco/caixa
        const linhas = [];
        f.linhas.forEach(r => { if (r.liquido <= 0) return; const cc = AY.contab.contaCorrente ? AY.contab.contaCorrente(c2.contaPagar, r.colaborador.nome) : c2.contaPagar; linhas.push({ codigo: cc, debito: r.liquido, credito: 0, entidade: r.colaborador.nome, descricao: "Pagamento " + r.colaborador.nome }); });
        linhas.push({ codigo: conta, debito: 0, credito: liquido, descricao: "Pagamento a partir de banco/caixa" });
        const l = AY.contab.postar({ data: opts.data || hojeData(), diario: c2.diarioPag, documento: c2.documentoPag, mes,
          descricao: "Pagamento de salários — " + (AY.contab.periodoLabel ? AY.contab.periodoLabel(mes) : mes), documentoRef: "PAG-" + mes, origem: "rh", linhas });
        lancado = true; lancId = l.id; numeroOp = l.numeroOp || "";
      } catch (e) { msg = e.message; }
    }
    const l = read(K.pag, []); l.push({ id: uid("pag"), mes, valor: liquido, conta, em: hoje(), lancId, numeroOp, lancado });
    write(K.pag, l);
    return { valor: liquido, lancado, lancId, numeroOp, erro: msg };
  }

  // ---------- Honorários / Trabalhadores independentes ----------
  function independentes() {
    seed();
    if (read(K.indep, null) === null) write(K.indep, [{ id: uid("ind"), nome: "Carlos Consultor", nif: "1000000000", atividade: "Consultoria contabilística", taxaRet: 6.5, estado: "activo" }]);
    return read(K.indep, []);
  }
  function independente(id) { return independentes().find(i => i.id === id) || null; }
  function saveIndependente(i) {
    const l = independentes(); if (!i.id) { i.id = uid("ind"); i.criadoEm = hoje(); }
    i.taxaRet = Number(i.taxaRet); if (isNaN(i.taxaRet)) i.taxaRet = cfg().taxaRetHon;
    const k = l.findIndex(x => x.id === i.id); if (k >= 0) l[k] = Object.assign(l[k], i); else l.push(i);
    write(K.indep, l); return i;
  }
  function removeIndependente(id) { write(K.indep, independentes().filter(i => i.id !== id)); }
  function reciboIndependente(ind, valor) {
    const c2 = cfg();
    const bruto = round2(Number(valor) || 0);
    const taxa = ind && ind.taxaRet != null ? Number(ind.taxaRet) : c2.taxaRetHon;
    const retencao = round2(bruto * taxa / 100);
    return { bruto, taxa, retencao, liquido: round2(bruto - retencao) };
  }
  function honorarios() { return read(K.hon, []); }
  function processarHonorario(d) {
    const c2 = cfg(); const ind = independente(d.indepId) || {};
    const r = reciboIndependente(ind, d.valor);
    if (r.bruto <= 0) return { erro: "Indica um valor válido." };
    let lancado = false, lancId = null, numeroOp = "", msg = "";
    if (AY.contab && !d.semLancamento) {
      try {
        const contaPagInd = ind.nome && AY.contab.contaCorrente ? AY.contab.contaCorrente(c2.contaPagarHon, ind.nome) : c2.contaPagarHon;
        const linhas = [
          { codigo: c2.contaCustoHon, debito: r.bruto, credito: 0, entidade: ind.nome || "", descricao: d.descricao || "Honorários" },
          { codigo: contaPagInd, debito: 0, credito: r.liquido, entidade: ind.nome || "", descricao: "Líquido a pagar" },
        ];
        if (r.retencao > 0) linhas.push({ codigo: c2.contaIRTHon, debito: 0, credito: r.retencao, descricao: "IRT retido (independentes)" });
        const l = AY.contab.postar({ data: d.data || hojeData(), diario: c2.diarioHon, documento: c2.documentoHon, mes: d.mes || (d.data || hojeData()).slice(5, 7),
          descricao: "Honorários — " + (ind.nome || ""), documentoRef: d.ref || "HON", origem: "rh", linhas });
        lancado = true; lancId = l.id; numeroOp = l.numeroOp || "";
      } catch (e) { msg = e.message; }
    }
    const l = read(K.hon, []); l.push({ id: uid("hon"), indepId: d.indepId, nome: ind.nome || "", data: d.data || hojeData(), mes: d.mes || "", descricao: d.descricao || "", bruto: r.bruto, taxa: r.taxa, retencao: r.retencao, liquido: r.liquido, lancId, numeroOp, lancado });
    write(K.hon, l);
    return Object.assign(r, { lancado, lancId, numeroOp, erro: msg });
  }

  AY.rh = { K, cfg, saveCfg, irps, IRT_VERSAO, colaboradores, colaborador, saveColaborador, removeColaborador, proximoNumero, calcIRT, recibo, folha, processarMes, processamentos, mesProcessado,
    alteracoes, alteracaoDe, saveAlteracao,
    pagamentos, mesPago, estadoMes, pagarMes,
    independentes, independente, saveIndependente, removeIndependente, reciboIndependente, honorarios, processarHonorario,
    SUBS_NAO_SUJEITOS, SUBS_SUJEITOS, MAPAIRT_FLAGS, mapaIrtLinha, saveMapaIrtLinha, mapaIrtCalcular, mapaIrt };
  try { seed(); } catch (e) { console.warn("rh seed:", e); }
})(window);
