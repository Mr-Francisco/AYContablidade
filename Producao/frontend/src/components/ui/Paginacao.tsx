"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { Botao } from "@/components/ui";

/**
 * Paginação e caixa de histórico — a regra de listagens do projecto.
 *
 * NENHUM HISTÓRICO É INFINITO NO ECRÃ. Uma lista que cresce sem limite faz
 * três coisas más ao mesmo tempo: alonga a página até ser impossível chegar
 * ao rodapé, traz milhares de registos que ninguém vai ler, e torna cada
 * abertura mais lenta do que a anterior. Ao fim de um ano de utilização é a
 * diferença entre um ecrã que abre e um que não abre.
 *
 * Por isso: **o scroll é DESTA CAIXA e não da página**, e os dados vêm uma
 * página de cada vez. Está aqui e não em cada ecrã porque foi assim que as
 * listagens divergiram antes — cada uma com o seu tamanho, as suas palavras e
 * o seu sítio para os botões.
 */

/** O que o servidor devolve em qualquer listagem paginada. */
export interface Pagina<T> {
  linhas: T[];
  total: number;
  offset: number;
  limite: number;
}

export const LIMITE_OMISSAO = 25;

/**
 * Estado de paginação para usar na chave do SWR.
 *
 *   const p = usePaginacao();
 *   const { data } = useSWR<Pagina<X>>(`/api/x?${p.query}`, buscador);
 *   …
 *   <BarraPaginacao pagina={data} {...p.controlos} />
 */
export function usePaginacao(limite = LIMITE_OMISSAO) {
  const [offset, setOffset] = useState(0);

  // `reiniciar` e `controlos` são estáveis de propósito: entram em listas de
  // dependências de `useEffect` («mudou o filtro, volta à primeira página») e,
  // recriados a cada render, davam um ciclo de renderizações.
  const reiniciar = useCallback(() => setOffset(0), []);
  const controlos = useMemo(
    () => ({
      aoAnterior: () => setOffset((o) => Math.max(0, o - limite)),
      aoSeguinte: () => setOffset((o) => o + limite),
    }),
    [limite],
  );

  return {
    offset,
    limite,
    query: `offset=${offset}&limite=${limite}`,
    /** Voltar ao início — chamar sempre que um filtro muda. */
    reiniciar,
    controlos,
  };
}

/**
 * A caixa de um histórico: altura máxima e scroll próprio.
 *
 * `altura` em píxeis. O valor certo é o que mostra sete ou oito linhas — o
 * suficiente para se perceber o padrão do que lá está sem empurrar o resto da
 * página para fora do ecrã.
 */
export function CaixaHistorico({
  children,
  altura = 380,
  className,
}: {
  children: ReactNode;
  altura?: number;
  className?: string;
}) {
  return (
    <div
      // `caixa-historico` existe para o `@media print`: no papel a caixa
      // abre-se e imprime tudo. Uma tabela cortada pela altura de um ecrã não
      // é um documento.
      className={`caixa-historico overflow-y-auto overscroll-contain ${className ?? ""}`}
      style={{ maxHeight: altura }}
    >
      {children}
    </div>
  );
}

/**
 * «1–25 de 4 812», com anterior e seguinte.
 *
 * Diz o TOTAL e não só a página: sem ele não se sabe se faltam três linhas ou
 * três mil, e o botão «seguinte» é um salto no escuro.
 */
export function BarraPaginacao({
  pagina,
  aoAnterior,
  aoSeguinte,
  nome = "registos",
}: {
  pagina: Pagina<unknown> | undefined;
  aoAnterior: () => void;
  aoSeguinte: () => void;
  /** Como se chamam as linhas: «lançamentos», «movimentos», «acções». */
  nome?: string;
}) {
  if (!pagina || pagina.total === 0) return null;

  const primeiro = pagina.offset + 1;
  const ultimo = Math.min(pagina.offset + pagina.linhas.length, pagina.total);
  const haAnterior = pagina.offset > 0;
  const haSeguinte = ultimo < pagina.total;

  // Uma barra que não pagina nada é ruído: com tudo à vista, não aparece.
  if (!haAnterior && !haSeguinte) {
    return (
      <p className="border-t border-borda px-4 py-2 text-[12px] text-texto-suave">
        {pagina.total} {nome}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-4 py-2">
      <span className="tabular text-[12px] text-texto-suave">
        {primeiro}–{ultimo} de {pagina.total} {nome}
      </span>
      <div className="flex items-center gap-1.5">
        <Botao
          variante="neutro"
          tamanho="pequeno"
          onClick={aoAnterior}
          disabled={!haAnterior}
        >
          <ChevronLeft size={14} />
          Anterior
        </Botao>
        <Botao
          variante="neutro"
          tamanho="pequeno"
          onClick={aoSeguinte}
          disabled={!haSeguinte}
        >
          Seguinte
          <ChevronRight size={14} />
        </Botao>
      </div>
    </div>
  );
}
