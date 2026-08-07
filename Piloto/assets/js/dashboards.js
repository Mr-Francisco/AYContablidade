/* SGD — Painéis executivos por módulo (dashboards).
 * Renderiza KPIs + gráficos SVG (via AY.chartBars/chartDonut) a partir dos motores de cada módulo. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("dashboards.js: AY não carregado."); return; }
  const E = AY.escapeHtml, kz = AY.formatKz, m2 = AY.formatMoeda2;

  function hero(eyebrow, titulo, sub, stats) {
    return `<div class="dash-hero"><div class="dh-eyebrow">${E(eyebrow)}</div><h1>${E(titulo)}</h1>${sub ? `<div class="dh-sub">${E(sub)}</div>` : ""}
      <div class="dh-stats">${(stats || []).map(s => `<div class="dh-stat"><div class="s-k">${E(s.k)}</div><div class="s-v">${s.v}</div></div>`).join("")}</div></div>`;
  }
  function lista(rows, vazio) {
    return `<div class="dash-list">${rows.length ? rows.map(r => `<div class="dl-row"><div class="dl-main"><div class="dl-t">${E(r.t)}</div>${r.s ? `<div class="dl-s">${E(r.s)}</div>` : ""}</div><div class="dl-v">${r.v != null ? r.v : ""}</div></div>`).join("") : `<div class="empty">${E(vazio || "Sem dados.")}</div>`}</div>`;
  }
  function kpis(arr) { return `<div class="grid-4" style="margin-bottom:16px">${arr.map(k => AY.kpi(k[0], k[1], k[2], k[3])).join("")}</div>`; }
  function valOf(arr, desig) { const l = (arr || []).find(x => x.designacao === desig); return l ? (l.valor || 0) : 0; }
  const D = {};

  // ---------------- Contabilidade ----------------
  D.contabilidade = function () {
    const C = AY.contab; const bal = C.balanco(), rr = C.resumoResultado();
    const imob = valOf(bal.activo, "Imobilizações Corpóreas") + valOf(bal.activo, "Imobilizações Incorpóreas") + valOf(bal.activo, "Investimentos Financeiros") + valOf(bal.activo, "Outros Activos Não Correntes");
    const exist = valOf(bal.activo, "Existências"), receber = valOf(bal.activo, "Contas a Receber"), disp = valOf(bal.activo, "Disponibilidades");
    const cp = valOf(bal.passivo, "Total do Capital Próprio"), passivo = valOf(bal.passivo, "Total do Passivo");
    const lancs = C.lancamentos().slice().sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.numero - a.numero));
    const totalMov = lancs.reduce((s, l) => s + (l.linhas || []).reduce((x, y) => x + (Number(y.debito) || 0), 0), 0);
    const donut = AY.chartDonut([
      { label: "Imobilizado", valor: imob }, { label: "Existências", valor: exist },
      { label: "Contas a Receber", valor: receber }, { label: "Disponibilidades", valor: disp },
    ], { centro: kz(bal.totalActivo).replace(/ Kz$/, ""), centroSub: "Activo" });
    const barsRes = AY.chartBars([
      { label: "Proveitos", valor: rr.proveitos, cor: "var(--chart-teal)" },
      { label: "Custos", valor: rr.custos, cor: "var(--pink)" },
      { label: "Resultado", valor: Math.abs(rr.resultado), texto: (rr.resultado >= 0 ? "" : "−") + kz(Math.abs(rr.resultado)), cor: "var(--indigo)" },
    ]);
    const barsEstr = AY.chartBars([
      { label: "Activo", valor: bal.totalActivo, cor: "var(--indigo)" },
      { label: "Capital Próprio", valor: cp, cor: "var(--purple)" },
      { label: "Passivo", valor: passivo, cor: "var(--magenta)" },
    ]);
    const recent = lancs.slice(0, 6).map(l => ({ t: (l.numeroOp ? l.numeroOp + " · " : "") + (l.descricao || "Lançamento"), s: AY.formatDate(l.data) + " · Diário " + (l.diario || ""), v: kz((l.linhas || []).reduce((x, y) => x + (Number(y.debito) || 0), 0)) }));
    return hero("Contabilidade · PGC-Angola", "Painel Contabilístico", "Posição financeira e resultado do exercício em tempo real.", [
      { k: "Total do Activo", v: kz(bal.totalActivo) }, { k: "Capital Próprio", v: kz(cp) },
      { k: "Resultado do Exercício", v: (rr.resultado >= 0 ? "" : "−") + kz(Math.abs(rr.resultado)) },
    ])
      + kpis([
        ["Total do Activo", kz(bal.totalActivo), bal.equilibrado ? "Balanço equilibrado ✓" : "⚠ verificar", "var(--indigo)"],
        ["Capital Próprio", kz(cp), "Passivo " + kz(passivo), "var(--purple)"],
        ["Resultado Líquido", (rr.resultado >= 0 ? "" : "−") + kz(Math.abs(rr.resultado)), rr.resultado >= 0 ? "Lucro" : "Prejuízo", rr.resultado >= 0 ? "var(--chart-teal)" : "var(--pink)"],
        ["Lançamentos", String(lancs.length), "Movimentado " + kz(totalMov), "var(--blue)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Composição do Activo", donut)}${AY.chartCard("Últimos Lançamentos", lista(recent, "Sem lançamentos."))}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Resultado do Exercício", barsRes, "Proveitos − Custos")}${AY.chartCard("Estrutura Financeira", barsEstr, "Activo = CP + Passivo")}</div>`;
  };

  // ---------------- Contas Correntes / Financeiro ----------------
  D.financeiro = function () {
    const C = AY.contab; const cli = C.contasCorrentes("31", { natureza: "D" }), forn = C.contasCorrentes("32", { natureza: "C" });
    const bal = C.balanco(); const disp = valOf(bal.activo, "Disponibilidades");
    const topCli = cli.linhas.filter(g => g.saldo > 0.005).sort((a, b) => b.saldo - a.saldo).slice(0, 6).map(g => ({ label: g.entidade || g.codigo, valor: g.saldo, cor: "var(--indigo)" }));
    const topForn = forn.linhas.filter(g => g.saldo > 0.005).sort((a, b) => b.saldo - a.saldo).slice(0, 6).map(g => ({ label: g.entidade || g.codigo, valor: g.saldo, cor: "var(--magenta)" }));
    const donut = AY.chartDonut([{ label: "A Receber", valor: cli.totais.saldo, cor: "var(--chart-teal)" }, { label: "A Pagar", valor: forn.totais.saldo, cor: "var(--pink)" }],
      { centro: kz(AY.round2(cli.totais.saldo - forn.totais.saldo)).replace(/ Kz$/, ""), centroSub: "Posição" });
    return hero("Tesouraria · Contas Correntes", "Painel Financeiro", "Posição de clientes, fornecedores e disponibilidades.", [
      { k: "A Receber", v: kz(cli.totais.saldo) }, { k: "A Pagar", v: kz(forn.totais.saldo) }, { k: "Disponibilidades", v: kz(disp) },
    ])
      + kpis([
        ["A Receber (Clientes)", kz(cli.totais.saldo), cli.comSaldo + " contas c/ saldo", "var(--chart-teal)"],
        ["A Pagar (Fornecedores)", kz(forn.totais.saldo), forn.comSaldo + " contas c/ saldo", "var(--pink)"],
        ["Posição Líquida", kz(AY.round2(cli.totais.saldo - forn.totais.saldo)), "Receber − Pagar", "var(--indigo)"],
        ["Disponibilidades", kz(disp), "Bancos e Caixa", "var(--blue)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Clientes a Receber", topCli.length ? AY.chartBars(topCli) : `<div class="empty">Sem saldos a receber.</div>`)}${AY.chartCard("Receber vs Pagar", donut)}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Fornecedores a Pagar", topForn.length ? AY.chartBars(topForn) : `<div class="empty">Sem saldos a pagar.</div>`)}${AY.chartCard("Contas Correntes", lista([{ t: "Clientes", s: cli.comSaldo + " contas com saldo", v: kz(cli.totais.saldo) }, { t: "Fornecedores", s: forn.comSaldo + " contas com saldo", v: kz(forn.totais.saldo) }]))}</div>`;
  };

  // ---------------- Comercial ----------------
  D.comercial = function () {
    const M = AY.com; const r = M.resumo(), vendas = M.vendas(), clientes = M.clientes();
    const porCliente = {}, porTipo = { produtos: 0, servicos: 0 };
    vendas.forEach(v => { porCliente[v.clienteNome || "—"] = AY.round2((porCliente[v.clienteNome || "—"] || 0) + v.total); porTipo[v.tipo === "servicos" ? "servicos" : "produtos"] = AY.round2(porTipo[v.tipo === "servicos" ? "servicos" : "produtos"] + v.total); });
    const topCli = Object.entries(porCliente).map(([k, v]) => ({ label: k, valor: v })).sort((a, b) => b.valor - a.valor).slice(0, 6);
    const donut = AY.chartDonut([{ label: "Produtos", valor: porTipo.produtos, cor: "var(--indigo)" }, { label: "Serviços", valor: porTipo.servicos, cor: "var(--purple)" }],
      { centro: kz(r.totalVendas).replace(/ Kz$/, ""), centroSub: "Vendas" });
    const com = M.comissoes({ soFaturadas: true }).map(g => ({ label: g.vendedor, valor: g.comissao, cor: "var(--magenta)" }));
    const recent = vendas.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 6).map(v => ({ t: v.numero + " · " + (v.clienteNome || "—"), s: AY.formatDate(v.data) + " · " + (v.estado === "faturada" ? "Faturada" : "Rascunho"), v: kz(v.total) }));
    return hero("Comercial · Vendas", "Painel Comercial", "Faturação, carteira de clientes e desempenho de vendas.", [
      { k: "Total Faturado", v: kz(r.totalFaturado) }, { k: "Por Faturar", v: kz(r.porFaturar) }, { k: "Clientes", v: String(clientes.length) },
    ])
      + kpis([
        ["Total Faturado", kz(r.totalFaturado), r.nFaturadas + " faturas", "var(--chart-teal)"],
        ["Por Faturar", kz(r.porFaturar), (r.nVendas - r.nFaturadas) + " rascunhos", "var(--chart-amber)"],
        ["Total de Vendas", kz(r.totalVendas), r.nVendas + " documentos", "var(--purple)"],
        ["Clientes Activos", String(clientes.filter(c => c.estado !== "inactivo").length), "de " + clientes.length + " registados", "var(--blue)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Top Clientes por Faturação", topCli.length ? AY.chartBars(topCli) : `<div class="empty">Sem vendas.</div>`)}${AY.chartCard("Vendas por Tipo", donut)}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Comissões por Vendedor", com.length ? AY.chartBars(com) : `<div class="empty">Sem comissões apuradas.</div>`)}${AY.chartCard("Vendas Recentes", lista(recent, "Sem vendas registadas."))}</div>`;
  };

  // ---------------- Imobilizados ----------------
  D.imobilizados = function () {
    const I = AY.imob; const mp = I.mapa(), t = mp.totais;
    const topLiq = mp.linhas.slice().sort((a, b) => b.valorLiquido - a.valorLiquido).slice(0, 6).map(l => ({ label: l.designacao, valor: l.valorLiquido, cor: "var(--indigo)" }));
    const donut = AY.chartDonut([{ label: "Valor Líquido", valor: t.valorLiquido, cor: "var(--chart-teal)" }, { label: "Amort. Acumulada", valor: t.amortAcumulada, cor: "var(--pink)" }],
      { centro: kz(t.valorBruto).replace(/ Kz$/, ""), centroSub: "Bruto" });
    const pctAmort = t.valorBruto ? Math.round(t.amortAcumulada / t.valorBruto * 100) : 0;
    const rows = mp.linhas.map(l => ({ t: l.designacao, s: "Taxa " + l.taxa + "% · " + (l.dataAquisicao ? AY.formatDate(l.dataAquisicao) : "—"), v: kz(l.valorLiquido) }));
    return hero("Imobilizado · Ativos", "Painel de Imobilizados", "Valor patrimonial, amortizações e valor líquido dos ativos.", [
      { k: "Valor Bruto", v: kz(t.valorBruto) }, { k: "Amort. Acumulada", v: kz(t.amortAcumulada) }, { k: "Valor Líquido", v: kz(t.valorLiquido) },
    ])
      + kpis([
        ["Nº de Ativos", String(mp.linhas.length), "em ficha", "var(--blue)"],
        ["Valor Bruto", kz(t.valorBruto), "custo de aquisição", "var(--indigo)"],
        ["Amort. Acumulada", kz(t.amortAcumulada), pctAmort + "% amortizado", "var(--pink)"],
        ["Valor Líquido", kz(t.valorLiquido), "valor contabilístico", "var(--chart-teal)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Valor Líquido por Ativo", topLiq.length ? AY.chartBars(topLiq) : `<div class="empty">Sem ativos.</div>`)}${AY.chartCard("Bruto vs Amortizado", donut)}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Ativos", lista(rows, "Sem ativos registados."))}</div>`;
  };

  // ---------------- Recursos Humanos ----------------
  D.rh = function () {
    const R = AY.rh; const f = R.folha({ soAtivos: true }), t = f.totais, colab = R.colaboradores();
    const porCat = {}; colab.filter(c => c.estado === "activo").forEach(c => { const k = c.categoria || "(sem categoria)"; porCat[k] = AY.round2((porCat[k] || 0) + (Number(c.salarioBase) || 0) + (Number(c.subsidios) || 0)); });
    const barsCat = Object.entries(porCat).map(([k, v]) => ({ label: k, valor: v })).sort((a, b) => b.valor - a.valor);
    const donut = AY.chartDonut([
      { label: "Líquido", valor: t.liquido, cor: "var(--chart-teal)" }, { label: "IRT", valor: t.irt, cor: "var(--pink)" },
      { label: "INSS trab.", valor: t.inss, cor: "var(--purple)" }, { label: "INSS empresa", valor: t.inssEmpresa, cor: "var(--magenta)" },
    ], { centro: kz(AY.round2(t.bruto + t.inssEmpresa)).replace(/ Kz$/, ""), centroSub: "Custo total" });
    const top = f.linhas.slice().sort((a, b) => b.bruto - a.bruto).slice(0, 6).map(r => ({ t: r.colaborador.nome, s: r.colaborador.categoria || "—", v: kz(r.liquido) }));
    const nProc = R.processamentos().length, nPago = R.pagamentos().length;
    return hero("Recursos Humanos · Salários", "Painel de RH", "Massa salarial, encargos e processamento do pessoal.", [
      { k: "Colaboradores", v: String(colab.filter(c => c.estado === "activo").length) }, { k: "Massa Salarial", v: kz(t.bruto) }, { k: "Custo Total Empresa", v: kz(AY.round2(t.bruto + t.inssEmpresa)) },
    ])
      + kpis([
        ["Colaboradores Activos", String(colab.filter(c => c.estado === "activo").length), "de " + colab.length + " registados", "var(--blue)"],
        ["Massa Salarial (bruto)", kz(t.bruto), "líquido " + kz(t.liquido), "var(--indigo)"],
        ["Retenções", kz(AY.round2(t.irt + t.inss)), "IRT + INSS trab.", "var(--pink)"],
        ["Custo p/ Empresa", kz(AY.round2(t.bruto + t.inssEmpresa)), "c/ INSS empresa", "var(--purple)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Massa Salarial por Categoria", barsCat.length ? AY.chartBars(barsCat) : `<div class="empty">Sem colaboradores.</div>`)}${AY.chartCard("Custo do Pessoal", donut)}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Maiores Vencimentos", lista(top, "Sem colaboradores."), nProc + " mês(es) processado(s) · " + nPago + " pago(s)")}</div>`;
  };

  // ---------------- Contabilidade Analítica (Centros de Custo) ----------------
  D.analitica = function () {
    const C = AY.contab; const mp = C.analiticaMapa({}), t = mp.totais;
    const centros = C.centrosAtivos();
    const classificado = mp.linhas.filter(l => l.codigo !== "—");
    const semCentro = mp.linhas.find(l => l.codigo === "—");
    const topCusto = classificado.filter(l => l.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 6).map(l => ({ label: l.nome, valor: l.saldo, cor: "var(--pink)" }));
    const donut = AY.chartDonut(classificado.filter(l => l.saldo > 0).map(l => ({ label: l.nome, valor: l.saldo })),
      { centro: kz(t.saldo).replace(/ Kz$/, ""), centroSub: "Custo líquido" });
    const rows = classificado.map(l => ({ t: l.nome, s: l.n + " linha(s)", v: kz(l.saldo) }));
    const pctSemCentro = t.debito ? Math.round(((semCentro ? semCentro.debito : 0) / t.debito) * 100) : 0;
    return hero("Contabilidade Analítica", "Painel de Centros de Custo", "Custos e proveitos (classes 6/7) imputados por centro de responsabilidade.", [
      { k: "Custo Líquido Total", v: kz(t.saldo) }, { k: "Centros Activos", v: String(centros.length) }, { k: "Sem Centro", v: pctSemCentro + "%" },
    ])
      + kpis([
        ["Custo Líquido Total", kz(t.saldo), "débito " + kz(t.debito) + " − crédito " + kz(t.credito), "var(--pink)"],
        ["Centros de Custo", String(centros.length), "activos", "var(--blue)"],
        ["Maior Centro", topCusto.length ? topCusto[0].label : "—", topCusto.length ? kz(topCusto[0].valor) : "", "var(--indigo)"],
        ["Não Classificado", semCentro ? kz(semCentro.saldo) : kz(0), pctSemCentro + "% do débito total", pctSemCentro > 10 ? "var(--chart-amber)" : "var(--chart-teal)"],
      ])
      + `<div class="dash-grid cols-3">${AY.chartCard("Maiores Centros de Custo", topCusto.length ? AY.chartBars(topCusto) : `<div class="empty">Sem custos imputados.</div>`)}${AY.chartCard("Distribuição por Centro", donut)}</div>`
      + `<div class="dash-grid" style="margin-top:14px">${AY.chartCard("Custo por Centro", lista(rows, "Sem lançamentos classificados por centro."), "Mapa de Custos")}</div>`;
  };

  function render(modulo, el) {
    if (!el) return;
    try { el.innerHTML = (D[modulo] || (() => `<div class="empty">Painel indisponível.</div>`))(); }
    catch (e) { console.error("dash render " + modulo, e); el.innerHTML = `<div class="alert alert-error">Não foi possível gerar o painel: ${E(e.message)}</div>`; }
  }
  AY.dash = { render, D };
})(window);
