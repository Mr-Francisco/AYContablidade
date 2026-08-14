"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { Selo } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balanco, Resumo } from "@/types";

/**
 * A etiqueta do exercício activo no cabeçalho — o `<span class="tag">` do
 * Piloto, que ali é só um rótulo.
 *
 * Aqui abre. O exercício é o contexto de tudo o que se lança, e quem lança
 * precisa de saber três coisas antes de o fazer: se está aberto, que datas
 * apanha, e se as contas ainda batem certo. Estava tudo a três cliques de
 * distância, em Exercícios.
 *
 * O QUE NÃO ESTÁ AQUI é tão importante como o que está: nada de gráficos, nada
 * de listas, nada que se leia melhor no painel. É uma etiqueta, não um segundo
 * painel.
 *
 * Os números da contabilidade só se pedem quando o painel abre, e só a quem
 * pode vê-los — o cabeçalho está em todas as páginas, e um pedido por página
 * seria pagar caro por uma etiqueta.
 */
export function EtiquetaExercicio() {
  const { pode } = useAuth();
  const { activo } = useExercicios();
  const [aberto, setAberto] = useState(false);

  if (!activo) return null;

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Exercício activo"
          className="hidden max-w-[150px] items-center gap-1.5 truncate rounded-md border border-borda bg-superficie-2 px-[9px] py-[3px] text-[11.5px] font-bold text-texto-suave transition-colors hover:border-acento hover:text-texto sm:inline-flex"
        >
          <CalendarDays size={13} className="shrink-0" />
          <span className="truncate">{activo.nome}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[290px] rounded-[14px] border border-borda bg-superficie p-4 shadow-forte"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-texto-suave">
                Exercício
              </p>
              <p className="truncate text-[15px] font-extrabold">
                {activo.nome}
              </p>
            </div>
            <Selo cor={activo.estado === "aberto" ? "#1a9c5f" : "#62657a"}>
              {activo.estado === "aberto" ? "Aberto" : "Fechado"}
            </Selo>
          </div>

          <Linha
            rotulo="Período"
            valor={`${dataCurta(activo.inicio)} a ${dataCurta(activo.fim)}`}
          />

          {pode("contab.ver") && aberto && <Numeros exercicioId={activo.id} />}

          {activo.apuramento ? (
            <Linha
              rotulo="Apuramento"
              valor={`feito até ${dataCurta(activo.apuramento.ate)}`}
            />
          ) : (
            <Linha rotulo="Apuramento" valor="por fazer" />
          )}

          {pode("contab.fechar") && (
            <Link
              href="/contabilidade/exercicios"
              onClick={() => setAberto(false)}
              className="mt-3 block rounded-[10px] bg-superficie-2 px-3 py-2 text-center text-[12.5px] font-bold text-marca hover:bg-borda/60"
            >
              Gerir exercícios e fechos
            </Link>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Os três números que dizem se o exercício está são. */
function Numeros({ exercicioId }: { exercicioId: string }) {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const q = `?exercicio_id=${exercicioId}`;
  const { data: resumo } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: balanco } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );

  const kz = (v: string) => formataMoeda(v, moeda, 0);
  const lucro = Number(resumo?.resultado ?? 0) >= 0;

  return (
    <>
      <Linha
        rotulo="Lançamentos"
        valor={
          resumo
            ? `${resumo.lancamentos ?? 0} · ${kz(resumo.movimentado ?? "0")}`
            : "…"
        }
      />
      <Linha
        rotulo="Resultado"
        valor={
          resumo
            ? `${kz(resumo.resultado)} · ${lucro ? "lucro" : "prejuízo"}`
            : "…"
        }
      />
      <Linha
        rotulo="Balanço"
        valor={
          balanco
            ? balanco.equilibrado
              ? "equilibrado ✓"
              : "⚠ verificar"
            : "…"
        }
      />
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borda py-[7px] text-[12.5px] last:border-b-0">
      <span className="shrink-0 text-texto-suave">{rotulo}</span>
      <b className="tabular truncate text-right">{valor}</b>
    </div>
  );
}

/** `2026-01-01` → `01/01/2026`. */
function dataCurta(iso: string): string {
  const [a, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${a}` : iso;
}
