"use client";

import { formataMoeda } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";
import type { LinhaDemonstracao } from "@/types";

/**
 * Tabela de uma demonstração financeira (Balanço, DR).
 *
 * O `tipo` da linha define a hierarquia visual: cabeçalho, grupo, linha,
 * subtotal e total. É a mesma estrutura que o backend devolve, transposta do
 * Piloto — a apresentação não reinterpreta os dados, só os desenha.
 */
export function TabelaDemonstracao({
  linhas,
  moeda,
  titulo,
}: {
  linhas: LinhaDemonstracao[];
  moeda: string;
  titulo?: string;
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      {titulo && (
        <div className="border-b border-borda px-4 py-3 text-sm font-extrabold">
          {titulo}
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <tbody>
          {linhas.map((l, i) => {
            const chave = `${l.tipo}-${l.designacao}-${i}`;

            if (l.tipo === "cabecalho") {
              return (
                <tr key={chave}>
                  <th
                    colSpan={3}
                    className="gradiente-marca px-4 py-2.5 text-left text-[13px] font-extrabold uppercase tracking-[0.5px] text-white"
                  >
                    {l.designacao}
                  </th>
                </tr>
              );
            }

            if (l.tipo === "grupo") {
              return (
                <tr key={chave}>
                  <td
                    colSpan={3}
                    className="border-b border-borda bg-superficie-2 px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.4px] text-texto-suave"
                  >
                    {l.designacao}
                  </td>
                </tr>
              );
            }

            const ehTotal = l.tipo === "total";
            const ehSubtotal = l.tipo === "subtotal";

            return (
              <tr
                key={chave}
                className={cn(
                  "border-b border-borda last:border-b-0",
                  ehTotal && "bg-superficie-2 font-extrabold",
                  ehSubtotal && "font-bold",
                  !ehTotal && !ehSubtotal && "hover:bg-superficie-2",
                )}
              >
                <td
                  className={cn(
                    "px-4 py-2.5",
                    !ehTotal && !ehSubtotal && "pl-7",
                  )}
                >
                  {l.designacao}
                </td>
                <td className="w-14 px-2 py-2.5 text-center text-[12px] text-texto-suave">
                  {l.nota || ""}
                </td>
                <td className="w-[180px] px-4 py-2.5 text-right tabular">
                  {l.valor === null ? "" : formataMoeda(l.valor, moeda)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
