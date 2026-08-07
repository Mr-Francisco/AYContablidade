"use client";

import { Slot } from "radix-ui";
import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

type Variante =
  | "primario"
  | "acento"
  | "contorno"
  | "perigo"
  | "sucesso"
  | "neutro";
type Tamanho = "normal" | "pequeno";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-marca text-white border-transparent hover:bg-marca-escuro hover:shadow-[0_6px_18px_rgba(11,61,145,0.35)]",
  acento: "bg-acento text-[#0b1220] border-transparent hover:bg-acento-claro",
  contorno:
    "bg-transparent border-[1.5px] border-marca text-marca hover:bg-marca/5",
  perigo:
    "bg-transparent border-[1.5px] border-perigo text-perigo hover:bg-perigo/5",
  sucesso: "bg-sucesso text-white border-transparent hover:brightness-110",
  neutro: "bg-superficie-2 text-texto border-borda hover:border-acento",
};

const TAMANHOS: Record<Tamanho, string> = {
  normal: "px-[18px] py-[11px] text-sm rounded-[10px]",
  pequeno: "px-3 py-[6px] text-[12.5px] rounded-lg",
};

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  bloco?: boolean;
  /** Renderiza no elemento filho — para envolver um <Link> sem <button> aninhado. */
  comoFilho?: boolean;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    className,
    variante = "neutro",
    tamanho = "normal",
    bloco,
    comoFilho,
    type,
    ...props
  },
  ref,
) {
  const Comp = comoFilho ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      // Um <button> sem `type` dentro de um <form> submete-o. Já causou
      // submissões acidentais em botões de acção secundária.
      type={comoFilho ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-semibold",
        "cursor-pointer select-none",
        // Só transform e opacidade animam — regra do CLAUDE.md.
        "transition-[transform,box-shadow,background-color,border-color,color] duration-150",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        bloco && "w-full",
        className,
      )}
      {...props}
    />
  );
});
