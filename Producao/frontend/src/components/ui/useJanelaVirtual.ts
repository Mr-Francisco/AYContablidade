"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   Desenhar só as linhas que se vêem.

   O PROBLEMA MEDIDO: o Plano de Contas tem 1631 linhas e põe-nas todas no
   ecrã. Cada tecla escrita no filtro custava 410 ms — o browser refaz mil e
   seiscentas linhas para mostrar quatro. Nenhum `useMemo` resolve isso: o
   trabalho não é calcular quais as linhas, é desenhá-las.

   O QUE ISTO FAZ: em vez das 1631, desenha as que cabem no ecrã mais uma
   margem, e põe duas linhas vazias — uma acima e outra abaixo — com a altura
   do que não está desenhado. A barra de scroll fica do tamanho certo e quem
   rola não nota a diferença.

   EXIGE ALTURA DE LINHA FIXA, e é por isso que as linhas passaram a ter uma só
   linha de texto. Com designações a quebrar para duas linhas, as alturas eram
   37, 39 e 56 px conforme a linha, e a conta do que fica acima dava sempre
   errado — o conteúdo saltava ao rolar.
--------------------------------------------------------------------------- */

export function useJanelaVirtual({
  total,
  alturaLinha,
  margem = 10,
  indiceObrigatorio,
}: {
  total: number;
  /** Altura de UMA linha, em pixels. Tem de ser a real e igual para todas. */
  alturaLinha: number;
  /** Linhas desenhadas para cada lado do que se vê. Absorve o rolar rápido —
   *  sem margem, rolar depressa mostrava branco antes de desenhar. */
  margem?: number;
  /** Uma linha que TEM de ser desenhada mesmo estando fora do que se vê.
   *
   *  É a célula que está a ser escrita: se saísse da janela, o campo era
   *  desmontado a meio da palavra e perdia-se o que lá estava. */
  indiceObrigatorio?: number | null;
}) {
  const referencia = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // Antes da primeira medição, um valor que dá para encher um ecrã: começar a
  // zero desenhava zero linhas e a página aparecia vazia por um instante.
  const [alturaVisivel, setAlturaVisivel] = useState(600);

  const limpeza = useRef<(() => void) | null>(null);

  // UMA *CALLBACK REF*, e não um `useEffect` com `[]`.
  //
  // A tabela só existe depois de as contas chegarem do servidor. Um efeito com
  // dependências vazias corre UMA vez, na montagem — e nessa altura o elemento
  // que rola ainda não existe, `referencia.current` é nulo, o efeito desiste e
  // nunca mais tenta. O resultado era a barra de scroll a andar com o conteúdo
  // parado nas primeiras linhas, sem erro nenhum a apontar o problema.
  //
  // Uma callback ref é chamada pelo React QUANDO O NÓ APARECE, e outra vez
  // quando desaparece. Não há momento em que se possa perder.
  const referenciaLigada = useCallback((elemento: HTMLDivElement | null) => {
    limpeza.current?.();
    limpeza.current = null;
    referencia.current = elemento;
    if (!elemento) return;

    const medir = () => setAlturaVisivel(elemento.clientHeight || 600);
    const aoRolar = () => setScrollTop(elemento.scrollTop);

    medir();
    aoRolar();
    // `passive` porque isto nunca cancela o gesto de rolar.
    elemento.addEventListener("scroll", aoRolar, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);

    limpeza.current = () => {
      elemento.removeEventListener("scroll", aoRolar);
      observador.disconnect();
    };
  }, []);

  useEffect(() => () => limpeza.current?.(), []);

  // FILTRAR ENCURTA A LISTA e o scroll fica para lá do fim: se estivesse na
  // linha 1500 e o filtro deixasse 4, ficava a olhar para o vazio sem perceber
  // que havia resultados lá em cima.
  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;
    if (scrollTop > total * alturaLinha) {
      elemento.scrollTop = 0;
      setScrollTop(0);
    }
  }, [total, alturaLinha, scrollTop]);

  let inicio = Math.max(0, Math.floor(scrollTop / alturaLinha) - margem);
  let fim = Math.min(
    total,
    Math.ceil((scrollTop + alturaVisivel) / alturaLinha) + margem,
  );

  if (
    indiceObrigatorio !== null &&
    indiceObrigatorio !== undefined &&
    indiceObrigatorio >= 0 &&
    indiceObrigatorio < total
  ) {
    inicio = Math.min(inicio, indiceObrigatorio);
    fim = Math.max(fim, indiceObrigatorio + 1);
  }

  return {
    /** No elemento que rola. Liga o ouvinte assim que o nó aparece. */
    referencia: referenciaLigada,
    inicio,
    fim,
    /** Altura das linhas que ficam por cima, para a linha vazia de topo. */
    alturaAcima: inicio * alturaLinha,
    /** E das que ficam por baixo. */
    alturaAbaixo: Math.max(0, (total - fim) * alturaLinha),
  };
}
