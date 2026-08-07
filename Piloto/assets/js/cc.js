/* SGD — Contas Correntes (clientes / fornecedores). Reutilizado por cc-clientes e cc-fornecedores. */
function renderContasCorrentes(cfg) {
  const u = AY.initPage(cfg.pagina, null);
  if (!u) return;
  const E = AY.escapeHtml, C = AY.contab, m2 = AY.formatMoeda2;
  const natD = cfg.natureza !== "C";

  function dados() {
    const ex = AY.exercicioAtivo();
    return C.contasCorrentes(cfg.prefixo, { natureza: cfg.natureza, exercicioId: ex ? ex.id : null });
  }
  function render() {
    const d = dados();
    const q = (document.getElementById("busca").value || "").toLowerCase().trim();
    const soSaldo = document.getElementById("fComSaldo").checked;
    let linhas = d.linhas;
    if (soSaldo) linhas = linhas.filter(g => Math.abs(g.saldo) > 0.005);
    if (q) linhas = linhas.filter(g => g.codigo.toLowerCase().includes(q) || (g.nome || "").toLowerCase().includes(q) || (g.entidade || "").toLowerCase().includes(q));

    const cor = natD ? "#8e44ad" : "#c0392b";
    document.getElementById("kpis").innerHTML = [
      AY.kpi(cfg.saldoLabel, AY.formatKz(d.totais.saldo), cfg.titulo, cor),
      AY.kpi("Contas com saldo", d.comSaldo, "de " + d.linhas.length, "var(--chart-blue)"),
      AY.kpi("Total débito", m2(d.totais.debito), "", "var(--chart-teal)"),
      AY.kpi("Total crédito", m2(d.totais.credito), "", "var(--chart-amber)"),
    ].join("");

    document.getElementById("tabela").innerHTML = linhas.length ? `<table>
      <thead><tr><th>Conta</th><th>Designação / Entidade</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
      <tbody>${linhas.map(g => `<tr class="cc-row" data-conta="${E(g.codigo)}" style="cursor:pointer" title="Duplo clique: extrato">
        <td><b>${E(g.codigo)}</b></td>
        <td>${E(g.entidade || g.nome || "—")}${g.entidade && g.nome ? ` <small>· ${E(g.nome)}</small>` : ""}</td>
        <td class="num">${g.debito ? m2(g.debito) : ""}</td>
        <td class="num">${g.credito ? m2(g.credito) : ""}</td>
        <td class="num"><b style="color:${Math.abs(g.saldo) < 0.005 ? "var(--text-muted)" : cor}">${m2(Math.abs(g.saldo))} ${g.saldo < 0 ? (natD ? "C" : "D") : (natD ? "D" : "C")}</b></td>
      </tr>`).join("")}</tbody>
      <tfoot><tr style="font-weight:800;background:var(--surface-2)"><td colspan="2">TOTAIS</td>
        <td class="num">${m2(d.totais.debito)}</td><td class="num">${m2(d.totais.credito)}</td>
        <td class="num">${m2(Math.abs(d.totais.saldo))} ${d.totais.saldo < 0 ? (natD ? "C" : "D") : (natD ? "D" : "C")}</td></tr></tfoot>
    </table>` : `<div class="empty">Sem contas de ${cfg.titulo} com movimento no exercício.</div>`;

    document.querySelectorAll(".cc-row").forEach(tr => {
      tr.ondblclick = () => location.href = "extrato.html?conta=" + tr.dataset.conta;
    });
  }
  document.getElementById("busca").oninput = render;
  document.getElementById("fComSaldo").onchange = render;
  document.getElementById("btnAtualizar").onclick = () => { render(); AY.toast("Contas correntes atualizadas.", "success"); };
  document.getElementById("btnImprimir").onclick = () => window.print();
  render();
}
