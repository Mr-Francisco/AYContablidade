"use client";

import { Switch } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Um interruptor com o que ele significa ao lado.

   PORQUE NÃO É SÓ O BOTÃO: um interruptor sozinho diz que há duas posições e
   não diz o que muda entre elas. Marcar «não amortizável» num terreno tem
   consequência — deixa de amortizar — e quem o marca tem de a ler antes, não
   descobri-la no fecho do exercício.

   Por isso a `nota` acompanha o estado: o que se lê quando está ligado não é o
   mesmo que se lê quando está desligado.
--------------------------------------------------------------------------- */

export function Interruptor({
  ligado,
  aoMudar,
  titulo,
  notaLigado,
  notaDesligado,
  desactivado,
  className,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  titulo: ReactNode;
  /** O que passa a valer quando está ligado. */
  notaLigado: ReactNode;
  /** E quando está desligado. */
  notaDesligado: ReactNode;
  desactivado?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-borda p-3.5",
        ligado && "border-marca bg-marca/[0.05]",
        desactivado && "opacity-60",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold">{titulo}</div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-texto-suave">
          {ligado ? notaLigado : notaDesligado}
        </p>
      </div>
      <Switch.Root
        checked={ligado}
        disabled={desactivado}
        onCheckedChange={aoMudar}
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-borda transition-colors data-[state=checked]:bg-marca"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
