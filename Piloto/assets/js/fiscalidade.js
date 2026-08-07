/* SGD — Módulo de Fiscalidade (Angola / AGT).
 * Catálogo de impostos, regimes de IVA, obrigações por forma jurídica e regime, calendário fiscal.
 * Fontes: Portal do Contribuinte (minfin.gov.ao) e AGT. As taxas devem ser confirmadas com a legislação em vigor. */
(function (global) {
  "use strict";
  const AY = global.AY;
  if (!AY) { console.error("fiscalidade.js: AY não carregado."); return; }
  const round2 = AY.round2;

  // ---------------- Regimes de IVA ----------------
  const REGIMES_IVA = [
    {
      id: "exclusao", nome: "Regime de Não Sujeição (Exclusão)", cor: "#8a8a8a",
      limite: "Volume de negócios ou importações ≤ 25.000.000 Kz",
      taxa: "Não liquida IVA nas suas operações",
      deducao: "Sem direito à dedução do IVA suportado",
      declaracao: "Dispensado da declaração periódica de IVA",
      pagamento: "Não entrega IVA (salvo IVA cativo/autoliquidação em importações)",
      obrigacoes: [
        "Emissão de fatura/fatura-recibo com a menção «IVA — Regime de Não Sujeição»",
        "Comunicação de faturas (SAF-T / faturação certificada) quando aplicável",
        "Mudança obrigatória de regime até ao fim do mês seguinte se ultrapassar 25 M Kz",
      ],
    },
    {
      id: "simplificado", nome: "Regime Simplificado", cor: "#d68910",
      limite: "Volume de negócios entre 25.000.000 e 350.000.000 Kz",
      taxa: "Paga 7% sobre os recebimentos (operações não isentas)",
      deducao: "Dedução limitada a 10% do IVA suportado nas aquisições",
      declaracao: "Declaração do Regime Simplificado do IVA (mensal)",
      pagamento: "Por via eletrónica, até ao último dia útil do mês seguinte",
      obrigacoes: [
        "Declaração do Regime Simplificado — mensal (último dia útil do mês seguinte)",
        "Emissão de faturas por sistema de faturação válido",
        "Escrituração do livro de registo de compras e vendas",
        "Mudança para Regime Geral se ultrapassar 350 M Kz (até ao fim do mês seguinte)",
      ],
    },
    {
      id: "geral", nome: "Regime Geral", cor: "#7a3aab",
      limite: "Volume de negócios > 350.000.000 Kz ou grandes contribuintes",
      taxa: "14% (taxa normal). Reduzidas: 7% hotelaria/restauração, 5% cesta básica e insumos agrícolas, 1% Cabinda",
      deducao: "Direito à dedução integral do IVA suportado",
      declaracao: "Declaração Periódica do IVA (mensal) com anexos",
      pagamento: "Por via eletrónica, até ao último dia útil do mês seguinte",
      obrigacoes: [
        "Declaração Periódica do IVA — mensal (último dia útil do mês seguinte)",
        "Anexo de fornecedores, clientes, existências e regularizações",
        "Faturação eletrónica certificada e comunicação à AGT",
        "Autoliquidação (IVA cativo) nas operações com não residentes, quando aplicável",
        "Reembolso/crédito de IVA a favor do sujeito passivo, quando aplicável",
      ],
    },
  ];
  function regimeIVA(id) { return REGIMES_IVA.find(r => r.id === id) || REGIMES_IVA[0]; }

  // ---------------- Regimes de Imposto Industrial ----------------
  const REGIMES_II = [
    { id: "geral", nome: "Regime Geral (contabilidade organizada)", antigo: "antigo Grupo A", taxa: "25% sobre o lucro tributável (10% agro-pecuária/pesca)",
      declaracao: "Declaração Modelo 1 — anual, no mês de Maio, com DR, Balanço, Balancete e anexos assinados por contabilista",
      provisorio: "Liquidação provisória: 2% sobre o volume de vendas do 1.º semestre, até ao fim de Agosto" },
    { id: "simplificado", nome: "Regime Simplificado", antigo: "antigo Grupo B", taxa: "25% sobre o lucro (ou tributação simplificada sobre o volume de faturação)",
      declaracao: "Declaração Modelo 2 — anual, até ao fim de Abril",
      provisorio: "Liquidação provisória: 2% sobre o volume de vendas do 1.º semestre, até ao fim de Julho" },
  ];

  // ---------------- Formas jurídicas ----------------
  const FORMAS = [
    { id: "eni", nome: "Empresário em Nome Individual (ENI)", nota: "Tributado em IRT (Grupo B/C) ou Imposto Industrial simplificado, consoante a atividade." },
    { id: "lda", nome: "Sociedade por Quotas (Lda.)", nota: "Contabilidade organizada; sujeita a Imposto Industrial no Regime Geral." },
    { id: "sa", nome: "Sociedade Anónima (S.A.)", nota: "Contabilidade organizada e certificação de contas; distribuição de dividendos sujeita a IAC." },
    { id: "coop", nome: "Cooperativa", nota: "Pode beneficiar de isenções/reduções ao abrigo do Código dos Benefícios Fiscais." },
    { id: "sucursal", nome: "Sucursal de sociedade estrangeira", nota: "Tributada em Angola pelos rendimentos aqui obtidos; retenções na fonte a não residentes." },
    { id: "publica", nome: "Empresa Pública / Instituto", nota: "Sujeita às regras gerais, com especificidades de reporte ao Estado." },
    { id: "petrolifero", nome: "Concessionária / Associada Petrolífera", nota: "Regime fiscal petrolífero especial (Lei 13/04) que substitui o Imposto Industrial." },
  ];
  function forma(id) { return FORMAS.find(f => f.id === id) || FORMAS[1]; }

  // ---------------- Catálogo de impostos ----------------
  const IMPOSTOS = [
    { sigla: "IVA", nome: "Imposto sobre o Valor Acrescentado", categoria: "Despesa / Consumo",
      incidencia: "Transmissão de bens, prestação de serviços e importações efetuadas em território nacional.",
      taxa: "14% (normal) · 7% hotelaria e restauração · 5% cesta básica e insumos agrícolas · 1% Cabinda",
      calculo: "IVA liquidado nas vendas − IVA dedutível nas compras. No Regime Simplificado: 7% dos recebimentos − 10% do IVA suportado.",
      modelos: ["Declaração Periódica do IVA (Regime Geral)", "Declaração do Regime Simplificado", "Anexos: fornecedores, clientes, existências, regularizações"],
      prazo: "Mensal — até ao último dia útil do mês seguinte", retencao: "IVA cativo (autoliquidação) em operações com não residentes e por entidades do Estado." },
    { sigla: "II", nome: "Imposto Industrial", categoria: "Rendimento",
      incidencia: "Lucros imputáveis ao exercício de atividade comercial ou industrial exercida em Angola.",
      taxa: "25% (geral) · 10% (atividades agrícolas, aquícolas, apícolas, avícolas, pecuárias, silvícolas e de pesca)",
      calculo: "25% × lucro tributável (resultado líquido corrigido fiscalmente). Pagamento provisório de 2% sobre as vendas do 1.º semestre.",
      modelos: ["Declaração Modelo 1 (Regime Geral) — Maio", "Declaração Modelo 2 (Simplificado) — Abril"],
      prazo: "Anual — Modelo 1 em Maio; Modelo 2 até Abril; liquidação provisória em Julho/Agosto", retencao: "Retenção de 6,5% sobre prestações de serviços (a contribuintes sem contabilidade adequada)." },
    { sigla: "IRT", nome: "Imposto sobre os Rendimentos do Trabalho", categoria: "Rendimento",
      incidencia: "Rendimentos do trabalho por conta de outrem (Grupo A), independente (Grupo B) e comercial/industrial (Grupo C).",
      taxa: "Tabela progressiva (isenção até 100.000 Kz) · Grupo B/C: 6,5% ou 10% sobre a faturação",
      calculo: "Grupo A: tabela progressiva sobre a matéria coletável (bruto − INSS − subsídios isentos). Retenção na fonte pela entidade patronal.",
      modelos: ["Mapa de Remunerações — Modelo IRT A2.1 (mensal)", "Declaração anual de rendimentos"],
      prazo: "Retenção entregue até ao fim do mês seguinte; mapa mensal", retencao: "Retenção na fonte pela entidade empregadora / pagadora." },
    { sigla: "IAC", nome: "Imposto sobre a Aplicação de Capitais", categoria: "Rendimento",
      incidencia: "Rendimentos de capitais: dividendos, juros, royalties, suprimentos e outros.",
      taxa: "Secção A: 15% · Secção B: 10% (geral) · 5% (mercados regulamentados / compensações)",
      calculo: "Taxa × rendimento de capitais. Retenção na fonte pela entidade que paga ou coloca à disposição.",
      modelos: ["Declaração de retenção de IAC"], prazo: "Retenção entregue até ao fim do mês seguinte", retencao: "Retenção na fonte." },
    { sigla: "IS", nome: "Imposto de Selo", categoria: "Selo / Documentos",
      incidencia: "Documentos, contratos, operações financeiras, garantias, recibos e outros atos da Tabela do Imposto de Selo.",
      taxa: "Variável conforme a verba da Tabela (ex.: operações financeiras, arrendamento, garantias, letras)",
      calculo: "Taxa/verba da Tabela × valor do ato ou documento.", modelos: ["Declaração/guia do Imposto de Selo"],
      prazo: "Até ao fim do mês seguinte ao da constituição da obrigação", retencao: "Liquidado e entregue pela entidade que pratica o ato." },
    { sigla: "IEC", nome: "Imposto Especial de Consumo", categoria: "Despesa / Consumo",
      incidencia: "Produção, importação e consumo de bens específicos (bebidas alcoólicas, tabaco, veículos, produtos de luxo, etc.).",
      taxa: "Variável por produto (geralmente 2% a 30% ou mais)", calculo: "Taxa específica/ad valorem × base do bem.",
      modelos: ["Declaração do IEC"], prazo: "Mensal", retencao: "—" },
    { sigla: "IP", nome: "Imposto Predial", categoria: "Património",
      incidencia: "Detenção, arrendamento e transmissão onerosa de prédios (substituiu o IPU e a SISA — Lei 20/20).",
      taxa: "Detenção: 0,5% sobre o valor patrimonial (acima do limite isento) · Arrendamento: 25% sobre a renda · Transmissão (SISA): 2%",
      calculo: "Sobre a renda: 25% × renda recebida (retenção pelo arrendatário empresa). Transmissão: 2% × valor.",
      modelos: ["Declaração do Imposto Predial", "Guia de transmissão (SISA)"], prazo: "Arrendamento: mensal; detenção: anual/prestações", retencao: "Retenção de 25% sobre a renda pelas entidades com contabilidade organizada." },
    { sigla: "ISD", nome: "Imposto sobre Sucessões e Doações", categoria: "Património",
      incidencia: "Transmissões gratuitas de bens por morte ou doação.", taxa: "Progressiva conforme o grau de parentesco e o valor",
      calculo: "Taxa × valor dos bens transmitidos.", modelos: ["Declaração de transmissão gratuita"], prazo: "Após o facto tributário", retencao: "—" },
    { sigla: "IVM", nome: "Imposto sobre os Veículos Motorizados", categoria: "Património",
      incidencia: "Propriedade de veículos motorizados.", taxa: "Valor fixo anual por tipo, cilindrada / tonelagem e idade do veículo",
      calculo: "Tabela fixa por categoria de veículo.", modelos: ["Guia de pagamento do IVM"], prazo: "Anual (1.º trimestre)", retencao: "—" },
    { sigla: "PETRO", nome: "Regime Fiscal Petrolífero", categoria: "Regime Especial",
      incidencia: "Rendimentos das atividades de pesquisa, desenvolvimento e produção de petróleo (Lei 13/04).",
      taxa: "Imposto sobre o Rendimento do Petróleo (IRP) 50%/65,75% · Imposto sobre a Produção do Petróleo ~20% · Imposto de Transação · Taxa de Superfície",
      calculo: "Regime especial que substitui o Imposto Industrial para as concessionárias e associadas.",
      modelos: ["Declarações específicas do setor petrolífero"], prazo: "Conforme contrato de concessão / partilha de produção", retencao: "Retenções específicas do setor." },
  ];
  function imposto(sigla) { return IMPOSTOS.find(i => i.sigla === sigla) || null; }

  // ---------------- Gerador de obrigações por empresa ----------------
  // cfg: { forma, regimeIVA, regimeII, temEmpregados, pagaCapitais, temImoveisArrend }
  function obrigacoes(cfg) {
    cfg = cfg || {};
    const o = [];
    const add = (imposto, obrigacao, periodicidade, prazo, cor) => o.push({ imposto, obrigacao, periodicidade, prazo, cor: cor || "#4a4ecb" });
    const petro = cfg.forma === "petrolifero";

    // IVA
    const ri = regimeIVA(cfg.regimeIVA || "geral");
    if (ri.id === "exclusao") {
      add("IVA", "Emissão de faturas com menção de não sujeição a IVA", "Contínua", "—", "#8a8a8a");
    } else if (ri.id === "simplificado") {
      add("IVA", "Declaração do Regime Simplificado do IVA", "Mensal", "Último dia útil do mês seguinte", "#d68910");
      add("IVA", "Pagamento de 7% sobre os recebimentos (deduzindo 10% do IVA suportado)", "Mensal", "Último dia útil do mês seguinte", "#d68910");
    } else {
      add("IVA", "Declaração Periódica do IVA + anexos (fornecedores, clientes, existências)", "Mensal", "Último dia útil do mês seguinte", "#7a3aab");
      add("IVA", "Pagamento do IVA apurado (liquidado − dedutível)", "Mensal", "Último dia útil do mês seguinte", "#7a3aab");
    }

    // Imposto Industrial (ou regime petrolífero)
    if (petro) {
      add("PETRO", "Declarações e liquidações do regime fiscal petrolífero (IRP, produção, transação)", "Conforme contrato", "Conforme concessão", "#1a9c5f");
    } else {
      const rii = REGIMES_II.find(r => r.id === (cfg.regimeII || "geral")) || REGIMES_II[0];
      if (rii.id === "geral") {
        add("II", "Declaração Modelo 1 (com DR, Balanço, Balancete e anexos)", "Anual", "Maio", "#1e5fcc");
        add("II", "Liquidação provisória — 2% sobre as vendas do 1.º semestre", "Anual", "Até fim de Agosto", "#1e5fcc");
      } else {
        add("II", "Declaração Modelo 2 (Regime Simplificado)", "Anual", "Até fim de Abril", "#1e5fcc");
        add("II", "Liquidação provisória — 2% sobre as vendas do 1.º semestre", "Anual", "Até fim de Julho", "#1e5fcc");
      }
    }

    // IRT + Segurança Social (empregadores)
    if (cfg.temEmpregados !== false) {
      add("IRT", "Retenção e entrega do IRT dos trabalhadores", "Mensal", "Fim do mês seguinte", "#e6007e");
      add("IRT", "Mapa de Remunerações — Modelo IRT A2.1", "Mensal", "Fim do mês seguinte", "#e6007e");
      add("INSS", "Contribuição para a Segurança Social (3% trabalhador + 8% empresa)", "Mensal", "Até ao dia 10 do mês seguinte", "#b81893");
    }

    // IAC
    if (cfg.pagaCapitais) add("IAC", "Retenção e entrega do IAC (dividendos, juros, royalties)", "Mensal / por evento", "Fim do mês seguinte", "#7a3aab");

    // Imposto Predial (arrendamento)
    if (cfg.temImoveisArrend) add("IP", "Retenção de 25% sobre rendas e entrega do Imposto Predial", "Mensal", "Fim do mês seguinte", "#1a9c5f");

    // Imposto de Selo (transversal)
    add("IS", "Imposto de Selo sobre contratos, operações financeiras e garantias", "Por evento", "Fim do mês seguinte", "#8e44ad");

    // Específicos por forma jurídica
    if (cfg.forma === "sa") add("II", "Certificação legal de contas / auditoria e ata de aprovação de contas", "Anual", "Após a assembleia geral anual", "#1e5fcc");
    if (cfg.forma === "coop") add("II", "Comprovação dos requisitos de benefícios fiscais (isenções/reduções)", "Anual", "Com a declaração anual", "#1a9c5f");

    return o;
  }

  // ---------------- Calendário fiscal (obrigações recorrentes por mês) ----------------
  const CALENDARIO = [
    { mes: "Mensal", itens: ["IVA — Declaração periódica/simplificada e pagamento (último dia útil do mês seguinte)", "IRT — Retenção e Mapa de Remunerações (fim do mês seguinte)", "INSS — Contribuição (até ao dia 10)", "IAC / Imposto de Selo — quando aplicável"] },
    { mes: "Abril", itens: ["Imposto Industrial — Declaração Modelo 2 (Regime Simplificado)"] },
    { mes: "Maio", itens: ["Imposto Industrial — Declaração Modelo 1 (Regime Geral) com demonstrações financeiras"] },
    { mes: "Julho", itens: ["Imposto Industrial — Liquidação provisória (2% s/ vendas 1.º semestre) — Regime Simplificado"] },
    { mes: "Agosto", itens: ["Imposto Industrial — Liquidação provisória (2% s/ vendas 1.º semestre) — Regime Geral"] },
    { mes: "1.º Trimestre", itens: ["Imposto sobre Veículos Motorizados (IVM) — pagamento anual"] },
  ];

  // ---------------- Cálculos ----------------
  function calcII(lucroTributavel, taxa) { return round2((Number(lucroTributavel) || 0) * (taxa != null ? taxa : 25) / 100); }
  function calcProvisorioII(vendasSemestre) { return round2((Number(vendasSemestre) || 0) * 0.02); }
  function calcIVASimplificado(recebimentos, ivaSuportado) { return round2((Number(recebimentos) || 0) * 0.07 - (Number(ivaSuportado) || 0) * 0.10); }
  function calcIVAGeral(baseVendas, taxa, ivaDedutivel) { return round2((Number(baseVendas) || 0) * (taxa != null ? taxa : 14) / 100 - (Number(ivaDedutivel) || 0)); }

  const FONTES = [
    { nome: "Portal do Contribuinte — Impostos e Taxas", url: "https://portaldocontribuinte.minfin.gov.ao/impostos-e-taxas" },
    { nome: "AGT — Administração Geral Tributária", url: "https://agt.minfin.gov.ao/PortalAGT/" },
    { nome: "Calendário Fiscal (Portal do Contribuinte)", url: "https://portaldocontribuinte.minfin.gov.ao/pdfs/CALENDARIO_FISCAL_2026.pdf" },
  ];

  AY.fisc = { REGIMES_IVA, regimeIVA, REGIMES_II, FORMAS, forma, IMPOSTOS, imposto, obrigacoes, CALENDARIO, FONTES,
    calcII, calcProvisorioII, calcIVASimplificado, calcIVAGeral };
})(window);
