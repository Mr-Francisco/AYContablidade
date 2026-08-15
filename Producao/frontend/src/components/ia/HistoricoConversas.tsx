"use client";

import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { ConsultaIa } from "@/types";

/**
 * Histórico do assistente — uma coluna de conversas, à esquerda.
 *
 * Estava dentro da conversa: ao abrir a página, as vinte perguntas anteriores
 * apareciam por cima da caixa de escrita e era preciso rolar tudo para chegar
 * ao princípio da actual. O histórico é NAVEGAÇÃO; o centro é a conversa que
 * se está a ter.
 *
 * Cada linha é uma consulta gravada, com o seu título e a sua data. Não se
 * inventa aqui um conceito de «sessão» que o servidor não tem: cada pergunta é
 * respondida por si só — é o que a nota ao fundo do ecrã diz — e por isso cada
 * pergunta é uma conversa. As linhas ficam agrupadas por dia, que é como se
 * procura uma conversa antiga: «foi na terça».
 */

const DIA = 86_400_000;

/** «Hoje», «Ontem», ou a data por extenso. */
function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const meio = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((meio(hoje) - meio(d)) / DIA);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 7) return `Há ${dias} dias`;
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric",
  });
}

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function HistoricoConversas({
  consultas,
  activa,
  aAcontecer,
  aoEscolher,
  aoNova,
}: {
  consultas: ConsultaIa[];
  /** Id da consulta aberta, ou `null` quando a conversa é a nova. */
  activa: string | null;
  /** Há uma conversa por gravar (perguntas feitas agora). */
  aAcontecer: boolean;
  aoEscolher: (id: string) => void;
  aoNova: () => void;
}) {
  // Já vêm do servidor da mais recente para a mais antiga.
  const dias = useMemo(() => {
    const m = new Map<string, ConsultaIa[]>();
    for (const c of consultas) {
      const chave = rotuloDoDia(c.criado_em);
      const g = m.get(chave) ?? [];
      g.push(c);
      m.set(chave, g);
    }
    return [...m.entries()];
  }, [consultas]);

  return (
    <div className="flex min-h-0 flex-col">
      <button
        type="button"
        onClick={aoNova}
        className={cn(
          "mb-3 flex w-full items-center gap-2 rounded-xl border border-borda px-3 py-2.5",
          "text-sm font-semibold transition-colors hover:border-marca hover:text-marca",
          activa === null && "border-marca text-marca",
        )}
      >
        <MessageSquarePlus size={15} aria-hidden />
        Nova conversa
      </button>

      {/* O scroll é DESTA coluna e não da página — regra do projecto. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {!consultas.length ? (
          <p className="px-1 py-6 text-center text-[12.5px] leading-relaxed text-texto-suave">
            <MessagesSquare
              size={20}
              className="mx-auto mb-2 opacity-50"
              aria-hidden
            />
            Ainda não fez perguntas. A primeira aparece aqui assim que tiver
            resposta.
          </p>
        ) : (
          dias.map(([dia, linhas]) => (
            <section key={dia} className="mb-3">
              <h3 className="sticky top-0 z-[1] bg-fundo px-1 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.6px] text-texto-suave">
                {dia}
              </h3>
              <ul className="flex flex-col gap-1">
                {linhas.map((c) => {
                  const escolhida = c.id === activa;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => aoEscolher(c.id)}
                        aria-current={escolhida ? "true" : undefined}
                        className={cn(
                          "w-full rounded-lg border-l-2 px-2.5 py-2 text-left transition-colors",
                          escolhida
                            ? "border-l-marca bg-marca/10"
                            : "border-l-transparent hover:bg-superficie-2",
                        )}
                      >
                        <span
                          className={cn(
                            "line-clamp-2 text-[12.5px] leading-snug",
                            escolhida
                              ? "font-semibold text-texto"
                              : "text-texto",
                          )}
                        >
                          {c.pergunta}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-texto-suave">
                          <span className="tabular">{horaDe(c.criado_em)}</span>
                          {c.erro && (
                            <span className="text-perigo">· sem resposta</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {aAcontecer && activa === null && (
          <p className="px-1 pb-2 text-[11px] text-texto-suave">
            A conversa em curso entra no histórico quando tiver resposta.
          </p>
        )}
      </div>
    </div>
  );
}
