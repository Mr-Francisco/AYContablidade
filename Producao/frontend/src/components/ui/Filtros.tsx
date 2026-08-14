"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Barra de filtros — o mesmo bloco em todas as páginas de listagem. */
export function BarraFiltros({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // A `.toolbar` do Piloto: só uma fila de controlos, sem moldura nem fundo
    // próprios. O cartão que aqui estava criava uma caixa dentro da caixa e
    // afastava a Produção do Piloto em todas as páginas de uma vez.
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {children}
    </div>
  );
}

interface Opcao {
  valor: string;
  rotulo: string;
}

/**
 * Selector. Usa Radix `Select` — teclado, leitores de ecrã e posicionamento
 * já resolvidos, ao contrário de um `<select>` estilizado à mão.
 */
export function Selector({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  placeholder = "Seleccionar…",
  className,
  larguraMinima = "10rem",
}: {
  rotulo?: string;
  valor: string | undefined;
  aoMudar: (v: string) => void;
  opcoes: Opcao[];
  placeholder?: string;
  className?: string;
  larguraMinima?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o label envolve o trigger do Radix Select, que ja recebe aria-label; o Biome nao reconhece o componente como controlo.
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {rotulo && (
        <span className="text-[12.5px] font-semibold text-texto-suave">
          {rotulo}
        </span>
      )}
      <Select.Root value={valor} onValueChange={aoMudar}>
        <Select.Trigger
          className="flex items-center justify-between gap-2 rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-sm text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento/25 data-[placeholder]:text-texto-suave/70"
          style={{ minWidth: larguraMinima }}
          aria-label={rotulo}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown size={15} className="text-texto-suave" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-[320px] overflow-hidden rounded-xl border border-borda bg-superficie shadow-forte"
          >
            <Select.Viewport className="p-1.5">
              {opcoes.map((o) => (
                <Select.Item
                  key={o.valor}
                  value={o.valor}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-superficie-2"
                >
                  <Select.ItemText>{o.rotulo}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} className="text-marca" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
}
