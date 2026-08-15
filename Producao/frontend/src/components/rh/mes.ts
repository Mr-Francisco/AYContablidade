/**
 * O mês de RH é sempre `AAAA-MM`.
 *
 * Vale a pena ter isto num sítio só: no Piloto o mês era a chave de tudo
 * (alterações, processamento, pagamento, mapa de remunerações) e qualquer
 * página que o formate à sua maneira deixa de encontrar os registos das
 * outras. É também por isto que o valor NÃO passa por `toLocaleDateString`:
 * "08/2026" e "2026-08" são a mesma coisa para uma pessoa e coisas diferentes
 * para uma comparação de strings.
 */

const NOMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Mês corrente em `AAAA-MM`. */
export function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "Agosto de 2026". Devolve o original se não reconhecer. */
export function mesPorExtenso(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  if (!m) return mes ?? "";
  const nome = NOMES[Number(m[2]) - 1];
  return nome ? `${nome} de ${m[1]}` : mes;
}

/** Os 24 meses até ao actual, do mais recente para o mais antigo. */
export function ultimosMeses(quantos = 24): string[] {
  const hoje = new Date();
  const lista: string[] = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return lista;
}

/**
 * O período de dois dígitos com o ano do exercício: "08" + "2026" → "2026-08".
 *
 * A base guarda o PERÍODO (`08`) e o exercício à parte — é o que permite uma
 * empresa ter dois anos. Quem lê a lista precisa do mês por extenso, e
 * `mesPorExtenso("08")` devolve "08", que não diz nada a ninguém.
 */
export function mesDoExercicio(mes: string, exercicio?: string | null): string {
  if (/^\d{4}-\d{2}$/.test(mes)) return mes;
  const ano = /(\d{4})/.exec(exercicio ?? "")?.[1];
  return ano ? `${ano}-${mes.padStart(2, "0")}` : mes;
}

export const ESTADOS_MES: Record<string, { rotulo: string; cor: string }> = {
  por_processar: { rotulo: "Por processar", cor: "#c98a10" },
  processado: { rotulo: "Processado", cor: "#3d7fe0" },
  pago: { rotulo: "Pago", cor: "#1a9c5f" },
};
