"use client";

import type { HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export { Botao } from "./Botao";
export { Cartao, GrelhaRevelada, ItemRevelado, TituloCartao } from "./Cartao";

// ---------------------------------------------------------------------------
// Cabeçalho de página
// ---------------------------------------------------------------------------
export function CabecalhoPagina({
  titulo,
  descricao,
  accoes,
}: {
  titulo: string;
  descricao?: string;
  accoes?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-6 mb-5 pb-3.5 border-b-2 border-borda">
      <div className="min-w-0">
        {/* A barra vertical com o gradiente da marca é a assinatura visual do
            cabeçalho de página no Piloto. */}
        <h1 className="relative pl-3.5 text-[26px] font-bold tracking-[-0.3px] m-0 before:absolute before:left-0 before:top-[3px] before:bottom-[3px] before:w-1 before:rounded-[3px] before:gradiente-marca before:content-['']">
          {titulo}
        </h1>
        {descricao && (
          <p className="pl-3.5 mt-1 mb-0 text-sm text-texto-suave">
            {descricao}
          </p>
        )}
      </div>
      {accoes && (
        <div className="flex items-center gap-2 flex-wrap">{accoes}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
export function Kpi({
  rotulo,
  valor,
  detalhe,
  cor = "var(--color-acento)",
  tendencia,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: string;
  tendencia?: "sobe" | "desce";
}) {
  return (
    <div className="relative overflow-hidden bg-superficie border border-borda rounded-[14px] shadow-suave px-4 py-[15px] min-w-0">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: cor }}
      />
      <div className="text-[11.5px] uppercase tracking-[0.5px] text-texto-suave font-bold truncate">
        {rotulo}
      </div>
      {/* tabular-nums alinha os dígitos; truncate evita transbordo em mobile. */}
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
}: HTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
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
}: HTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
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
      <span className="text-[12.5px] font-semibold text-texto-suave">
        {rotulo}
      </span>
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

export function Entrada({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
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
