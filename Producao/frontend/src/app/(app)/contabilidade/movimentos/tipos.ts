import type { Lancamento, LinhaLancamento } from "@/types";

/**
 * Uma linha do editor. Tudo `string` de propósito.
 *
 * Os valores viajam como texto entre o campo e a API — nunca como `number`. Um
 * `float` num campo de dinheiro perde cêntimos, e o que o servidor grava é
 * `Numeric(18,2)`. A conversão faz-se com `big.js` só onde há contas a fazer.
 */
export interface Linha {
  /** Identidade estável da linha.
   *
   * Sem ela, a chave do React seria o índice: ao remover a 2.ª de três linhas,
   * a 3.ª passa a ocupar o índice 2 e o React reutiliza os campos da removida —
   * os valores saltam de linha. */
  id: string;
  conta_codigo: string;
  debito: string;
  credito: string;
  iva_perc: string;
  perc_nao_ded: string;
  iva_autoliq: string;
  tipo_entidade: string;
  entidade: string;
  moeda: string;
  cambio: string;
  descricao: string;
  centro_codigo: string;
  fluxo_codigo: string;
}

export function linhaVazia(): Linha {
  return {
    id: crypto.randomUUID(),
    conta_codigo: "",
    debito: "",
    credito: "",
    iva_perc: "",
    perc_nao_ded: "",
    iva_autoliq: "",
    tipo_entidade: "",
    entidade: "",
    moeda: "AKZ",
    cambio: "1",
    descricao: "",
    centro_codigo: "",
    fluxo_codigo: "",
  };
}

/** O que o editor guarda enquanto se lança. */
export interface EstadoEditor {
  /** `null` num movimento novo; o id quando se está a alterar um existente. */
  editId: string | null;
  numeroOp: string | null;
  origem: string;
  data: string;
  mes: string;
  diario: string;
  documento: string;
  documentoRef: string;
  descricao: string;
  diferido: boolean;
  linhas: Linha[];
}

export function estadoNovo(hoje = new Date()): EstadoEditor {
  return {
    editId: null,
    numeroOp: null,
    origem: "manual",
    data: hoje.toISOString().slice(0, 10),
    mes: "",
    diario: "",
    documento: "",
    documentoRef: "",
    descricao: "",
    diferido: false,
    linhas: [linhaVazia(), linhaVazia()],
  };
}

/** Traz um movimento gravado para o editor. */
export function estadoDe(
  l: Lancamento & { linhas?: LinhaLancamento[] },
): EstadoEditor {
  const linhas = (l.linhas ?? []).map((x) => ({
    id: crypto.randomUUID(),
    conta_codigo: x.conta_codigo,
    debito: semZero(x.debito),
    credito: semZero(x.credito),
    iva_perc: semZero(x.iva_perc),
    perc_nao_ded: semZero(x.perc_nao_ded),
    iva_autoliq: semZero(x.iva_autoliq),
    tipo_entidade: x.tipo_entidade ?? "",
    entidade: x.entidade ?? "",
    moeda: x.moeda || "AKZ",
    cambio: x.cambio ?? "1",
    descricao: x.descricao ?? "",
    centro_codigo: x.centro_codigo ?? "",
    fluxo_codigo: x.fluxo_codigo ?? "",
  }));
  // O Piloto garante sempre duas linhas no editor, mesmo num movimento com uma.
  while (linhas.length < 2) linhas.push(linhaVazia());

  return {
    editId: l.id,
    numeroOp: l.numero_op ?? `#${l.numero}`,
    origem: l.origem ?? "manual",
    data: l.data,
    mes: l.mes ?? "",
    diario: l.diario_codigo,
    documento: l.documento_codigo,
    documentoRef: l.documento_ref ?? "",
    descricao: l.descricao ?? "",
    diferido: Boolean(l.diferido),
    linhas,
  };
}

/** `0.00` mostra-se em branco: um zero num campo de valor só estorva. */
function semZero(v: string | null | undefined): string {
  if (!v) return "";
  return Number(v) === 0 ? "" : String(v);
}
