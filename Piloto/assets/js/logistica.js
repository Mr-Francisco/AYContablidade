/* SGD — Módulo de Inventário / Logística (artigos, armazéns, movimentos de stock).
 * Receção, Expedição, Transferência e Inventariação. Integra na contabilidade (existências classe 2 / custo classe 7). */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("logistica.js: AY não carregado."); return; }
  const { read, write, uid, round2, hoje, hojeData } = AY;

  const K = { artigos: AY.PREFIX + "log_artigos", armazens: AY.PREFIX + "log_armazens", movs: AY.PREFIX + "log_movs", cfg: AY.PREFIX + "log_cfg", seq: AY.PREFIX + "log_seq", seeded: AY.PREFIX + "log_seeded_v1" };

  function cfgDefault() {
    return { contaExistencia: "2611", contaCusto: "7111", contaContrapartida: "32121", contaRegulariza: "7111",
      contaIVADedutivel: "34521111", diarioEntrada: "21", docEntrada: "220", diarioSaida: "90", docSaida: "901", diarioAjuste: "90", docAjuste: "902",
      // Acertos de stock: positivo (ganho — encontrou-se mais do que o sistema indicava) e negativo
      // (quebra/perda) usam documentos e contrapartidas próprias — não se misturam com o CMVMC.
      docAjustePos: "903", docAjusteNeg: "904", contaGanhoExistencias: "6804", contaQuebraExistencias: "78041",
      // Baixa automática de stock + CMVMC quando se emite uma venda de mercadorias
      autoBaixaVenda: true, armazemVendaId: "" };
  }
  // Armazém usado por defeito na baixa de stock das vendas (o configurado, ou o 1.º existente)
  function armazemVenda() { const c = cfg(); const arms = armazens(); return c.armazemVendaId && arms.some(w => w.id === c.armazemVendaId) ? c.armazemVendaId : (arms[0] ? arms[0].id : null); }
  function cfg() { const c = read(K.cfg, null); return c ? Object.assign(cfgDefault(), c) : cfgDefault(); }
  function saveCfg(c) { write(K.cfg, c); return c; }

  // Tipos de movimento (mapeiam os botões Receção/Expedição/Transferência/Inventariação do Primavera)
  const TIPOS_MOV = [
    { cod: "entrada", nome: "Receção", sinal: 1, contab: "entrada", cor: "#16a085" },
    { cod: "saida", nome: "Expedição", sinal: -1, contab: "saida", cor: "#c0392b" },
    { cod: "transferencia", nome: "Transferência", sinal: 0, contab: "nenhum", cor: "#2980b9" },
    { cod: "ajuste", nome: "Inventariação / Ajuste", sinal: 0, contab: "ajuste", cor: "#d68910" },
  ];
  function tipoMov(cod) { return TIPOS_MOV.find(t => t.cod === cod) || TIPOS_MOV[0]; }

  function seed() {
    if (read(K.seeded, false)) return;
    write(K.armazens, [
      { id: uid("wh"), codigo: "A1", nome: "Armazém Central", localizacao: "Luanda" },
      { id: uid("wh"), codigo: "A2", nome: "Armazém Loja", localizacao: "Luanda" },
    ]);
    write(K.artigos, [
      { id: uid("art"), codigo: "0001", descricao: "Resma de Papel A4", familia: "Consumíveis", unidade: "Cx", tipoArtigo: "Mercadoria", precoVenda: 8500, precoCompra: 6000, taxaIVA: 14, stockMin: 10, estado: "activo" },
      { id: uid("art"), codigo: "0002", descricao: "Toner de Impressora", familia: "Consumíveis", unidade: "Un", tipoArtigo: "Mercadoria", precoVenda: 45000, precoCompra: 32000, taxaIVA: 14, stockMin: 5, estado: "activo" },
    ]);
    write(K.movs, []); write(K.seq, {});
    write(K.seeded, true);
  }

  // ---------- Artigos ----------
  function artigos() { seed(); return read(K.artigos, []); }
  function artigo(id) { return artigos().find(a => a.id === id) || null; }
  function artigoPorCodigo(cod) { return artigos().find(a => a.codigo === String(cod)) || null; }
  function proximoCodigoArtigo() { let m = 0; artigos().forEach(a => { const n = parseInt(a.codigo, 10); if (!isNaN(n)) m = Math.max(m, n); }); return String(m + 1).padStart(4, "0"); }
  function saveArtigo(a) {
    const l = artigos(); if (!a.id) { a.id = uid("art"); a.criadoEm = hoje(); } if (!a.codigo) a.codigo = proximoCodigoArtigo();
    ["precoVenda", "precoCompra", "taxaIVA", "stockMin"].forEach(k => a[k] = round2(a[k]));
    const i = l.findIndex(x => x.id === a.id); if (i >= 0) l[i] = Object.assign(l[i], a); else l.push(a);
    write(K.artigos, l); return a;
  }
  function removeArtigo(id) { write(K.artigos, artigos().filter(a => a.id !== id)); }

  // ---------- Armazéns ----------
  function armazens() { seed(); return read(K.armazens, []); }
  function armazem(id) { return armazens().find(w => w.id === id) || null; }
  function saveArmazem(w) { const l = armazens(); if (!w.id) w.id = uid("wh"); const i = l.findIndex(x => x.id === w.id); if (i >= 0) l[i] = Object.assign(l[i], w); else l.push(w); write(K.armazens, l); return w; }
  function removeArmazem(id) { write(K.armazens, armazens().filter(w => w.id !== id)); }

  // ---------- Movimentos de stock ----------
  function movimentos() { seed(); return read(K.movs, []); }
  function nextNumero(cod) { const seqs = read(K.seq, {}); const n = (seqs[cod] || 0) + 1; seqs[cod] = n; write(K.seq, seqs); return cod.toUpperCase() + " " + new Date().getFullYear() + "/" + String(n).padStart(4, "0"); }
  // stock de um artigo (opcional por armazém)
  function stock(artigoId, armazemId) {
    let q = 0;
    movimentos().forEach(m => {
      if (m.artigoId !== artigoId) return; const qtd = Number(m.qtd) || 0;
      if (m.tipo === "entrada") { if (!armazemId || m.armazemId === armazemId) q += qtd; }
      else if (m.tipo === "saida") { if (!armazemId || m.armazemId === armazemId) q -= qtd; }
      else if (m.tipo === "ajuste") { if (!armazemId || m.armazemId === armazemId) q += qtd; } // qtd pode ser negativa
      else if (m.tipo === "transferencia") { if (!armazemId) return; if (m.armazemId === armazemId) q -= qtd; if (m.armazemDestino === armazemId) q += qtd; }
    });
    return round2(q);
  }
  function stockTotal(artigoId) { return stock(artigoId, null); }
  // Custo Médio Ponderado (CUMP) — recalculado cronologicamente a cada entrada (o critério legal de
  // valorização de existências), por armazém (ou global, agregando todos os armazéns, se armazemId
  // for omitido). Uma saída não altera o CUMP, só reduz a quantidade — o valor sai sempre ao custo
  // médio corrente. Transferências entre armazéns próprios não alteram o CUMP global (só realocam),
  // mas no armazém de destino entram ao CUMP que o armazém de origem tinha nesse momento.
  function custoMedio(artigoId, armazemId) {
    const movs = movimentos().filter(m => m.artigoId === artigoId)
      .sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.criadoEm || "").localeCompare(b.criadoEm || ""));
    let qtd = 0, valor = 0;
    const entra = (q, cu) => { qtd = round2(qtd + q); valor = round2(valor + q * cu); };
    const sai = (q) => {
      if (qtd <= 0) return;
      const cm = valor / qtd, qSai = Math.min(q, qtd);
      valor = round2(valor - qSai * cm); qtd = round2(qtd - qSai);
    };
    movs.forEach(m => {
      const q = Math.abs(Number(m.qtd) || 0), cu = Number(m.custoUnit) || 0;
      if (m.tipo === "entrada") { if (!armazemId || m.armazemId === armazemId) entra(q, cu); }
      else if (m.tipo === "saida") { if (!armazemId || m.armazemId === armazemId) sai(q); }
      else if (m.tipo === "ajuste") {
        if (armazemId && m.armazemId !== armazemId) return;
        if ((Number(m.qtd) || 0) >= 0) entra(q, cu); else sai(q);
      } else if (m.tipo === "transferencia" && armazemId) { // globalmente uma transferência é neutra: ignora-se
        if (m.armazemId === armazemId) sai(q);
        else if (m.armazemDestino === armazemId) entra(q, cu); // cu = CUMP de origem gravado na transferência
      }
    });
    if (qtd > 0) return round2(valor / qtd);
    const a = artigo(artigoId); return a ? round2(a.precoCompra) : 0;
  }
  function existencias(opts) {
    opts = opts || {};
    return artigos().filter(a => !opts.soAtivos || a.estado === "activo").map(a => {
      const qt = opts.armazemId ? stock(a.id, opts.armazemId) : stockTotal(a.id);
      const cm = custoMedio(a.id, opts.armazemId || null);
      return { artigo: a, codigo: a.codigo, descricao: a.descricao, unidade: a.unidade, stock: qt, custoMedio: cm, valor: round2(qt * cm), stockMin: Number(a.stockMin) || 0, rutura: qt <= (Number(a.stockMin) || 0) };
    });
  }
  function valorStock() { return round2(existencias().reduce((s, e) => s + e.valor, 0)); }

  function registarMovimento(m) {
    const a = artigo(m.artigoId); if (!a) throw new Error("Indica o artigo.");
    if (!m.armazemId) throw new Error("Indica o armazém.");
    const td = tipoMov(m.tipo); const c2 = cfg();
    let qtd = Number(m.qtd) || 0;
    if (td.cod !== "ajuste" && qtd <= 0) throw new Error("Quantidade inválida.");
    if (td.cod === "transferencia" && !m.armazemDestino) throw new Error("Indica o armazém de destino.");
    if (td.cod === "saida") { const disp = stock(m.artigoId, m.armazemId); if (qtd > disp) throw new Error("Stock insuficiente (" + disp + " " + (a.unidade || "un") + " disponíveis)."); }
    if (td.cod === "ajuste" && qtd < 0) { const disp = stock(m.artigoId, m.armazemId); if (-qtd > disp) throw new Error("Acerto negativo maior do que o stock disponível (" + disp + " " + (a.unidade || "un") + ")."); }
    // Saída e transferência saem sempre ao CUMP corrente do armazém de origem (nunca editável — é o
    // que garante a coerência da valorização); só entradas e ajustes positivos levam um custo indicado.
    let custoUnit;
    if (td.cod === "saida" || td.cod === "transferencia") custoUnit = custoMedio(m.artigoId, m.armazemId);
    else if (td.cod === "ajuste" && qtd < 0) custoUnit = round2(m.custoUnit != null ? m.custoUnit : custoMedio(m.artigoId, m.armazemId));
    else custoUnit = round2(m.custoUnit != null ? m.custoUnit : a.precoCompra);
    const valor = round2(Math.abs(qtd) * custoUnit);
    const mes = (m.data || hojeData()).slice(5, 7);
    const contaExist = a.contaExistencia || c2.contaExistencia, contaCusto = a.contaCusto || c2.contaCusto;
    let lanc = null, numero = nextNumero(td.cod === "entrada" ? "REC" : td.cod === "saida" ? "EXP" : td.cod === "transferencia" ? "TRF" : (qtd >= 0 ? "ACP" : "ACN"));

    if (AY.contab && !m.semLancamento && td.contab !== "nenhum" && valor > 0) {
      let linhas = [], diario, documento;
      if (td.contab === "entrada") { diario = m.diarioContab || c2.diarioEntrada; documento = m.documentoContab || c2.docEntrada;
        const contaForn = m.entidade ? AY.contab.contaCorrente(c2.contaContrapartida, m.entidade) : c2.contaContrapartida;
        // IVA dedutível (opcional — só quando indicado, ex.: pelo módulo de Compras): acresce ao valor
        // creditado ao fornecedor, sem alterar o valor de existências nem o custo médio do artigo.
        const ivaValor = round2(valor * (Number(m.ivaPerc) || 0) / 100);
        linhas = [{ codigo: contaExist, debito: valor, credito: 0, descricao: a.descricao }];
        if (ivaValor > 0) linhas.push({ codigo: m.contaIVA || c2.contaIVADedutivel, debito: ivaValor, credito: 0, descricao: "IVA dedutível — " + a.descricao });
        linhas.push({ codigo: contaForn, debito: 0, credito: round2(valor + ivaValor), entidade: m.entidade || "", descricao: "Receção " + numero });
      } else if (td.contab === "saida") { diario = c2.diarioSaida; documento = c2.docSaida;
        linhas = [{ codigo: contaCusto, debito: valor, credito: 0, descricao: "Custo — " + a.descricao }, { codigo: contaExist, debito: 0, credito: valor, descricao: "Saída " + numero }];
      } else if (td.contab === "ajuste") { diario = c2.diarioAjuste;
        // Acerto positivo (encontrou-se mais stock) → Ganhos em Existências; negativo (quebra/perda) → Quebras.
        if (qtd >= 0) { documento = c2.docAjustePos || c2.docAjuste;
          linhas = [{ codigo: contaExist, debito: valor, credito: 0, descricao: "Acerto de Stock Positivo" }, { codigo: c2.contaGanhoExistencias || c2.contaRegulariza, debito: 0, credito: valor, descricao: "Ganho em existências — " + a.descricao }];
        } else { documento = c2.docAjusteNeg || c2.docAjuste;
          linhas = [{ codigo: c2.contaQuebraExistencias || c2.contaRegulariza, debito: valor, credito: 0, descricao: "Quebra de existências — " + a.descricao }, { codigo: contaExist, debito: 0, credito: valor, descricao: "Acerto de Stock Negativo" }];
        }
      }
      try { lanc = AY.contab.postar({ data: m.data || hojeData(), diario, documento, mes, descricao: td.nome + " " + numero + " — " + a.descricao, documentoRef: numero, origem: "logistica", linhas }); }
      catch (e) { if (!m.ignorarErroContab) throw e; }
    }
    const mov = { id: uid("mov"), numero, tipo: td.cod, data: m.data || hojeData(), artigoId: m.artigoId, artigoDesc: a.descricao, armazemId: m.armazemId, armazemDestino: m.armazemDestino || null,
      qtd: qtd, unidade: a.unidade, custoUnit, valor, documento: m.documento || "", descricao: m.descricao || "", entidade: m.entidade || "", lancamentoId: lanc ? lanc.id : null, numeroOp: lanc ? lanc.numeroOp : "", criadoEm: hoje() };
    const l = movimentos(); l.push(mov); write(K.movs, l);
    return mov;
  }
  function removeMovimento(id) { write(K.movs, movimentos().filter(m => m.id !== id)); }

  AY.log = { K, cfg, saveCfg, TIPOS_MOV, tipoMov,
    artigos, artigo, artigoPorCodigo, saveArtigo, removeArtigo, proximoCodigoArtigo,
    armazens, armazem, saveArmazem, removeArmazem,
    movimentos, registarMovimento, removeMovimento, stock, stockTotal, custoMedio, existencias, valorStock, armazemVenda };
  try { seed(); } catch (e) { console.warn("logistica seed:", e); }
})(window);
