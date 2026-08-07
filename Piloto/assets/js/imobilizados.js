/* SGD — Módulo de Imobilizados (ativos fixos + amortizações).
 * Ficha de ativos, mapa de amortizações e integração com a contabilidade.
 * Métodos de amortização: Quotas Constantes (base/omissão) e Quotas Decrescentes (simplificado). */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("imobilizados.js: AY não carregado."); return; }
  const { read, write, uid, round2, hoje, hojeData } = AY;

  const K = { ativos: AY.PREFIX + "imob_ativos", processos: AY.PREFIX + "imob_processos", cfg: AY.PREFIX + "imob_cfg", seeded: AY.PREFIX + "imob_seeded_v2" };

  // Diário/documento usados a processar amortizações — configuráveis (Amortizações → Configurações).
  function cfgDefault() { return { diario: "71", documento: "713" }; }
  function cfg() { const c = read(K.cfg, null); return c ? Object.assign(cfgDefault(), c) : cfgDefault(); }
  function saveCfg(c) { write(K.cfg, c); return c; }

  function seed() {
    if (read(K.seeded, false)) return;
    const ano = new Date().getFullYear();
    write(K.ativos, [
      { id: uid("im"), codigo: "IM-0001", designacao: "Viatura ligeira", contaImob: "1141", contaAmortAcum: "1814", contaCustoAmort: "7314",
        dataAquisicao: ano + "-01-10", valorAquisicao: 8500000, taxa: 25, metodo: "quotas", amortAcumulada: 0, estado: "activo", fornecedor: "Fornecedor Nacional" },
    ]);
    write(K.seeded, true);
  }

  function ativos() { seed(); return read(K.ativos, []); }
  function ativo(id) { return ativos().find(a => a.id === id) || null; }
  function saveAtivo(a) {
    const l = ativos();
    if (!a.id) { a.id = uid("im"); a.criadoEm = hoje(); if (a.amortAcumulada == null) a.amortAcumulada = 0; }
    a.valorAquisicao = round2(a.valorAquisicao); a.taxa = Number(a.taxa) || 0; a.amortAcumulada = round2(a.amortAcumulada || 0);
    a.metodo = a.metodo || "quotas";
    if (!a.codigo) a.codigo = proximoCodigo();
    const i = l.findIndex(x => x.id === a.id);
    if (i >= 0) l[i] = Object.assign(l[i], a); else l.push(a);
    write(K.ativos, l); return a;
  }
  function removeAtivo(id) { write(K.ativos, ativos().filter(a => a.id !== id)); }
  function proximoCodigo() {
    let max = 0; ativos().forEach(a => { const m = /IM-(\d+)/.exec(a.codigo || ""); if (m) max = Math.max(max, +m[1]); });
    return "IM-" + String(max + 1).padStart(4, "0");
  }

  // ---------- Métodos de amortização ----------
  // "quotas" (Quotas Constantes, método base): quota anual fixa sobre o valor de aquisição.
  // "degressivas" (Quotas Decrescentes, simplificado): quota anual sobre o valor líquido (a
  // amortizar), multiplicada por um coeficiente que depende da vida útil estimada (~100/taxa anos)
  // — aproxima a prática comum PT/AO, sem a regra de comutação para quotas constantes no fim da vida útil.
  const METODOS = [["quotas", "Quotas Constantes"], ["degressivas", "Quotas Decrescentes"]];
  function coefDegressivo(vidaUtilAnos) {
    if (vidaUtilAnos <= 5) return 1.5;
    if (vidaUtilAnos <= 6) return 2;
    return 2.5;
  }
  function amortAnual(a) {
    const valor = Number(a.valorAquisicao) || 0, taxa = Number(a.taxa) || 0;
    if (a.metodo === "degressivas") {
      const vidaUtil = taxa > 0 ? 100 / taxa : 0;
      return round2(valorLiquido(a) * (taxa / 100) * coefDegressivo(vidaUtil));
    }
    return round2(valor * taxa / 100);
  }
  function amortMensal(a) { return round2(amortAnual(a) / 12); }
  function valorLiquido(a) { return round2((Number(a.valorAquisicao) || 0) - (Number(a.amortAcumulada) || 0)); }
  // Amortização anual a reconhecer, limitada ao valor líquido ainda por amortizar (visão global/painel).
  function amortExercicio(a) { if (a.estado === "abatido") return 0; return round2(Math.min(amortAnual(a), Math.max(0, valorLiquido(a)))); }
  // Amortização de um período (mês) concreto — quota mensal, limitada ao valor líquido restante.
  // Período "00" (Abertura) não tem amortização própria.
  function amortDoPeriodo(a, mes) {
    if (a.estado === "abatido" || mes === "00") return 0;
    return round2(Math.min(amortMensal(a), Math.max(0, valorLiquido(a))));
  }
  function percentAmortizado(a) { const v = Number(a.valorAquisicao) || 0; return v ? Math.round((Number(a.amortAcumulada) || 0) / v * 100) : 0; }

  function mapa(opts) {
    opts = opts || {};
    const linhas = ativos().filter(a => !opts.soAtivos || a.estado === "activo").map(a => ({
      id: a.id, codigo: a.codigo, designacao: a.designacao, conta: a.contaImob,
      dataAquisicao: a.dataAquisicao, valorBruto: round2(a.valorAquisicao), taxa: Number(a.taxa) || 0, metodo: a.metodo || "quotas",
      amortAcumuladaAnt: round2(a.amortAcumulada), amortExercicio: amortExercicio(a),
      amortAcumulada: round2(round2(a.amortAcumulada) + amortExercicio(a)), valorLiquido: round2(valorLiquido(a) - amortExercicio(a)),
      estado: a.estado,
    }));
    const totais = linhas.reduce((t, l) => ({
      valorBruto: round2(t.valorBruto + l.valorBruto), amortAcumuladaAnt: round2(t.amortAcumuladaAnt + l.amortAcumuladaAnt),
      amortExercicio: round2(t.amortExercicio + l.amortExercicio), amortAcumulada: round2(t.amortAcumulada + l.amortAcumulada), valorLiquido: round2(t.valorLiquido + l.valorLiquido),
    }), { valorBruto: 0, amortAcumuladaAnt: 0, amortExercicio: 0, amortAcumulada: 0, valorLiquido: 0 });
    return { linhas, totais };
  }

  // ---------- Processamento periódico (mensal) de amortizações — idempotente por exercício/período ----------
  function processos() { return read(K.processos, []); }
  function processoDe(exercicioId, mes) { return processos().find(p => p.exercicioId === exercicioId && p.mes === mes) || null; }
  function processosDoExercicio(exercicioId) { return processos().filter(p => p.exercicioId === exercicioId).sort((a, b) => a.mes.localeCompare(b.mes)); }

  // Mapa do período selecionado: para cada ativo mostra o valor já processado (se o período já foi
  // fechado) ou o valor a processar (se ainda por fazer).
  function mapaPeriodo(opts) {
    opts = opts || {};
    const batch = opts.exercicioId && opts.mes ? processoDe(opts.exercicioId, opts.mes) : null;
    const linhas = ativos().filter(a => !opts.soAtivos || a.estado === "activo").map(a => {
      const item = batch ? batch.itens.find(i => i.ativoId === a.id) : null;
      const valor = item ? item.valor : (opts.mes ? amortDoPeriodo(a, opts.mes) : 0);
      return {
        id: a.id, codigo: a.codigo, designacao: a.designacao, conta: a.contaImob, taxa: Number(a.taxa) || 0, metodo: a.metodo || "quotas",
        valorBruto: round2(a.valorAquisicao), amortAcumuladaAtual: round2(a.amortAcumulada), valorLiquidoAtual: round2(valorLiquido(a)),
        valorPeriodo: valor, jaProcessado: !!item, lancamentoId: item ? item.lancamentoId : null, estado: a.estado,
      };
    });
    const totais = linhas.reduce((t, l) => round2(t + l.valorPeriodo), 0);
    return { linhas, totalPeriodo: totais, processado: !!batch, batch };
  }

  // Processa a amortização de um exercício/período concretos (quota mensal). Idempotente: recusa
  // reprocessar um período já fechado — usa reabrirPeriodo() primeiro para corrigir.
  function processarPeriodo(opts) {
    opts = opts || {};
    const exId = opts.exercicioId; const mes = opts.mes; const data = opts.data;
    if (!exId) throw new Error("Indica o exercício a processar.");
    if (!mes) throw new Error("Indica o período a processar.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "")) throw new Error("Indica uma data de processamento válida.");
    if (processoDe(exId, mes)) throw new Error("Este período já foi processado — reabre-o antes de processar de novo.");
    const cfgAtual = cfg();
    const list = ativos(); const itens = []; const lancamentoIds = []; const erros = [];
    list.forEach(a => {
      const valor = amortDoPeriodo(a, mes); if (valor <= 0) return;
      a.amortAcumulada = round2((Number(a.amortAcumulada) || 0) + valor);
      const item = { ativoId: a.id, codigo: a.codigo, designacao: a.designacao, valor };
      itens.push(item);
      if (AY.contab && a.contaCustoAmort && a.contaAmortAcum) {
        try {
          const lanc = AY.contab.postar({ data, diario: cfgAtual.diario, documento: cfgAtual.documento, mes, exercicioId: exId,
            descricao: "Amortização do período — " + (a.designacao || a.codigo), documentoRef: a.codigo, origem: "imobilizado",
            linhas: [{ codigo: a.contaCustoAmort, debito: valor, credito: 0, descricao: a.designacao }, { codigo: a.contaAmortAcum, debito: 0, credito: valor, descricao: a.designacao }] });
          item.lancamentoId = lanc.id; lancamentoIds.push(lanc.id);
        } catch (e) { erros.push(a.codigo + ": " + e.message); }
      }
    });
    write(K.ativos, list);
    const totalAmort = round2(itens.reduce((s, i) => s + i.valor, 0));
    const u = AY.currentUser();
    const batch = { id: uid("imp"), exercicioId: exId, mes, data, itens, lancamentoIds, totalAmort, em: hoje(), por: u ? u.nome : "sistema" };
    const list2 = processos(); list2.push(batch); write(K.processos, list2);
    return { processados: itens.length, totalAmort, lancados: lancamentoIds.length, erros, batch };
  }
  // Reabre (desfaz) o processamento de um período: repõe a amort. acumulada e remove os lançamentos gerados.
  function reabrirPeriodo(exercicioId, mes) {
    const batch = processoDe(exercicioId, mes); if (!batch) return false;
    const list = ativos();
    batch.itens.forEach(item => {
      const a = list.find(x => x.id === item.ativoId); if (a) a.amortAcumulada = round2((Number(a.amortAcumulada) || 0) - item.valor);
      if (item.lancamentoId && AY.contab) AY.contab.removeLancamento(item.lancamentoId);
    });
    write(K.ativos, list);
    write(K.processos, processos().filter(p => p.id !== batch.id));
    return true;
  }

  AY.imob = {
    K, METODOS, cfg, saveCfg, ativos, ativo, saveAtivo, removeAtivo, proximoCodigo,
    amortAnual, amortMensal, amortExercicio, amortDoPeriodo, valorLiquido, percentAmortizado, mapa,
    processos, processoDe, processosDoExercicio, mapaPeriodo, processarPeriodo, reabrirPeriodo,
  };
  try { seed(); } catch (e) { console.warn("imob seed:", e); }
})(window);
