import type { Conta } from "@/types";

/**
 * Peças do plano de contas partilhadas por quem o desenha ou o percorre.
 *
 * Existem aqui porque a árvore é a mesma em três sítios — a página do Plano, o
 * selector de conta (F4) e o explorador — e três cópias divergiam à primeira
 * correcção.
 */

export const CLASSES: Record<string, string> = {
  "1": "Meios Fixos e Investimentos",
  "2": "Existências",
  "3": "Terceiros",
  "4": "Disponibilidades",
  "5": "Capital e Reservas",
  "6": "Proveitos e Ganhos",
  "7": "Custos e Perdas",
  "8": "Resultados",
  "9": "Contabilidade Analítica",
};

export const NATUREZAS: Record<string, { rotulo: string; cor: string }> = {
  D: { rotulo: "Devedora", cor: "#16a085" },
  C: { rotulo: "Credora", cor: "#c0392b" },
  M: { rotulo: "Mista", cor: "#8a8a8a" },
};

/**
 * Uma conta é de MOVIMENTO (folha) se o plano o disser (`tipo === "M"`, como no
 * Primavera) ou, na falta de tipo, se nenhuma outra conta estender o seu
 * código.
 *
 * A regra é a mesma de `services/contabilidade.py::eh_movimento`. Divergir dela
 * daria um selector que oferece contas que o servidor depois recusa.
 */
export function ehMovimento(conta: Conta, todas: Conta[]): boolean {
  if (conta.tipo) return conta.tipo === "M";
  return !todas.some(
    (o) =>
      o.id !== conta.id &&
      o.codigo.length > conta.codigo.length &&
      o.codigo.startsWith(conta.codigo),
  );
}

export interface ArvorePlano {
  porCodigo: Map<string, Conta>;
  filhos: Map<string, Conta[]>;
  raizesPorClasse: Record<string, Conta[]>;
}

/**
 * Constrói a hierarquia a partir dos códigos.
 *
 * A mãe de uma conta é a conta EXISTENTE com o prefixo mais longo — e não o
 * código com menos um dígito. Num plano onde há `34` e `3431` mas não `343`, é
 * o que faz `3431` cair debaixo de `34` em vez de virar raiz.
 *
 * A ordenação é por string e não numérica, de propósito: `3431` tem de vir
 * depois de `343`, e ordenar por número punha `3431` antes de `344`.
 */
export function construirArvore(contas: Conta[]): ArvorePlano {
  const porCodigo = new Map<string, Conta>();
  for (const c of contas) porCodigo.set(c.codigo, c);

  const ordenadas = [...contas].sort((a, b) =>
    a.codigo.localeCompare(b.codigo),
  );
  const filhos = new Map<string, Conta[]>();
  const raizesPorClasse: Record<string, Conta[]> = {};

  for (const c of ordenadas) {
    let mae: Conta | undefined;
    for (let n = c.codigo.length - 1; n >= 1; n--) {
      const p = porCodigo.get(c.codigo.slice(0, n));
      if (p) {
        mae = p;
        break;
      }
    }
    if (mae) {
      const lista = filhos.get(mae.codigo);
      if (lista) lista.push(c);
      else filhos.set(mae.codigo, [c]);
    } else {
      const cl = c.codigo[0];
      const raizes = raizesPorClasse[cl];
      if (raizes) raizes.push(c);
      else raizesPorClasse[cl] = [c];
    }
  }

  return { porCodigo, filhos, raizesPorClasse };
}

/** A mãe de uma conta, ou `null` se for raiz. */
export function maeDe(
  codigo: string,
  porCodigo: Map<string, Conta>,
): Conta | null {
  for (let n = codigo.length - 1; n >= 1; n--) {
    const p = porCodigo.get(codigo.slice(0, n));
    if (p) return p;
  }
  return null;
}

/**
 * Os códigos a mostrar numa pesquisa: os que correspondem **e todos os seus
 * ascendentes**.
 *
 * Sem os ascendentes, o resultado aparecia sem o ramo que o contém e a árvore
 * ficava com nós órfãos pendurados no nada.
 */
export function visiveisNaPesquisa(
  contas: Conta[],
  arvore: ArvorePlano,
  procura: string,
): Set<string> | null {
  const q = procura.toLowerCase().trim();
  if (!q) return null;

  const visiveis = new Set<string>();
  for (const c of contas) {
    if (
      !c.codigo.toLowerCase().includes(q) &&
      !c.nome.toLowerCase().includes(q)
    )
      continue;
    let actual: Conta | null = c;
    while (actual) {
      visiveis.add(actual.codigo);
      actual = maeDe(actual.codigo, arvore.porCodigo);
    }
  }
  return visiveis;
}
