"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { Botao } from "@/components/ui";

/**
 * A regra dos históricos, num sítio só.
 *
 * NENHUMA LISTA CRONOLÓGICA CRESCE SEM FIM NA PÁGINA. Um exercício com quatro
 * mil lançamentos não pode dar quatro mil linhas de HTML: o browser engasga, o
 * rato percorre metros, e quem procura um movimento de ontem tem de passar por
 * tudo o resto.
 *
 * A escolha aqui foi CARREGAMENTO INCREMENTAL e não `overflow-y: scroll`, por
 * três razões concretas:
 *
 *   1. Uma barra de rolamento dentro de outra é uma armadilha — no telemóvel o
 *      dedo nunca acerta na que quer, e a roda do rato salta de uma para a
 *      outra a meio do gesto.
 *   2. Uma tabela com altura fixa perde o cabeçalho ou perde os totais; as
 *      duas coisas fazem falta ao mesmo tempo.
 *   3. Rolar dentro de uma caixa não reduz o que o browser desenha. O
 *      problema de quatro mil linhas continua lá, só deixa de se ver.
 *
 * O que se ganha: a página fica curta, o browser desenha pouco, e quem precisa
 * de ver mais carrega uma vez em «Mostrar mais». E — o que mais falta fazia —
 * **diz-se sempre quantos registos existem**, em vez de mostrar uma lista
 * aparentemente completa que não é.
 *
 * Onde NÃO se usa: catálogos (plano de contas, artigos, clientes) e relatórios
 * de dimensão fixa (balanço, demonstração de resultados). Esses não crescem
 * com o tempo — ver `docs/documentacao/PROJECT_DOCUMENTATION.md`.
 */

/** Quantos registos se mostram de início, e de cada vez que se pede mais.
 *
 *  Vinte e cinco cabe num ecrã de portátil sem rolar, e é mais do que a
 *  maioria das consultas precisa. Cem por clique porque quem carrega uma vez
 *  costuma estar à procura de algo mais antigo, e três cliques para lá chegar
 *  seriam dois a mais. */
export const POR_PAGINA = 25;
export const INCREMENTO = 100;

/**
 * Divide uma lista em «o que se mostra» e «o resto».
 *
 * Devolve também o que o rodapé precisa de saber. A contagem regressa a zero
 * quando o conteúdo muda — mudar de filtro e continuar a ver 500 linhas de uma
 * pesquisa anterior seria pior do que não filtrar.
 */
export function useHistorico<T>(
  dados: T[] | undefined,
  { inicial = POR_PAGINA }: { inicial?: number } = {},
) {
  const total = dados?.length ?? 0;
  const [limite, setLimite] = useState(inicial);

  // `total` como dependência e não o array: o SWR devolve um array novo a cada
  // revalidação, e reiniciar a contagem nessa altura fazia a lista encolher
  // sozinha enquanto se estava a ler.
  useEffect(() => {
    setLimite(inicial);
  }, [inicial]);

  const visiveis = (dados ?? []).slice(0, limite);

  return {
    visiveis,
    total,
    mostrados: visiveis.length,
    temMais: total > visiveis.length,
    mostrarMais: () => setLimite((l) => l + INCREMENTO),
    mostrarTodos: () => setLimite(total),
    reiniciar: () => setLimite(inicial),
  };
}

/**
 * O rodapé da lista: quantos há, quantos se vêem, e como ver mais.
 *
 * Aparece SEMPRE que há registos, mesmo quando estão todos à vista — «7
 * registos» é informação, e uma lista que só mostra o rodapé quando está
 * cortada deixa a pessoa sem saber se está a ver tudo.
 */
export function RodapeHistorico({
  total,
  mostrados,
  temMais,
  mostrarMais,
  mostrarTodos,
  nome = "registos",
  /** O servidor cortou a resposta? Então o total nem é o total. */
  truncadoNoServidor,
}: {
  total: number;
  mostrados: number;
  temMais: boolean;
  mostrarMais: () => void;
  mostrarTodos: () => void;
  nome?: string;
  truncadoNoServidor?: boolean;
}) {
  if (total === 0) return null;

  return (
    <div className="sem-imprimir flex flex-wrap items-center justify-between gap-3 border-t border-borda px-4 py-3">
      <p className="text-[13px] text-texto-suave">
        {temMais ? (
          <>
            A mostrar <b className="tabular text-texto">{mostrados}</b> de{" "}
            <b className="tabular text-texto">
              {total.toLocaleString("pt-PT")}
            </b>{" "}
            {nome}
          </>
        ) : (
          <>
            <b className="tabular text-texto">
              {total.toLocaleString("pt-PT")}
            </b>{" "}
            {total === 1 ? nome.replace(/s$/, "") : nome}
          </>
        )}
        {truncadoNoServidor && (
          <>
            {" — "}
            <span className="text-[var(--color-aviso)]">
              pode haver mais; refine os filtros
            </span>
          </>
        )}
      </p>

      {temMais && (
        <div className="flex items-center gap-2">
          <Botao variante="neutro" tamanho="pequeno" onClick={mostrarMais}>
            <ChevronDown size={14} />
            Mostrar mais {Math.min(INCREMENTO, total - mostrados)}
          </Botao>
          {total - mostrados > INCREMENTO && (
            <button
              type="button"
              onClick={mostrarTodos}
              // `py-2 -my-2`: o alvo de toque cresce para os 36 px sem mexer
              // no alinhamento com o botão ao lado. Um link de 20 px é
              // difícil de acertar com o polegar.
              className="-my-2 px-1 py-2 text-[13px] font-semibold text-marca hover:underline"
            >
              Mostrar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Variante compacta: histórico que vive ao lado de outra coisa.
 *
 * Aqui a altura máxima com rolamento interno É a solução certa, e é a única
 * situação em que se usa: o histórico é secundário na página (o histórico de
 * meses processados por baixo do botão de processar, por exemplo), tem dezenas
 * de linhas e não milhares, e o que interessa é que não empurre o conteúdo
 * principal para fora do ecrã.
 *
 * A altura é em `rem` e não em `vh`: num telemóxel deitado, `40vh` são cento e
 * oitenta píxeis e não cabe linha nenhuma.
 */
export function HistoricoCompacto({
  children,
  altura = "26rem",
}: {
  children: React.ReactNode;
  altura?: string;
}) {
  return (
    <div
      className="overflow-y-auto overscroll-contain"
      style={{ maxHeight: altura }}
    >
      {children}
    </div>
  );
}
