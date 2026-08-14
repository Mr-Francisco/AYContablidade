"use client";

import Link from "next/link";
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

import { ACarregar, Cartao, Kpi, TituloCartao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balanco, Lancamento, Resumo } from "@/types";

/**
 * Painel Contabilístico — o `dash.contabilidade` do Piloto.
 *
 * A mesma estrutura, pela mesma ordem: faixa com três valores, quatro KPIs,
 * a composição do activo com o total ao centro ao lado dos últimos
 * lançamentos, e em baixo as duas leituras que fecham o exercício — o
 * resultado (proveitos menos custos) e a estrutura financeira (activo igual a
 * capital próprio mais passivo).
 *
 * O Piloto não tem selector de exercício aqui: usa o activo. Mantém-se assim.
 */

/** Soma as rubricas do balanço pelo nome, como o `valOf` do Piloto. */
function valorDe(
  linhas: { designacao: string; valor: string | null }[] | undefined,
  ...nomes: string[]
) {
  let total = big("0");
  for (const nome of nomes) {
    const l = linhas?.find((x) => x.designacao === nome);
    if (l?.valor) total = total.plus(big(l.valor));
  }
  return total;
}

export default function PainelContabilistico() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";
  const q = activo?.id ? `?exercicio_id=${activo.id}` : "";

  const { data: balanco, isLoading } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );
  const { data: resumo } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: lancamentos } = useSWR<Lancamento[]>(
    `/api/contabilidade/lancamentos?limite=6${activo?.id ? `&exercicio_id=${activo.id}` : ""}`,
    buscador,
  );

  const imobilizado = valorDe(
    balanco?.activo,
    "Imobilizações Corpóreas",
    "Imobilizações Incorpóreas",
    "Investimentos Financeiros",
    "Outros Activos Não Correntes",
  );
  const existencias = valorDe(balanco?.activo, "Existências");
  const receber = valorDe(balanco?.activo, "Contas a Receber");
  const disponibilidades = valorDe(balanco?.activo, "Disponibilidades");
  const capitalProprio = valorDe(balanco?.passivo, "Total do Capital Próprio");
  const passivo = valorDe(balanco?.passivo, "Total do Passivo");

  const resultado = big(resumo?.resultado ?? "0");
  const lucro = resultado.gte(0);

  const composicao = useMemo(
    () =>
      [
        { nome: "Imobilizado", valor: imobilizado, cor: "var(--grafico-1)" },
        { nome: "Existências", valor: existencias, cor: "var(--grafico-2)" },
        { nome: "Contas a Receber", valor: receber, cor: "var(--grafico-3)" },
        {
          nome: "Disponibilidades",
          valor: disponibilidades,
          cor: "var(--grafico-4)",
        },
      ].filter((x) => x.valor.gt(0)),
    [imobilizado, existencias, receber, disponibilidades],
  );

  const barrasResultado = [
    {
      nome: "Proveitos",
      v: Number(resumo?.proveitos ?? 0),
      cor: "var(--grafico-6)",
    },
    { nome: "Custos", v: Number(resumo?.custos ?? 0), cor: "var(--grafico-1)" },
    {
      nome: "Resultado",
      v: Math.abs(Number(resumo?.resultado ?? 0)),
      cor: "var(--grafico-2)",
    },
  ];

  const barrasEstrutura = [
    {
      nome: "Activo",
      v: Number(balanco?.total_activo ?? 0),
      cor: "var(--grafico-2)",
    },
    {
      nome: "Capital Próprio",
      v: Number(capitalProprio.toString()),
      cor: "var(--grafico-3)",
    },
    { nome: "Passivo", v: Number(passivo.toString()), cor: "var(--grafico-5)" },
  ];

  if (isLoading) return <ACarregar />;

  return (
    <>
      {/* A faixa do Piloto: sobrenome, título, subtítulo e três valores. */}
      <div className="gradiente-marca relative mb-4 overflow-hidden rounded-[14px] px-6 py-5 text-white shadow-suave">
        <span
          aria-hidden
          className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10"
        />
        <p className="text-[11.5px] font-bold uppercase tracking-[1px] text-white/75">
          Contabilidade · PGC-Angola
        </p>
        <h1 className="mt-0.5 text-[28px] font-black tracking-[-0.5px]">
          Painel Contabilístico
        </h1>
        <p className="mt-0.5 text-[13.5px] text-white/85">
          Posição financeira e resultado do exercício em tempo real.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          <ValorDaFaixa
            rotulo="Total do Activo"
            valor={formataMoeda(balanco?.total_activo ?? "0", moeda)}
          />
          <ValorDaFaixa
            rotulo="Capital Próprio"
            valor={formataMoeda(capitalProprio, moeda)}
          />
          <ValorDaFaixa
            rotulo="Resultado do Exercício"
            valor={`${lucro ? "" : "−"}${formataMoeda(resultado.abs(), moeda)}`}
          />
        </div>
      </div>

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          rotulo="Total do Activo"
          valor={formataMoeda(balanco?.total_activo ?? "0", moeda)}
          detalhe={
            balanco?.equilibrado ? "Balanço equilibrado ✓" : "⚠ verificar"
          }
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Capital Próprio"
          valor={formataMoeda(capitalProprio, moeda)}
          detalhe={`Passivo ${formataMoeda(passivo, moeda)}`}
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Resultado Líquido"
          valor={`${lucro ? "" : "−"}${formataMoeda(resultado.abs(), moeda)}`}
          detalhe={lucro ? "Lucro" : "Prejuízo"}
          tendencia={lucro ? "sobe" : "desce"}
          cor={lucro ? "var(--color-sucesso)" : "var(--color-rosa)"}
        />
        <Kpi
          rotulo="Lançamentos"
          valor={String(lancamentos?.length ?? 0)}
          detalhe={`Últimos ${lancamentos?.length ?? 0} movimentos`}
          cor="var(--color-azul)"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Cartao>
          <TituloCartao>Composição do Activo</TituloCartao>
          {composicao.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem activo registado.
            </p>
          ) : (
            <>
              <div className="relative h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={composicao.map((c) => ({
                        name: c.nome,
                        value: Number(c.valor.toString()),
                      }))}
                      dataKey="value"
                      innerRadius="62%"
                      outerRadius="92%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {composicao.map((c) => (
                        <Cell key={c.nome} fill={c.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formataMoeda(String(v ?? 0), moeda)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* O total ao centro, como o `centro`/`centroSub` do Piloto. */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <b className="tabular text-[19px] leading-none">
                    {formataCompacto(balanco?.total_activo ?? "0")}
                  </b>
                  <span className="text-[10.5px] uppercase tracking-[1px] text-texto-suave">
                    Activo
                  </span>
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {composicao.map((c) => (
                  <li
                    key={c.nome}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: c.cor }}
                    />
                    <span className="flex-1 truncate">{c.nome}</span>
                    <b className="tabular">{formataMoeda(c.valor, moeda)}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Últimos Lançamentos</TituloCartao>
          {!lancamentos?.length ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem lançamentos.
            </p>
          ) : (
            <ul className="flex flex-col">
              {lancamentos.map((l) => (
                <li key={l.id}>
                  <Link
                    href="/contabilidade/movimentos"
                    className="flex items-center gap-3 border-b border-borda py-2.5 last:border-b-0 hover:bg-superficie-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {l.numero_op ? `${l.numero_op} · ` : ""}
                        {l.descricao || "Lançamento"}
                      </span>
                      <span className="block text-[12px] text-texto-suave">
                        {formataData(l.data)} · Diário {l.diario_codigo}
                      </span>
                    </span>
                    <b className="tabular shrink-0 text-[13.5px]">
                      {formataMoeda(l.total ?? "0", moeda)}
                    </b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoDeBarras
          titulo="Resultado do Exercício"
          extra="Proveitos − Custos"
          dados={barrasResultado}
          moeda={moeda}
        />
        <CartaoDeBarras
          titulo="Estrutura Financeira"
          extra="Activo = CP + Passivo"
          dados={barrasEstrutura}
          moeda={moeda}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function ValorDaFaixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-white/70">
        {rotulo}
      </p>
      <p className="tabular text-[21px] font-black leading-tight">{valor}</p>
    </div>
  );
}

function CartaoDeBarras({
  titulo,
  extra,
  dados,
  moeda,
}: {
  titulo: string;
  extra: string;
  dados: { nome: string; v: number; cor: string }[];
  moeda: string;
}) {
  return (
    <Cartao>
      <TituloCartao extra={extra}>{titulo}</TituloCartao>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="nome"
              width={110}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12.5, fill: "var(--color-texto-suave)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-superficie-2)" }}
              formatter={(v) => formataMoeda(String(v ?? 0), moeda)}
            />
            <Bar dataKey="v" radius={[0, 6, 6, 0]} barSize={22}>
              {dados.map((d) => (
                <Cell key={d.nome} fill={d.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cartao>
  );
}

/** `2026-08-09` → `09/08/2026`. */
function formataData(iso: string): string {
  const [a, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${a}` : iso;
}
