"use client";

import { Selo } from "@/components/ui";
import { BarraPaginacao, type Pagina } from "@/components/ui/Paginacao";
import { formataMoeda } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import type { Diario, Lancamento } from "@/types";

/**
 * A lista de movimentos, à esquerda do editor — a `mov-list` do Piloto.
 *
 * Cada item mostra três linhas: número de operação e data em cima, diário ao
 * meio, descrição e valor em baixo. Carregar num item traz o movimento para o
 * editor, e o que está a ser editado fica marcado.
 *
 * Os filtros são os três do Piloto: diário, pesquisa livre e «só diferidos».
 * A pesquisa procura na descrição, na referência do documento e nos códigos de
 * conta das linhas — é assim que se encontra «aquele lançamento da 4311».
 */
export function ListaLancamentos({
  lancamentos,
  diarios,
  seleccionado,
  aoEscolher,
  filtroDiario,
  aoMudarFiltroDiario,
  procura,
  aoMudarProcura,
  soDiferidos,
  aoMudarSoDiferidos,
  aCarregar,
  pagina,
  controlos,
}: {
  lancamentos: Lancamento[];
  diarios: Diario[];
  seleccionado: string | null;
  aoEscolher: (l: Lancamento) => void;
  filtroDiario: string;
  aoMudarFiltroDiario: (v: string) => void;
  procura: string;
  aoMudarProcura: (v: string) => void;
  soDiferidos: boolean;
  aoMudarSoDiferidos: (v: boolean) => void;
  aCarregar: boolean;
  pagina: Pagina<Lancamento> | undefined;
  controlos: { aoAnterior: () => void; aoSeguinte: () => void };
}) {
  return (
    <aside className="flex min-h-0 flex-col rounded-[14px] border border-borda bg-superficie p-3 shadow-suave">
      <div className="mb-2 flex items-center gap-2">
        <b className="text-sm">Diário</b>
        <select
          value={filtroDiario}
          onChange={(e) => aoMudarFiltroDiario(e.target.value)}
          aria-label="Filtrar por diário"
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-[13px] outline-none focus:border-acento"
        >
          <option value="">Todos</option>
          {diarios.map((d) => (
            <option key={d.id} value={d.codigo}>
              {d.codigo} · {d.nome}
            </option>
          ))}
        </select>
      </div>

      <input
        type="search"
        value={procura}
        onChange={(e) => aoMudarProcura(e.target.value)}
        placeholder="Pesquisar…"
        className="mb-1.5 w-full rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-[13px] outline-none focus:border-acento"
      />

      <label className="mb-2 flex cursor-pointer items-start gap-2 text-[12px] text-texto-suave">
        <input
          type="checkbox"
          checked={soDiferidos}
          onChange={(e) => aoMudarSoDiferidos(e.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-marca)]"
        />
        Só diferidos (pendentes de integração)
      </label>

      {/* Altura máxima com rolamento interno: aqui é o caso certo da regra dos
          históricos — a lista é secundária ao editor e não pode empurrá-lo
          para fora do ecrã. Ver components/ui/Historico.tsx. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {aCarregar ? (
          <p className="py-8 text-center text-[13px] text-texto-suave">
            A carregar…
          </p>
        ) : lancamentos.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-texto-suave">
            Sem movimentos.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lancamentos.map((l) => {
              const activo = l.id === seleccionado;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => aoEscolher(l)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors",
                    activo
                      ? "border-marca bg-marca/10"
                      : "border-borda bg-fundo hover:border-acento",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="tabular truncate text-[12.5px]">
                      {l.numero_op ?? `#${l.numero}`}
                    </b>
                    <span className="tabular shrink-0 text-[11.5px] text-texto-suave">
                      {formataData(l.data)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-marca">
                    {l.diario_codigo} ·{" "}
                    {diarios.find((d) => d.codigo === l.diario_codigo)?.nome ??
                      ""}
                    {l.diferido && (
                      <Selo cor="#d68910" className="shrink-0">
                        Diferido
                      </Selo>
                    )}
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] text-texto-suave">
                      {l.descricao || "—"}
                    </span>
                    <b className="tabular shrink-0 text-[12.5px]">
                      {formataMoeda(l.total ?? "0")}
                    </b>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginação do SERVIDOR. Antes vinham mil de uma vez e revelavam-se
          quarenta a quarenta do lado do cliente: a lista era curta no ecrã
          mas o pedido era enorme. Agora vêm cinquenta, e passa-se de página. */}
      <BarraPaginacao pagina={pagina} nome="movimentos" {...controlos} />
    </aside>
  );
}

/** `2026-08-09` → `09/08/2026`, como o `formatDate` do Piloto. */
function formataData(iso: string): string {
  const [a, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${a}` : iso;
}
