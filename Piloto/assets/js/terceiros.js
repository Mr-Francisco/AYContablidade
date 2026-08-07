/* SGD — Ficha de Terceiro (Cliente / Fornecedor) estilo Primavera, com separadores.
 * Componente reutilizável: renderFicha(cfg) gera lista + ficha com abas a partir de uma "store" injetada. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("terceiros.js: AY não carregado."); return; }
  const E = AY.escapeHtml;

  const PROVINCIAS = ["", "Bengo", "Benguela", "Bié", "Cabinda", "Cuando Cubango", "Cuanza Norte", "Cuanza Sul", "Cunene", "Huambo", "Huíla", "Luanda", "Lunda Norte", "Lunda Sul", "Malanje", "Moxico", "Namibe", "Uíge", "Zaire"];

  // Separadores e campos (modelo Ficha de Cliente/Fornecedor do Primavera)
  const TABS = [
    { id: "moradas", label: "Moradas", campos: [
      { k: "morada", l: "Morada", full: true }, { k: "morada2", l: "Morada (continuação)", full: true },
      { k: "localidade", l: "Localidade" }, { k: "codigoPostal", l: "Código Postal" },
      { k: "provincia", l: "Província", t: "prov" }, { k: "pais", l: "País" },
      { k: "telefone", l: "Telefone" }, { k: "telefone2", l: "Telefone 2" },
      { k: "fax", l: "Fax" }, { k: "email", l: "E-mail", t: "email" },
      { k: "web", l: "Endereço Web", full: true },
      { k: "tipoTerceiro", l: "Tipo de Terceiro", t: "sel", opts: ["Cliente", "Fornecedor", "Cliente e Fornecedor", "Outro"] },
    ] },
    { id: "fiscais", label: "Dados Fiscais", campos: [
      { k: "nif", l: "NIF (Contribuinte)" },
      { k: "regimeIVA", l: "Regime de IVA", t: "sel", opts: ["Regime Geral", "Regime Simplificado", "Regime de Exclusão / Não Sujeição"] },
      { k: "isentoIVA", l: "Isento de IVA", t: "sel", opts: ["Não", "Sim"] },
      { k: "retencaoFonte", l: "Sujeito a retenção na fonte", t: "sel", opts: ["Não", "Sim"] },
      { k: "reparticaoFiscal", l: "Repartição Fiscal" },
    ] },
    { id: "bancos", label: "Bancos", campos: [
      { k: "banco", l: "Banco" }, { k: "iban", l: "IBAN", full: true }, { k: "swift", l: "SWIFT / BIC" },
    ] },
    { id: "comerciais", label: "Dados Comerciais", campos: [
      { k: "condicoesPagamento", l: "Condições de pagamento", t: "sel", opts: ["Pronto pagamento", "15 dias", "30 dias", "60 dias", "90 dias"] },
      { k: "descontoComercial", l: "Desconto comercial (%)", t: "num" },
      { k: "moeda", l: "Moeda", t: "sel", opts: ["AKZ", "USD", "EUR"] },
      { k: "responsavel", l: "Vendedor / Comprador habitual" },
    ] },
    { id: "credito", label: "Crédito", campos: [
      { k: "limiteCredito", l: "Limite de crédito", t: "num" }, { k: "diasCredito", l: "Dias de crédito", t: "num" },
      { k: "estado", l: "Estado", t: "sel", opts: [["activo", "Activo"], ["inactivo", "Inactivo / Anulado"]] },
    ] },
    { id: "conta", label: "Contabilidade", campos: [
      { k: "conta", l: "Conta corrente", t: "conta" },
    ] },
    { id: "obs", label: "Observações", campos: [
      { k: "observacoes", l: "Observações", full: true },
    ] },
  ];
  const CAMPOS = TABS.reduce((a, t) => a.concat(t.campos), []);

  function fieldHTML(f) {
    const id = "tf_" + f.k; const cls = f.full ? " full" : "";
    if (f.k === "nif") return `<label class="${cls}">${E(f.l)}<div class="f4-group"><input id="${id}"><button type="button" class="f4-btn" id="btnNif" title="Consultar NIF">🔍</button></div></label>`;
    let input;
    if (f.t === "sel") input = `<select id="${id}">` + f.opts.map(o => Array.isArray(o) ? `<option value="${E(o[0])}">${E(o[1])}</option>` : `<option>${E(o)}</option>`).join("") + `</select>`;
    else if (f.t === "prov") input = `<select id="${id}">` + PROVINCIAS.map(p => `<option value="${E(p)}">${E(p || "—")}</option>`).join("") + `</select>`;
    else if (f.t === "num") input = `<input type="number" step="0.01" min="0" id="${id}">`;
    else if (f.t === "conta") input = `<input id="${id}" list="tercContas" placeholder="Ex.: 31121">`;
    else if (f.t === "email") input = `<input type="email" id="${id}">`;
    else input = `<input id="${id}">`;
    return `<label class="${cls}">${E(f.l)}${input}</label>`;
  }

  function renderFicha(cfg) {
    const store = cfg.store, tipo = cfg.tipo || "cliente", ehCliente = tipo === "cliente";
    const rotulo = ehCliente ? "cliente" : "fornecedor", Rotulo = ehCliente ? "Cliente" : "Fornecedor";
    const contaPrefixo = cfg.contaPrefixo || (ehCliente ? "31" : "32");
    const podeGerir = AY.can(cfg.gerirCap || "comercial.gerir");
    const root = cfg.root || document.getElementById("terc");
    let editId = null;

    // ---- estrutura da página ----
    root.innerHTML = `
      <div class="card">
        <div class="toolbar"><input type="search" id="tercBusca" placeholder="Pesquisar ${rotulo}…" class="grow"><button class="btn btn-amber" id="tercNovo">+ Novo ${rotulo}</button></div>
        <div class="table-wrap" id="tercTabela"></div>
      </div>`;

    // ---- modal ----
    const tabsBtns = TABS.map((t, i) => `<button type="button" class="ficha-tab ${i === 0 ? "active" : ""}" data-tab="${t.id}">${E(t.label)}</button>`).join("");
    const panes = TABS.map((t, i) => `<div class="ficha-pane grid-2 ${i === 0 ? "" : "hidden"}" data-pane="${t.id}">${t.campos.filter(f => !(f.k === "responsavel" && !ehCliente)).map(fieldHTML).join("")}</div>`).join("");
    const modal = document.createElement("div");
    modal.className = "modal-backdrop hidden"; modal.id = "tercModal";
    modal.innerHTML = `<div class="modal" style="max-width:820px">
      <div class="modal-head"><b id="tercTitulo">Novo ${rotulo}</b><button class="icon-btn" id="tercFechar">✕</button></div>
      <div class="ficha-topo"><label>Nome / Designação<input id="tf_nome" required></label><label>Nº (código)<input id="tf_numero" placeholder="(automático)"></label></div>
      <div class="ficha-tabs">${tabsBtns}</div>
      <form id="tercForm">${panes}
        <div id="tercErro" class="alert alert-error hidden"></div>
        <div class="modal-actions"><button type="button" class="btn btn-outline" id="tercCancelar">Cancelar</button><button class="btn btn-primary" type="submit">Gravar</button></div>
      </form></div>`;
    document.body.appendChild(modal);

    let dl = document.getElementById("tercContas");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "tercContas"; document.body.appendChild(dl); }
    dl.innerHTML = AY.contab.contasMovimento().filter(c => c.codigo.startsWith(contaPrefixo)).map(c => `<option value="${E(c.codigo)}">${E(c.codigo)} · ${E(c.nome)}</option>`).join("");

    const DEFAULTS = { pais: "Angola", provincia: "Luanda", tipoTerceiro: ehCliente ? "Cliente" : "Fornecedor", regimeIVA: "Regime Geral",
      isentoIVA: "Não", retencaoFonte: "Não", condicoesPagamento: "30 dias", moeda: "AKZ", estado: "activo", conta: contaPrefixo + "121",
      descontoComercial: 0, limiteCredito: 0, diasCredito: 30 };

    function q(id) { return document.getElementById(id); }
    function activarTab(id) {
      modal.querySelectorAll(".ficha-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
      modal.querySelectorAll(".ficha-pane").forEach(p => p.classList.toggle("hidden", p.dataset.pane !== id));
    }
    modal.querySelectorAll(".ficha-tab").forEach(b => b.onclick = () => activarTab(b.dataset.tab));

    // Consulta de NIF (AGT DS-120 se configurada, senão local)
    const btnNif = modal.querySelector("#btnNif");
    if (btnNif) btnNif.onclick = async () => {
      if (!AY.nif) return;
      const antes = btnNif.textContent; btnNif.textContent = "…"; btnNif.disabled = true;
      try {
        const r = await AY.nif.consultar(q("tf_nif").value);
        if (!r.valido) { AY.toast(r.msg, "info"); return; }
        if (r.encontrado) {
          if (q("tf_nome")) q("tf_nome").value = r.nome || q("tf_nome").value;
          if (r.morada && q("tf_morada")) q("tf_morada").value = r.morada;
          if (r.localidade && q("tf_localidade")) q("tf_localidade").value = r.localidade;
          if (r.provincia && q("tf_provincia")) q("tf_provincia").value = r.provincia;
          if (r.telefone && q("tf_telefone")) q("tf_telefone").value = r.telefone;
          if (r.regimeFicha && q("tf_regimeIVA")) q("tf_regimeIVA").value = r.regimeFicha;
          AY.toast((r.fonte === "AGT" ? "AGT · " : "") + (r.restrito ? r.msg : "NIF encontrado — " + r.nome) + (r.avisoAGT ? " · " + r.avisoAGT : ""), r.restrito ? "info" : "success");
        } else AY.toast(r.msg + (r.avisoAGT ? " · " + r.avisoAGT : ""), "info");
      } catch (e) { AY.toast("Erro na consulta: " + e.message, "info"); }
      finally { btnNif.textContent = antes; btnNif.disabled = false; }
    };

    function render() {
      const busca = (q("tercBusca").value || "").toLowerCase().trim();
      let rows = store.list();
      if (busca) rows = rows.filter(c => ((c.nome || "") + " " + (c.nif || "") + " " + (c.localidade || "")).toLowerCase().includes(busca));
      q("tercTabela").innerHTML = rows.length ? `<table>
        <thead><tr><th>Nº</th><th>Nome</th><th>NIF</th><th>Localidade</th><th>Telefone</th><th>Conta</th><th>Estado</th>${podeGerir ? "<th></th>" : ""}</tr></thead>
        <tbody>${rows.map(c => `<tr>
          <td><b>${E(c.numero || "—")}</b></td><td><b>${E(c.nome)}</b></td><td>${E(c.nif || "—")}</td><td>${E(c.localidade || "—")}</td><td>${E(c.telefone || "—")}</td>
          <td>${c.conta ? `<a href="extrato.html?conta=${E(c.conta)}" class="brand-text">${E(c.conta)}</a>` : "—"}</td>
          <td>${c.estado === "inactivo" ? AY.badge("Inactivo", "#8a8a8a") : AY.badge("Activo", "#16a085")}</td>
          ${podeGerir ? `<td class="num"><button class="btn btn-sm btn-outline" data-edit="${c.id}">Editar</button> <button class="btn btn-sm btn-outline" data-del="${c.id}">✕</button></td>` : ""}
        </tr>`).join("")}</tbody></table>` : `<div class="empty">Sem ${rotulo}es registados.</div>`;
      q("tercTabela").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => abrir(b.dataset.edit));
      q("tercTabela").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const c = store.get(b.dataset.del); if (confirm("Eliminar " + c.nome + "?")) { store.remove(b.dataset.del); render(); } });
    }
    function abrir(id) {
      editId = id || null; const c = id ? store.get(id) : null;
      q("tercTitulo").textContent = c ? "Ficha — " + c.nome : "Novo " + rotulo;
      q("tf_nome").value = c ? (c.nome || "") : ""; q("tf_numero").value = c ? (c.numero || "") : "";
      CAMPOS.forEach(f => { const el = q("tf_" + f.k); if (!el) return; let v = c ? c[f.k] : undefined; if (v == null || v === "") v = c ? (v || "") : (DEFAULTS[f.k] != null ? DEFAULTS[f.k] : ""); el.value = v; });
      q("tercErro").classList.add("hidden"); activarTab("moradas"); modal.classList.remove("hidden");
    }
    q("tercNovo").onclick = () => abrir(null);
    q("tercNovo").style.display = podeGerir ? "" : "none";
    q("tercFechar").onclick = () => modal.classList.add("hidden");
    q("tercCancelar").onclick = () => modal.classList.add("hidden");
    q("tercBusca").oninput = render;
    q("tercForm").onsubmit = e => {
      e.preventDefault(); const err = q("tercErro");
      const nome = q("tf_nome").value.trim(); if (!nome) { err.textContent = "Indica o nome / designação."; err.classList.remove("hidden"); return; }
      const obj = { id: editId, nome: nome, numero: q("tf_numero").value.trim() };
      CAMPOS.forEach(f => { const el = q("tf_" + f.k); if (!el) return; obj[f.k] = f.t === "num" ? (Number(el.value) || 0) : (typeof el.value === "string" ? el.value.trim() : el.value); });
      store.save(obj);
      modal.classList.add("hidden"); render(); AY.toast(Rotulo + " guardado.", "success");
    };
    render();
  }

  AY.terceiros = { renderFicha, TABS, CAMPOS, PROVINCIAS };
})(window);
