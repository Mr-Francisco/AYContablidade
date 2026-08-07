/* SGD — Renderização do documento legal (fatura / recibo / nota…) no modelo SGD.
 * Partilhado por vendas.html (emissão) e consulta-faturas.html (consulta). Requer AY.com. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) return;
  const E = AY.escapeHtml, m2 = AY.formatMoeda2;

  function pseudoQR(seed) {
    const N = 21, cell = 4, pad = 8, dim = N * cell + pad * 2; let rects = "";
    function h(i) { let x = 2166136261; const s = (seed || "x") + ":" + i; for (let k = 0; k < s.length; k++) x = ((x ^ s.charCodeAt(k)) * 16777619) >>> 0; return (x % 1000) / 1000; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if ((x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9)) continue;
      if (h(y * N + x) > 0.5) rects += `<rect x="${pad + x * cell}" y="${pad + y * cell}" width="${cell}" height="${cell}"/>`;
    }
    function finder(ox, oy) { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const on = (x === 0 || x === 6 || y === 0 || y === 6) || (x >= 2 && x <= 4 && y >= 2 && y <= 4); if (on) rects += `<rect x="${pad + (ox + x) * cell}" y="${pad + (oy + y) * cell}" width="${cell}" height="${cell}"/>`; } }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    return `<svg class="doc-qr" viewBox="0 0 ${dim} ${dim}" width="92" height="92"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
  }

  function valorExtenso(v) {
    v = Math.round((Number(v) || 0) * 100) / 100; const inteiro = Math.floor(v), cent = Math.round((v - inteiro) * 100);
    const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
    const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
    function ate999(x) { if (x === 0) return ""; if (x === 100) return "cem"; const ce = Math.floor(x / 100), r = x % 100; let s = []; if (ce) s.push(c[ce]); if (r) { if (r < 20) s.push(u[r]); else { const de = Math.floor(r / 10), un = r % 10; s.push(d[de] + (un ? " e " + u[un] : "")); } } return s.join(" e "); }
    function grupos(n) { if (n === 0) return "zero"; const partes = []; const mi = Math.floor(n / 1000000), mil = Math.floor((n % 1000000) / 1000), r = n % 1000;
      if (mi) partes.push(ate999(mi) + (mi === 1 ? " milhão" : " milhões"));
      if (mil) partes.push(mil === 1 ? "mil" : ate999(mil) + " mil");
      if (r) partes.push(ate999(r));
      return partes.join(" e "); }
    let s = grupos(inteiro) + " " + (inteiro === 1 ? "kwanza" : "kwanzas");
    if (cent) s += " e " + grupos(cent) + " " + (cent === 1 ? "cêntimo" : "cêntimos");
    return s.toUpperCase();
  }

  function render(v) {
    const M = AY.com, emp = AY.getEmpresa();
    const td = M.tipoDoc(v.tipoDoc || "FT"), cl = M.cliente(v.clienteId) || {}, c2 = M.cfg();
    const oper = (AY.currentUser() || {}).nome || "—";
    const hora = v.emitidoEm ? new Date(v.emitidoEm).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "";
    const codVal = v.codigoValidacao || M.codigoValidacao(v);
    const tes = (AY.getConfig().tesouraria || []).filter(t => t.tipo === "banco" && (t.iban || t.nome));
    const bancos = tes.length ? tes.map(t => t.nome + (t.iban ? " " + t.iban : "")).join(" · ") : (emp.bancos || "").trim();
    const fat = Object.assign({ modo: "eletronica", software: c2.softwareValidacao || "SGD", versao: "", certificado: "" }, (AY.getConfig().faturacao || {}));
    const swLinha = (fat.software || "SGD") + (fat.versao ? " " + fat.versao : "") + (fat.certificado ? " · " + fat.certificado : "");
    const modoNota = fat.modo === "saft" ? "Comunicação por SAF-T (AO) à AGT." : fat.modo === "ambos" ? "Faturação eletrónica (QR) + SAF-T." : "Faturação eletrónica — comunicada em tempo real à AGT.";
    const linhas = (v.linhas || []).map((l, i) => `<tr>
      <td>${String(i + 1).padStart(3, "0")}</td><td>${E(l.descricao)}</td>
      <td class="num">${m2(l.preco)}</td><td class="num">${l.qtd}</td><td>${E(l.unidade || "UN")}</td>
      <td class="num">0,00</td><td class="num">${td.iva ? v.ivaPerc + "%" : "—"}</td><td class="num">${m2(l.total)}</td>
    </tr>`).join("");
    return `<div class="doc-legal doc-fatura" id="docLegal">
      <div class="doc-top">
        <div class="doc-emp"><div class="de-logo">${E((emp.nome || "AY").replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase())}</div>
          <div class="de-txt"><b>${E(emp.nome || "A Minha Empresa, Lda.")}</b>
            <span>${E(emp.morada || emp.localizacao || "")}</span><span>NIF: ${E(emp.nif || "—")}</span>
            ${emp.telefone ? `<span>Telefone: ${E(emp.telefone)}</span>` : ""}${emp.email ? `<span>Email: ${E(emp.email)}</span>` : ""}</div>
        </div>
        <div class="doc-tit"><div class="dt-nome">${E(td.nome)}</div><div class="dt-num">${E(v.numero || "(rascunho)")}</div>
          <span class="dt-orig">${td.fiscal === false ? "Não fiscal" : "Original"}</span></div>
      </div>
      <div class="doc-cli-meta">
        <div class="dcm-cli"><div class="dc-k">Exmo.(s) Sr.(s)</div><b>${E(cl.nome || v.clienteNome || "Consumidor final")}</b>
          <div>NIF: ${E(cl.nif || "—")}</div><div>${E(cl.morada || cl.localidade || "—")}</div>${cl.telefone ? `<div>${E(cl.telefone)}</div>` : ""}</div>
        <div class="dcm-meta">
          <div><span>Data</span><b>${AY.formatDate(v.data)}${hora ? " " + hora : ""}</b></div>
          <div><span>Vencimento</span><b>${AY.formatDate(v.vencimento || v.data)}</b></div>
          <div><span>Operador</span><b>${E(oper)}</b></div>
          <div><span>Moeda</span><b>${E(AY.moeda())}</b></div>
          ${v.docOrigemNum ? `<div><span>Doc. origem</span><b>${E(v.docOrigemNum)}</b></div>` : ""}
          ${v.motivo ? `<div><span>Motivo</span><b>${E(v.motivo)}</b></div>` : ""}
        </div>
      </div>
      <table class="doc-linhas"><thead><tr>
        <th>Cód.</th><th>Descrição</th><th class="num">Preço s/IVA</th><th class="num">Qtd.</th><th>Uni.</th><th class="num">Desc.(%)</th><th class="num">Taxa(%)</th><th class="num">Total</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <div class="doc-rodape">
        <div class="doc-resumo-imp"><div class="dc-k">Resumo de Impostos</div>
          <table><thead><tr><th class="num">Taxa(%)</th><th class="num">Incidência</th><th class="num">Imposto</th></tr></thead>
            <tbody><tr><td class="num">${td.iva ? v.ivaPerc + "%" : "0%"}</td><td class="num">${m2(v.subtotal)}</td><td class="num">${m2(v.iva)}</td></tr></tbody></table></div>
        <div class="doc-totais">
          <div><span>Total Ilíquido</span><b>${m2(v.subtotal)}</b></div>
          <div><span>Total Desconto</span><b>0,00</b></div>
          <div><span>Total Imposto</span><b>${m2(v.iva)}</b></div>
          <div class="dt-final"><span>Total da ${E(td.nome)}</span><b>${m2(v.total)} ${E(AY.moeda())}</b></div>
        </div>
      </div>
      <div class="doc-extenso"><b>${E(valorExtenso(v.total))}</b></div>
      ${bancos ? `<div class="doc-pag"><b>Pagamento:</b> ${E(bancos)}</div>` : ""}
      <div class="doc-foot">
        <div class="df-txt">
          Processado por programa validado — ${E(swLinha)} · ${E(emp.nome)}<br>
          ${td.fiscal === false ? "Este documento não serve de factura." : E(modoNota) + " Ao abrigo do Decreto Presidencial n.º 71/25 (Regime Jurídico das Facturas)."}<br>
          Os bens/serviços foram colocados à disposição do adquirente na data do documento.<br>
          Código de validação AGT: <span class="doc-val">${E(codVal)}</span>
        </div>
        ${td.fiscal === false ? "" : pseudoQR((v.numero || "") + codVal)}
      </div>
    </div>`;
  }

  // Impressão com escolha de formato: "a4" (fatura completa) ou "pos" (talão térmico 80mm)
  function imprimir(formato) {
    document.body.classList.add("printing-doc");
    if (formato === "pos") document.body.classList.add("pos-print");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-doc", "pos-print"), 500);
  }

  AY.faturaDoc = { render, pseudoQR, valorExtenso, imprimir };
})(window);
