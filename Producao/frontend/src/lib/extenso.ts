/**
 * Valor por extenso, em português de Portugal.
 *
 * Vai no documento legal — «Valor total: dois milhões, quinhentos e trinta e
 * dois mil kwanzas e cinquenta cêntimos» — e não é decoração: é a forma
 * clássica de impedir que um algarismo seja alterado num documento impresso.
 * Transposto de `Piloto/assets/js/fatura-doc.js`, com as regras do português
 * europeu que o Piloto já respeitava: «cem» sozinho mas «cento e um», o «e»
 * entre centenas e dezenas, e «milhão/milhões».
 */

const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezasseis",
  "dezassete",
  "dezoito",
  "dezanove",
];

const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];

const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

/** Até 999. «Cem» é o único caso em que não se diz «cento». */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(DEZENAS[d] + (u ? ` e ${UNIDADES[u]}` : ""));
    }
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const partes: string[] = [];
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  if (milhoes)
    partes.push(`${ate999(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  // «mil» e não «um mil» — em português não se diz o «um».
  if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));

  return partes.join(" e ");
}

/**
 * O valor inteiro, com moeda e cêntimos.
 *
 * `moeda` no plural é o que aparece («kwanzas»); com valor 1 usa-se o
 * singular, porque «um kwanzas» dá nas vistas num documento oficial.
 */
export function valorPorExtenso(
  valor: number | string,
  moeda = "kwanzas",
  moedaSingular = "kwanza",
): string {
  const n = Math.round((Number(valor) || 0) * 100) / 100;
  const inteiro = Math.floor(n);
  const centimos = Math.round((n - inteiro) * 100);

  const unidade = inteiro === 1 ? moedaSingular : moeda;
  let texto = `${inteiroPorExtenso(inteiro)} ${unidade}`;
  if (centimos > 0) {
    texto += ` e ${inteiroPorExtenso(centimos)} ${
      centimos === 1 ? "cêntimo" : "cêntimos"
    }`;
  }
  // Primeira letra maiúscula: é uma frase do documento, não um fragmento.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
