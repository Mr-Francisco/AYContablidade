"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Carrossel horizontal de painéis inteiros.
 *
 * Um painel de cada vez, à largura toda, e passa-se ao lado — não se empilha
 * por baixo. A diferença não é decorativa: empilhado, o segundo painel só
 * existe para quem faz scroll, e o primeiro ecrã do sistema passa a ser meia
 * página de marca com os números escondidos em baixo.
 *
 * A ÁREA É O QUE CABE NO ECRÃ, e o painel activo enche-a. Se o conteúdo for
 * mais alto do que isso, o scroll é DO PAINEL e não da página (regra dos
 * históricos — ver `Paginacao.tsx`). Assim a página não cresce à medida que se
 * acrescenta informação a um dos painéis.
 *
 * Os painéis inactivos ficam com `inert`: continuam no DOM para a transição
 * poder correr, mas não recebem foco nem cliques. Sem isso, o `Tab` saltava
 * para ligações invisíveis do painel do lado.
 */

export interface PainelCarrossel {
  /** Identificador estável — serve de chave e de `aria-label` do indicador. */
  id: string;
  /** Nome curto para leitores de ecrã e para o botão indicador. */
  titulo: string;
  conteudo: ReactNode;
}

/**
 * Folga por baixo de tudo.
 *
 * Tem de cobrir o `pb-10` do contentor da aplicação (40 px): se for menor, o
 * carrossel enche o ecrã, a margem de baixo empurra o documento e a página
 * ganha uma barra de scroll para mostrar espaço vazio.
 */
const FOLGA_INFERIOR = 44;

/** Nunca encolher abaixo disto, mesmo num ecrã baixo: espremido não se lê. */
const ALTURA_MINIMA = 420;

export function Carrossel({
  paineis,
  inicial = 0,
  className,
  nota,
  aoMudar,
}: {
  paineis: PainelCarrossel[];
  /** Índice do painel a mostrar à entrada. */
  inicial?: number;
  className?: string;
  /**
   * Linha de ajuda por baixo dos indicadores. Vive aqui dentro e não na
   * página para entrar na conta da altura — o que ficasse por fora era
   * exactamente o que fazia a página crescer.
   */
  nota?: ReactNode;
  aoMudar?: (indice: number) => void;
}) {
  const [activo, setActivo] = useState(inicial);
  const [altura, setAltura] = useState<number>();
  const viewport = useRef<HTMLDivElement>(null);
  const rodape = useRef<HTMLDivElement>(null);

  const total = paineis.length;
  const indice = Math.min(activo, total - 1);

  const ir = useCallback(
    (destino: number) => {
      const n = ((destino % total) + total) % total;
      setActivo(n);
      aoMudar?.(n);
    },
    [total, aoMudar],
  );

  // A área do carrossel é O QUE CABE NO ECRÃ, e os painéis enchem-na.
  //
  // Já foi a altura do painel activo, medida com um `ResizeObserver`. Não
  // funcionava: a caixa do painel tem tamanho fixo (é a do carrossel), por isso
  // o observador nunca disparava quando o CONTEÚDO crescia — o painel ficava do
  // tamanho que tinha antes de os dados chegarem, cortado a meio.
  //
  // Assim também é o que se quer ver: um painel de cada vez a ocupar a área
  // principal, e não dois painéis de alturas diferentes a saltar ao mudar.
  // `useLayoutEffect` porque medir depois da pintura dava um salto visível.
  useLayoutEffect(() => {
    const medir = () => {
      const caixa = viewport.current;
      if (!caixa) return;

      // Os indicadores e a nota também ocupam ecrã. Medidos da base do
      // carrossel à base do rodapé, e não pelo `offsetHeight` dele: as margens
      // não entram no `offsetHeight` e a página ficava a transbordar
      // exactamente a margem que sobrava.
      const rect = caixa.getBoundingClientRect();
      const abaixo = rodape.current
        ? Math.max(
            0,
            rodape.current.getBoundingClientRect().bottom - rect.bottom,
          )
        : 0;
      const nova = Math.max(
        ALTURA_MINIMA,
        window.innerHeight - rect.top - abaixo - FOLGA_INFERIOR,
      );
      // Só se escreve quando muda mesmo. Sem esta guarda, medir → mudar altura
      // → o corpo muda de tamanho → medir outra vez, e o `ResizeObserver`
      // entrava em ciclo.
      setAltura((anterior) =>
        anterior !== undefined && Math.abs(anterior - nova) <= 1
          ? anterior
          : nova,
      );
    };

    medir();

    const observador = new ResizeObserver(medir);
    if (rodape.current) observador.observe(rodape.current);
    // O corpo entra na conta porque o carrossel pode DESCER ou SUBIR sem mudar
    // de tamanho: basta o aviso de segurança do topo ser dispensado. Sem isto,
    // a altura ficava a do sítio onde o carrossel estava antes.
    observador.observe(document.body);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  // Setas do teclado, quando o foco está dentro do carrossel.
  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(indice + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(indice - 1);
    }
  };

  // Arrastar com o dedo. Só o gesto horizontal conta — um deslize vertical é
  // scroll do painel e não deve mudar de painel nenhum.
  const toque = useRef<{ x: number; y: number } | null>(null);
  const inicioToque = (e: React.TouchEvent) => {
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY };
  };
  const fimToque = (e: React.TouchEvent) => {
    if (!toque.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toque.current.x;
    const dy = t.clientY - toque.current.y;
    toque.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      ir(indice + (dx < 0 ? 1 : -1));
    }
  };

  return (
    <section
      className={cn("relative", className)}
      aria-roledescription="carrossel"
      aria-label="Painel inicial"
      onKeyDown={teclado}
    >
      <div
        ref={viewport}
        className="overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
        style={{ height: altura }}
        onTouchStart={inicioToque}
        onTouchEnd={fimToque}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${indice * 100}%)` }}
        >
          {paineis.map((p, i) => (
            <div
              key={p.id}
              // Painel e indicador ligam-se como separador e conteúdo: é o que
              // faz um leitor de ecrã anunciar «painel 1 de 2» ao mudar, em vez
              // de duas caixas soltas.
              //
              // `inert` tira do alcance do teclado e do rato de uma vez só — é
              // o que evita o `Tab` cair no painel escondido. Não se lhe põe
              // `invisible`: o painel que sai tem de continuar a ver-se
              // enquanto desliza, senão a transição é um salto para o vazio.
              role="tabpanel"
              id={`painel-${p.id}`}
              aria-labelledby={`indicador-${p.id}`}
              inert={i !== indice}
              className="w-full shrink-0 overflow-y-auto overscroll-contain px-px"
              style={{ maxHeight: altura }}
            >
              {p.conteudo}
            </div>
          ))}
        </div>
      </div>

      {/* Em ecrã largo as setas ficam por cima das margens do painel. Em
          telemóvel não há margem nenhuma e tapavam o texto dos cartões — por
          isso ali descem para junto dos indicadores. */}
      <Seta
        lado="esquerda"
        onClick={() => ir(indice - 1)}
        className="absolute top-1/2 z-10 hidden -translate-y-1/2 min-[700px]:grid left-1 lg:-left-3"
      />
      <Seta
        lado="direita"
        onClick={() => ir(indice + 1)}
        className="absolute top-1/2 z-10 hidden -translate-y-1/2 min-[700px]:grid right-1 lg:-right-3"
      />

      <div ref={rodape}>
        <div className="mt-3 flex items-center justify-center gap-3">
          <Seta
            lado="esquerda"
            onClick={() => ir(indice - 1)}
            className="grid h-8 w-8 min-[700px]:hidden"
          />
          <div
            role="tablist"
            aria-label="Painéis"
            className="flex items-center justify-center gap-2"
          >
            {paineis.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`indicador-${p.id}`}
                aria-controls={`painel-${p.id}`}
                aria-selected={i === indice}
                // Só o indicador activo entra na ordem do `Tab`: dentro de um
                // `tablist` navega-se com as setas, não saltando de ponto em ponto.
                tabIndex={i === indice ? 0 : -1}
                onClick={() => ir(i)}
                aria-label={`Ver ${p.titulo}`}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  i === indice
                    ? "w-7 bg-marca"
                    : "w-2.5 bg-borda hover:bg-texto-suave",
                )}
              />
            ))}
          </div>
          <Seta
            lado="direita"
            onClick={() => ir(indice + 1)}
            className="grid h-8 w-8 min-[700px]:hidden"
          />
        </div>
        {nota}
      </div>
    </section>
  );
}

function Seta({
  lado,
  onClick,
  className,
}: {
  lado: "esquerda" | "direita";
  onClick: () => void;
  className?: string;
}) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "esquerda" ? "Painel anterior" : "Painel seguinte"}
      className={cn(
        "h-10 w-10 place-items-center rounded-full",
        "border border-borda bg-superficie/90 text-texto shadow-suave backdrop-blur",
        "transition-colors hover:border-acento hover:text-acento",
        className,
      )}
    >
      <Icone size={20} />
    </button>
  );
}
