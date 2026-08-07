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

import { mesActual, mesPorExtenso } from "@/components/rh/mes";
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
  big,
  compara,
  formataCompacto,
  formataMoeda,
  paraGrafico,
  soma,
} from "@/lib/dinheiro";
import type {
  Colaborador,
  Folha,
  PagamentoSalarial,
  Processamento,
} from "@/types";

const CORES_CUSTO = [
  "var(--grafico-6)",
  "var(--grafico-4)",
  "var(--grafico-2)",
  "var(--grafico-3)",
];

export default function PainelRh() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const mes = mesActual();

  const { data: folha, isLoading } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=true`,
    buscador,
  );
  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );
  const { data: processamentos } = useSWR<Processamento[]>(
    "/api/rh/processamentos",
    buscador,
  );
  const { data: pagamentos } = useSWR<PagamentoSalarial[]>(
    "/api/rh/pagamentos",
    buscador,
  );

  const activos = (colaboradores ?? []).filter((c) => c.estado === "activo");

  // Massa salarial por categoria, como no painel do Piloto: base + subsídios
  // da ficha, não o processado — mostra a estrutura de custos contratada.
  const porCategoria = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of activos) {
      const chave = c.categoria?.trim() || "(sem categoria)";
      m.set(
        chave,
        soma(m.get(chave) ?? "0", c.salario_base, c.subsidios).toString(),
      );
    }
    return [...m.entries()]
      .map(([categoria, valor]) => ({ categoria, valor: paraGrafico(valor) }))
      .sort((a, b) => b.valor - a.valor);
  }, [activos]);

  const custoTotal = folha
    ? soma(folha.totais.bruto, folha.totais.inss_empresa)
    : big(0);

  const reparticao = folha
    ? [
        { nome: "Líquido", valor: paraGrafico(folha.totais.liquido) },
        { nome: "IRT", valor: paraGrafico(folha.totais.irt) },
        { nome: "INSS trab.", valor: paraGrafico(folha.totais.inss) },
        { nome: "INSS empresa", valor: paraGrafico(folha.totais.inss_empresa) },
      ].filter((x) => x.valor > 0)
    : [];

  const maiores = useMemo(
    () =>
      [...(folha?.linhas ?? [])]
        .sort((a, b) => compara(b.bruto, a.bruto))
        .slice(0, 6),
    [folha],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Painel de RH"
        descricao={`Massa salarial, encargos e processamento — ${mesPorExtenso(mes)}.`}
      />

      {isLoading || !folha ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Colaboradores activos"
                valor={String(activos.length)}
                detalhe={`de ${colaboradores?.length ?? 0} registados`}
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Massa salarial (bruto)"
                valor={formataCompacto(folha.totais.bruto, moeda)}
                detalhe={`líquido ${formataCompacto(folha.totais.liquido, moeda)}`}
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Retenções"
                valor={formataCompacto(
                  soma(folha.totais.irt, folha.totais.inss),
                  moeda,
                )}
                detalhe="IRT + INSS do trabalhador"
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Custo para a empresa"
                valor={formataCompacto(custoTotal, moeda)}
                detalhe="com o INSS da entidade"
                cor="var(--grafico-6)"
              />
            </div>
          </div>

          <div className="mb-4 grid min-w-0 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Cartao className="min-w-0">
              <TituloCartao extra="Base + subsídios da ficha">
                Massa salarial por categoria
              </TituloCartao>
              {!porCategoria.length ? (
                <Vazio>Sem colaboradores activos.</Vazio>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={porCategoria}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <XAxis
                        dataKey="categoria"
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-texto-suave)"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-texto-suave)"
                        tickFormatter={(v: number) => formataCompacto(v, "")}
                        width={64}
                      />
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
                      <Bar
                        dataKey="valor"
                        fill="var(--grafico-1)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Cartao>

            <Cartao className="min-w-0">
              <TituloCartao extra={formataCompacto(custoTotal, moeda)}>
                Custo do pessoal
              </TituloCartao>
              {!reparticao.length ? (
                <Vazio>Sem valores no mês.</Vazio>
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
                        {reparticao.map((r, i) => (
                          <Cell
                            key={r.nome}
                            fill={CORES_CUSTO[i % CORES_CUSTO.length]}
                          />
                        ))}
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
              extra={`${processamentos?.length ?? 0} mês(es) processado(s) · ${pagamentos?.length ?? 0} pago(s)`}
            >
              Maiores vencimentos
            </TituloCartao>
            {!maiores.length ? (
              <Vazio>Sem colaboradores.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Colaborador</Th>
                      <Th numerico>Bruto</Th>
                      <Th numerico>Retenções</Th>
                      <Th numerico>Líquido</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {maiores.map((l) => (
                      <Tr key={l.colaborador_id}>
                        <Td className="max-w-[280px] truncate font-semibold">
                          {l.colaborador}
                        </Td>
                        <Td numerico>{formataMoeda(l.bruto, moeda)}</Td>
                        <Td numerico className="text-texto-suave">
                          {formataMoeda(soma(l.inss, l.irt), moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(l.liquido, moeda)}
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
