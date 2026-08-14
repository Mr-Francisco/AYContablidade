"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { ACarregar, Cartao, Kpi, TituloCartao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balanco, Lancamento, Resumo } from "@/types";

/**
 * Painel Contabilístico — o `dash.contabilidade` do Piloto.
 *
 * A mesma estrutura, pela mesma ordem: faixa com três valores, quatro KPIs, a
 * composição do activo com o total ao centro ao lado dos últimos lançamentos,
 * e em baixo as duas leituras que fecham o exercício — o resultado (proveitos
 * menos custos) e a estrutura financeira (activo igual a capital próprio mais
 * passivo).
 *
 * TUDO SEM CASAS DECIMAIS. O painel do Piloto usa `formatKz`, que arredonda ao
 * inteiro: aqui lê-se a ordem de grandeza, e os cêntimos só fazem barulho. Os
 * mapas onde os cêntimos contam — balancete, extracto, razão — continuam com
 * as duas casas.
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
  const kz = (v: Parameters<typeof big>[0]) => formataMoeda(v, moeda, 0);

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

  if (isLoading) return <ACarregar />;

  return (
    <>
      {/* `.dash-hero`: sobrenome, título, subtítulo e três valores. */}
      <div className="gradiente-marca relative mb-4 overflow-hidden rounded-[14px] px-[22px] py-5 text-white shadow-suave">
        <span
          aria-hidden
          className="absolute -right-[60px] -top-[60px] size-[220px] rounded-full bg-white/[0.12]"
        />
        <p className="text-[11.5px] uppercase tracking-[1.4px] opacity-90">
          Contabilidade · PGC-Angola
        </p>
        <h1 className="mb-0.5 mt-1 text-[25px] font-black">
          Painel Contabilístico
        </h1>
        <p className="max-w-[640px] text-[13.5px] opacity-90">
          Posição financeira e resultado do exercício em tempo real.
        </p>
        <div className="relative z-[1] mt-3.5 flex flex-wrap gap-[26px]">
          <ValorDaFaixa
            rotulo="Total do Activo"
            valor={kz(balanco?.total_activo ?? "0")}
          />
          <ValorDaFaixa rotulo="Capital Próprio" valor={kz(capitalProprio)} />
          <ValorDaFaixa
            rotulo="Resultado do Exercício"
            valor={`${lucro ? "" : "−"}${kz(resultado.abs())}`}
          />
        </div>
      </div>

      {/* `.grid-4`: quatro, dois abaixo de 1050, um abaixo de 760. */}
      <div className="revelar-grelha mb-4 grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-2 min-[1050px]:grid-cols-4">
        <Kpi
          rotulo="Total do Activo"
          valor={kz(balanco?.total_activo ?? "0")}
          detalhe={
            balanco?.equilibrado ? "Balanço equilibrado ✓" : "⚠ verificar"
          }
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Capital Próprio"
          valor={kz(capitalProprio)}
          detalhe={`Passivo ${kz(passivo)}`}
          cor="var(--color-roxo)"
        />
        {/* Sem `tendencia`: no Piloto «Lucro» sai na cor de legenda como
            qualquer outro detalhe, não a verde. */}
        <Kpi
          rotulo="Resultado Líquido"
          valor={`${lucro ? "" : "−"}${kz(resultado.abs())}`}
          detalhe={lucro ? "Lucro" : "Prejuízo"}
          cor={lucro ? "var(--color-sucesso)" : "var(--color-rosa)"}
        />
        <Kpi
          rotulo="Lançamentos"
          valor={String(resumo?.lancamentos ?? 0)}
          detalhe={`Movimentado ${kz(resumo?.movimentado ?? "0")}`}
          cor="var(--color-azul)"
        />
      </div>

      {/* `.dash-grid.cols-3`: 2fr para o activo, 1fr para os lançamentos. */}
      <div className="mb-3.5 grid items-start gap-3.5 min-[900px]:grid-cols-[2fr_1fr]">
        <Cartao>
          <TituloCartao>Composição do Activo</TituloCartao>
          {composicao.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem activo registado.
            </p>
          ) : (
            <Donut
              segmentos={composicao}
              centro={formataMoeda(balanco?.total_activo ?? "0", "", 0).trim()}
              centroSub="Activo"
              kz={kz}
            />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Últimos Lançamentos</TituloCartao>
          {!lancamentos?.length ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem lançamentos.
            </p>
          ) : (
            <div className="flex flex-col">
              {lancamentos.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2.5 border-b border-borda px-0.5 py-[9px] last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">
                      {l.numero_op ? `${l.numero_op} · ` : ""}
                      {l.descricao || "Lançamento"}
                    </div>
                    <div className="text-[12px] text-texto-suave">
                      {dataCurta(l.data)} · Diário {l.diario_codigo}
                    </div>
                  </div>
                  <b className="tabular whitespace-nowrap">
                    {kz(l.total ?? "0")}
                  </b>
                </div>
              ))}
            </div>
          )}
        </Cartao>
      </div>

      <div className="grid items-start gap-3.5 min-[900px]:grid-cols-2">
        <Cartao>
          <TituloCartao extra="Proveitos − Custos">
            Resultado do Exercício
          </TituloCartao>
          <Barras
            itens={[
              {
                rotulo: "Proveitos",
                valor: resumo?.proveitos ?? "0",
                cor: "var(--grafico-6)",
              },
              {
                rotulo: "Custos",
                valor: resumo?.custos ?? "0",
                cor: "var(--grafico-1)",
              },
              {
                rotulo: "Resultado",
                valor: resultado.abs().toString(),
                texto: `${lucro ? "" : "−"}${kz(resultado.abs())}`,
                cor: "var(--grafico-2)",
              },
            ]}
            kz={kz}
          />
        </Cartao>

        <Cartao>
          <TituloCartao extra="Activo = CP + Passivo">
            Estrutura Financeira
          </TituloCartao>
          <Barras
            itens={[
              {
                rotulo: "Activo",
                valor: balanco?.total_activo ?? "0",
                cor: "var(--grafico-2)",
              },
              {
                rotulo: "Capital Próprio",
                valor: capitalProprio.toString(),
                cor: "var(--grafico-3)",
              },
              {
                rotulo: "Passivo",
                valor: passivo.toString(),
                cor: "var(--grafico-5)",
              },
            ]}
            kz={kz}
          />
        </Cartao>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function ValorDaFaixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.6px] opacity-85">
        {rotulo}
      </p>
      <p className="tabular mt-0.5 text-[20px] font-extrabold">{valor}</p>
    </div>
  );
}

/**
 * O `chartDonut` do Piloto: anel de 132px à esquerda, legenda à direita.
 *
 * Escrito à mão e não com o Recharts porque é o que o Piloto faz e o desenho
 * depende disso — um anel pequeno ao lado da legenda, com o total lá dentro.
 * São dois `circle` com `stroke-dasharray`; não há biblioteca nenhuma a
 * acrescentar.
 */
function Donut({
  segmentos,
  centro,
  centroSub,
  kz,
}: {
  segmentos: { nome: string; valor: ReturnType<typeof big>; cor: string }[];
  centro: string;
  centroSub: string;
  kz: (v: string) => string;
}) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const total = segmentos.reduce((s, x) => s.plus(x.valor.abs()), big("0"));

  let offset = 0;
  const arcos = segmentos.map((s) => {
    const comprimento = total.eq(0)
      ? 0
      : Number(s.valor.abs().div(total).toString()) * C;
    const arco = (
      <circle
        key={s.nome}
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke={s.cor}
        strokeWidth="17"
        strokeDasharray={`${comprimento.toFixed(2)} ${(C - comprimento).toFixed(2)}`}
        strokeDashoffset={(-offset).toFixed(2)}
        transform="rotate(-90 64 64)"
      />
    );
    offset += comprimento;
    return arco;
  });

  return (
    <div className="mt-1 flex flex-wrap items-center gap-[18px]">
      <svg
        viewBox="0 0 128 128"
        className="size-[132px] flex-none"
        aria-hidden="true"
      >
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="var(--color-borda)"
          strokeWidth="17"
          opacity=".3"
        />
        {arcos}
        <text
          x="64"
          y="60"
          textAnchor="middle"
          className="fill-[var(--color-texto)] text-[15px] font-extrabold"
        >
          {centro}
        </text>
        <text
          x="64"
          y="80"
          textAnchor="middle"
          className="fill-[var(--color-texto-suave)] text-[9px] uppercase tracking-[0.5px]"
        >
          {centroSub}
        </text>
      </svg>
      <div className="flex min-w-[180px] flex-1 flex-col gap-2">
        {segmentos.map((s) => (
          <div key={s.nome} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-[11px] flex-none rounded-[3px]"
              style={{ background: s.cor }}
            />
            <span className="flex-1 text-texto-suave">{s.nome}</span>
            <b className="tabular">{kz(s.valor.toString())}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** O `chartBars` do Piloto: rótulo de 150px, barra, valor à direita. */
function Barras({
  itens,
  kz,
}: {
  itens: { rotulo: string; valor: string; texto?: string; cor: string }[];
  kz: (v: string) => string;
}) {
  const maximo = itens.reduce(
    (m, i) => Math.max(m, Math.abs(Number(i.valor))),
    1,
  );

  return (
    <div className="mt-1 flex flex-col gap-2.5">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className="grid grid-cols-[96px_1fr_auto] items-center gap-3 min-[560px]:grid-cols-[150px_1fr_auto]"
        >
          <div className="truncate text-[13px]" title={i.rotulo}>
            {i.rotulo}
          </div>
          <div className="h-3 overflow-hidden rounded-md bg-[color-mix(in_srgb,var(--color-borda)_60%,transparent)]">
            <div
              className="h-full min-w-[4px] rounded-md transition-[width] duration-500"
              style={{
                width: `${Math.max(2, Math.round((Math.abs(Number(i.valor)) / maximo) * 100))}%`,
                background: i.cor,
              }}
            />
          </div>
          <div className="tabular whitespace-nowrap text-[13px] font-bold">
            {i.texto ?? kz(i.valor)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** `2026-08-09` → `09/08/2026`. */
function dataCurta(iso: string): string {
  const [a, m, d] = (iso || "").split("-");
  return d ? `${d}/${m}/${a}` : iso;
}
