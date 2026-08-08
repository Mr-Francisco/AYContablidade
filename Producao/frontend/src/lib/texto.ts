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
