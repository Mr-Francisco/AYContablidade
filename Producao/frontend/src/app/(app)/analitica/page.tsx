"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selector,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import {
  compara,
  formataCompacto,
  formataMoeda,
  paraGrafico,
} from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { CentroCusto, MapaAnalitico } from "@/types";

export default function PainelAnalitica() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState("");

  const exId = exercicioId || activo?.id || "";
  const { data, isLoading } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${exId ? `?exercicio_id=${exId}` : ""}`,
    buscador,
  );
  const { data: centros } = useSWR<CentroCusto[]>(
    "/api/contabilidade/centros",
    buscador,
  );

  // O gráfico deixa de fora "(Sem centro)": misturar o que não está
  // classificado com os centros reais faria a barra maior ser sempre a que
  // não diz nada. O número aparece no KPI e no aviso, que é onde interessa.
  const porCentro = useMemo(
    () =>
      (data?.linhas ?? [])
        .filter((l) => l.codigo !== "—")
        .sort((a, b) => compara(b.debito, a.debito))
        .slice(0, 8)
        .map((l) => ({
          nome: l.nome.length > 20 ? `${l.nome.slice(0, 19)}…` : l.nome,
          custos: paraGrafico(l.debito),
          proveitos: paraGrafico(l.credito),
        })),
    [data],
  );

  const semCentro = data?.linhas.find((l) => l.codigo === "—");
  const classificadas = (data?.linhas ?? [])
    .filter((l) => l.codigo !== "—")
    .reduce((s, l) => s + l.n, 0);
  const total = classificadas + (semCentro?.n ?? 0);
  const pctClassificado = total ? Math.round((classificadas / total) * 100) : 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Contabilidade Analítica"
        descricao="Como os custos e proveitos se repartem pelos centros de custo."
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos os exercícios" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {isLoading || !data ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Custos imputados"
                valor={formataCompacto(data.totais.debito, moeda)}
                detalhe="Classe 6"
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Proveitos imputados"
                valor={formataCompacto(data.totais.credito, moeda)}
                detalhe="Classe 7"
                cor="var(--grafico-6)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Centros"
                valor={String(centros?.length ?? 0)}
                detalhe={`${(data.linhas ?? []).filter((l) => l.codigo !== "—").length} com movimento`}
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Classificado"
                valor={`${pctClassificado}%`}
                detalhe={`${plural(semCentro?.n ?? 0, "linha")} sem centro`}
                cor={
                  pctClassificado === 100
                    ? "var(--grafico-6)"
                    : "var(--color-aviso)"
                }
              />
            </div>
          </div>

          {(semCentro?.n ?? 0) > 0 && (
            <Alerta tipo="aviso" className="mb-4">
              <b>{semCentro?.n}</b> linhas das classes 6 e 7 não têm centro
              atribuído, no valor de{" "}
              <b className="tabular">
                {formataMoeda(semCentro?.debito ?? "0", moeda)}
              </b>{" "}
              em custos. Só {pctClassificado}% do movimento está repartido pelos
              centros — a análise por centro fica incompleta até isso mudar.
            </Alerta>
          )}

          <Cartao className="mb-4">
            <TituloCartao extra="Os oito com mais custo">
              Custos e proveitos por centro
            </TituloCartao>
            {!porCentro.length ? (
              <Vazio>
                Nenhum centro tem movimento imputado neste exercício.
              </Vazio>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={porCentro}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 10 }}
                      stroke="var(--color-texto-suave)"
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-texto-suave)"
                      tickFormatter={(v: number) => formataCompacto(v, "")}
                      width={64}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-superficie-2)" }}
                      formatter={(v, nome) => [
                        formataMoeda(v as string | number, moeda),
                        nome === "custos" ? "Custos" : "Proveitos",
                      ]}
                      contentStyle={{
                        background: "var(--color-superficie)",
                        border: "1px solid var(--color-borda)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="custos"
                      fill="var(--grafico-4)"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={30}
                    />
                    <Bar
                      dataKey="proveitos"
                      fill="var(--grafico-6)"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={30}
                    >
                      {porCentro.map((c) => (
                        <Cell key={c.nome} fill="var(--grafico-6)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>

          <Cartao className="p-0">
            <TituloCartao className="px-5 pt-5">
              Resultado por centro
            </TituloCartao>
            {!data.linhas.length ? (
              <Vazio>Sem movimento nas classes 6 e 7.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Centro</Th>
                      <Th>Designação</Th>
                      <Th numerico>Linhas</Th>
                      <Th numerico>Custos</Th>
                      <Th numerico>Proveitos</Th>
                      <Th numerico>Resultado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.linhas.map((l) => (
                      <Tr
                        key={l.codigo}
                        className={l.codigo === "—" ? "bg-aviso/6" : undefined}
                      >
                        <Td className="tabular font-bold">{l.codigo}</Td>
                        <Td className="max-w-[260px] truncate font-semibold">
                          {l.nome}
                        </Td>
                        <Td numerico className="text-texto-suave">
                          {l.n}
                        </Td>
                        <Td numerico>{formataMoeda(l.debito, moeda)}</Td>
                        <Td numerico>{formataMoeda(l.credito, moeda)}</Td>
                        <Td numerico className="font-bold">
                          {formataMoeda(l.saldo, moeda)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
