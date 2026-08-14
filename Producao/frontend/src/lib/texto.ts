/** Utilitários de texto em Português (PT-PT). */

/**
 * "1 conta", "2 contas", "0 contas".
 *
 * Existe porque interpolar `${n} contas` dá "1 contas" — pequeno, mas é o tipo
 * de coisa que faz uma aplicação parecer traduzida à pressa. O plural
 * irregular passa-se explicitamente: `plural(n, "mês", "meses")`.
 */
export function plural(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * `40.0000` → `40`; `1.5000` → `1,5`; `25.00` → `25`.
 *
 * Para quantidades, taxas e percentagens — números que NÃO são dinheiro. O
 * backend devolve-os com as casas do `Numeric` da base, e «40,0000 Un» ou
 * «14,00 %» lêem-se pior do que «40 Un» e «14 %». Os valores monetários não
 * passam por aqui: esses querem sempre as duas casas.
 */
export function numeroLimpo(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace(".", ",") : String(v);
}
