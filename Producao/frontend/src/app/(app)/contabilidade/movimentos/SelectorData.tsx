"use client";

import { useEffect, useRef, useState } from "react";

import { usePeriodos } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

/**
 * Selector de mês e dia do movimento — o `dpPicker` do Piloto.
 *
 * NÃO é um calendário. O que se escolhe aqui é o **período contabilístico**
 * (00 a 15, onde 13–15 são de rectificação e apuramento e não existem no
 * calendário) e o dia. Um `<input type="date">` não sabe representar «período
 * 14» e obrigava a separar os dois campos.
 *
 * Fecha ao carregar fora ou com `Escape`, como no Piloto.
 */
export function SelectorData({
  ano,
  mes,
  dia,
  aoMudarAno,
  aoMudarMes,
  aoMudarDia,
}: {
  ano: number;
  mes: string;
  dia: string;
  aoMudarAno: (v: number) => void;
  aoMudarMes: (v: string) => void;
  aoMudarDia: (v: string) => void;
}) {
  const { periodos } = usePeriodos();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    // `capture`: o mesmo do Piloto. Sem isto, um clique num botão que pára a
    // propagação deixava o selector aberto por cima do resto.
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", fora, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [aberto]);

  const nomeDoMes = periodos.find((p) => p.codigo === mes)?.nome ?? "";

  return (
    <div ref={caixa} className="relative flex items-center gap-1.5">
      <input
        type="number"
        min={2000}
        max={2100}
        value={ano}
        onChange={(e) => aoMudarAno(Number(e.target.value) || ano)}
        aria-label="Ano"
        className="tabular w-[70px] rounded-[10px] border border-borda bg-superficie px-2 py-2.5 text-sm outline-none focus:border-acento"
      />
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="min-w-[190px] rounded-[10px] border border-acento bg-superficie px-3 py-2.5 text-left text-sm font-semibold outline-none hover:border-acento"
      >
        {dia} / {mes} · {nomeDoMes}
      </button>

      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[330px] rounded-xl border border-borda bg-superficie p-3 shadow-forte">
          <div className="mb-3">
            <b className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
              Mês
            </b>
            <div className="grid grid-cols-8 gap-1">
              {periodos.map((p) => (
                <button
                  key={p.codigo}
                  type="button"
                  title={`${p.codigo} · ${p.nome}`}
                  onClick={() => aoMudarMes(p.codigo)}
                  className={cn(
                    "tabular rounded-md py-1.5 text-[12.5px] font-semibold",
                    p.codigo === mes
                      ? "bg-marca text-white"
                      : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                  )}
                >
                  {Number(p.codigo)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <b className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
              Dia
            </b>
            <div className="grid grid-cols-8 gap-1">
              {DIAS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => aoMudarDia(d)}
                  className={cn(
                    "tabular rounded-md py-1.5 text-[12.5px] font-semibold",
                    d === dia
                      ? "bg-marca text-white"
                      : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                  )}
                >
                  {Number(d)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
