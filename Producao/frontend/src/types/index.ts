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
  unidade: string | null;
  tipo_artigo: string | null;
  preco_venda: string;
  preco_compra: string;
  taxa_iva: string;
  stock_min: string;
  estado: string;
}
