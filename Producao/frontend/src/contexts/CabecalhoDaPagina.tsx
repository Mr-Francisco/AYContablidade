"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/* ---------------------------------------------------------------------------
   O título da página sobe para a barra de cima.

   PORQUÊ. O bloco do título ocupava uma faixa inteira no corpo da página: o
   nome em 26 px, a frase que explica o ecrã por baixo, e um risco a fechar —
   79 px, sempre, em todas as páginas. Num portátil de 1366×768 é um décimo do
   ecrã gasto a repetir o nome do sítio onde já se está.

   E A BARRA DE CIMA TINHA ESPAÇO VAZIO. Depois de os módulos passarem para
   baixo, sobrava uma faixa larga entre o logótipo e a empresa sem nada lá
   dentro. O nome da página cabe ali sem custar um pixel de altura a ninguém.

   COMO. As páginas continuam a escrever `<CabecalhoPagina titulo=… />` como
   sempre — cinquenta e sete ficheiros que não mudam uma linha. O componente
   deixou de desenhar e passou a ANUNCIAR: o título e a descrição por aqui, e
   os botões por um portal para dentro da barra.

   PORQUE OS BOTÕES VÃO POR PORTAL e não por este contexto: um `ReactNode` é
   um objecto novo a cada desenho, e guardá-lo em estado com um efeito punha a
   página a redesenhar-se em ciclo. O título e a descrição são texto, e texto
   compara-se.
--------------------------------------------------------------------------- */

interface Pagina {
  titulo: string;
  descricao?: string;
}

interface Contexto {
  pagina: Pagina | null;
  anunciar: (p: Pagina | null) => void;
}

const CabecalhoDaPaginaCtx = createContext<Contexto>({
  pagina: null,
  anunciar: () => {},
});

/** Onde os botões da página aterram, dentro da barra de cima. */
export const ID_DAS_ACCOES = "accoes-da-pagina";

export function ProvedorDoCabecalhoDaPagina({
  children,
}: {
  children: ReactNode;
}) {
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const valor = useMemo(() => ({ pagina, anunciar: setPagina }), [pagina]);
  return (
    <CabecalhoDaPaginaCtx.Provider value={valor}>
      {children}
    </CabecalhoDaPaginaCtx.Provider>
  );
}

/** O que a barra de cima lê para saber onde estamos. */
export function useCabecalhoDaPagina(): Pagina | null {
  return useContext(CabecalhoDaPaginaCtx).pagina;
}

/**
 * Anuncia o título da página à barra de cima.
 *
 * LIMPA AO SAIR. Sem isso, mudar de página deixava o nome da anterior lá em
 * cima até a nova anunciar o seu — e numa página sem cabeçalho ficava para
 * sempre o nome de outra.
 */
export function useAnunciarPagina(titulo: string, descricao?: string) {
  const { anunciar } = useContext(CabecalhoDaPaginaCtx);
  useEffect(() => {
    anunciar({ titulo, descricao });
    return () => anunciar(null);
  }, [titulo, descricao, anunciar]);
}
