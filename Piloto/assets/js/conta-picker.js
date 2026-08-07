/* SGD — Seletor de Conta em árvore, reutilizável.
 * Mesma estrutura hierárquica do Plano de Contas (classes → integradoras → subcontas),
 * usada em qualquer campo "Conta" da aplicação. Uso típico:
 *   AY.contaPicker.attach(inputEl, { soMovimento: true })   // liga F4 + duplo clique
 *   AY.contaPicker.abrir(inputEl, { soMovimento: false })   // abre diretamente
 */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("conta-picker.js: AY não carregado."); return; }
  const E = AY.escapeHtml;

  let modal = null, elBusca, elLista, elTitulo, elAviso;
  const expandido = new Set();
  let jaIniciado = false, alvo = null, opcoesAtuais = {};

  function garantirModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal-backdrop hidden";
    modal.id = "contaPickerModal";
    modal.innerHTML = `<div class="modal" style="max-width:720px">
      <div class="modal-head"><b id="cpTitulo">Plano de Contas — escolher conta</b><button type="button" class="icon-btn" id="cpFechar">✕</button></div>
      <input type="search" id="cpBusca" placeholder="Pesquisar por código ou nome… (Enter escolhe · Esc fecha)" style="width:100%;margin-bottom:8px">
      <div class="table-wrap" style="max-height:56vh;overflow:auto">
        <table class="pc-tree"><thead><tr><th style="width:30%">Código</th><th>Designação</th><th style="width:100px">Natureza</th><th style="width:110px">Tipo</th></tr></thead>
        <tbody id="cpLista"></tbody></table>
      </div>
      <p class="sub" id="cpAviso" style="margin-top:8px"></p>
    </div>`;
    document.body.appendChild(modal);
    elBusca = modal.querySelector("#cpBusca"); elLista = modal.querySelector("#cpLista");
    elTitulo = modal.querySelector("#cpTitulo"); elAviso = modal.querySelector("#cpAviso");
    modal.querySelector("#cpFechar").onclick = fechar;
    modal.addEventListener("click", e => { if (e.target === modal) fechar(); });
    elBusca.oninput = () => desenhar(elBusca.value);
    elBusca.addEventListener("keydown", e => {
      if (e.key === "Escape") fechar();
      else if (e.key === "Enter") { e.preventDefault(); const first = elLista.querySelector("[data-sel]"); if (first) escolher(first.dataset.sel); }
    });
  }

  function construirArvore(todas) {
    const byCode = new Map(); todas.forEach(c => byCode.set(c.codigo, c));
    const sorted = todas.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)); // string: 3431 sob 343
    const children = new Map(), rootsByClass = {};
    sorted.forEach(c => {
      let parent = null;
      for (let len = c.codigo.length - 1; len >= 1; len--) { const p = c.codigo.slice(0, len); if (byCode.has(p)) { parent = byCode.get(p); break; } }
      if (parent) { if (!children.has(parent.codigo)) children.set(parent.codigo, []); children.get(parent.codigo).push(c); }
      else (rootsByClass[c.codigo[0]] = rootsByClass[c.codigo[0]] || []).push(c);
    });
    return { byCode, children, rootsByClass };
  }

  function natLabel(n) { return n === "C" ? AY.badge("Credora", "#c0392b") : n === "M" ? AY.badge("Mista", "#8a8a8a") : AY.badge("Devedora", "#16a085"); }

  function desenhar(q) {
    const C = AY.contab;
    q = (q || "").toLowerCase().trim();
    const todas = C.contas();
    const arvore = construirArvore(todas);
    const restringirMovimento = opcoesAtuais.soMovimento !== false; // por omissão: só contas de movimento são escolhíveis
    if (!jaIniciado) { jaIniciado = true; Object.keys(arvore.rootsByClass).forEach(cl => expandido.add("cls-" + cl)); arvore.children.forEach((_, cod) => expandido.add(cod)); }
    let visibleSet = null, expandAll = false;
    if (q) {
      visibleSet = new Set(); expandAll = true;
      todas.forEach(c => {
        if (!(c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q))) return;
        let cur = c; while (cur) { visibleSet.add(cur.codigo); let p = null; for (let len = cur.codigo.length - 1; len >= 1; len--) { const pp = cur.codigo.slice(0, len); if (arvore.byCode.has(pp)) { p = arvore.byCode.get(pp); break; } } cur = p; }
      });
    }
    function rowHTML(c) {
      const filhos = arvore.children.get(c.codigo); const temF = !!(filhos && filhos.length);
      const aberto = expandido.has(c.codigo), mov = C.ehMovimento(c, todas);
      const selecionavel = mov || !restringirMovimento;
      const caret = temF ? `<span class="pc-caret" data-toggle="${E(c.codigo)}">${aberto ? "▾" : "▸"}</span>` : `<span class="pc-caret pc-leaf">·</span>`;
      const cod = temF ? `<b>${E(c.codigo)}</b>` : E(c.codigo), nome = temF ? `<b>${E(c.nome)}</b>` : E(c.nome);
      return `<tr class="pc-node${temF ? " pc-parent" : ""}${selecionavel ? "" : " pc-disabled"}"${selecionavel ? ` data-sel="${E(c.codigo)}"` : ""} title="${selecionavel ? "Escolher esta conta" : "Integradora — não recebe lançamentos, escolhe uma subconta"}">
        <td><span class="pc-code">${caret} ${cod}</span></td>
        <td>${nome}</td>
        <td>${natLabel(c.natureza)}</td>
        <td>${mov ? AY.badge("Movimento", "#2980b9") : AY.badge("Integração", "#8a8a8a")}</td>
      </tr>`;
    }
    const out = [];
    function walk(c) {
      if (visibleSet && !visibleSet.has(c.codigo)) return;
      out.push(rowHTML(c));
      const filhos = arvore.children.get(c.codigo) || [];
      if (filhos.length && (expandAll || expandido.has(c.codigo))) filhos.forEach(walk);
    }
    Object.keys(C.CLASSES).forEach(cl => {
      const roots = (arvore.rootsByClass[cl] || []).filter(c => !visibleSet || visibleSet.has(c.codigo));
      if (!roots.length) return;
      const nClasse = todas.filter(c => c.codigo[0] === cl).length;
      const aberta = q ? true : expandido.has("cls-" + cl);
      out.push(`<tr class="pc-classe" data-cls="${cl}"><td colspan="4"><span class="pc-caret">${aberta ? "▾" : "▸"}</span> <b>${cl} · ${E((C.CLASSES[cl] || {}).nome || "")}</b> <small class="sub">— ${nClasse} conta(s)</small></td></tr>`);
      if (aberta) roots.forEach(walk);
    });
    elLista.innerHTML = out.length ? out.join("") : `<tr><td colspan="4" class="empty">Sem contas para "${E(q)}".</td></tr>`;
    elLista.querySelectorAll(".pc-classe").forEach(tr => tr.onclick = () => { const cl = tr.dataset.cls; if (expandido.has("cls-" + cl)) expandido.delete("cls-" + cl); else expandido.add("cls-" + cl); desenhar(elBusca.value); });
    elLista.querySelectorAll("[data-toggle]").forEach(s => s.onclick = e => { e.stopPropagation(); const cod = s.dataset.toggle; if (expandido.has(cod)) expandido.delete(cod); else expandido.add(cod); desenhar(elBusca.value); });
    elLista.querySelectorAll("[data-sel]").forEach(tr => tr.onclick = () => escolher(tr.dataset.sel));
    elLista.querySelectorAll(".pc-node.pc-disabled").forEach(tr => tr.onclick = e => { const t = tr.querySelector("[data-toggle]"); if (t) t.click(); });
  }

  function escolher(codigo) {
    fechar();
    if (alvo) {
      alvo.value = codigo;
      alvo.dispatchEvent(new Event("input", { bubbles: true }));
      alvo.dispatchEvent(new Event("change", { bubbles: true }));
      alvo.focus();
    }
    if (opcoesAtuais.onEscolher) opcoesAtuais.onEscolher(codigo);
  }

  function fechar() { if (modal) modal.classList.add("hidden"); }

  function abrir(input, opts) {
    garantirModal();
    alvo = input || null; opcoesAtuais = opts || {};
    elTitulo.textContent = opcoesAtuais.titulo || "Plano de Contas — escolher conta";
    elAviso.textContent = opcoesAtuais.soMovimento === false
      ? "Podes escolher qualquer conta (integradora ou de movimento)."
      : "Só contas de movimento podem ser escolhidas — clica numa integradora para expandir.";
    elBusca.value = "";
    desenhar("");
    modal.classList.remove("hidden");
    setTimeout(() => elBusca.focus(), 30);
  }

  // Liga F4 + duplo clique a um input, para abrir o seletor sem código extra em cada página.
  function attach(input, opts) {
    if (!input) return;
    input.addEventListener("keydown", e => { if (e.key === "F4") { e.preventDefault(); abrir(input, opts); } });
    input.addEventListener("dblclick", () => abrir(input, opts));
  }

  AY.contaPicker = { abrir, attach };
})(window);
