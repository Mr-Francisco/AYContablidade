import Big from "big.js";

/**
 * Aritmética e formatação de valores monetários.
 *
 * A API envia dinheiro como STRING, não como número JSON. Um número JSON é
 * lido como double de 64 bits, que garante 15–17 dígitos significativos; as
 * colunas da base são `Numeric(18,2)`. Somar em `number` faria um balancete
 * que fecha no servidor chegar desequilibrado por um cêntimo ao ecrã, sem nada
 * a explicar porquê.
 *
 * Por isso: NUNCA converter um valor monetário para `number`. Toda a
 * aritmética passa por aqui.
 */

// Sem notação exponencial: 1e21 escreveria "1e+21" numa factura.
Big.PE = 1_000_000;
Big.NE = -1_000_000;

export type Valor = string | number | Big | null | undefined;

/** Converte para Big, tratando nulos e strings vazias como zero. */
export function big(v: Valor): Big {
  if (v === null || v === undefined || v === "") return new Big(0);
  if (v instanceof Big) return v;
  try {
    return new Big(v);
  } catch {
    return new Big(0);
  }
}

export function soma(...valores: Valor[]): Big {
  return valores.reduce<Big>((acc, v) => acc.plus(big(v)), new Big(0));
}

export function subtrai(a: Valor, b: Valor): Big {
  return big(a).minus(big(b));
}

export function multiplica(a: Valor, b: Valor): Big {
  return big(a).times(big(b));
}

/** Divisão protegida: divisor zero devolve zero em vez de rebentar. */
export function divide(a: Valor, b: Valor): Big {
  const divisor = big(b);
  if (divisor.eq(0)) return new Big(0);
  return big(a).div(divisor);
}

/** Percentagem que `parte` representa de `total`, com 1 casa decimal. */
export function percentagem(parte: Valor, total: Valor): number {
  const t = big(total).abs();
  if (t.eq(0)) return 0;
  return Number(big(parte).abs().div(t).times(100).round(1).toString());
}

export function ehZero(v: Valor): boolean {
  return big(v).eq(0);
}

export function ehNegativo(v: Valor): boolean {
  return big(v).lt(0);
}

export function compara(a: Valor, b: Valor): number {
  return big(a).cmp(big(b));
}

/**
 * Formata à portuguesa: milhares com espaço fino, decimais com vírgula.
 *
 * Feito à mão em vez de `toLocaleString` porque este recebe uma string e
 * converter para `number` para formatar reintroduzia exactamente o erro de
 * precisão que estamos a evitar.
 */
export function formata(v: Valor, casas = 2): string {
  const n = big(v).round(casas, Big.roundHalfUp);
  const negativo = n.lt(0);
  const texto = n.abs().toFixed(casas);
  const [inteiro, decimal] = texto.split(".");

  let agrupado = "";
  for (let i = 0; i < inteiro.length; i++) {
    if (i > 0 && (inteiro.length - i) % 3 === 0) agrupado += " "; // espaço fino
    agrupado += inteiro[i];
  }

  const saida = decimal ? `${agrupado},${decimal}` : agrupado;
  return negativo ? `−${saida}` : saida; // sinal menos tipográfico, não hífen
}

/**
 * Um inteiro agrupado como o resto do sistema: `1 000 000`.
 *
 * O `toLocaleString("pt-PT")` agrupa com pontos — `1.000.000` — e num ecrã de
 * contabilidade isso é ambíguo: o ponto é separador decimal em metade do mundo
 * e a mesma tabela passava a ter dois agrupamentos diferentes conforme o número
 * fosse dinheiro ou contagem. Aqui é sempre o mesmo espaço fino.
 */
export function formataInteiro(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  return formata(String(n), 0);
}

/** Valor com moeda: "1 234,56 Kz". */
export function formataMoeda(v: Valor, moeda = "Kz", casas = 2): string {
  return `${formata(v, casas)} ${moeda}`;
}

/** Valor compacto para KPIs: "1,2 M Kz". Só para leitura, nunca para conferir. */
export function formataCompacto(v: Valor, moeda = "Kz"): string {
  const n = big(v);
  const abs = n.abs();
  const sinal = n.lt(0) ? "−" : "";

  if (abs.gte(1_000_000_000)) {
    return `${sinal}${formata(abs.div(1_000_000_000), 1)} MM ${moeda}`;
  }
  if (abs.gte(1_000_000)) {
    return `${sinal}${formata(abs.div(1_000_000), 1)} M ${moeda}`;
  }
  if (abs.gte(1_000)) {
    return `${sinal}${formata(abs.div(1_000), 1)} mil ${moeda}`;
  }
  return `${sinal}${formata(abs, 0)} ${moeda}`;
}

/** Devolve string com 2 casas, pronta a enviar para a API. */
export function paraApi(v: Valor, casas = 2): string {
  return big(v).round(casas, Big.roundHalfUp).toFixed(casas);
}

/** Converte para number — SÓ para gráficos, onde a precisão exacta não conta. */
export function paraGrafico(v: Valor): number {
  return Number(big(v).toString());
}
