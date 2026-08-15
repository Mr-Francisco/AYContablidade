"use client";

import { Search, Users, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { Botao, Entrada, Vazio } from "@/components/ui";
import { buscador } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Terceiro } from "@/types";

/**
 * Escolher um cliente — com procura, e não uma lista de opções.
 *
 * Uma `<select>` com os clientes todos parece a solução mais simples e é a que
 * pior envelhece: numa empresa com quatrocentos clientes obriga a rolar uma
 * lista que não se pode filtrar, e o teclado só salta para a primeira letra.
 * Quem procura uma factura sabe o nome do cliente ou o NIF — é por aí que a
 * procura tem de funcionar.
 *
 * Mostra o nome escolhido no botão e traz um «×» para limpar: sem ele, quem
 * escolhesse um cliente por engano não tinha como voltar a ver tudo.
 */
export function SelectorDeCliente({
  valor,
  aoMudar,
  rotulo = "Cliente",
}: {
  /** Id do cliente escolhido, ou "" para todos. */
  valor: string;
  aoMudar: (id: string, nome: string) => void;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [procura, setProcura] = useState("");
  const { data: clientes } = useSWR<Terceiro[]>(
    "/api/comercial/clientes",
    buscador,
    { revalidateOnFocus: false },
  );

  const escolhido = clientes?.find((c) => c.id === valor);

  const encontrados = useMemo(() => {
    const q = procura.trim().toLowerCase();
    const todos = clientes ?? [];
    if (!q) return todos.slice(0, 100);
    return todos
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          (c.nif ?? "").toLowerCase().includes(q) ||
          (c.numero ?? "").toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [clientes, procura]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-texto-suave">
        {rotulo}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={cn(
            "flex min-w-[15rem] flex-1 items-center gap-2 rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-acento",
          )}
        >
          <Users size={15} className="shrink-0 text-texto-suave" />
          <span className={cn("truncate", !escolhido && "text-texto-suave")}>
            {escolhido ? escolhido.nome : "Todos os clientes"}
          </span>
        </button>
        {valor && (
          <button
            type="button"
            aria-label="Limpar cliente"
            onClick={() => aoMudar("", "")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-borda text-texto-suave hover:border-perigo hover:text-perigo"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <Dialog.Root open={aberto} onOpenChange={setAberto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
            <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
              <Dialog.Title className="text-[15px] font-bold">
                Escolher cliente
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
                >
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>

            <div className="border-b border-borda p-3">
              <div className="relative">
                <Search
                  size={15}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
                />
                <Entrada
                  type="search"
                  autoFocus
                  value={procura}
                  onChange={(e) => setProcura(e.target.value)}
                  placeholder="Nome, NIF ou número…"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {encontrados.length === 0 ? (
                <Vazio>Nenhum cliente corresponde à procura.</Vazio>
              ) : (
                <ul>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        aoMudar("", "");
                        setAberto(false);
                      }}
                      className="flex w-full items-center gap-3 border-b border-borda px-4 py-2.5 text-left text-sm text-texto-suave hover:bg-superficie-2"
                    >
                      Todos os clientes
                    </button>
                  </li>
                  {encontrados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          aoMudar(c.id, c.nome);
                          setAberto(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-borda px-4 py-2.5 text-left text-sm hover:bg-superficie-2",
                          c.id === valor && "bg-superficie-2",
                        )}
                      >
                        <span className="tabular w-14 shrink-0 text-texto-suave">
                          {c.numero}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {c.nome}
                        </span>
                        <span className="tabular shrink-0 text-[12px] text-texto-suave">
                          {c.nif || ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end border-t border-borda px-5 py-3">
              <Botao onClick={() => setAberto(false)}>Fechar</Botao>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
