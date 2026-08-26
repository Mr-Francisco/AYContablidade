"use client";

import type {
  ComponentPropsWithRef,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ID_DAS_ACCOES, useAnunciarPagina } from "@/contexts/CabecalhoDaPagina";
import { cn } from "@/lib/utils";

export { Botao } from "./Botao";
export { CabecalhoDoMapa } from "./CabecalhoDoMapa";
export { Carrossel, type PainelCarrossel } from "./Carrossel";
export { Cartao, GrelhaRevelada, ItemRevelado, TituloCartao } from "./Cartao";
export { BarraFiltros, Selector } from "./Filtros";

// ---------------------------------------------------------------------------
// Cabeçalho de página
// ---------------------------------------------------------------------------
/**
 * O cabeçalho da página — que já não se desenha aqui.
 *
 * ERA UMA FAIXA NO CORPO DA PÁGINA: o nome em 26 px, a frase que explica o
 * ecrã, e um risco a fechar. Setenta e nove pixéis, sempre, em todas as
 * páginas — um décimo de um portátil gasto a repetir o nome do sítio onde já
 * se está, enquanto a barra de cima tinha uma faixa larga vazia entre o
 * logótipo e a empresa.
 *
 * As páginas continuam a escrevê-lo como sempre. O que mudou é o destino: o
 * título e a descrição sobem para a barra, e os botões vão por um portal para
 * o lugar que lá os espera. Ver `contexts/CabecalhoDaPagina.tsx`.
 *
 * NA IMPRESSÃO CONTINUA A HAVER TÍTULO: é o `CabecalhoDoMapa`, dentro do
 * próprio mapa, que já era quem escrevia o nome da empresa, o do mapa e o
 * período na folha. A barra de cima não vai ao papel — nem devia.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  accoes,
}: {
  titulo: string;
  descricao?: string;
  accoes?: ReactNode;
}) {
  useAnunciarPagina(titulo, descricao);
  return <AccoesNaBarra>{accoes}</AccoesNaBarra>;
}

/** Leva os botões da página para dentro da barra de cima. */
function AccoesNaBarra({ children }: { children?: ReactNode }) {
  // O destino só existe depois de a barra desenhar. Um estado, e não uma
  // `ref`: é preciso desenhar outra vez quando ele aparecer.
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setDestino(document.getElementById(ID_DAS_ACCOES));
  }, []);
  if (!children || !destino) return null;
  return createPortal(
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      {children}
    </div>,
    destino,
  );
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
/** Uma célula do rodapé de um KPI: um número e o que ele é. */
export interface CelulaKpi {
  valor: ReactNode;
  rotulo: string;
  tendencia?: "sobe" | "desce";
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  cor = "var(--color-acento)",
  tendencia,
  icone,
  rodape,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: string;
  tendencia?: "sobe" | "desce";
  /** Símbolo do indicador, dentro de um disco da cor dele. */
  icone?: ReactNode;
  /**
   * Até duas células por baixo de uma linha divisória — tipicamente a variação
   * e o valor de referência. Só aparece onde houver números para lá pôr: um
   * rodapé vazio ocupa espaço a dizer nada.
   */
  rodape?: CelulaKpi[];
}) {
  return (
    // `kpi`: um mapa impresso começa pelo mapa. Os indicadores são a
    // leitura rápida de quem está no ecrã; no papel empurram a primeira linha
    // da tabela para a segunda folha. O Piloto esconde-os.
    <div className="kpi relative overflow-hidden bg-superficie border border-borda rounded-[14px] shadow-suave px-4 py-3 min-w-0">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: cor }}
      />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] uppercase tracking-[0.5px] text-texto-suave font-bold truncate">
            {rotulo}
          </div>
          {/* tabular-nums alinha os dígitos; truncate evita transbordo em
              mobile. */}
          <div className="text-[23px] font-black mt-[3px] tracking-[-0.5px] tabular truncate">
            {valor}
          </div>
          {detalhe && (
            <div
              className={cn(
                "text-[11.5px] mt-[3px] truncate",
                tendencia === "sobe"
                  ? "text-sucesso"
                  : tendencia === "desce"
                    ? "text-perigo"
                    : "text-texto-suave",
              )}
            >
              {detalhe}
            </div>
          )}
        </div>
        {icone && (
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{
              color: cor,
              background: `color-mix(in srgb, ${cor} 16%, transparent)`,
            }}
          >
            {icone}
          </span>
        )}
      </div>
      {rodape && rodape.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-borda pt-2">
          {rodape.map((c) => (
            <div key={c.rotulo} className="min-w-0">
              <div
                className={cn(
                  "text-[12.5px] font-bold tabular truncate",
                  c.tendencia === "sobe"
                    ? "text-sucesso"
                    : c.tendencia === "desce"
                      ? "text-perigo"
                      : "",
                )}
              >
                {c.valor}
              </div>
              <div className="text-[11px] text-texto-suave truncate">
                {c.rotulo}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selo
// ---------------------------------------------------------------------------
export function Selo({
  children,
  cor = "#62657a",
  className,
}: {
  children: ReactNode;
  cor?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[11.5px] font-bold border whitespace-nowrap",
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${cor} 13%, transparent)`,
        color: cor,
        borderColor: `color-mix(in srgb, ${cor} 34%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------
/**
 * O `overflow-x-auto` fica NESTE contentor: tabelas largas rolam dentro dele e
 * a página nunca ganha barra horizontal. `min-w-0` é obrigatório porque itens
 * de grelha e flex têm `min-width:auto` e não encolhem — sem ele, uma coluna
 * larga empurra o layout todo (ver docs/LESSONS.md).
 */
export function EnvolveTabela({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-x-auto rounded-[10px] border border-borda",
        className,
      )}
      {...props}
    />
  );
}

export function Tabela({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function Th({
  className,
  numerico,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <th
      className={cn(
        "px-3.5 py-[11px] text-left whitespace-nowrap border-b border-borda",
        "text-xs uppercase tracking-[0.4px] text-texto-suave bg-superficie-2 font-bold",
        numerico && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numerico,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <td
      className={cn(
        "px-3.5 py-[11px] text-left whitespace-nowrap border-b border-borda",
        numerico && "text-right tabular",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-superficie-2 last:[&>td]:border-b-0", className)}
      {...props}
    />
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-texto-suave">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Alerta
// ---------------------------------------------------------------------------
const CORES_ALERTA = {
  info: "border-azul/35 bg-azul/8 text-azul",
  erro: "border-perigo/35 bg-perigo/8 text-perigo",
  sucesso: "border-sucesso/35 bg-sucesso/8 text-sucesso",
  aviso: "border-aviso/40 bg-aviso/10 text-aviso",
} as const;

export function Alerta({
  tipo = "info",
  children,
  className,
}: {
  tipo?: keyof typeof CORES_ALERTA;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cn(
        "px-3.5 py-3 rounded-[10px] text-[13.5px] border my-2.5",
        CORES_ALERTA[tipo],
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
export function Campo({
  rotulo,
  erro,
  dica,
  className,
  children,
}: {
  rotulo: string;
  erro?: string;
  dica?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o input vem em children e fica envolvido pelo label (associacao implicita, valida em HTML); o Biome nao verifica isto estaticamente.
    <label className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      {/* A regra global do Piloto: `label { font-size: 13px; font-weight: 700;
          color: var(--text) }`. A Produção tinha-os mais pequenos e cinzentos,
          o que dá aos formulários um ar de legenda em vez de rótulo. */}
      <span className="text-[13px] font-bold text-texto">{rotulo}</span>
      {children}
      {dica && !erro && (
        <span className="text-[11.5px] text-texto-suave">{dica}</span>
      )}
      {erro && (
        <span className="text-[11.5px] text-perigo font-semibold">{erro}</span>
      )}
    </label>
  );
}

/** `ComponentPropsWithRef` e não `InputHTMLAttributes`: sem isto o `ref` não
 *  passa, e há campos que precisam de receber o foco ao abrir o diálogo. */
export function Entrada({
  className,
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      className={cn(
        "w-full min-w-0 px-3 py-2.5 rounded-[10px] text-sm",
        "bg-superficie border border-borda text-texto",
        "placeholder:text-texto-suave/70",
        "focus:outline-none focus:border-acento focus:ring-2 focus:ring-acento/25",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------
export function ACarregar({ texto = "A carregar…" }: { texto?: string }) {
  return (
    <output
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-12 text-sm text-texto-suave"
    >
      <span className="w-4 h-4 rounded-full border-2 border-borda border-t-acento animate-spin" />
      {texto}
    </output>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-superficie-2", className)}
    />
  );
}
