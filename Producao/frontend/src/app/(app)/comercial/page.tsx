"use client";

import { ArrowRight, FileSearch, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
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

import {
  ACarregar,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selo,
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
  formataCompacto,
  formataMoeda,
  paraGrafico,
  soma,
} from "@/lib/dinheiro";
import type { Comissao, ResumoComercial, Venda } from "@/types";

const ATALHOS = [
  {
    href: "/comercial/vendas",
    rotulo: "Vendas",
    descricao: "Emitir facturas e outros documentos",
    Icone: ShoppingCart,
  },
  {
    href: "/comercial/clientes",
    rotulo: "Clientes",
    descricao: "Fichas e contas correntes",
    Icone: Users,
  },
  {
    href: "/comercial/consulta-faturas",
    rotulo: "Consulta de Facturas",
    descricao: "Procurar documentos emitidos",
    Icone: FileSearch,
  },
];

export default function PainelComercial() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: resumo, isLoading } = useSWR<ResumoComercial>(
    "/api/comercial/resumo",
    buscador,
  );
  const { data: vendas } = useSWR<Venda[]>(
    "/api/comercial/vendas?estado=emitida&limite=500",
    buscador,
  );
  const { data: comissoes } = useSWR<Comissao[]>(
    "/api/comercial/comissoes",
    buscador,
  );

  // Facturação por mês do ano corrente — a leitura que interessa num painel.
  const porMes = useMemo(() => {
    const meses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const acumulado = new Map<number, string[]>();
    for (const v of vendas ?? []) {
      const m = new Date(v.data).getMonth();
      acumulado.set(m, [...(acumulado.get(m) ?? []), v.total]);
    }
    return meses.map((nome, i) => ({
      nome,
      valor: paraGrafico(soma(...(acumulado.get(i) ?? []))),
    }));
  }, [vendas]);

  const ultimas = (vendas ?? []).slice(0, 8);

  return (
    <>
      <CabecalhoPagina
        titulo="Comercial"
        descricao="Facturação, clientes e comissões."
        accoes={
          resumo && (
            <Selo cor="#1a9c5f">{resumo.n_faturadas} documentos emitidos</Selo>
          )
        }
      />

      {isLoading ? (
        <ACarregar />
      ) : (
        <>
          <div className="revelar-grelha grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Total facturado"
                valor={formataCompacto(resumo?.total_faturado, moeda)}
                detalhe="Documentos emitidos"
                cor="var(--grafico-6)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Por facturar"
                valor={formataCompacto(resumo?.por_faturar, moeda)}
                detalhe="Rascunhos por emitir"
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Documentos"
                valor={String(resumo?.n_vendas ?? 0)}
                detalhe={`${resumo?.n_faturadas ?? 0} emitidos`}
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Comissões"
                valor={formataCompacto(
                  soma(...(comissoes ?? []).map((c) => c.comissao)),
                  moeda,
                )}
                detalhe={`${comissoes?.length ?? 0} vendedores`}
                cor="var(--grafico-3)"
              />
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Cartao className="min-w-0">
              <TituloCartao extra="Documentos emitidos">
                Facturação por mês
              </TituloCartao>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={porMes}
                    margin={{ top: 8, right: 8, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-borda)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="nome"
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={{ stroke: "var(--color-borda)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formataCompacto(v, "")}
                      width={64}
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
                      formatter={(v) => [
                        formataMoeda(v as string | number, moeda),
                        "Facturado",
                      ]}
                    />
                    <Bar dataKey="valor" radius={[5, 5, 0, 0]} maxBarSize={38}>
                      {porMes.map((d) => (
                        <Cell key={d.nome} fill="var(--grafico-4)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>

            <div className="flex min-w-0 flex-col gap-4">
              <Cartao className="min-w-0 p-0">
                <TituloCartao className="px-5 pt-5">
                  Últimos documentos
                </TituloCartao>
                {ultimas.length === 0 ? (
                  <Vazio>Ainda não há documentos emitidos.</Vazio>
                ) : (
                  <EnvolveTabela className="rounded-none border-0 border-t">
                    <Tabela>
                      <thead>
                        <tr>
                          <Th>Número</Th>
                          <Th>Cliente</Th>
                          <Th numerico>Total</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {ultimas.map((v) => (
                          <Tr key={v.id}>
                            <Td className="tabular font-semibold">
                              {v.numero}
                            </Td>
                            <Td className="max-w-[150px] truncate">
                              {v.cliente_nome || "Consumidor final"}
                            </Td>
                            <Td numerico>{formataMoeda(v.total, moeda)}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Tabela>
                  </EnvolveTabela>
                )}
              </Cartao>

              <Cartao className="min-w-0">
                <TituloCartao>Aceder</TituloCartao>
                <div className="revelar-grelha flex flex-col gap-2">
                  {ATALHOS.map(({ href, rotulo, descricao, Icone }) => (
                    <div key={href} className="min-w-0">
                      <Link
                        href={href}
                        className="group flex min-w-0 items-center gap-3 rounded-xl border border-borda p-3 transition-colors hover:border-acento"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-marca">
                          <Icone size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {rotulo}
                          </span>
                          <span className="block truncate text-[12px] text-texto-suave">
                            {descricao}
                          </span>
                        </span>
                        <ArrowRight
                          size={15}
                          className="shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    </div>
                  ))}
                </div>
              </Cartao>
            </div>
          </div>
        </>
      )}
    </>
  );
}
