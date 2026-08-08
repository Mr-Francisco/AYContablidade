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
  iva_perc: string;
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
}

export interface LinhaRecibo {
  colaborador_id: string;
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

export interface Independente {
  id: string;
  nome: string;
  nif: string | null;
  atividade: string | null;
  taxa_ret: string;
  estado: string;
}

export interface Honorario {
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
}

export interface RespostaIa {
  id: string;
  resposta: string;
  modelo: string;
  ambitos: string[];
  entidades_pseudonimizadas: number;
  tokens: { entrada: number; saida: number };
  duracao_ms: number;
}

export interface ConsultaIa {
  id: string;
  pergunta: string;
  resposta: string | null;
  contexto: string[] | null;
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
