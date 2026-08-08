"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";

import {
  ACarregar,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
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
import type { MapaImob } from "@/types";

export default function PainelImobilizados() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: mapa, isLoading } = useSWR<MapaImob>(
    "/api/imobilizados/mapa",
    buscador,
  );

  const topLiquido = useMemo(
    () =>
      [...(mapa?.linhas ?? [])]
        .sort((a, b) => compara(b.valor_liquido, a.valor_liquido))
        .slice(0, 6)
        .map((l) => ({
          nome:
            l.designacao.length > 22
              ? `${l.designacao.slice(0, 21)}…`
              : l.designacao,
          valor: paraGrafico(l.valor_liquido),
        })),
    [mapa],
  );

  const bruto = mapa ? paraGrafico(mapa.totais.valor_bruto) : 0;
  const acumulada = mapa ? paraGrafico(mapa.totais.amort_acumulada) : 0;
  const liquido = mapa ? paraGrafico(mapa.totais.valor_liquido) : 0;
  const pctAmortizado = bruto ? Math.round((acumulada / bruto) * 100) : 0;

  const reparticao = [
    { nome: "Valor líquido", valor: liquido },
    { nome: "Amortização acumulada", valor: acumulada },
  ].filter((x) => x.valor > 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Painel de Imobilizados"
        descricao="Valor patrimonial, amortizações e valor líquido dos activos."
      />

      {isLoading || !mapa ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Nº de activos"
                valor={String(mapa.linhas.length)}
                detalhe="em ficha"
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Valor bruto"
                valor={formataCompacto(mapa.totais.valor_bruto, moeda)}
                detalhe="custo de aquisição"
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Amortização acumulada"
                valor={formataCompacto(mapa.totais.amort_acumulada, moeda)}
                detalhe={`${pctAmortizado}% amortizado`}
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Valor líquido"
                valor={formataCompacto(mapa.totais.valor_liquido, moeda)}
                detalhe="valor contabilístico"
                cor="var(--grafico-6)"
              />
            </div>
          </div>

          <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Cartao className="min-w-0">
              <TituloCartao extra="Os seis maiores">
                Valor líquido por activo
              </TituloCartao>
              {!topLiquido.length ? (
                <Vazio>Sem activos registados.</Vazio>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topLiquido}
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
                        formatter={(v) => [
                          formataMoeda(v as string | number, moeda),
                          "Valor líquido",
                        ]}
                        contentStyle={{
                          background: "var(--color-superficie)",
                          border: "1px solid var(--color-borda)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="valor"
                        fill="var(--grafico-6)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Cartao>

            <Cartao className="min-w-0">
              <TituloCartao
                extra={formataCompacto(mapa.totais.valor_bruto, moeda)}
              >
                Bruto vs. amortizado
              </TituloCartao>
              {!reparticao.length ? (
                <Vazio>Sem valores.</Vazio>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reparticao}
                        dataKey="valor"
                        nameKey="nome"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={2}
                      >
                        <Cell fill="var(--grafico-6)" />
                        <Cell fill="var(--grafico-4)" />
                      </Pie>
                      <Tooltip
                        formatter={(v) =>
                          formataMoeda(v as string | number, moeda)
                        }
                        contentStyle={{
                          background: "var(--color-superficie)",
                          border: "1px solid var(--color-borda)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Cartao>
          </div>

          <Cartao className="p-0">
            <TituloCartao
              className="px-5 pt-5"
              extra={`Quota do exercício: ${formataCompacto(mapa.totais.amort_exercicio, moeda)}`}
            >
              Activos
            </TituloCartao>
            {!mapa.linhas.length ? (
              <Vazio>Sem activos registados.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Designação</Th>
                      <Th>Aquisição</Th>
                      <Th numerico>Taxa</Th>
                      <Th numerico>Valor bruto</Th>
                      <Th numerico>Do exercício</Th>
                      <Th numerico>Valor líquido</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapa.linhas.map((l) => (
                      <Tr key={l.id}>
                        <Td className="tabular font-bold">{l.codigo}</Td>
                        <Td className="max-w-[280px] truncate font-semibold">
                          {l.designacao}
                        </Td>
                        <Td className="tabular">
                          {l.data_aquisicao
                            ? new Date(l.data_aquisicao).toLocaleDateString(
                                "pt-PT",
                              )
                            : "—"}
                        </Td>
                        <Td numerico>{l.taxa} %</Td>
                        <Td numerico>{formataMoeda(l.valor_bruto, moeda)}</Td>
                        <Td numerico>
                          {formataMoeda(l.amort_exercicio, moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(l.valor_liquido, moeda)}
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
