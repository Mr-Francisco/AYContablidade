"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Cartao({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-superficie border border-borda rounded-[14px] shadow-suave p-5",
        className,
      )}
      {...props}
    />
  );
}

export function TituloCartao({
  children,
  extra,
  className,
}: {
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div
      // `.card-title` do Piloto: 16px a 800, catorze píxeis de margem em baixo
      // e mais nada. A linha divisória que aqui estava era invenção nossa, e
      // aparecia em todos os cartões da aplicação.
      className={cn(
        "flex items-baseline gap-3 flex-wrap font-extrabold text-[16px] mb-3.5",
        className,
      )}
    >
      {children}
      {extra && (
        <span className="ml-auto font-semibold text-[12.5px] text-texto-suave">
          {extra}
        </span>
      )}
    </div>
  );
}

/**
 * Grelha com revelação em cascata.
 *
 * A animação é CSS (`.revelar-grelha` em globals.css), não JavaScript. A razão
 * é de robustez, não de estilo: o Framer Motion anima com
 * `requestAnimationFrame`, que não dispara com o documento oculto — um
 * separador aberto em segundo plano deixaria o conteúdo a `opacity: 0`, ou
 * seja, invisível. Foi o que aconteceu na verificação dos KPIs do painel.
 *
 * Assim, a visibilidade do conteúdo não depende de JavaScript nenhum. Só
 * `opacity` e `transform` são animados, e a regra global de
 * `prefers-reduced-motion` continua a aplicar-se.
 */
export function GrelhaRevelada({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("revelar-grelha", className)}>{children}</div>;
}

/**
 * Item da grelha. O atraso em cascata vem do `nth-child` no CSS — não é
 * preciso passar índice nenhum.
 */
export function ItemRevelado({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
