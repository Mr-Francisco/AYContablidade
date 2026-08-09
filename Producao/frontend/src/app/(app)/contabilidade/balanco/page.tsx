"use client";

import { useState } from "react";
import useSWR from "swr";

import { TabelaDemonstracao } from "@/components/contabilidade/TabelaDemonstracao";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda, subtrai } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";
import type { Balanco } from "@/types";

export default function PaginaBalanco() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [mes, setMes] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (mes) p.set("mes", mes);

  const { data, isLoading } = useSWR<Balanco>(
    `/api/relatorios/balanco?${p}`,
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Balanço"
        descricao="Posição financeira à data — PGC-AR."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <Selo cor={data.equilibrado ? "#1a9c5f" : "#e0284f"}>
                {data.equilibrado ? "Equilibrado" : "NÃO equilibra"}
              </Selo>
            )}
            <AccoesDoMapa />
          </div>
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Selector
          rotulo="Até ao período"
          valor={mes}
          aoMudar={setMes}
          opcoes={[
            { valor: "", rotulo: "Todo o exercício" },
            ...periodos.map((x) => ({
              valor: x.codigo,
              rotulo: `${x.codigo} — ${x.nome}`,
            })),
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">Não foi possível carregar o balanço.</Alerta>
      ) : (
        <>
          {!data.equilibrado && (
            <Alerta tipo="erro" className="mb-4">
              O Balanço não equilibra. Activo de{" "}
              {formataMoeda(data.total_activo, moeda)} contra capital próprio e
              passivo de {formataMoeda(data.total_cp_passivo, moeda)} —
              diferença de{" "}
              {formataMoeda(
                subtrai(data.total_activo, data.total_cp_passivo),
                moeda,
              )}
              . Isto indica um problema nos lançamentos, não no relatório.
            </Alerta>
          )}

          {/* Duas colunas em ecrã largo, empilhadas em estreito — cada uma rola
              sozinha, para a página nunca ganhar barra horizontal. */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Cartao className="min-w-0 overflow-hidden p-0">
              <TabelaDemonstracao linhas={data.activo} moeda={moeda} />
            </Cartao>
            <Cartao className="min-w-0 overflow-hidden p-0">
              <TabelaDemonstracao linhas={data.passivo} moeda={moeda} />
            </Cartao>
          </div>
        </>
      )}
    </>
  );
}
