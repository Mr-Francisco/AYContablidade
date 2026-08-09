/* biome-ignore-all lint/suspicious/noArrayIndexKey: a lista é o resultado de
   analisar uma cadeia imutável — as posições nunca se reordenam nem se inserem
   elementos a meio, e o índice é a identidade estável de cada bloco. Inventar
   uma chave a partir do conteúdo daria colisões em linhas repetidas. */

import type { ReactNode } from "react";

/**
 * Leitor do Markdown que o assistente devolve.
 *
 * O modelo responde em Markdown — `**negrito**`, listas numeradas, títulos — e
 * até aqui a resposta era mostrada em texto simples. O utilizador lia
 * literalmente `1. **IVA por Apurar**: há um aviso...`, com os asteriscos à
 * vista. Numa análise contabilística de vinte linhas isso são dezenas de
 * asteriscos entre o leitor e o que interessa.
 *
 * NÃO USA BIBLIOTECA e NÃO GERA HTML. Constrói elementos React a partir do
 * texto, o que torna a injecção impossível por construção: não há
 * `dangerouslySetInnerHTML` nem sanitização em que confiar. O que vem da API
 * externa nunca chega ao DOM como marcação.
 *
 * Cobre o subconjunto que o modelo usa mesmo — títulos, listas, negrito,
 * itálico, código e citações. O resto do Markdown fica como texto, que é o
 * comportamento honesto para um leitor parcial: nunca esconde conteúdo.
 */

/** Divide uma linha em pedaços de texto, negrito, itálico e código. */
function inline(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  // A ordem importa: `**` antes de `*`, senão o negrito é lido como dois
  // itálicos vazios.
  const padrao = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let ultimo = 0;
  let n = 0;

  for (const m of texto.matchAll(padrao)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push(texto.slice(ultimo, i));
    const t = m[0];
    const k = `${chave}-${n++}`;

    if (t.startsWith("**") || t.startsWith("__")) {
      partes.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("`")) {
      partes.push(
        <code
          key={k}
          className="tabular rounded bg-superficie-2 px-1 py-0.5 text-[0.92em]"
        >
          {t.slice(1, -1)}
        </code>,
      );
    } else {
      partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    }
    ultimo = i + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes.length ? partes : [texto];
}

type Bloco =
  | { tipo: "p"; linhas: string[] }
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "citacao"; linhas: string[] };

/** Agrupa as linhas em blocos. Uma passagem só, sem retroceder. */
function blocos(fonte: string): Bloco[] {
  const saida: Bloco[] = [];
  const linhas = fonte.replace(/\r\n/g, "\n").split("\n");

  for (const linha of linhas) {
    const t = linha.trim();
    const ultimo = saida.at(-1);

    if (!t) {
      // Uma linha vazia fecha o bloco corrente.
      if (ultimo && ultimo.tipo === "p") saida.push({ tipo: "p", linhas: [] });
      continue;
    }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(t);
    if (titulo) {
      saida.push({
        tipo: "titulo",
        nivel: titulo[1].length,
        texto: titulo[2],
      });
      continue;
    }

    const numerada = /^\d+[.)]\s+(.*)$/.exec(t);
    if (numerada) {
      if (ultimo?.tipo === "lista" && ultimo.ordenada)
        ultimo.itens.push(numerada[1]);
      else saida.push({ tipo: "lista", ordenada: true, itens: [numerada[1]] });
      continue;
    }

    const marcada = /^[-*+]\s+(.*)$/.exec(t);
    if (marcada) {
      if (ultimo?.tipo === "lista" && !ultimo.ordenada)
        ultimo.itens.push(marcada[1]);
      else saida.push({ tipo: "lista", ordenada: false, itens: [marcada[1]] });
      continue;
    }

    const citada = /^>\s?(.*)$/.exec(t);
    if (citada) {
      if (ultimo?.tipo === "citacao") ultimo.linhas.push(citada[1]);
      else saida.push({ tipo: "citacao", linhas: [citada[1]] });
      continue;
    }

    if (ultimo?.tipo === "p" && ultimo.linhas.length) ultimo.linhas.push(t);
    else saida.push({ tipo: "p", linhas: [t] });
  }

  return saida.filter((b) => b.tipo !== "p" || b.linhas.length > 0);
}

export function Markdown({ children }: { children: string }) {
  const partes = blocos(children ?? "");

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      {partes.map((b, i) => {
        const k = `b${i}`;
        if (b.tipo === "titulo") {
          // Os títulos do modelo não são a estrutura da página — são ênfase
          // dentro de uma resposta. Por isso saem sempre como o mesmo elemento
          // e distinguem-se pelo tamanho, em vez de criarem uma hierarquia de
          // h2/h3 que confundiria um leitor de ecrã.
          return (
            <p
              key={k}
              className={
                b.nivel <= 2
                  ? "mt-1 text-[15px] font-bold"
                  : "mt-1 text-sm font-bold"
              }
            >
              {inline(b.texto, k)}
            </p>
          );
        }

        if (b.tipo === "lista") {
          const Lista = b.ordenada ? "ol" : "ul";
          return (
            <Lista
              key={k}
              className={
                b.ordenada
                  ? "flex list-decimal flex-col gap-1.5 pl-5"
                  : "flex list-disc flex-col gap-1.5 pl-5"
              }
            >
              {b.itens.map((item, j) => (
                <li key={`${k}-${j}`} className="pl-0.5">
                  {inline(item, `${k}-${j}`)}
                </li>
              ))}
            </Lista>
          );
        }

        if (b.tipo === "citacao") {
          return (
            <blockquote
              key={k}
              className="border-l-2 border-borda pl-3 text-texto-suave"
            >
              {b.linhas.map((l, j) => (
                <p key={`${k}-${j}`}>{inline(l, `${k}-${j}`)}</p>
              ))}
            </blockquote>
          );
        }

        return (
          <p key={k} className="break-words">
            {b.linhas.map((l, j) => (
              <span key={`${k}-${j}`}>
                {inline(l, `${k}-${j}`)}
                {j < b.linhas.length - 1 && " "}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
