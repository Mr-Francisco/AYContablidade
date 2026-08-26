/**
 * Tipos da API.
 *
 * Valores monetários são `string` de propósito — ver `lib/dinheiro.ts`. Se
 * aparecer `number` num campo de dinheiro, é erro.
 */

export type Perfil =
  | "superadmin"
  | "admin"
  | "contabilista"
  | "financeiro"
  | "comercial"
  | "logistica"
  | "rh"
  | "consulta";

export type Modulo =
  | "contabilidade"
  | "contasCorrentes"
  | "comercial"
  | "logistica"
  | "imobilizados"
  | "analitica"
  | "rh"
  | "fiscalidade";

export interface Utilizador {
  id: string;
  empresa_id: string | null;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  aprovado: boolean;
  telefone: string | null;
  modulos_permitidos: string[] | null;
  permissoes_extra: string[];
  permissoes_accao: Record<string, string[]>;
  ultimo_login: string | null;
  totp_ativo: boolean;
  /** A palavra-passe actual foi definida por outra pessoa. Só serve para
   *  avisar — não tranca nada. */
  password_provisoria: boolean;
}

/** Estado do segundo factor da própria conta. Nunca traz o segredo. */
export interface EstadoTotp {
  ativo: boolean;
  ativado_em: string | null;
  codigos_por_usar: number;
  /** Perfis de administração da plataforma não o podem desligar. */
  obrigatorio: boolean;
}

/** Primeiro passo do login quando a conta tem segundo factor.
 *
 * Não traz token nenhum: enquanto houver desafio não há sessão. Uma
 * palavra-passe errada numa conta com 2FA devolve isto na mesma — é o que
 * impede o formulário de servir para confirmar palavras-passe. */
export interface Desafio2Fa {
  requer_2fa: true;
  desafio: string;
  expira_em: string;
}

/** Material de configuração. Só existe entre iniciar e confirmar. */
export interface InicioTotp {
  qr_svg: string;
  segredo: string;
  uri: string;
}

export interface RespostaLogin {
  access_token: string;
  token_type: string;
  expira_absoluto: string;
  utilizador: Utilizador;
}

export interface Empresa {
  id: string;
  nome: string;
  nif: string;
  morada: string | null;
  localizacao: string | null;
  telefone: string | null;
  email: string | null;
  moeda: string;
  regime: "geral" | "simplificado" | "exclusao";
  forma_juridica: string | null;
  estado: string;
  criado_em: string;
}

export interface Licenca {
  id: string;
  empresa_id: string;
  chave: string;
  titular: string;
  plano: string;
  validade: string | null;
  estado: "pendente" | "activa" | "expirada" | "suspensa" | "cancelada";
  modulos_incluidos: string[];
  limite_utilizadores: number | null;
  aprovada_em: string | null;
  notas: string | null;
}

export interface Exercicio {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  estado: "aberto" | "fechado";
  ativo: boolean;
  /** Resultado do último Apuramento de Resultados; nulo se ainda por apurar. */
  apuramento: {
    em: string;
    ate: string;
    resultado: string;
    lancamento_ids: string[];
  } | null;
}

// ---------------------------------------------------------------------------
// Contabilidade
// ---------------------------------------------------------------------------
export interface Conta {
  id: string;
  codigo: string;
  nome: string;
  tipo: "M" | "I" | "R" | null;
  natureza: "D" | "C" | "M";
  classe_iva: string | null;
  ativa: boolean;

  /** A ficha de conta do Piloto. Nenhum destes campos entra no motor de
   *  lançamentos — são parametrização e arquivo. */
  classe_primavera: string | null;
  conta_alt_codigo: string | null;
  conta_alt_nome: string | null;
  retencao: string | null;
  motivo_tributacao: string | null;
  trat_pendentes: boolean;
  integra_equipamentos: boolean;
  integra_ativos: boolean;
  investimento: string | null;
  custo_fixo: string;
  item_tesouraria: string | null;
}

export interface Diario {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  ativo: boolean;
}

export interface DocumentoContabilistico {
  id: string;
  codigo: string;
  descricao: string;
  diario_codigo: string;
  conta_debito: string | null;
  conta_credito: string | null;
  retencao: boolean;
  ativo: boolean;

  /** A classe principal, quando este documento é uma subclasse dela.
   *  `211.1` guarda aqui `211`. Um só nível: uma subclasse não tem subclasses. */
  pai_codigo: string | null;
  /** `permanente`, `periodico`, ou vazio — o comportamento de sempre. */
  sistema_inventario: string;
  /** A conta para onde a compra se reflecte no sistema permanente, tipicamente
   *  uma de existências. O outro lado da reflexão é a `conta_debito` deste
   *  documento, creditada — não se guarda porque não é uma escolha. */
  conta_reflexao: string | null;
}

export interface CentroCusto {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  responsavel: string | null;
  estado: string;
}

export interface LinhaLancamento {
  ordem: number;
  conta_codigo: string;
  conta_nome: string | null;
  descricao: string | null;
  debito: string;
  credito: string;
  entidade: string | null;
  /** Cliente, Fornecedor, Estado ou Outro — as opções do Piloto. */
  tipo_entidade: string | null;
  iva_perc: string;
  /** Percentagem de IVA não dedutível. */
  perc_nao_ded: string;
  /** IVA de autoliquidação. */
  iva_autoliq: string;
  centro_codigo: string | null;
  fluxo_codigo: string | null;
  moeda: string;
  cambio: string;
}

export interface Lancamento {
  id: string;
  numero: number;
  numero_op: string | null;
  data: string;
  mes: string;
  diario_codigo: string;
  documento_codigo: string;
  descricao: string | null;
  documento_ref: string | null;
  origem: string;
  diferido: boolean;
  total?: string;
  linhas?: LinhaLancamento[];
}

export interface LinhaBalancete {
  codigo: string;
  nome: string;
  debito: string;
  credito: string;
  saldo_devedor: string;
  saldo_credor: string;
  classe: string;
  natureza: string;
}

/** Custos, proveitos e resultado — o resumo do painel e do explorador. */
export interface Resumo {
  custos: string;
  proveitos: string;
  resultado: string;
  /** Quantos lançamentos há no exercício, e quanto passou por eles. */
  lancamentos?: number;
  movimentado?: string;
}

export interface Balancete {
  linhas: LinhaBalancete[];
  totais: {
    debito: string;
    credito: string;
    saldo_devedor: string;
    saldo_credor: string;
  };
}

export interface LinhaDemonstracao {
  designacao: string;
  nota: string | number;
  valor: string | null;
  tipo: "linha" | "subtotal" | "total" | "cabecalho" | "grupo";
}

export interface DemonstracaoResultados {
  linhas: LinhaDemonstracao[];
  liquido: string;
}

export interface Balanco {
  activo: LinhaDemonstracao[];
  passivo: LinhaDemonstracao[];
  total_activo: string;
  total_cp_passivo: string;
  resultado: string;
  equilibrado: boolean;
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------
export interface Ambito {
  id: string;
  nome: string;
  modulo: Modulo;
  descricao: string;
}

export interface AchadoDiagnostico {
  gravidade: "erro" | "aviso" | "sugestao";
  modulo: string;
  regra: string;
  titulo: string;
  detalhe: string;
  itens: Record<string, unknown>[];
  accao: string | null;
}

export interface Diagnostico {
  achados: AchadoDiagnostico[];
  resumo: { erro: number; aviso: number; sugestao: number };
  total: number;
}

export interface RespostaIA {
  id: string;
  resposta: string;
  modelo: string;
  ambitos: string[];
  entidades_pseudonimizadas: number;
  tokens: { entrada: number | null; saida: number | null };
  duracao_ms: number;
}

// ---------------------------------------------------------------------------
// Comercial
// ---------------------------------------------------------------------------
export interface TipoDocumento {
  cod: string;
  nome: string;
  /** Como lança na contabilidade: venda, venda_pronto, adiantamento,
   *  nota_debito, nota_credito, recibo, nenhum. */
  contab: string;
  exige_cliente?: boolean;
  iva?: boolean;
  ref?: boolean;
  pagamento?: boolean;
  fiscal?: boolean;
}

export interface Terceiro {
  id: string;
  numero: string;
  nome: string;
  nif: string | null;
  localidade: string | null;
  telefone: string | null;
  conta: string | null;
  estado: string;
  /** Só na listagem, para o formulário de alteração vir preenchido. */
  morada?: string | null;
  provincia?: string | null;
  email?: string | null;
}

export interface Vendedor {
  id: string;
  nome: string;
  tipo_comissao: "percentagem" | "fixo";
  comissao_perc: string;
  estado: string;
}

export interface LinhaVenda {
  ordem: number;
  artigo_id: string | null;
  descricao: string | null;
  unidade: string | null;
  qtd: string;
  preco: string;
  total: string;
}

export interface Venda {
  id: string;
  numero: string | null;
  tipo_doc: string;
  tipo: string;
  data: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  vendedor_id?: string | null;
  iva_perc?: string;
  subtotal: string;
  iva: string;
  total: string;
  estado: string;
  numero_op: string | null;
  codigo_validacao: string | null;
  emitido_em?: string | null;
  linhas?: LinhaVenda[];
}

export interface ResumoComercial {
  total_vendas: string;
  total_faturado: string;
  n_vendas: number;
  n_faturadas: number;
  por_faturar: string;
}

export interface Comissao {
  vendedor: string;
  perc: string;
  tipo: string;
  base: string;
  vendas: number;
  comissao: string;
}

// ---------------------------------------------------------------------------
// Logística
// ---------------------------------------------------------------------------
export interface Artigo {
  id: string;
  codigo: string;
  descricao: string;
  familia: string | null;
  subfamilia: string | null;
  unidade: string | null;
  cod_barras: string | null;
  tipo_artigo: string | null;
  preco_venda: string;
  preco_compra: string;
  taxa_iva: string;
  stock_min: string;
  estado: string;
  /** Contas por omissão. A API já as devolvia; declaradas aqui para o
   *  formulário de alteração as poder preencher. */
  conta_existencia: string | null;
  conta_custo: string | null;
  conta_proveito: string | null;
}

export interface Armazem {
  id: string;
  codigo: string;
  nome: string;
  localizacao: string | null;
}

export interface LinhaExistencia {
  artigo_id: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  stock: string;
  custo_medio: string;
  valor: string;
  stock_min: string;
  rutura: boolean;
}

export interface Existencias {
  linhas: LinhaExistencia[];
  valor_total: string;
  em_rutura: number;
}

export interface DocumentoCompra {
  codigo: string;
  descricao: string;
  diario_codigo: string | null;
}

export interface Compra {
  id: string;
  numero: string | null;
  documento_codigo: string;
  documento_nome: string | null;
  data: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  subtotal: string;
  iva: string;
  total: string;
  estado: string;
}

export interface ResumoCompras {
  total_compras: string;
  total_rececionado: string;
  n_compras: number;
  n_emitidas: number;
  por_emitir: string;
}

export interface Colaborador {
  id: string;
  numero: string;
  nome: string;
  categoria: string | null;
  salario_base: string;
  subsidios: string;
  subsidio_ferias: string;
  subsidio_natal: string;
  subs_nao_sujeitos: string;
  data_admissao: string | null;
  iban: string | null;
  nif: string | null;
  num_ss: string | null;
  provincia: string | null;
  municipio: string | null;
  estado: string;
  // Os restantes separadores da ficha (Piloto, `pessoal.html`). Opcionais
  // porque as fichas antigas foram criadas com nove campos e vão sendo
  // completadas à medida que forem abertas.
  nome_abreviado?: string | null;
  genero?: string | null;
  data_nascimento?: string | null;
  nacionalidade?: string | null;
  naturalidade?: string | null;
  morada?: string | null;
  localidade?: string | null;
  codigo_postal?: string | null;
  pais?: string | null;
  comuna?: string | null;
  email?: string | null;
  telefone?: string | null;
  telemovel?: string | null;
  tipo_documento?: string | null;
  num_documento?: string | null;
  validade_documento?: string | null;
  estado_civil?: string | null;
  dependentes?: number;
  regime_irt?: string | null;
  tipo_contrato?: string | null;
  data_fim?: string | null;
  forma_pagamento?: string | null;
  banco?: string | null;
  dias_ferias?: number;
  habilitacoes?: string | null;
  notas?: string | null;
}

export interface LinhaRecibo {
  colaborador_id: string;
  numero: string;
  colaborador: string;
  base: string;
  subs: string;
  bruto: string;
  inss: string;
  materia: string;
  irt: string;
  desc_extra: string;
  desc_faltas: string;
  faltas: string;
  abonos_extra: string;
  liquido: string;
  inss_empresa: string;
}

export interface Folha {
  linhas: LinhaRecibo[];
  totais: {
    bruto: string;
    inss: string;
    irt: string;
    liquido: string;
    inss_empresa: string;
  };
}

export interface AlteracaoMensal {
  id: string;
  colaborador_id: string;
  mes: string;
  faltas: string;
  // A chave é `desc`, não `descricao` — é o que o backend grava e lê.
  abonos: { desc?: string; valor?: string }[];
  descontos: { desc?: string; valor?: string }[];
}

export interface Processamento {
  id: string;
  mes: string;
  totais: Folha["totais"];
  lancado: boolean;
  lancamento_id: string | null;
  criado_em: string;
}

export interface PagamentoSalarial {
  id: string;
  mes: string;
  valor: string;
  conta: string | null;
  lancado: boolean;
  numero_op: string | null;
}

/** Uma linha do Mapa de Remunerações — Modelo IRT A2.1 (AGT). */
export interface LinhaMapaIrt {
  colaborador_id: string;
  nif: string;
  nome: string;
  num_ss: string;
  provincia: string;
  municipio: string;

  // Apuramentos
  salario_base: string;
  descontos_falta: string;
  sub_nao_suj: string;
  sub_suj: string;
  salario_iliquido: string;
  base_ss: string;
  contrib_ss: string;
  base_irt: string;
  irt: string;

  // Rubricas não sujeitas a IRT (Art. 2º do CIRT)
  sub_alimentacao: string;
  sub_transporte: string;
  abono_familia: string;
  reembolso_despesas: string;
  outros_nao_sujeitos: string;

  // Rubricas sujeitas a IRT
  abono_falhas: string;
  sub_renda_casa: string;
  compensacao_rescisao: string;
  sub_ferias: string;
  horas_extras: string;
  sub_atavio: string;
  sub_representacao: string;
  premios: string;
  sub_natal: string;
  outros_sujeitos: string;

  // Marcas do modelo oficial
  calc_manual_excesso: boolean;
  excesso_subsidios_nao_sujeitos: string;
  registo_manual_ss: boolean;
  base_tributavel_ss_manual: string;
  nao_sujeito_ss: boolean;
  isento_irt: boolean;
}

export interface MapaIrt {
  mes: string;
  rubricas_nao_sujeitas: string[];
  rubricas_sujeitas: string[];
  linhas: LinhaMapaIrt[];
  totais: Record<string, string>;
}

/** Um mês processado e o seu estado de pagamento — a lista do Piloto. */
export interface MesAPagar {
  mes: string;
  /** Nome do exercício ("2026"): o mês é o período de dois dígitos. */
  exercicio: string | null;
  liquido: string;
  estado: "processado" | "pago";
  valor_pago: string | null;
  conta: string | null;
  numero_op: string | null;
  lancamento_id: string | null;
}

export interface Independente {
  id: string;
  nome: string;
  nif: string | null;
  atividade: string | null;
  taxa_ret: string;
  estado: string;
}

export interface Honorario {
  /** O lançamento que o honorário gerou, para se poder abrir no diário. */
  lancamento_id?: string | null;
  id: string;
  nome: string;
  data: string;
  mes: string | null;
  descricao: string | null;
  bruto: string;
  taxa: string;
  retencao: string;
  liquido: string;
  numero_op: string | null;
}

export interface EscalaoIrt {
  de: string;
  ate: string | null;
  taxa: string;
  fixa: string;
}

export interface ConfigRh {
  inss_trab: string;
  inss_empr: string;
  irt_versao: string;
  irt: EscalaoIrt[];
  conta_custo: string;
  conta_pagar: string;
  conta_irt: string;
  conta_inss: string;
  conta_banco: string;
  taxa_ret_hon: string;
  [chave: string]: unknown;
}

export interface Ativo {
  id: string;
  codigo: string;
  designacao: string;
  conta_imob: string | null;
  conta_amort_acum: string | null;
  conta_custo_amort: string | null;
  data_aquisicao: string | null;
  valor_aquisicao: string;
  taxa: string;
  metodo: string;
  amort_acumulada: string;
  valor_liquido: string;
  amort_anual: string;
  amort_mensal: string;
  percent_amortizado: number;
  fornecedor: string | null;
  estado: string;

  /** `corporeo` | `incorporeo` | `financeiro` — decide as contas. */
  tipo_imobilizado: string | null;
  /** Um bem que não amortiza, como um terreno. */
  nao_amortizavel: boolean;
  /** A amortização incide só sobre `valor_sujeito_amortizacao`. */
  condicoes_especiais: boolean;
  condicoes_texto: string | null;
  valor_sujeito_amortizacao: string | null;
  /** O valor sobre o qual a amortização incide, já resolvido pelo servidor. */
  base_amortizavel: string;

  /** Ainda em construção: acumula itens e não amortiza. */
  em_curso: boolean;
  fechado_em: string | null;
  /** A conta para onde foi transferido no fecho. */
  conta_destino: string | null;
  /** O que a obra já custou — a soma dos itens. Só vem preenchido enquanto
   *  está em curso; depois de fechada, o valor está no `valor_aquisicao`. */
  valor_acumulado: string | null;
  /** Quantas despesas formam esse acumulado. */
  itens: number | null;
}

/** Um custo somado a um imobilizado em curso. */
export interface ItemImobilizado {
  id: string;
  data: string;
  descricao: string;
  valor: string;
  fornecedor: string | null;
  documento: string | null;
}

export interface LinhaMapaImob {
  id: string;
  codigo: string;
  designacao: string;
  conta: string | null;
  data_aquisicao: string | null;
  valor_bruto: string;
  taxa: string;
  metodo: string;
  amort_acumulada_ant: string;
  amort_exercicio: string;
  amort_acumulada: string;
  valor_liquido: string;
  estado: string;
}

export interface MapaImob {
  linhas: LinhaMapaImob[];
  totais: {
    valor_bruto: string;
    amort_acumulada_ant: string;
    amort_exercicio: string;
    amort_acumulada: string;
    valor_liquido: string;
  };
}

export interface LinhaPeriodoImob {
  id: string;
  codigo: string;
  designacao: string;
  conta: string | null;
  taxa: string;
  metodo: string;
  valor_bruto: string;
  amort_acumulada_atual: string;
  valor_liquido_atual: string;
  valor_periodo: string;
  ja_processado: boolean;
  lancamento_id: string | null;
  estado: string;
}

export interface MapaPeriodoImob {
  linhas: LinhaPeriodoImob[];
  total_periodo: string;
  processado: boolean;
  /** Data do processamento — para o ecrã dizer «Processado em 31/08/2026». */
  processado_em: string | null;
}

export interface ProcessoAmortizacao {
  id: string;
  exercicio_id: string;
  mes: string;
  data: string;
  total_amort: string;
  itens: number;
  por: string | null;
  criado_em: string;
}

export interface LinhaContaCorrente {
  codigo: string;
  nome: string;
  entidade: string;
  debito: string;
  credito: string;
  saldo: string;
  mov: number;
}

export interface ContasCorrentes {
  linhas: LinhaContaCorrente[];
  totais: { debito: string; credito: string; saldo: string };
  natureza: string;
  com_saldo: number;
}

export interface LinhaAnalitica {
  codigo: string;
  nome: string;
  debito: string;
  credito: string;
  saldo: string;
  n: number;
}

export interface MapaAnalitico {
  linhas: LinhaAnalitica[];
  totais: { debito: string; credito: string; saldo: string };
}

export interface Imposto {
  sigla: string;
  nome: string;
  categoria: string;
  incidencia: string;
  taxa: string;
  calculo: string;
  modelos: string[];
  prazo: string;
  retencao: string;
}

export interface RegimeIva {
  id: string;
  nome: string;
  cor: string;
  limite: string;
  taxa: string;
  deducao: string;
  declaracao: string;
  pagamento: string;
  obrigacoes: string[];
}

export interface RegimeIi {
  id: string;
  nome: string;
  antigo: string;
  taxa: string;
  declaracao: string;
  provisorio: string;
}

export interface FormaJuridica {
  id: string;
  nome: string;
  nota: string;
}

export interface MesCalendario {
  mes: string;
  itens: string[];
}

export interface FonteFiscal {
  nome: string;
  url: string;
}

export interface CatalogoFiscal {
  impostos: Imposto[];
  regimes_iva: RegimeIva[];
  regimes_ii: RegimeIi[];
  formas: FormaJuridica[];
  calendario: MesCalendario[];
  fontes: FonteFiscal[];
  categorias: string[];
}

export interface ObrigacaoFiscal {
  imposto: string;
  obrigacao: string;
  periodicidade: string;
  prazo: string;
  cor: string;
}

export interface RespostaObrigacoes {
  forma: FormaJuridica;
  regime_iva: RegimeIva;
  regime_ii: RegimeIi;
  obrigacoes: ObrigacaoFiscal[];
}

export interface SimulacaoIva {
  regime: string;
  liquidado: string;
  dedutivel: string;
  a_entregar: string;
}

export interface AmbitoIa {
  id: string;
  nome: string;
  modulo: string;
  descricao: string;
}

export interface EstadoIa {
  disponivel: boolean;
  modelo: string;
  diagnostico_local: boolean;
  /** Distingue «falta a chave» de «foi desligado pela administração» — são
   *  coisas diferentes e a mensagem a mostrar também é. */
  desligada_pela_plataforma: boolean;
}

export interface RespostaIa {
  id: string;
  resposta: string;
  modelo: string;
  ambitos: string[];
  entidades_pseudonimizadas: number;
  /**  é o tecto definido para a plataforma. Serve para a interface
   *  explicar uma resposta curta em vez de a deixar parecer um defeito. */
  tokens: { entrada: number; saida: number; max_saida?: number };
  duracao_ms: number;
}

/** O que foi pedido numa consulta: âmbitos e período.
 *
 * É um OBJECTO e não uma lista de âmbitos — estava declarado como
 * `string[]`, e chamar `.map` nele rebentava a página inteira do histórico
 * assim que existisse uma consulta gravada. */
export interface ContextoDaConsulta {
  ambitos: string[];
  exercicio_id: string | null;
  de: string | null;
  ate: string | null;
  mes: string | null;
}

export interface ConsultaIa {
  id: string;
  pergunta: string;
  resposta: string | null;
  contexto: ContextoDaConsulta | null;
  modelo: string | null;
  erro: string | null;
  entidades_pseudonimizadas: number;
  duracao_ms: number | null;
  criado_em: string;
}

export interface PreviaContexto {
  pacote: Record<string, unknown>;
  entidades_pseudonimizadas: number;
  identificadores_detectados: string[];
}

export interface PerfilMeta {
  id: string;
  nome: string;
  cor: string;
  atribuivel: boolean;
  capacidades: string[];
}

export interface MetadadosAcesso {
  perfis: PerfilMeta[];
  modulos: { id: string; nome: string }[];
  accoes: string[];
}

export interface ConfigEmpresa {
  modulos: Record<string, boolean>;
  parametrizacoes: Record<string, unknown>;
  agt: Record<string, unknown>;
}

export interface LicencaPlataforma {
  id: string;
  empresa_id: string | null;
  chave_prefixo: string;
  nif_previsto: string;
  nome_previsto: string;
  titular: string;
  plano: string;
  duracao_meses: number | null;
  expira_activacao: string;
  activada_em: string | null;
  validade: string | null;
  estado: string;
  modulos_incluidos: string[];
  limite_utilizadores: number | null;
  limite_tokens_mes: number | null;
  limite_custo_mes: string | null;
  notas: string | null;
}

export interface LicencaGerada {
  id: string;
  chave: string;
  chave_prefixo: string;
  nif_previsto: string;
  nome_previsto: string;
  plano: string;
  expira_activacao: string;
  dias_para_activar: number;
}

export interface EmpresaPlataforma {
  id: string;
  nome: string;
  nif: string;
  codigo: string;
  morada: string | null;
  localizacao: string | null;
  telefone: string | null;
  email: string | null;
  moeda: string;
  regime: string;
  forma_juridica: string | null;
  estado: string;
  /** Número de certificação da AGT. Só a plataforma o define; a empresa vê-o. */
  certificacao_agt: string | null;
  criado_em: string;
}

export interface ConsumoIa {
  mes: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens: number;
  custo: string;
  consultas: number;
  plano: string | null;
  limite_tokens: number | null;
  limite_custo: string | null;
  percentagem: number | null;
  sem_limite: boolean;
  excedido: boolean;
  a_avisar: boolean;
  motivo: string | null;
}

export interface ConsumoEmpresa {
  empresa_id: string;
  empresa: string;
  codigo: string;
  tokens: number;
  custo: string;
  consultas: number;
  plano: string | null;
  limite_tokens: number | null;
  limite_custo: string | null;
  percentagem: number | null;
  excedido: boolean;
}

export interface RegistoAuditoria {
  id: string;
  criado_em: string;
  accao: string;
  actor_nome: string | null;
  actor_email: string | null;
  actor_perfil: string | null;
  alvo_tipo: string | null;
  alvo_desc: string | null;
  empresa_id?: string | null;
  detalhes: Record<string, unknown>;
  ip: string | null;
}

/** Um membro de uma empresa, visto pela administração da plataforma.
 *
 * Só identificação e acesso — o superadministrador gere contas, não consulta
 * a contabilidade dos clientes. */
export interface UtilizadorDaEmpresa {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  aprovado: boolean;
  totp_ativo: boolean;
  ultimo_login: string | null;
  criado_em: string;
}

/** Conta de administração da plataforma. */
export interface ContaPlataforma {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  totp_ativo: boolean;
  ultimo_login: string | null;
  criado_em: string;
}

/** Só existe no momento da criação — a palavra-passe não se recupera depois. */
export interface ContaPlataformaCriada {
  id: string;
  nome: string;
  email: string;
  password_inicial: string;
}

/** Tabela de preços da API de IA em vigor no servidor.
 *
 * A `origem` diz se veio de configuração ou do recurso embutido — a diferença
 * importa a quem confere a factura. */
export interface PrecosIa {
  origem: string;
  de_configuracao: boolean;
  por_omissao: { entrada: string; saida: string };
  modelos: {
    modelo: string;
    entrada: string;
    saida: string;
    entrada_cache: string | null;
  }[];
}

/** Definições de IA da plataforma, geridas pelo superadministrador. */
export interface ConfigIa {
  max_tokens_saida: number;
  minimo: number;
  maximo: number;
  /** Dias até o pacote enviado ser descartado — é o que ocupa espaço. */
  ia_dias_pacote: number;
  dias_pacote_min: number;
  dias_pacote_max: number;
  /** Dias até a consulta ser apagada. Aqui perde-se também o consumo. */
  ia_dias_historico: number;
  dias_historico_min: number;
  dias_historico_max: number;
  /** Modelo em uso agora, já resolvido pelo servidor: o do registo marcado
   *  como padrão. Só de leitura — escolhe-se no registo de modelos. */
  modelo_ia: string;
  /** Interruptor geral do assistente. */
  ia_ativa: boolean;
}

/** Um modelo do registo, gerido pelo superadministrador.
 *
 *  Os preços são `string` de propósito, como todo o dinheiro nesta API: em
 *  vírgula flutuante, `0.075` não é setenta e cinco milésimos, e estes números
 *  multiplicam-se por milhões de tokens. */
export interface ModeloIa {
  id: string;
  nome: string;
  /** O identificador técnico que vai no pedido à API. */
  modelo_id: string;
  preco_entrada: string;
  preco_entrada_cache: string | null;
  preco_saida: string;
  nota: string | null;
  ativo: boolean;
  padrao: boolean;
  /** Só na criação, quando não foi possível confirmar o ID junto da OpenAI. */
  aviso?: string;
}
