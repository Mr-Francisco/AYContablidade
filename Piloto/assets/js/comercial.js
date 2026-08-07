/* SGD — Módulo Comercial (clientes, vendas/faturação, vendedores e comissões).
 * A faturação lança automaticamente na contabilidade e alimenta as contas correntes de clientes. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("comercial.js: AY não carregado."); return; }
  const { read, write, uid, round2, hoje, hojeData } = AY;

  const K = { clientes: AY.PREFIX + "com_clientes", vendedores: AY.PREFIX + "com_vendedores", vendas: AY.PREFIX + "com_vendas", cfg: AY.PREFIX + "com_cfg", seq: AY.PREFIX + "com_seq", docseq: AY.PREFIX + "com_docseq", seeded: AY.PREFIX + "com_seeded_v1" };

  function cfgDefault() {
    return { contaCliente: "31121", contaVendas: "6111", contaServicos: "6211", contaIVA: "345311111", contaIVAVendas: "345311111", contaIVAServicos: "345312111",
      diario: "61", documento: "611", documentoServicos: "612",
      contaCaixa: "4511", contaBanco: "43101", contaAdiantamento: "319121", softwareValidacao: "AGT/SGD/2026" };
  }
  function cfg() { const c = read(K.cfg, null); return c ? Object.assign(cfgDefault(), c) : cfgDefault(); }
  function saveCfg(c) { write(K.cfg, c); return c; }

  // Tipos de documento do Regime Jurídico das Facturas e Documentos Equivalentes (Decreto Presidencial n.º 71/25).
  // contab: como lança na contabilidade · exigeCliente/iva/ref: regras de preenchimento · pagamento: usa conta caixa/banco.
  const TIPOS_DOC = [
    { cod: "FT", nome: "Factura", contab: "venda", exigeCliente: true, iva: true },
    { cod: "FR", nome: "Factura-Recibo", contab: "venda_pronto", exigeCliente: true, iva: true, pagamento: true },
    { cod: "FS", nome: "Factura Simplificada", contab: "venda_pronto", exigeCliente: false, iva: true, pagamento: true },
    { cod: "FG", nome: "Factura Global", contab: "venda", exigeCliente: true, iva: true },
    { cod: "FA", nome: "Factura de Adiantamento", contab: "adiantamento", exigeCliente: true, iva: true, pagamento: true },
    { cod: "VD", nome: "Venda a Dinheiro / Talão", contab: "venda_pronto", exigeCliente: false, iva: true, pagamento: true },
    { cod: "ND", nome: "Nota de Débito", contab: "nota_debito", exigeCliente: true, iva: true, ref: true },
    { cod: "NC", nome: "Nota de Crédito", contab: "nota_credito", exigeCliente: true, iva: true, ref: true },
    { cod: "RC", nome: "Recibo", contab: "recibo", exigeCliente: true, iva: false, ref: true, pagamento: true },
    { cod: "GR", nome: "Guia de Remessa / Transporte", contab: "nenhum", exigeCliente: true, iva: false },
    { cod: "PP", nome: "Factura Pró-forma", contab: "nenhum", exigeCliente: true, iva: true, fiscal: false },
  ];
  function tipoDoc(cod) { return TIPOS_DOC.find(t => t.cod === cod) || TIPOS_DOC[0]; }

  function seed() {
    if (read(K.seeded, false)) return;
    write(K.clientes, [
      { id: uid("cl"), nome: "AS Imagem, Lda.", nif: "5417000000", contacto: "923 000 111", morada: "Luanda", conta: "31121", estado: "activo" },
      { id: uid("cl"), nome: "Master Tech", nif: "5417000001", contacto: "923 000 222", morada: "Luanda", conta: "31121", estado: "activo" },
    ]);
    write(K.vendedores, [
      { id: uid("vd"), nome: "Comercial 1", comissaoPerc: 3, estado: "activo" },
    ]);
    write(K.seeded, true);
  }

  // ---------- Clientes ----------
  function clientes() { seed(); return read(K.clientes, []); }
  function cliente(id) { return clientes().find(c => c.id === id) || null; }
  function proximoNumeroCliente() { let m = 0; clientes().forEach(c => { const n = parseInt(c.numero, 10); if (!isNaN(n)) m = Math.max(m, n); }); return String(m + 1).padStart(3, "0"); }
  function saveCliente(c) { const l = clientes(); if (!c.id) { c.id = uid("cl"); c.criadoEm = hoje(); } if (!c.numero) c.numero = proximoNumeroCliente(); const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = Object.assign(l[i], c); else l.push(c); write(K.clientes, l); return c; }
  function removeCliente(id) { write(K.clientes, clientes().filter(c => c.id !== id)); }

  // ---------- Vendedores ----------
  function vendedores() { seed(); return read(K.vendedores, []); }
  function vendedor(id) { return vendedores().find(v => v.id === id) || null; }
  function saveVendedor(v) { const l = vendedores(); if (!v.id) { v.id = uid("vd"); } v.comissaoPerc = Number(v.comissaoPerc) || 0; const i = l.findIndex(x => x.id === v.id); if (i >= 0) l[i] = Object.assign(l[i], v); else l.push(v); write(K.vendedores, l); return v; }
  function removeVendedor(id) { write(K.vendedores, vendedores().filter(v => v.id !== id)); }

  // ---------- Vendas ----------
  function vendas() { seed(); return read(K.vendas, []); }
  function venda(id) { return vendas().find(v => v.id === id) || null; }
  // Numeração sequencial e cronológica por tipo de documento (ex.: FT 2026/0001, NC 2026/0001)
  function nextNumero(cod) { cod = cod || "FT"; const seqs = read(K.docseq, {}); const n = (seqs[cod] || 0) + 1; seqs[cod] = n; write(K.docseq, seqs); return cod + " " + new Date().getFullYear() + "/" + String(n).padStart(4, "0"); }
  function hash32(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(32).toUpperCase().padStart(6, "0"); }
  function codigoValidacao(v) { return hash32((v.numero || "") + "|" + v.total + "|" + (v.clienteNome || "") + "|" + (v.data || "")).slice(0, 4) + "-" + hash32(v.id || "x").slice(0, 4); }
  function calcTotais(linhas, ivaPerc) {
    const subtotal = round2((linhas || []).reduce((s, l) => s + (Number(l.qtd) || 0) * (Number(l.preco) || 0), 0));
    const iva = round2(subtotal * (Number(ivaPerc) || 0) / 100);
    return { subtotal, iva, total: round2(subtotal + iva) };
  }
  function saveVenda(v) {
    if (!v.data) throw new Error("Indica a data do documento.");
    const l = vendas();
    const td = tipoDoc(v.tipoDoc || "FT");
    if (!td.iva) v.ivaPerc = 0;
    v.linhas = (v.linhas || []).map(x => ({ artigoId: x.artigoId || "", unidade: x.unidade || "", descricao: x.descricao || "", qtd: Number(x.qtd) || 0, preco: round2(x.preco), total: round2((Number(x.qtd) || 0) * (Number(x.preco) || 0)) })).filter(x => x.descricao || x.total);
    const t = calcTotais(v.linhas, v.ivaPerc); v.subtotal = t.subtotal; v.iva = t.iva; v.total = t.total;
    if (!v.id) { v.id = uid("vn"); v.tipoDoc = v.tipoDoc || "FT"; v.criadoEm = hoje(); v.estado = v.estado || "rascunho"; }
    const cl = cliente(v.clienteId); v.clienteNome = cl ? cl.nome : (v.clienteNome || "");
    const i = l.findIndex(x => x.id === v.id); if (i >= 0) l[i] = Object.assign(l[i], v); else l.push(v);
    write(K.vendas, l); return v;
  }
  function removeVenda(id) { write(K.vendas, vendas().filter(v => v.id !== id)); }

  // Documento (diário/documento contabilístico) por conta de recebimento
  function docRecebimento(conta) { return String(conta).startsWith("43") ? { diario: "43", documento: "431" } : { diario: "45", documento: "456" }; }

  // Conta corrente do cliente: cria automaticamente uma subconta sequencial (31121001, 31121002…) no ato da faturação.
  function contaCorrenteCliente(cl) {
    const C = AY.contab, base = cfg().contaCliente;
    if (!C || !base) return base;
    const baseConta = C.contaPorCodigo(base), baseEhMov = baseConta && C.ehMovimento(baseConta);
    // Cliente registado: usa a conta própria se já a tiver, senão cria a próxima subconta sequencial
    if (cl && cl.id) {
      if (cl.conta && cl.conta !== base && String(cl.conta).startsWith(base) && C.contaPorCodigo(cl.conta)) return cl.conta;
      const cod = C.proximaSubconta(base);
      try { C.criarSubconta(base, { codigo: cod, nome: cl.nome }); } catch (e) { try { C.criarConta(cod, cl.nome, "D"); } catch (_) { return cl.conta || base; } }
      cl.conta = cod; saveCliente(cl);
      return cod;
    }
    // Consumidor final: usa a base enquanto for de movimento; se já for integradora, usa/cria "Clientes Diversos"
    if (baseEhMov) return base;
    const div = C.contas().find(x => x.codigo !== base && x.codigo.startsWith(base) && C.ehMovimento(x) && /divers|consumidor/i.test(x.nome));
    if (div) return div.codigo;
    const cod = C.proximaSubconta(base);
    try { C.criarSubconta(base, { codigo: cod, nome: "Clientes Diversos" }); } catch (e) { return base; }
    return cod;
  }

  // Baixa de stock + CMVMC ao emitir uma venda de mercadorias.
  // Para cada linha ligada a um artigo, gera uma saída de stock (custo médio) que a logística
  // lança na contabilidade: débito Custo das Mercadorias Vendidas / crédito Existências (mercadoria).
  // Parametrizável em Configurações → Parametrizações (contas, diário/documento, armazém, ativar/desativar).
  function baixaStockVenda(v) {
    if (!AY.log) return { movs: [], avisos: [] };
    const lc = AY.log.cfg();
    if (lc.autoBaixaVenda === false) return { movs: [], avisos: [] };
    const linhasArt = (v.linhas || []).filter(l => l.artigoId && Number(l.qtd) > 0);
    if (!linhasArt.length) return { movs: [], avisos: [] };
    const armId = AY.log.armazemVenda();
    if (!armId) return { movs: [], avisos: ["Sem armazém configurado — stock não movimentado (Configurações → Parametrizações)."] };
    const movs = [], avisos = [];
    linhasArt.forEach(l => {
      try {
        const mov = AY.log.registarMovimento({ tipo: "saida", artigoId: l.artigoId, armazemId: armId, qtd: Number(l.qtd),
          data: v.data || hojeData(), documento: v.numero, descricao: "Venda " + v.numero, ignorarErroContab: true });
        movs.push(mov.id);
      } catch (e) { avisos.push((l.descricao || "artigo") + ": " + e.message); }
    });
    return { movs, avisos };
  }

  // Emitir = validar o documento e lançar na contabilidade conforme o tipo (Regime Jurídico das Facturas).
  function emitir(id, opts) {
    opts = opts || {};
    const v = venda(id); if (!v) throw new Error("Documento inexistente.");
    if (v.estado === "emitida") throw new Error("Documento já emitido.");
    if (v.total <= 0) throw new Error("Documento sem valor.");
    const td = tipoDoc(v.tipoDoc || "FT");
    if (td.exigeCliente && !v.clienteId && !v.clienteNome) throw new Error(td.nome + " exige a identificação do cliente.");
    const c2 = cfg(); const cl = cliente(v.clienteId) || {};
    const usaCliente = ["venda", "nota_credito", "nota_debito", "recibo"].indexOf(td.contab) >= 0;
    const contaCli = usaCliente ? contaCorrenteCliente(cl) : (cl.conta || c2.contaCliente);
    const servicos = v.tipo === "servicos";
    const contaProv = servicos ? c2.contaServicos : c2.contaVendas;
    const contaIVA = servicos ? (c2.contaIVAServicos || c2.contaIVA) : (c2.contaIVAVendas || c2.contaIVA);
    const docVenda = servicos ? (c2.documentoServicos || c2.documento) : c2.documento;
    const contaPag = opts.conta || v.contaRecebimento || c2.contaCaixa;
    const mes = (v.data || hojeData()).slice(5, 7);
    // atribui número sequencial do tipo, se ainda for rascunho
    if (!v.numero) v.numero = nextNumero(td.cod);

    let linhas = [], diario = c2.diario, documento = docVenda, lanc = null;
    if (td.contab === "venda") {
      linhas = [{ codigo: contaCli, debito: v.total, credito: 0, entidade: v.clienteNome, descricao: v.numero },
        { codigo: contaProv, debito: 0, credito: v.subtotal, entidade: v.clienteNome, descricao: v.numero }];
      if (v.iva > 0) linhas.push({ codigo: contaIVA, debito: 0, credito: v.iva, descricao: "IVA liquidado" });
    } else if (td.contab === "venda_pronto") {
      const dr = docRecebimento(contaPag); diario = "56"; documento = "561";
      linhas = [{ codigo: contaPag, debito: v.total, credito: 0, entidade: v.clienteNome, descricao: v.numero },
        { codigo: contaProv, debito: 0, credito: v.subtotal, entidade: v.clienteNome, descricao: v.numero }];
      if (v.iva > 0) linhas.push({ codigo: contaIVA, debito: 0, credito: v.iva, descricao: "IVA liquidado" });
    } else if (td.contab === "adiantamento") {
      const dr = docRecebimento(contaPag); diario = dr.diario; documento = dr.documento;
      linhas = [{ codigo: contaPag, debito: v.total, credito: 0, entidade: v.clienteNome, descricao: v.numero },
        { codigo: c2.contaAdiantamento, debito: 0, credito: v.subtotal, entidade: v.clienteNome, descricao: "Adiantamento " + v.numero }];
      if (v.iva > 0) linhas.push({ codigo: contaIVA, debito: 0, credito: v.iva, descricao: "IVA s/ adiantamento" });
    } else if (td.contab === "nota_debito") {
      diario = "61"; documento = "614";
      linhas = [{ codigo: contaCli, debito: v.total, credito: 0, entidade: v.clienteNome, descricao: v.numero },
        { codigo: contaProv, debito: 0, credito: v.subtotal, entidade: v.clienteNome, descricao: v.numero }];
      if (v.iva > 0) linhas.push({ codigo: contaIVA, debito: 0, credito: v.iva, descricao: "IVA liquidado" });
    } else if (td.contab === "nota_credito") {
      diario = "61"; documento = "613";
      linhas = [{ codigo: contaProv, debito: v.subtotal, credito: 0, entidade: v.clienteNome, descricao: v.numero }];
      if (v.iva > 0) linhas.push({ codigo: contaIVA, debito: v.iva, credito: 0, descricao: "IVA regularizado (a favor)" });
      linhas.push({ codigo: contaCli, debito: 0, credito: v.total, entidade: v.clienteNome, descricao: v.numero });
    } else if (td.contab === "recibo") {
      const dr = docRecebimento(contaPag); diario = dr.diario; documento = dr.documento;
      linhas = [{ codigo: contaPag, debito: v.total, credito: 0, entidade: v.clienteNome, descricao: "Recibo " + v.numero },
        { codigo: contaCli, debito: 0, credito: v.total, entidade: v.clienteNome, descricao: "Liquidação " + (v.docOrigemNum || v.numero) }];
    } else { // nenhum (Guia de Remessa, Pró-forma) — não gera lançamento
      v.estado = "emitida"; v.codigoValidacao = codigoValidacao(v); v.emitidoEm = hoje();
      saveVenda(v); return { venda: v, lancamento: null };
    }
    lanc = AY.contab.postar({ data: v.data || hojeData(), diario, documento, mes,
      descricao: td.nome + " " + v.numero + " — " + v.clienteNome, documentoRef: v.numero, origem: "comercial", linhas });
    v.estado = "emitida"; v.lancamentoId = lanc.id; v.numeroOp = lanc.numeroOp; v.codigoValidacao = codigoValidacao(v); v.emitidoEm = hoje();
    // Venda de mercadorias: baixa o stock e lança o CMVMC (só documentos que saem mercadoria)
    let avisosStock = [];
    if (td.contab === "venda" || td.contab === "venda_pronto") {
      const bs = baixaStockVenda(v); v.stockMovs = bs.movs; avisosStock = bs.avisos;
    }
    saveVenda(v);
    return { venda: v, lancamento: lanc, avisosStock };
  }
  function faturar(id, opts) { return emitir(id, opts); } // compat

  // Comissões por vendedor (sobre o subtotal das vendas faturadas)
  function emitida(v) { return v.estado === "emitida" || v.estado === "faturada"; }
  function geraProveito(v) { const c = tipoDoc(v.tipoDoc || "FT").contab; return c === "venda" || c === "venda_pronto" || c === "nota_debito"; }
  function comissoes(opts) {
    opts = opts || {};
    const map = {};
    vendas().forEach(v => {
      if (opts.soFaturadas && !emitida(v)) return;
      if (!geraProveito(v)) return;
      if (!v.vendedorId) return;
      const vd = vendedor(v.vendedorId); if (!vd) return;
      const g = map[v.vendedorId] = map[v.vendedorId] || { vendedor: vd.nome, perc: vd.comissaoPerc, tipo: vd.tipoComissao || "percentagem", base: 0, vendas: 0, comissao: 0 };
      g.vendas++; g.base = round2(g.base + v.subtotal);
      // Comissão: valor fixo por venda OU percentagem sobre a base
      const inc = (vd.tipoComissao === "fixo") ? (vd.comissaoPerc || 0) : round2(v.subtotal * (vd.comissaoPerc || 0) / 100);
      g.comissao = round2(g.comissao + inc);
    });
    return Object.values(map).sort((a, b) => b.comissao - a.comissao);
  }

  function resumo(opts) {
    const vs = vendas();
    const emit = vs.filter(emitida);
    return {
      totalVendas: round2(vs.reduce((s, v) => s + v.total, 0)),
      totalFaturado: round2(emit.reduce((s, v) => s + v.total, 0)),
      nVendas: vs.length, nFaturadas: emit.length,
      porFaturar: round2(vs.filter(v => !emitida(v)).reduce((s, v) => s + v.total, 0)),
    };
  }

  AY.com = { K, cfg, saveCfg, clientes, cliente, saveCliente, removeCliente, vendedores, vendedor, saveVendedor, removeVendedor,
    vendas, venda, saveVenda, removeVenda, calcTotais, TIPOS_DOC, tipoDoc, emitir, faturar, codigoValidacao, emitida, comissoes, resumo };
  try { seed(); } catch (e) { console.warn("comercial seed:", e); }
})(window);
