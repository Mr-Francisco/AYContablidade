"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  TituloCartao,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import {
  big,
  formataCompacto,
  formataMoeda,
  paraGrafico,
} from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";
import type { DemonstracaoResultados } from "@/types";

export default function Resultados() {
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

  const { data, isLoading } = useSWR<DemonstracaoResultados>(
    `/api/relatorios/demonstracao-resultados?${p}`,
    buscador,
  );

  // Só as rubricas com valor entram no gráfico — um gráfico com dez barras a
  // zero não diz nada.
  const grafico = useMemo(() => {
    if (!data) return [];
    return data.linhas
      .filter((l) => l.tipo === "linha" && l.valor && !big(l.valor).eq(0))
      .map((l) => ({
        nome:
          l.designacao.length > 24
            ? `${l.designacao.slice(0, 22)}…`
            : l.designacao,
        completo: l.designacao,
        valor: paraGrafico(l.valor),
        cor: big(l.valor).lt(0) ? "var(--grafico-1)" : "var(--grafico-6)",
      }));
  }, [data]);

  return (
    <>
      <CabecalhoPagina
        titulo="Demonstração de Resultados"
        descricao="Resultados por naturezas — PGC-AR."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <Selo cor={big(data.liquido).gte(0) ? "#1a9c5f" : "#e0284f"}>
                Resultado líquido: {formataMoeda(data.liquido, moeda)}
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
        <Alerta tipo="erro">Não foi possível carregar a demonstração.</Alerta>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1.15fr_1fr]">
          <Cartao className="min-w-0 overflow-hidden p-0">
            <TabelaDemonstracao linhas={data.linhas} moeda={moeda} />
          </Cartao>

          <Cartao className="min-w-0">
            <TituloCartao>Rubricas com movimento</TituloCartao>
            {grafico.length === 0 ? (
              <p className="py-8 text-center text-sm text-texto-suave">
                Sem rubricas com valor no período.
              </p>
            ) : (
              <div style={{ height: Math.max(240, grafico.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={grafico}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-borda)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formataCompacto(v, "")}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={150}
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-superficie-2)" }}
                      contentStyle={{
                        background: "var(--color-superficie)",
                        border: "1px solid var(--color-borda)",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "var(--color-texto)",
                      }}
                      formatter={(v, _n, item) => [
                        formataMoeda(v as string | number, moeda),
                        (item?.payload as { completo?: string })?.completo ??
                          "",
                      ]}
                    />
                    <Bar dataKey="valor" radius={[0, 5, 5, 0]} maxBarSize={22}>
                      {grafico.map((d) => (
                        <Cell key={d.completo} fill={d.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>
        </div>
      )}
    </>
  );
}
