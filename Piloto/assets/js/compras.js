/* SGD — Módulo de Compras / Logística (cadastro de fornecedores).
 * Partilha a Ficha de Terceiro (terceiros.js). Ligado às contas correntes de fornecedores (32…). */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("compras.js: AY não carregado."); return; }
  const { read, write, uid, round2, hoje } = AY;

  const K = { fornecedores: AY.PREFIX + "cmp_fornecedores", compras: AY.PREFIX + "cmp_compras", docseq: AY.PREFIX + "cmp_docseq", seeded: AY.PREFIX + "cmp_seeded_v1" };

  function seed() {
    if (read(K.seeded, false)) return;
    write(K.fornecedores, [
      { id: uid("fo"), numero: "001", nome: "Distribuidora Central, Lda.", nif: "5410000001", localidade: "Luanda", telefone: "222 000 111", conta: "32121", tipoTerceiro: "Fornecedor", estado: "activo" },
      { id: uid("fo"), numero: "002", nome: "TecnoServe", nif: "5410000002", localidade: "Luanda", telefone: "222 000 222", conta: "32121", tipoTerceiro: "Fornecedor", estado: "activo" },
    ]);
    write(K.seeded, true);
  }
  function fornecedores() { seed(); return read(K.fornecedores, []); }
  function fornecedor(id) { return fornecedores().find(f => f.id === id) || null; }
  function proximoNumero() { let m = 0; fornecedores().forEach(f => { const n = parseInt(f.numero, 10); if (!isNaN(n)) m = Math.max(m, n); }); return String(m + 1).padStart(3, "0"); }
  function saveFornecedor(f) {
    const l = fornecedores();
    if (!f.id) { f.id = uid("fo"); f.criadoEm = hoje(); }
    if (!f.numero) f.numero = proximoNumero();
    const i = l.findIndex(x => x.id === f.id); if (i >= 0) l[i] = Object.assign(l[i], f); else l.push(f);
    write(K.fornecedores, l); return f;
  }
  function removeFornecedor(id) { write(K.fornecedores, fornecedores().filter(f => f.id !== id)); }

  // ---------- Documentos de Compra (fatura do fornecedor) ----------
  // O "tipo de documento" de uma compra É o documento contabilístico (o mesmo gerido em Diários e
  // Documentos) do Diário de Compras configurado — a lista mostra sempre todos os já criados, e
  // permite criar um novo no próprio acto do lançamento. Ao emitir, cada linha (obrigatoriamente
  // ligada a um artigo) gera uma entrada de stock via AY.log.registarMovimento, usando esse diário
  // e documento — essa única operação já debita as Existências, credita o Fornecedor (conta
  // corrente própria, criada/encontrada automaticamente pelo nome) e, se houver IVA, debita o IVA
  // Dedutível. Não há um lançamento de fatura em separado — a entrada em armazém É a contabilização
  // da compra, para não duplicar.
  function documentosCompra() {
    if (!AY.contab) return [];
    const diarioBase = (AY.log ? AY.log.cfg().diarioEntrada : null) || "21";
    return AY.contab.documentosDoDiario(diarioBase);
  }
  function comprasDocs() { seed(); return read(K.compras, []); }
  function compraDoc(id) { return comprasDocs().find(c => c.id === id) || null; }
  function nextNumeroCompra(cod) { cod = cod || "CP"; const seqs = read(K.docseq, {}); const n = (seqs[cod] || 0) + 1; seqs[cod] = n; write(K.docseq, seqs); return cod + " " + new Date().getFullYear() + "/" + String(n).padStart(4, "0"); }
  function calcTotaisCompra(linhas, ivaPerc) {
    const subtotal = round2((linhas || []).reduce((s, l) => s + (Number(l.qtd) || 0) * (Number(l.preco) || 0), 0));
    const iva = round2(subtotal * (Number(ivaPerc) || 0) / 100);
    return { subtotal, iva, total: round2(subtotal + iva) };
  }
  function saveCompraDoc(c) {
    if (!c.data) throw new Error("Indica a data do documento.");
    if (!c.documentoCod) throw new Error("Indica o tipo de documento.");
    const l = comprasDocs();
    c.linhas = (c.linhas || []).map(x => ({ artigoId: x.artigoId || "", unidade: x.unidade || "", descricao: x.descricao || "", qtd: Number(x.qtd) || 0, preco: round2(x.preco), total: round2((Number(x.qtd) || 0) * (Number(x.preco) || 0)) })).filter(x => x.descricao || x.total);
    const t = calcTotaisCompra(c.linhas, c.ivaPerc); c.subtotal = t.subtotal; c.iva = t.iva; c.total = t.total;
    if (!c.id) { c.id = uid("cp"); c.criadoEm = hoje(); c.estado = c.estado || "rascunho"; }
    const fo = fornecedor(c.fornecedorId); c.fornecedorNome = fo ? fo.nome : (c.fornecedorNome || "");
    const docRec = AY.contab ? AY.contab.documentos().find(d => d.codigo === c.documentoCod) : null;
    c.documentoNome = docRec ? docRec.descricao : (c.documentoNome || "");
    const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = Object.assign(l[i], c); else l.push(c);
    write(K.compras, l); return c;
  }
  function removeCompraDoc(id) { write(K.compras, comprasDocs().filter(c => c.id !== id)); }
  function compraEmitida(c) { return c.estado === "emitida"; }

  // Entrada de stock (por linha) ao emitir uma compra — cada linha tem obrigatoriamente um artigo,
  // já que o objectivo do documento é justamente movimentar o stock, além de lançar na contabilidade.
  function emitirCompra(id) {
    const c = compraDoc(id); if (!c) throw new Error("Documento inexistente.");
    if (compraEmitida(c)) throw new Error("Documento já emitido.");
    if (c.total <= 0) throw new Error("Documento sem valor.");
    if (!c.fornecedorId && !c.fornecedorNome) throw new Error("Indica o fornecedor.");
    if (!c.armazemId) throw new Error("Indica o armazém de entrada.");
    if (!c.documentoCod) throw new Error("Indica o tipo de documento.");
    const docRec = AY.contab.documentos().find(d => d.codigo === c.documentoCod);
    if (!docRec) throw new Error("O documento " + c.documentoCod + " já não existe — escolhe outro.");
    const linhasArt = (c.linhas || []).filter(l => l.qtd > 0);
    if (!linhasArt.length) throw new Error("Adiciona pelo menos uma linha.");
    if (linhasArt.some(l => !l.artigoId)) throw new Error("Todas as linhas têm de estar ligadas a um artigo — a compra tem de movimentar o stock.");
    if (!AY.log) throw new Error("Módulo de Logística indisponível.");
    if (!c.numero) c.numero = nextNumeroCompra(c.documentoCod);
    const movs = [], lancamentoIds = [], erros = [];
    linhasArt.forEach(l => {
      try {
        const mov = AY.log.registarMovimento({ tipo: "entrada", artigoId: l.artigoId, armazemId: c.armazemId, qtd: Number(l.qtd),
          custoUnit: l.preco, ivaPerc: c.ivaPerc || 0, data: c.data, documento: c.numero, entidade: c.fornecedorNome, descricao: "Compra " + c.numero,
          diarioContab: docRec.diario, documentoContab: docRec.codigo });
        movs.push(mov.id); if (mov.lancamentoId) lancamentoIds.push(mov.lancamentoId);
      } catch (e) { erros.push((l.descricao || "artigo") + ": " + e.message); }
    });
    if (!movs.length) throw new Error("Não foi possível movimentar o stock: " + erros.join(" · "));
    c.estado = "emitida"; c.stockMovs = movs; c.lancamentoIds = lancamentoIds; c.emitidoEm = hoje();
    saveCompraDoc(c);
    return { compra: c, stockMovs: movs, lancamentoIds, erros };
  }

  function resumoCompras() {
    const cs = comprasDocs(); const emit = cs.filter(compraEmitida);
    return { totalCompras: round2(cs.reduce((s, c) => s + c.total, 0)), totalRececionado: round2(emit.reduce((s, c) => s + c.total, 0)),
      nCompras: cs.length, nEmitidas: emit.length, porEmitir: round2(cs.filter(c => !compraEmitida(c)).reduce((s, c) => s + c.total, 0)) };
  }

  AY.compras = { K, fornecedores, fornecedor, saveFornecedor, removeFornecedor, proximoNumero,
    documentosCompra, comprasDocs, compraDoc, saveCompraDoc, removeCompraDoc, calcTotaisCompra, emitirCompra, compraEmitida, resumoCompras };
  try { seed(); } catch (e) { console.warn("compras seed:", e); }
})(window);
