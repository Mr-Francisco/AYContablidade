/* SGD — Consulta e validação de NIF (Angola).
 * Integração com o serviço oficial da AGT (DS-120 "Consultar Dados de Contribuinte" v5) quando configurado;
 * fallback para consulta local (clientes, fornecedores, colaboradores, independentes, empresa).
 * Endpoint REST (Obter): {base}/v5/obter?tipoDocumento=NIF&numeroDocumento=<nif> · cabeçalhos Username/Password.
 * A app é estática: a chamada direta ao host da AGT exige CORS/credenciais — usar um proxy (config.agt.proxy) num backend. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) return;

  const ENDPOINT_HML = "https://sifphml.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter";
  const ESTADOS = { A: "Ativo", C: "Cessado", D: "Falecido", E: "Herança", F: "Anulado", G: "Suspenso" };
  const REGIMES = { GNAD: "Regime Geral", TRAG: "Regime Transitório", SIMP: "Regime Simplificado", NBND: "Regime de Não Sujeição", EXCL: "Regime de Exclusão" };
  const REGIME_FICHA = { GNAD: "Regime Geral", SIMP: "Regime Simplificado", EXCL: "Regime de Exclusão / Não Sujeição", NBND: "Regime de Exclusão / Não Sujeição", TRAG: "Regime Geral" };
  // Estados que implicam restrições (não pode emitir faturas, operar, etc. — DS-120 §4.2.7)
  const ESTADOS_RESTRITOS = ["C", "D", "F", "G"];

  function limpar(n) { return String(n || "").replace(/\s+/g, "").toUpperCase(); }
  function tipo(nif) {
    const n = limpar(nif);
    if (/^5\d{9}$/.test(n)) return "coletivo";
    if (/^\d{9}[A-Z]{2}\d{3}$/.test(n)) return "singular";
    if (/^\d{8,10}$/.test(n)) return "outro";
    if (n.length >= 6 && /^[A-Z0-9]+$/.test(n)) return "estrangeiro";
    return "invalido";
  }
  function tipoLabel(t) { return { coletivo: "Pessoa coletiva", singular: "Pessoa singular", outro: "Contribuinte", estrangeiro: "Não residente", invalido: "Inválido" }[t] || t; }
  function valido(nif) { return tipo(nif) !== "invalido"; }
  function agtCfg() { return Object.assign({ ativo: false, ambiente: "homologacao", endpoint: ENDPOINT_HML, proxy: "", username: "", password: "" }, (AY.getConfig().agt || {})); }

  function registos() {
    const out = [];
    try { if (AY.com) AY.com.clientes().forEach(c => out.push({ nome: c.nome, nif: c.nif, morada: c.morada, localidade: c.localidade, provincia: c.provincia, telefone: c.telefone || c.contacto, origem: "Cliente" })); } catch (e) {}
    try { if (AY.compras) AY.compras.fornecedores().forEach(f => out.push({ nome: f.nome, nif: f.nif, morada: f.morada, localidade: f.localidade, provincia: f.provincia, telefone: f.telefone, origem: "Fornecedor" })); } catch (e) {}
    try { if (AY.rh) { AY.rh.colaboradores().forEach(c => out.push({ nome: c.nome, nif: c.nif, morada: c.morada, localidade: c.localidade, provincia: c.provincia, telefone: c.telemovel || c.telefone, origem: "Colaborador" })); AY.rh.independentes().forEach(i => out.push({ nome: i.nome, nif: i.nif, origem: "Independente" })); } } catch (e) {}
    try { const e = AY.getEmpresa(); if (e && e.nif) out.push({ nome: e.nome, nif: e.nif, morada: e.morada, telefone: e.telefone, origem: "Empresa" }); } catch (e) {}
    return out;
  }
  function consultarLocal(nif) {
    const t = tipo(nif);
    if (t === "invalido") return { valido: false, tipo: t, tipoLabel: tipoLabel(t), encontrado: false, fonte: "local", msg: "Formato de NIF inválido." };
    const alvo = limpar(nif);
    const m = registos().find(x => x.nif && limpar(x.nif) === alvo);
    if (m) return Object.assign({ valido: true, tipo: t, tipoLabel: tipoLabel(t), encontrado: true, fonte: "local", msg: m.origem + ": " + m.nome }, m);
    return { valido: true, tipo: t, tipoLabel: tipoLabel(t), encontrado: false, fonte: "local", msg: "NIF válido (" + tipoLabel(t) + "), sem registo local." };
  }

  // Consulta ao serviço oficial da AGT (DS-120). Devolve promise; lança em caso de erro/rede/CORS.
  async function consultarAGT(nif, tipoDocumento) {
    const cfg = agtCfg();
    const base = (cfg.proxy || cfg.endpoint || ENDPOINT_HML).replace(/\?.*$/, "");
    const url = base + "?tipoDocumento=" + encodeURIComponent(tipoDocumento || "NIF") + "&numeroDocumento=" + encodeURIComponent(limpar(nif));
    const headers = { "Accept": "application/json" };
    if (cfg.username) headers["Username"] = cfg.username;
    if (cfg.password) headers["Password"] = cfg.password;
    const resp = await fetch(url, { method: "GET", headers });
    if (!resp.ok) throw new Error("Serviço AGT respondeu " + resp.status);
    const data = await resp.json();
    const c = (data.ObterContribuinte && data.ObterContribuinte.contribuinte) || data.contribuinte || {};
    if (!c.numeroNIF && !c.nome) throw new Error((data.ObterContribuinte && data.ObterContribuinte.mensagem) || "Contribuinte não encontrado.");
    const est = c.estadoContribuinte || "A", reg = c.regimeIva || "";
    return {
      valido: true, encontrado: true, fonte: "AGT", tipo: (c.tipoContribuinte === "COLLECTIVE" ? "coletivo" : c.tipoContribuinte === "SINGULAR" ? "singular" : tipo(nif)), tipoLabel: tipoLabel(c.tipoContribuinte === "COLLECTIVE" ? "coletivo" : "singular"),
      nif: c.numeroNIF || limpar(nif), nome: c.nome || "",
      estado: est, estadoLabel: ESTADOS[est] || est, restrito: ESTADOS_RESTRITOS.indexOf(est) >= 0,
      regimeIva: reg, regimeLabel: REGIMES[reg] || reg, regimeFicha: REGIME_FICHA[reg] || "",
      naoResidente: String(c.indicadorNaoResidente) === "true" || c.indicadorNaoResidente === true,
      msg: (est !== "A" ? "⚠ Contribuinte " + (ESTADOS[est] || est) + " — com restrições legais." : "AGT: " + (c.nome || "")),
    };
  }

  // Consulta principal (async): tenta a AGT se configurada/ativa, senão (ou em erro) usa a consulta local.
  async function consultar(nif, tipoDocumento) {
    const t = tipo(nif);
    if (t === "invalido") return consultarLocal(nif);
    const cfg = agtCfg();
    if (cfg.ativo) {
      try { return await consultarAGT(nif, tipoDocumento); }
      catch (e) { const local = consultarLocal(nif); local.avisoAGT = "Serviço AGT indisponível (" + e.message + "). Mostrado registo local."; return local; }
    }
    return consultarLocal(nif);
  }

  AY.nif = { tipo, tipoLabel, valido, consultar, consultarLocal, consultarAGT, registos, ESTADOS, REGIMES, ENDPOINT_HML };
})(window);
