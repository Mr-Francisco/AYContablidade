"use client";

import { Slot, Tooltip } from "radix-ui";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

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
  acento: "bg-acento text-[#241500] border-transparent hover:bg-acento-claro",
  contorno:
    "bg-transparent border-[1.5px] border-marca text-marca hover:bg-marca/5",
  perigo:
    "bg-transparent border-[1.5px] border-perigo text-perigo hover:bg-perigo/5",
  sucesso: "bg-sucesso text-white border-transparent hover:brightness-110",
  neutro: "bg-superficie-2 text-texto border-borda hover:border-acento",
};

const TAMANHOS: Record<Tamanho, string> = {
  normal: "px-[18px] py-[11px] text-sm rounded-[10px]",
  pequeno: "px-3 py-[7px] text-[12.5px] rounded-lg",
};

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  bloco?: boolean;
  /** Renderiza no elemento filho — para envolver um <Link> sem <button> aninhado. */
  comoFilho?: boolean;
  /**
   * PORQUE É QUE ESTÁ BLOQUEADO. Regra do projecto: um botão desactivado tem
   * de dizer o motivo — ver `docs/LESSONS.md`.
   *
   * Dando isto, o botão deixa de usar o `disabled` nativo (que mata o hover e
   * com ele o tooltip) e passa a `aria-disabled`: continua a receber o rato,
   * mostra a explicação, e o clique não faz nada.
   */
  motivoBloqueio?: ReactNode;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    className,
    variante = "neutro",
    tamanho = "normal",
    bloco,
    comoFilho,
    type,
    disabled,
    motivoBloqueio,
    onClick,
    ...props
  },
  ref,
) {
  const Comp = comoFilho ? Slot.Root : "button";

  // Bloqueado COM motivo: nada de `disabled` nativo. Um `<button disabled>`
  // não dispara eventos de rato na maioria dos browsers — o tooltip nunca
  // chegaria a aparecer, e o utilizador ficava com um botão que «simplesmente
  // não funciona», que é exactamente o que a regra proíbe.
  const bloqueadoComMotivo = Boolean(disabled && motivoBloqueio);

  // Em desenvolvimento, apanha o esquecimento: um botão que fica bloqueado
  // sem motivo é um botão que «simplesmente não funciona» para quem o vê.
  // Só avisa — não muda o comportamento, e não corre em produção.
  if (process.env.NODE_ENV !== "production" && disabled && !motivoBloqueio) {
    console.warn(
      "Botão bloqueado sem `motivoBloqueio` — regra do projecto: um botão " +
        "desactivado diz porquê. Ver docs/LESSONS.md.",
      { conteudo: props.children },
    );
  }

  const botao = (
    <Comp
      ref={ref}
      // Um <button> sem `type` dentro de um <form> submete-o. Já causou
      // submissões acidentais em botões de acção secundária.
      type={comoFilho ? undefined : (type ?? "button")}
      disabled={bloqueadoComMotivo ? undefined : disabled}
      aria-disabled={disabled || undefined}
      onClick={bloqueadoComMotivo ? undefined : onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 border font-bold",
        "cursor-pointer select-none",
        // Só transform e opacidade animam — regra do CLAUDE.md.
        "transition-[transform,box-shadow,background-color,border-color,color] duration-150",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        // O mesmo aspecto para o bloqueio explicado, que não usa `disabled`.
        "aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
        "aria-disabled:hover:translate-y-0 aria-disabled:active:scale-100",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        bloco && "w-full",
        className,
      )}
      {...props}
    />
  );

  if (!bloqueadoComMotivo) return botao;

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        {/* `asChild` com um `<span>` à volta: o gatilho tem de ser um
            elemento que receba eventos, e o botão bloqueado ainda os recebe
            porque não leva `disabled` nativo. */}
        <Tooltip.Trigger asChild>{botao}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-[60] max-w-[280px] rounded-lg border border-borda bg-superficie px-3 py-2 text-[12.5px] leading-relaxed text-texto shadow-forte"
          >
            {motivoBloqueio}
            <Tooltip.Arrow className="fill-[var(--color-borda)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
});
