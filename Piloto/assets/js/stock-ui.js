/* SGD — UI partilhada de movimentos de stock (Receção, Expedição, Transferência, Inventariação). */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) return;
  const E = AY.escapeHtml, m2 = AY.formatMoeda2;

  // ajuste_pos / ajuste_neg: acertos de stock com direção fixa (documentos 903/904 dedicados) —
  // por baixo usam sempre o tipo de movimento "ajuste"; só a UI e o sinal da quantidade mudam.
  const DIRECAO_FIXA = { ajuste_pos: 1, ajuste_neg: -1 };
  function renderMov(cfg) {
    const L = AY.log, dirFixa = DIRECAO_FIXA[cfg.tipo] || null, tipoReal = dirFixa ? "ajuste" : cfg.tipo;
    const td = L.tipoMov(tipoReal), root = document.getElementById(cfg.root || "mov");
    const nome = dirFixa === 1 ? "Acerto de Stock Positivo" : dirFixa === -1 ? "Acerto de Stock Negativo" : td.nome;
    const cor = dirFixa === 1 ? "#16a085" : dirFixa === -1 ? "#c0392b" : td.cor;
    const podeGerir = AY.can("logistica.gerir");
    const isTransf = td.cod === "transferencia", isEntrada = td.cod === "entrada", isAjuste = td.cod === "ajuste", isSaida = td.cod === "saida";
    let editArtigo = null;

    root.innerHTML = `
      <div class="grid-4" id="mkpis" style="margin-bottom:16px"></div>
      <div class="card">
        <div class="toolbar"><input type="search" id="mBusca" placeholder="Pesquisar…" class="grow"><button class="btn btn-amber" id="mNovo">+ ${E(nome)}</button></div>
        <div class="table-wrap" id="mTabela"></div>
      </div>`;

    const modal = document.createElement("div");
    modal.className = "modal-backdrop hidden"; modal.id = "mModal";
    modal.innerHTML = `<div class="modal" style="max-width:620px">
      <div class="modal-head"><b>${E(nome)}</b><button class="icon-btn" id="mFechar">✕</button></div>
      <form id="mForm"><div class="grid-2">
        <label style="grid-column:1/-1">Artigo<select id="mArtigo" required></select></label>
        <label>${isTransf ? "Armazém de origem" : "Armazém"}<select id="mArmazem" required></select></label>
        <label id="mwDestino" style="${isTransf ? "" : "display:none"}">Armazém de destino<select id="mDestino"></select></label>
        <label>Data<input type="date" id="mData"></label>
        <label>Quantidade${isAjuste && !dirFixa ? " (± ajuste)" : ""}<input type="number" id="mQtd" step="0.001" min="0"></label>
        <label id="mwCusto" style="${isSaida || isTransf || dirFixa === -1 ? "display:none" : ""}">Custo unitário<input type="number" id="mCusto" step="0.01" min="0"></label>
        <label id="mwEntidade" style="${isEntrada ? "" : "display:none"}">Fornecedor<input id="mEntidade"></label>
        <label>Documento<input id="mDoc" placeholder="(ref.)"></label>
        <label style="grid-column:1/-1">Descrição<input id="mDesc"></label>
      </div>
      <div id="mResumo" class="cc-resumo" style="justify-content:flex-end;margin-top:8px"></div>
      <div id="mErro" class="alert alert-error hidden" style="margin-top:8px"></div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="mCancelar">Cancelar</button><button class="btn btn-primary" type="submit">Registar</button></div>
      </form></div>`;
    document.body.appendChild(modal);
    const g = id => document.getElementById(id);

    function encher() {
      g("mArtigo").innerHTML = `<option value="">— Artigo —</option>` + L.artigos().filter(a => a.estado !== "inactivo").map(a => `<option value="${a.id}">${E(a.codigo)} · ${E(a.descricao)}</option>`).join("");
      const whs = L.armazens().map(w => `<option value="${w.id}">${E(w.codigo)} · ${E(w.nome)}</option>`).join("");
      g("mArmazem").innerHTML = whs; g("mDestino").innerHTML = whs;
    }
    function resumo() {
      const a = L.artigo(g("mArtigo").value); if (!a) { g("mResumo").innerHTML = ""; return; }
      const armId = g("mArmazem").value || null;
      // Saída, transferência e acerto negativo saem sempre ao CUMP corrente do armazém — nunca editável.
      const usaCump = isSaida || isTransf || dirFixa === -1;
      const cu = usaCump ? L.custoMedio(a.id, armId) : (Number(g("mCusto").value) || 0);
      const qtd = Number(g("mQtd").value) || 0;
      const disp = armId ? L.stock(a.id, armId) : L.stockTotal(a.id);
      if (dirFixa === -1 && qtd > disp) { g("mResumo").innerHTML = `<span style="color:var(--danger)">Stock insuficiente no armazém (${disp} ${E(a.unidade || "")})</span>`; return; }
      g("mResumo").innerHTML = `<span>Stock atual <b>${disp} ${E(a.unidade || "")}</b></span>${usaCump ? `<span>CUMP do armazém <b>${m2(cu)}</b></span>` : ""}<span>Valor <b>${m2(Math.abs(qtd) * cu)}</b></span>`;
    }
    function movBate(m) {
      if (!dirFixa) return m.tipo === td.cod;
      return m.tipo === "ajuste" && Math.sign(Number(m.qtd) || 0) === dirFixa;
    }
    function render() {
      const q = (g("mBusca").value || "").toLowerCase().trim();
      let rows = L.movimentos().filter(movBate).sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      if (q) rows = rows.filter(m => ((m.numero || "") + " " + (m.artigoDesc || "")).toLowerCase().includes(q));
      const totalQ = rows.reduce((s, m) => s + Math.abs(Number(m.qtd) || 0), 0), totalV = rows.reduce((s, m) => s + (Number(m.valor) || 0), 0);
      g("mkpis").innerHTML = [
        AY.kpi(nome + " (nº)", rows.length, "movimentos", cor),
        AY.kpi("Quantidade", AY.round2(totalQ), "unidades", "var(--chart-blue)"),
        AY.kpi("Valor", AY.formatKz(totalV), "custo", "#8e44ad"),
        AY.kpi("Valor de stock", AY.formatKz(L.valorStock()), "total", "#16a085"),
      ].join("");
      g("mTabela").innerHTML = rows.length ? `<table>
        <thead><tr><th>Nº</th><th>Data</th><th>Artigo</th><th>${isTransf ? "Origem → Destino" : "Armazém"}</th><th class="num">Qtd</th><th class="num">Valor</th><th>Lanç.</th>${podeGerir ? "<th></th>" : ""}</tr></thead>
        <tbody>${rows.map(m => { const wo = L.armazem(m.armazemId) || {}, wd = L.armazem(m.armazemDestino) || {};
          return `<tr>
          <td><b>${E(m.numero)}</b></td><td>${AY.formatDate(m.data)}</td><td>${E(m.artigoDesc)}</td>
          <td><small>${E(wo.codigo || "—")}${isTransf ? " → " + E(wd.codigo || "—") : ""}</small></td>
          <td class="num">${Math.abs(m.qtd)} ${E(m.unidade || "")}</td><td class="num">${m2(m.valor)}</td>
          <td>${m.numeroOp ? `<a href="movimentos.html?id=${E(m.lancamentoId)}" class="brand-text">${E(m.numeroOp)}</a>` : "—"}</td>
          ${podeGerir ? `<td class="num"><button class="btn btn-sm btn-outline" data-del="${m.id}">✕</button></td>` : ""}
        </tr>`; }).join("")}</tbody></table>` : `<div class="empty">Sem ${nome.toLowerCase()} registada.</div>`;
      g("mTabela").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (confirm("Anular este movimento? (não reverte o lançamento contabilístico)")) { L.removeMovimento(b.dataset.del); render(); } });
    }
    function abrir() { encher(); g("mData").value = AY.hojeData(); ["mQtd", "mCusto", "mEntidade", "mDoc", "mDesc"].forEach(id => g(id).value = ""); g("mErro").classList.add("hidden"); resumo(); modal.classList.remove("hidden"); }
    g("mNovo").onclick = abrir; g("mNovo").style.display = podeGerir ? "" : "none";
    g("mFechar").onclick = () => modal.classList.add("hidden"); g("mCancelar").onclick = () => modal.classList.add("hidden");
    g("mBusca").oninput = render;
    ["mArtigo", "mArmazem", "mQtd", "mCusto"].forEach(id => g(id).addEventListener("input", () => { if (id === "mArtigo") { const a = L.artigo(g("mArtigo").value); if (a && !isSaida && !isTransf && dirFixa !== -1) g("mCusto").value = a.precoCompra; } resumo(); }));
    g("mForm").onsubmit = e => {
      e.preventDefault(); const err = g("mErro");
      const qtdAbs = Number(g("mQtd").value) || 0;
      try {
        L.registarMovimento({ tipo: td.cod, artigoId: g("mArtigo").value, armazemId: g("mArmazem").value, armazemDestino: isTransf ? g("mDestino").value : null,
          data: g("mData").value, qtd: dirFixa ? qtdAbs * dirFixa : qtdAbs, custoUnit: g("mCusto").value !== "" ? Number(g("mCusto").value) : null,
          entidade: g("mEntidade").value.trim(), documento: g("mDoc").value.trim(), descricao: g("mDesc").value.trim() });
        modal.classList.add("hidden"); render(); AY.toast(nome + " registada.", "success");
      } catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); }
    };
    render();
  }

  AY.stockUI = { renderMov };
})(window);
