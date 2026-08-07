/* SGD — Software de Gestão Dirigida — núcleo genérico (localStorage), autenticação, perfis, tema e
 * layout modular. Arquitetura preparada para backend: toda a persistência passa pela camada
 * Store / read-write. Cada MÓDULO (contabilidade.js, imobilizados.js, ...) gere as suas próprias
 * chaves usando as primitivas expostas em AY (read, write, uid, hoje, round2, ...). Substituir
 * read/write por chamadas HTTP = backend real, sem tocar nos módulos. */
(function (global) {
  "use strict";

  const PREFIX_ANTIGO = "ay_"; // prefixo usado antes de o sistema se chamar SGD
  const PREFIX = "sgd_";
  // Migração automática, uma única vez: copia para o novo prefixo tudo o que já estava gravado
  // no navegador com o prefixo antigo, para não perder dados ao mudar o nome do sistema.
  (function migrarPrefixoAntigo() {
    const marcador = PREFIX + "migrado_v1";
    if (localStorage.getItem(marcador)) return;
    const chaves = []; for (let i = 0; i < localStorage.length; i++) chaves.push(localStorage.key(i));
    chaves.forEach(k => {
      if (!k || !k.startsWith(PREFIX_ANTIGO)) return;
      const novaChave = PREFIX + k.slice(PREFIX_ANTIGO.length);
      if (localStorage.getItem(novaChave) == null) localStorage.setItem(novaChave, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
    localStorage.setItem(marcador, "1");
  })();
  const KEYS = {
    users: PREFIX + "users",
    config: PREFIX + "config",
    exercicios: PREFIX + "exercicios",
    session: PREFIX + "session",
    seeded: PREFIX + "seeded_v1",
    theme: PREFIX + "theme",
    notifs: PREFIX + "notifs",
  };
  // Migração pontual: as contas de demonstração usavam o domínio antigo (@aygest.ao) — atualiza
  // para @sgd.ao os utilizadores já gravados, para continuarem a coincidir com os botões de
  // "Contas de demonstração" do ecrã de login.
  (function migrarDominioContasDemo() {
    const marcador = PREFIX + "migrado_dominio_v1";
    if (localStorage.getItem(marcador)) return;
    try {
      const raw = localStorage.getItem(KEYS.users);
      if (raw) {
        const users = JSON.parse(raw);
        let mudou = false;
        users.forEach(u => { if (u.email && u.email.endsWith("@aygest.ao")) { u.email = u.email.replace("@aygest.ao", "@sgd.ao"); mudou = true; } });
        if (mudou) localStorage.setItem(KEYS.users, JSON.stringify(users));
      }
    } catch (e) { /* dados corrompidos ou ausentes — ignora */ }
    localStorage.setItem(marcador, "1");
  })();

  // ---------- utils ----------
  function uid(p) { return (p || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function read(key, fb) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : (fb !== undefined ? fb : null); } catch (e) { return fb; } }
  function write(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function qs(name) { return new URLSearchParams(location.search).get(name); }
  function hoje() { return new Date().toISOString(); }
  function hojeData() { return new Date().toISOString().slice(0, 10); }
  function moeda() { return (getEmpresa().moeda || "Kz"); }
  function formatKz(n) { n = Number(n) || 0; return n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " " + moeda(); }
  function formatMoeda2(n) { n = Number(n) || 0; return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatKz2(n) { return formatMoeda2(n) + " " + moeda(); }
  function formatDate(iso) { if (!iso) return "—"; const d = new Date(iso); if (isNaN(d)) return "—"; return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function formatDateTime(iso) { if (!iso) return "—"; const d = new Date(iso); if (isNaN(d)) return "—"; return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }); }
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function nomeMes(ym) { const p = String(ym || "").split("-"); if (p.length < 2) return ym || "—"; return (MESES[Number(p[1]) - 1] || "") + " " + p[0]; }

  // ---------- Perfis / níveis de acesso (genéricos de ERP) ----------
  const PERFIS = {
    superadmin:   { label: "Super Administrador", cor: "#6c2fb0" },
    admin:        { label: "Administrador",       cor: "#c0392b" },
    contabilista: { label: "Contabilista",        cor: "#2c3e50" },
    financeiro:   { label: "Tesouraria",          cor: "#1f7a44" },
    comercial:    { label: "Comercial",           cor: "#2980b9" },
    logistica:    { label: "Logística",           cor: "#d68910" },
    rh:           { label: "Recursos Humanos",    cor: "#16a085" },
    consulta:     { label: "Consulta",            cor: "#8a8a8a" },
  };
  function perfilLabel(p) { return (PERFIS[p] && PERFIS[p].label) || p || "—"; }
  const PERFIS_REGISTO = ["contabilista", "financeiro", "comercial", "logistica", "rh", "consulta", "admin"];
  const PERFIS_APROVADORES = ["superadmin", "admin"];

  // ---------- Matriz de permissões (capacidades por perfil) ----------
  // Cada módulo usa o prefixo do seu domínio: contab.*, financeiro.*, comercial.*, logistica.*, imob.*, rh.*, empresa.*
  const CAPS = {
    superadmin: ["*"],
    admin:      ["*"],
    contabilista: ["contab.ver", "contab.lancar", "contab.plano", "contab.fechar", "financeiro.ver", "imob.ver", "imob.gerir", "analitica.ver", "analitica.gerir", "empresa.ver"],
    financeiro:   ["financeiro.ver", "financeiro.gerir", "contab.ver", "comercial.ver", "logistica.ver"],
    comercial:    ["comercial.ver", "comercial.gerir", "financeiro.ver"],
    logistica:    ["logistica.ver", "logistica.gerir", "imob.ver"],
    rh:           ["rh.ver", "rh.gerir"],
    consulta:     ["contab.ver", "financeiro.ver", "comercial.ver", "logistica.ver", "imob.ver", "analitica.ver", "rh.ver", "empresa.ver"],
  };
  function ehAdminLike(p) { return p === "admin" || p === "superadmin"; }
  function perfilPermitido(u, perfis) { return !perfis || !perfis.length || perfis.includes(u.perfil) || (u.perfil === "superadmin" && perfis.includes("admin")); }
  function podeAprovar() { const u = currentUser(); return !!u && PERFIS_APROVADORES.includes(u.perfil); }
  function can(acao) {
    const u = currentUser();
    if (!u) return false;
    const caps = (CAPS[u.perfil] || []).concat(u.permissoesExtra || []);
    if (caps.includes("*")) return true;
    return caps.includes(acao);
  }

  // ---------- Empresa / configuração ----------
  const REGIMES = {
    geral:        { label: "Regime Geral",                  iva: 14 },
    simplificado: { label: "Regime Simplificado",           iva: 7 },
    exclusao:     { label: "Regime de Exclusão / Isenção",  iva: 0 },
  };
  function defaultConfig() {
    return {
      empresa: {
        nome: "A Minha Empresa, Lda.", nif: "5000000000",
        morada: "Luanda", localizacao: "Luanda — Angola",
        telefone: "+244 900 000 000", email: "geral@empresa.ao",
        moeda: "Kz", regime: "geral", logo: "", regimeHistorico: [],
      },
      licenca: { chave: "SGD-DEMO-0000-0000", titular: "Demo", plano: "Demonstração", validade: "", ativa: true },
      modulos: { contabilidade: true, contasCorrentes: true, logistica: true, imobilizados: true, comercial: true, analitica: true, rh: true, fiscalidade: true },
      agt: { ativo: false, ambiente: "homologacao", endpoint: "https://sifphml.minfin.gov.ao/sigt/contribuinte/consultarNIF/v5/obter", proxy: "", username: "", password: "" },
    };
  }
  function getConfig() { const c = read(KEYS.config, null); return c ? Object.assign(defaultConfig(), c) : defaultConfig(); }
  function saveConfig(c) { write(KEYS.config, c); return c; }
  function getEmpresa() { return getConfig().empresa || defaultConfig().empresa; }
  function saveEmpresa(emp) { const c = getConfig(); c.empresa = emp; saveConfig(c); return emp; }
  function taxaIVA() { const r = (getEmpresa().regime) || "geral"; return (REGIMES[r] || REGIMES.geral).iva; }
  // Lista canónica dos módulos (chave usada no NAV/config.modulos + rótulo) — partilhada entre
  // Configurações (toggle global, todos os utilizadores) e Utilizadores (toggle por utilizador).
  const MODULOS = [
    ["contabilidade", "📒 Contabilidade"], ["contasCorrentes", "💳 Contas Correntes"], ["comercial", "🛒 Comercial"],
    ["logistica", "📦 Logística"], ["imobilizados", "🏭 Imobilizados"], ["analitica", "📊 Analítica"],
    ["rh", "👥 Recursos Humanos"], ["fiscalidade", "⚖️ Fiscalidade"],
  ];
  // Um módulo fica visível se: (1) estiver ativo globalmente (Configurações) E (2) o utilizador não
  // tiver uma lista pessoal de módulos permitidos, ou essa lista incluir este módulo. Sem lista
  // pessoal definida (undefined) = sem restrição extra, só a global (comportamento anterior).
  function moduloAtivo(nome, u) {
    const m = getConfig().modulos || {};
    if (m[nome] === false) return false;
    u = u || currentUser();
    if (u && Array.isArray(u.modulosPermitidos)) return u.modulosPermitidos.includes(nome);
    return true;
  }

  // ---------- Exercícios económicos ----------
  function exercicios() { return read(KEYS.exercicios, []); }
  // Vários exercícios podem estar ativos em simultâneo (ex.: transição de ano) — "ativo" é um
  // interruptor independente por exercício, não uma escolha exclusiva. Por omissão (ex.: novo
  // lançamento sem exercício indicado), usa-se o ativo mais recente (pelo início).
  function exercicioAtivo() {
    const ativos = exercicios().filter(e => e.ativo).sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
    return ativos[0] || null;
  }
  function saveExercicio(e) { const l = exercicios(); const i = l.findIndex(x => x.id === e.id); if (i >= 0) l[i] = e; else l.push(e); write(KEYS.exercicios, l); return e; }
  function removeExercicio(id) { write(KEYS.exercicios, exercicios().filter(e => e.id !== id)); }
  // Exercício cronologicamente anterior a um dado exercício (pelo início) — usado para as colunas
  // comparativas "ano anterior" do Balanço, Demonstração de Resultados, Notas e Fluxos de Caixa.
  function exercicioAnterior(ex) {
    if (!ex) return null;
    const lista = exercicios().slice().sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));
    const i = lista.findIndex(x => x.id === ex.id);
    return i > 0 ? lista[i - 1] : null;
  }
  // <option>s de um seletor de Exercício, mais recente primeiro; devolve também o exercício selecionado
  // por omissão (o indicado por selectedId, senão o ativo, senão o mais recente).
  function exercicioOptions(selectedId) {
    const lista = exercicios().slice().sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
    const ativo = exercicioAtivo();
    const sel = lista.find(e => e.id === selectedId) || ativo || lista[0] || null;
    const html = lista.map(e => `<option value="${e.id}"${sel && e.id === sel.id ? " selected" : ""}>${escapeHtml(e.nome)}${e.ativo ? " · ativo" : ""}</option>`).join("");
    return { html, selecionado: sel };
  }

  // ---------- Store (dados do núcleo) ----------
  const Store = {
    users: () => read(KEYS.users, []),
    saveUser: (u) => { const l = read(KEYS.users, []); const i = l.findIndex(x => x.id === u.id); if (i >= 0) l[i] = u; else l.push(u); write(KEYS.users, l); return u; },
    removeUser: (id) => { write(KEYS.users, read(KEYS.users, []).filter(u => u.id !== id)); },
    pendentes: () => read(KEYS.users, []).filter(u => u.aprovado === false),
    aprovarUser: (id, perfil) => {
      const l = read(KEYS.users, []); const x = l.find(u => u.id === id); if (!x) return null;
      x.aprovado = true; x.ativo = true; if (perfil) x.perfil = perfil;
      const ap = currentUser(); x.aprovadoPor = ap ? ap.nome : "sistema"; x.aprovadoEm = hoje();
      write(KEYS.users, l); return x;
    },
    config: getConfig, saveConfig,
    exercicios, exercicioAtivo, saveExercicio, removeExercicio,
  };

  // ---------- Autenticação ----------
  function login(email, senha) {
    const u = Store.users().find(x => (x.email || "").toLowerCase() === String(email).toLowerCase().trim());
    if (!u || u.senha !== senha) throw new Error("E-mail ou palavra-passe inválidos.");
    if (u.aprovado === false) throw new Error("Conta pendente de aprovação. Aguarde a validação de um Administrador.");
    if (u.ativo === false) throw new Error("Conta desativada. Contacte o administrador.");
    write(KEYS.session, { id: u.id, em: hoje() });
    return u;
  }
  function registar(dados) {
    const nome = String(dados.nome || "").trim(), email = String(dados.email || "").trim().toLowerCase();
    if (!nome || !email) throw new Error("Nome e e-mail são obrigatórios.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    if (!dados.senha || String(dados.senha).length < 4) throw new Error("A palavra-passe deve ter pelo menos 4 caracteres.");
    if (Store.users().some(x => (x.email || "").toLowerCase() === email)) throw new Error("Já existe uma conta com este e-mail.");
    const perfil = PERFIS_REGISTO.includes(dados.perfil) ? dados.perfil : "consulta";
    return Store.saveUser({ id: uid("u"), nome, email, senha: dados.senha, perfil, ativo: true, aprovado: false, telefone: (dados.telefone || "").trim(), registadoEm: hoje(), criadoEm: hoje() });
  }
  function logout() { localStorage.removeItem(KEYS.session); location.href = "login.html"; }
  function currentUser() { const s = read(KEYS.session, null); if (!s) return null; return Store.users().find(u => u.id === s.id) || null; }
  function requireAuth(perfis) {
    const u = currentUser();
    if (!u) { location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search); return null; }
    if (!perfilPermitido(u, perfis)) { location.href = "index.html"; return null; }
    return u;
  }

  // ---------- Seed de demonstração ----------
  function seed() {
    if (read(KEYS.seeded, false)) return;
    const users = [
      { id: uid("u"), nome: "Super Admin",   email: "super@sgd.ao",     senha: "demo123", perfil: "superadmin",   ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "Gerente Geral",  email: "admin@sgd.ao",     senha: "demo123", perfil: "admin",        ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "Contabilista",   email: "contab@sgd.ao",    senha: "demo123", perfil: "contabilista", ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "Tesouraria",     email: "tesouraria@sgd.ao",senha: "demo123", perfil: "financeiro",   ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "Comercial",      email: "comercial@sgd.ao", senha: "demo123", perfil: "comercial",    ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "Logística",      email: "logistica@sgd.ao", senha: "demo123", perfil: "logistica",    ativo: true, aprovado: true, criadoEm: hoje() },
      { id: uid("u"), nome: "R. Humanos",     email: "rh@sgd.ao",        senha: "demo123", perfil: "rh",           ativo: true, aprovado: true, criadoEm: hoje() },
    ];
    write(KEYS.users, users);
    saveConfig(defaultConfig());
    const ano = new Date().getFullYear();
    write(KEYS.exercicios, [{ id: uid("ex"), nome: "Exercício " + ano, inicio: ano + "-01-01", fim: ano + "-12-31", estado: "aberto", ativo: true, criadoEm: hoje() }]);
    write(KEYS.seeded, true);
  }

  // ---------- Notificações (núcleo) ----------
  function notifDoUser(u) { return read(KEYS.notifs, []).filter(n => !n.para || n.para === u.perfil || (n.paraIds || []).includes(u.id)).sort((a, b) => (b.em || "").localeCompare(a.em || "")); }
  function notifNaoLidas(u) { return notifDoUser(u).filter(n => !(n.lidos || []).includes(u.id)); }
  function marcarLida(nid) { const u = currentUser(); if (!u) return; const l = read(KEYS.notifs, []); const n = l.find(x => x.id === nid); if (n) { n.lidos = n.lidos || []; if (!n.lidos.includes(u.id)) n.lidos.push(u.id); write(KEYS.notifs, l); } }
  function marcarTodasLidas() { const u = currentUser(); if (!u) return; const l = read(KEYS.notifs, []); l.forEach(n => { n.lidos = n.lidos || []; if (!n.lidos.includes(u.id)) n.lidos.push(u.id); }); write(KEYS.notifs, l); }
  const NOTIF_ICO = { info: "🔔", contab: "📒", alerta: "⚠️", ok: "✅" };

  // ---------- Tema ----------
  function initTheme() { const t = read(KEYS.theme, "light"); document.documentElement.setAttribute("data-theme", t); }
  function toggleTheme() { const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", cur); write(KEYS.theme, cur); const b = document.getElementById("themeBtn"); if (b) b.textContent = cur === "dark" ? "☀️" : "🌙"; }

  // ---------- Navegação modular ----------
  // Um módulo aparece se tiver ≥1 item visível (os itens controlam o acesso via perfis/cap).
  const NAV = [
    { href: "index.html", label: "Painel" },
    { label: "Contabilidade", modulo: "contabilidade", ribbon: true, children: [
        { href: "painel-contabilidade.html", label: "Painel", ico: "dashboard", seccao: "Painel", cap: "contab.ver" },
        { href: "movimentos.html",   label: "Movimentos", ico: "movimentos", seccao: "Contabilidade", cap: "contab.ver" },
        { href: "plano-contas.html", label: "Plano de Contas", ico: "plano", seccao: "Contabilidade", cap: "contab.ver" },
        { href: "contabilidade.html", label: "Explorador", ico: "explorador", seccao: "Contabilidade", cap: "contab.ver" },
        { href: "balancete.html",    label: "Balancete Geral", ico: "balancete", seccao: "Balancetes", cap: "contab.ver" },
        { href: "balancete-razao.html", label: "Balancete do Razão", ico: "livro", seccao: "Balancetes", cap: "contab.ver" },
        { href: "balanco.html",      label: "Balanço", ico: "balanco", seccao: "Demonstrações", cap: "contab.ver" },
        { href: "demonstracao-resultados.html", label: "Result. e Outros", ico: "resultados", seccao: "Demonstrações", cap: "contab.ver" },
        { href: "notas.html",        label: "Notas", ico: "notas", seccao: "Demonstrações", cap: "contab.ver" },
        { href: "fluxos-caixa.html", label: "Fluxos de Caixa", ico: "fluxos", seccao: "Demonstrações", cap: "contab.ver" },
        { href: "apuramento-iva.html", label: "Apuramento do IVA", ico: "balancete", seccao: "Apuramentos", cap: "contab.ver" },
        { href: "retencoes.html",    label: "Retenções na Fonte", ico: "fiscalidade", seccao: "Apuramentos", cap: "contab.ver" },
        { href: "extrato.html",      label: "Extratos", ico: "extratos", seccao: "Exploração", cap: "contab.ver" },
        { href: "razao.html",        label: "Razão", ico: "bookopen", seccao: "Exploração", cap: "contab.ver" },
        { href: "ct-diarios.html",   label: "Diários", ico: "diarios", seccao: "Tabelas", cap: "contab.ver" },
        { href: "ct-documentos.html",label: "Documentos", ico: "documentos", seccao: "Tabelas", cap: "contab.ver" },
    ]},
    { label: "Analítica", modulo: "analitica", ribbon: true, children: [
        { href: "painel-analitica.html", label: "Painel", ico: "dashboard", seccao: "Painel", cap: "analitica.ver" },
        { href: "analitica-mapa.html",    label: "Mapa de Custos", ico: "balancete", seccao: "Analítica", cap: "analitica.ver" },
        { href: "analitica-centros.html", label: "Centros de Custo", ico: "package", seccao: "Analítica", cap: "analitica.ver" },
    ]},
    { label: "Contas Correntes", modulo: "contasCorrentes", ribbon: true, children: [
        { href: "painel-financeiro.html", label: "Painel", ico: "dashboard", seccao: "Painel", cap: "financeiro.ver" },
        { href: "cc-clientes.html",     label: "Clientes", ico: "users", seccao: "Contas Correntes", cap: "financeiro.ver" },
        { href: "cc-fornecedores.html", label: "Fornecedores", ico: "truck", seccao: "Contas Correntes", cap: "financeiro.ver" },
    ]},
    { label: "Comercial", modulo: "comercial", ribbon: true, children: [
        { href: "painel-comercial.html", label: "Painel", ico: "dashboard", seccao: "Painel", cap: "comercial.ver" },
        { href: "vendas.html",    label: "Vendas", ico: "cart", seccao: "Comercial", cap: "comercial.ver" },
        { href: "consulta-faturas.html", label: "Consulta de Faturas", ico: "consultaFatura", seccao: "Comercial", cap: "comercial.ver" },
        { href: "clientes.html",  label: "Clientes", ico: "users", seccao: "Comercial", cap: "comercial.ver" },
        { href: "vendedores.html",label: "Vendedores", ico: "tie", seccao: "Comercial", cap: "comercial.ver" },
    ]},
    { label: "Logística", modulo: "logistica", ribbon: true, children: [
        { href: "artigos.html",       label: "Artigos", ico: "package", seccao: "Inventário", cap: "logistica.ver" },
        { href: "compras-documentos.html", label: "Compras", ico: "cart", seccao: "Inventário", cap: "logistica.ver" },
        { href: "rececao.html",       label: "Receção", ico: "arrowIn", seccao: "Inventário", cap: "logistica.ver" },
        { href: "expedicao.html",     label: "Expedição", ico: "arrowOut", seccao: "Inventário", cap: "logistica.ver" },
        { href: "transferencia.html", label: "Transferência", ico: "fluxos", seccao: "Inventário", cap: "logistica.ver" },
        { href: "inventariacao.html", label: "Acerto Positivo", ico: "clipboard", seccao: "Operações Logísticas", cap: "logistica.ver" },
        { href: "acerto-negativo.html", label: "Acerto Negativo", ico: "trendingDown", seccao: "Operações Logísticas", cap: "logistica.ver" },
        { href: "existencias.html",   label: "Existências", ico: "caixa", seccao: "Exploração", cap: "logistica.ver" },
        { href: "armazens.html",      label: "Armazéns", ico: "warehouse", seccao: "Recursos", cap: "logistica.ver" },
        { href: "fornecedores.html",  label: "Fornecedores", ico: "users", seccao: "Recursos", cap: "logistica.ver" },
    ]},
    { label: "Imobilizados", modulo: "imobilizados", ribbon: true, children: [
        { href: "painel-imobilizados.html", label: "Painel", ico: "dashboard", seccao: "Painel", cap: "imob.ver" },
        { href: "imobilizados.html",  label: "Ficha de Ativos", ico: "imob", seccao: "Imobilizado", cap: "imob.ver" },
        { href: "amortizacoes.html",  label: "Amortizações", ico: "trendingDown", seccao: "Imobilizado", cap: "imob.ver" },
    ]},
    { label: "RH", modulo: "rh", ribbon: true, children: [
        { href: "painel-rh.html",      label: "Painel", ico: "dashboard", seccao: "Painel", cap: "rh.ver" },
        { href: "pessoal.html",        label: "Funcionários", ico: "users", seccao: "Salários", cap: "rh.ver" },
        { href: "rh-alteracoes.html",  label: "Alterações Mensais", ico: "calendarEdit", seccao: "Salários", cap: "rh.ver" },
        { href: "salarios.html",       label: "Processamento", ico: "cog", seccao: "Salários", cap: "rh.ver" },
        { href: "rh-pagamentos.html",  label: "Pagamentos", ico: "banknote", seccao: "Salários", cap: "rh.ver" },
        { href: "rh-recibos.html",     label: "Recibos", ico: "receipt", seccao: "Salários", cap: "rh.ver" },
        { href: "rh-simulacao.html",   label: "Simulação", ico: "calculator", seccao: "Salários", cap: "rh.ver" },
        { href: "rh-independentes.html",label: "Independentes", ico: "tie", seccao: "Honorários", cap: "rh.ver" },
        { href: "carreiras.html",      label: "Tabelas", ico: "award", seccao: "Recursos", cap: "rh.ver" },
    ]},
    { label: "Fiscalidade", modulo: "fiscalidade", ribbon: true, children: [
        { href: "fiscalidade.html",            label: "Impostos", ico: "fiscalidade", seccao: "Fiscalidade", cap: "contab.ver" },
        { href: "fiscalidade-iva.html",        label: "Regimes de IVA", ico: "balancete", seccao: "Fiscalidade", cap: "contab.ver" },
        { href: "fiscalidade-obrigacoes.html", label: "Obrigações", ico: "notas", seccao: "Fiscalidade", cap: "contab.ver" },
        { href: "fiscalidade-calendario.html", label: "Calendário Fiscal", ico: "diarios", seccao: "Fiscalidade", cap: "contab.ver" },
        { href: "mapa-remuneracoes.html",      label: "Mapa de Remunerações", ico: "receipt", seccao: "Declarações", cap: "rh.ver" },
    ]},
    { label: "Gestão", ribbon: true, children: [
        { href: "utilizadores.html",  label: "Utilizadores", ico: "users", seccao: "Sistema", perfis: ["admin"] },
    ]},
    { href: "empresa.html", label: "Configurações", perfis: ["admin"] },
  ];
  function navFile(href) { return (href || "").split("?")[0]; }
  function navPermitido(n, u) {
    if (n.modulo && !moduloAtivo(n.modulo, u)) return false;
    return (!n.perfis && !n.cap) || (u && ((n.perfis && perfilPermitido(u, n.perfis)) || (n.cap && can(n.cap))));
  }
  function navVisivel(n, u) {
    if (n.modulo && !moduloAtivo(n.modulo, u)) return false;
    if (n.children) return n.children.some(c => navVisivel(c, u));
    return navPermitido(n, u);
  }
  function navContemAtivo(n, active) { return n.children ? n.children.some(c => navContemAtivo(c, active)) : navFile(n.href) === active; }
  // ---------- Ícones SVG de linha (profissionais/executivos) ----------
  const ICO = {
    movimentos: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    plano: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3.5" y1="6" x2="3.51" y2="6"/><line x1="3.5" y1="12" x2="3.51" y2="12"/><line x1="3.5" y1="18" x2="3.51" y2="18"/>',
    explorador: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    balancete: '<path d="M12 3v18"/><path d="M3 7h18"/><path d="m6.5 7-3.2 6a3 3 0 0 0 6.4 0Z"/><path d="m17.5 7-3.2 6a3 3 0 0 0 6.4 0Z"/><path d="M8 21h8"/>',
    livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    balanco: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    resultados: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    notas: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    fluxos: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    extratos: '<path d="M4 2v20l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5V2l-2 1.5L18 2l-2 1.5L14 2l-2 1.5L10 2 8 3.5 6 2Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    bookopen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/>',
    diarios: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    documentos: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    cart: '<circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    tie: '<circle cx="12" cy="7" r="4"/><path d="M12 11v3"/><path d="M10 14h4l1.5 6-3.5 2-3.5-2Z"/>',
    caixa: '<path d="M21 8V21H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>',
    imob: '<path d="M2 20h20"/><path d="M4 20V8l4-2v14"/><path d="M12 20V4l8 4v12"/><path d="M15 11h.01M15 14h.01M15 17h.01"/>',
    trendingDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.4 7 22l5-3 5 3-1.2-8.6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    calendarEdit: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M17.5 14.5 14 18v2h2l3.5-3.5a1.4 1.4 0 0 0-2-2Z"/>',
    cog: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2m15.5-5.5-2.1 2.1M8.6 15.4l-2.1 2.1m0-11 2.1 2.1m6.8 6.8 2.1 2.1"/>',
    banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    receipt: '<path d="M5 2v20l2-1.4 2 1.4 2-1.4 2 1.4 2-1.4 2 1.4V2l-2 1.4L15 2l-2 1.4L11 2 9 3.4 7 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h4"/>',
    fiscalidade: '<path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5Z"/><path d="M15 9l-6 6"/><circle cx="9.5" cy="9.5" r="1"/><circle cx="14.5" cy="14.5" r="1"/>',
    dashboard: '<rect x="3" y="3" width="8" height="10" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="3" y="17" width="8" height="4" rx="1"/>',
    package: '<path d="M12 2 3 7v10l9 5 9-5V7Z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/><path d="M7.5 4.5 16 9.5"/>',
    arrowIn: '<path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M9 12h9"/><path d="m15 9 3 3-3 3"/>',
    arrowOut: '<path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M15 12H6"/><path d="m9 9-3 3 3 3"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    warehouse: '<path d="M22 8 12 3 2 8v13h20Z"/><path d="M6 21v-8h12v8"/><path d="M6 13h12"/><path d="M9 21v-4h6v4"/>',
    consultaFatura: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><path d="M14 3v5h5"/><path d="M8 12h4M8 8h2"/><circle cx="16.5" cy="16.5" r="3"/><path d="m21 21-2.1-2.1"/>',
  };
  function iconHTML(name) { const p = ICO[name]; return p ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${p}</svg>` : (name || ""); }

  // Módulo (grupo) que contém a página ativa
  function moduloAtivoDe(active) { return NAV.find(n => n.children && n.children.some(c => navFile(c.href) === active)) || null; }
  // Barra de topo: só módulos (grupos) e itens simples
  function renderTopNav(u, active) {
    const modAtivo = moduloAtivoDe(active);
    return NAV.filter(n => navVisivel(n, u)).map(n => {
      if (n.children) {
        const kids = n.children.filter(c => navVisivel(c, u));
        const href = kids.length ? kids[0].href : "#";
        return `<a href="${href}" class="nav-module ${n === modAtivo ? "active" : ""}">${escapeHtml(n.label)}</a>`;
      }
      return `<a href="${n.href}" class="${navFile(n.href) === active ? "active" : ""}">${escapeHtml(n.label)}</a>`;
    }).join("");
  }
  // Sub-barra: páginas do módulo ativo (ribbon com secções, ou barra simples)
  function renderSubNav(u, active) {
    const mod = moduloAtivoDe(active);
    if (!mod) return "";
    const kids = mod.children.filter(c => navVisivel(c, u));
    if (!kids.length) return "";
    if (mod.ribbon) {
      const ordem = [], grupos = {};
      kids.forEach(c => { const s = c.seccao || mod.label; if (!grupos[s]) { grupos[s] = []; ordem.push(s); } grupos[s].push(c); });
      const html = ordem.map(s => `<div class="ribbon-group">
        <div class="ribbon-btns">${grupos[s].map(c => `<a href="${c.href}" class="ribbon-btn ${navFile(c.href) === active ? "active" : ""}"><span class="rb-ico">${iconHTML(c.ico)}</span><span class="rb-lbl">${escapeHtml(c.label)}</span></a>`).join("")}</div>
        <div class="ribbon-glabel">${escapeHtml(s)}</div>
      </div>`).join(`<div class="ribbon-sep"></div>`);
      return `<div class="ribbon"><div class="ribbon-inner">${html}</div></div>`;
    }
    return `<div class="sub-nav"><div class="sub-nav-inner">
      <span class="sub-nav-mod">${escapeHtml(mod.label)}</span>
      ${kids.map(c => `<a href="${c.href}" class="${navFile(c.href) === active ? "active" : ""}">${escapeHtml(c.label)}</a>`).join("")}
    </div></div>`;
  }
  let currentActive = "";
  function renderHeader(active) {
    currentActive = active || "";
    const host = document.getElementById("app-header");
    if (!host) return;
    const u = currentUser();
    const t = document.documentElement.getAttribute("data-theme");
    const links = renderTopNav(u, active);
    const iniciais = u ? u.nome.split(" ").map(x => x[0]).slice(0, 2).join("").toUpperCase() : "";
    const lista = u ? notifDoUser(u) : [];
    const nNaoLidas = u ? notifNaoLidas(u).length : 0;
    const sino = u ? `<div class="notif-wrap">
        <button class="icon-btn" id="notifBtn" title="Notificações">🔔${nNaoLidas ? `<span class="notif-badge">${nNaoLidas > 9 ? "9+" : nNaoLidas}</span>` : ""}</button>
        <div class="notif-panel" id="notifPanel">
          <div class="np-head"><b>Notificações</b>${lista.length ? `<button class="np-clear" id="notifClear">Marcar todas lidas</button>` : ""}</div>
          <div class="np-list">${lista.length ? lista.slice(0, 15).map(n => `<a class="np-item ${(n.lidos || []).includes(u.id) ? "" : "un"}" ${n.link ? `href="${n.link}"` : ""} data-nid="${n.id}"><span class="npi-ico">${NOTIF_ICO[n.tipo] || "🔔"}</span><span class="npi-txt">${escapeHtml(n.texto)}<small>${formatDateTime(n.em)}</small></span></a>`).join("") : `<div class="np-empty">Sem notificações.</div>`}</div>
        </div>
      </div>` : "";
    const ex = exercicioAtivo();
    host.innerHTML = `
      <div class="header-bar">
        <a href="index.html" class="logo-block">
          <span class="logo-mark">SGD</span>
          <span class="logo-sub"><b>SGD</b><span>SOFTWARE DE GESTÃO DIRIGIDA</span></span>
        </a>
        <nav class="main-nav">${links}</nav>
        <div class="header-actions">
          ${ex ? `<span class="tag" title="Exercício ativo" style="align-self:center">${escapeHtml(ex.nome)}</span>` : ""}
          ${sino}
          <button class="icon-btn" id="themeBtn" title="Tema">${t === "dark" ? "☀️" : "🌙"}</button>
          ${u ? `<div class="user-chip" id="userChip">
            <span class="avatar" style="background:${(PERFIS[u.perfil] || {}).cor || '#555'}">${iniciais}</span>
            <span class="user-meta"><b>${escapeHtml(u.nome)}</b><small>${perfilLabel(u.perfil)}</small></span>
          </div>` : `<a class="btn btn-primary btn-sm" href="login.html">Entrar</a>`}
        </div>
      </div>
      ${renderSubNav(u, active)}`;
    const tb = document.getElementById("themeBtn"); if (tb) tb.onclick = toggleTheme;
    const chip = document.getElementById("userChip"); if (chip) chip.onclick = () => { location.href = "perfil.html"; };
    const nb = document.getElementById("notifBtn"); if (nb) nb.onclick = (e) => { e.stopPropagation(); document.getElementById("notifPanel").classList.toggle("open"); };
    const nc = document.getElementById("notifClear"); if (nc) nc.onclick = (e) => { e.stopPropagation(); marcarTodasLidas(); renderHeader(currentActive); };
    host.querySelectorAll(".np-item").forEach(a => a.onclick = () => marcarLida(a.dataset.nid));
  }
  if (!global.__ayNavClose) { global.__ayNavClose = true; document.addEventListener("click", () => {
    document.querySelectorAll(".nav-group.open").forEach(g => g.classList.remove("open"));
    const p = document.getElementById("notifPanel"); if (p) p.classList.remove("open");
  }); }

  // ---------- Componentes UI reutilizáveis ----------
  function coverHTML(titulo, sub, kpis) {
    const emp = getEmpresa();
    return `<div class="mo-cover">
      <div style="flex:1;min-width:220px">
        <div style="font-size:12px;letter-spacing:1px;opacity:.85;text-transform:uppercase">${escapeHtml(emp.nome)}</div>
        <h1 style="margin:4px 0 2px;font-size:26px;font-weight:900">${escapeHtml(titulo)}</h1>
        ${sub ? `<div style="opacity:.9;font-size:13px">${escapeHtml(sub)}</div>` : ""}
      </div>
      ${kpis && kpis.length ? `<div class="cover-kpis">${kpis.map(k => `<div class="cover-kpi"><div class="ck-v">${k.v}</div><div class="ck-k">${escapeHtml(k.k)}</div></div>`).join("")}</div>` : ""}
    </div>`;
  }
  function kpi(k, v, d, cor) { return `<div class="kpi" style="--accent:${cor || 'var(--amber)'}"><div class="k">${escapeHtml(k)}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`; }
  function badge(txt, cor) { cor = cor || "#777"; return `<span class="badge" style="background:${cor}22;color:${cor};border-color:${cor}55">${escapeHtml(txt)}</span>`; }

  // Paleta de gráficos (marca AY)
  const CHART_CORES = ["var(--pink)", "var(--indigo)", "var(--purple)", "var(--blue)", "var(--magenta)", "var(--chart-teal)", "var(--chart-grey)"];
  // Barras horizontais executivas. items: [{label, valor, texto?, cor?}]
  function chartBars(items, opts) {
    opts = opts || {}; items = items || [];
    const max = Math.max(1, ...items.map(i => Math.abs(Number(i.valor) || 0)));
    return `<div class="chart-bars">` + items.map((i, k) => {
      const val = Math.abs(Number(i.valor) || 0), pct = Math.max(2, Math.round(val / max * 100));
      const cor = i.cor || opts.cor || CHART_CORES[k % CHART_CORES.length];
      return `<div class="cb-row"><div class="cb-lbl" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
        <div class="cb-track"><div class="cb-fill" style="width:${pct}%;background:${cor}"></div></div>
        <div class="cb-val">${i.texto != null ? i.texto : formatKz(i.valor)}</div></div>`;
    }).join("") + `</div>`;
  }
  // Donut SVG. segments: [{label, valor, cor?, texto?}]
  function chartDonut(segments, opts) {
    opts = opts || {}; segments = (segments || []).filter(s => Math.abs(Number(s.valor) || 0) > 0);
    const total = segments.reduce((s, x) => s + Math.abs(Number(x.valor) || 0), 0) || 1;
    const R = 54, C = 2 * Math.PI * R; let off = 0;
    const arcs = segments.map((s, k) => {
      const cor = s.cor || CHART_CORES[k % CHART_CORES.length];
      const len = Math.abs(Number(s.valor) || 0) / total * C;
      const el = `<circle cx="64" cy="64" r="${R}" fill="none" stroke="${cor}" stroke-width="17" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 64 64)"/>`;
      off += len; return el;
    }).join("");
    const legend = segments.map((s, k) => `<div class="cd-leg"><span class="cd-dot" style="background:${s.cor || CHART_CORES[k % CHART_CORES.length]}"></span><span class="cd-leg-l">${escapeHtml(s.label)}</span><b>${s.texto != null ? s.texto : formatKz(s.valor)}</b></div>`).join("");
    return `<div class="chart-donut"><svg viewBox="0 0 128 128" class="cd-svg" aria-hidden="true"><circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--border)" stroke-width="17" opacity=".3"/>${arcs}<text x="64" y="60" text-anchor="middle" class="cd-c1">${escapeHtml(opts.centro || "")}</text><text x="64" y="80" text-anchor="middle" class="cd-c2">${escapeHtml(opts.centroSub || "")}</text></svg><div class="cd-legend">${legend}</div></div>`;
  }
  // Cartão de gráfico com título
  function chartCard(titulo, conteudo, extra) { return `<div class="card dash-chart"><div class="card-title">${escapeHtml(titulo)}${extra ? `<span class="ct-extra">${extra}</span>` : ""}</div>${conteudo}</div>`; }

  function toast(msg, tipo) {
    let host = document.getElementById("toastHost");
    if (!host) { host = document.createElement("div"); host.id = "toastHost"; document.body.appendChild(host); }
    const el = document.createElement("div");
    el.className = "toast toast-" + (tipo || "info");
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.classList.add("show"); }, 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3200);
  }

  // ---------- Arranque de página ----------
  function initPage(active, perfisPermitidos) {
    initTheme();
    seed();
    if (active !== "public") { if (!requireAuth(perfisPermitidos)) return null; }
    renderHeader(active === "public" ? "" : active);
    return currentUser();
  }

  // ---------- API pública ----------
  const AY = {
    // primitivas (para módulos)
    KEYS, PREFIX, read, write, uid, round2, hoje, hojeData, escapeHtml, qs, $, $$,
    formatKz, formatKz2, formatMoeda2, formatDate, formatDateTime, nomeMes, MESES,
    moeda, taxaIVA, REGIMES,
    // domínio / auth
    PERFIS, perfilLabel, CAPS, can, ehAdminLike, perfilPermitido, podeAprovar,
    Store, login, logout, registar, currentUser, requireAuth, seed,
    getConfig, saveConfig, getEmpresa, saveEmpresa, moduloAtivo, MODULOS,
    exercicios, exercicioAtivo, saveExercicio, removeExercicio, exercicioAnterior, exercicioOptions,
    // notificações
    notifDoUser, notifNaoLidas, marcarLida, marcarTodasLidas,
    // UI
    initTheme, toggleTheme, renderHeader, initPage, toast, coverHTML, kpi, badge,
    chartBars, chartDonut, chartCard, iconHTML,
  };
  global.AY = AY;

})(window);
