"use client";

import type { ReactNode } from "react";

import { big } from "@/lib/dinheiro";

/**
 * As peças dos painéis do Piloto (`assets/js/dashboards.js` + `.dash-*` do CSS).
 *
 * São seis painéis — contabilidade, financeiro, comercial, imobilizados, RH e
 * analítica — construídos todos com as mesmas quatro peças: a faixa, os KPIs,
 * o anel e as barras, mais uma lista. Estavam a ser reescritas em cada página,
 * que é como as medidas se afastam uma da outra sem ninguém dar por isso.
 *
 * NENHUM VALOR LEVA CÊNTIMOS nestes painéis: o Piloto usa `formatKz`, que
 * arredonda ao inteiro. Aqui lê-se a ordem de grandeza; os cêntimos são dos
 * mapas.
 */

/** `.dash-hero`: faixa em gradiente com sobrenome, título, subtítulo e valores. */
export function FaixaPainel({
  sobrenome,
  titulo,
  subtitulo,
  valores,
}: {
  sobrenome: string;
  titulo: string;
  subtitulo?: string;
  valores: { rotulo: string; valor: string }[];
}) {
  return (
    <div className="gradiente-marca relative mb-4 overflow-hidden rounded-[14px] px-[22px] py-5 text-white shadow-suave">
      <span
        aria-hidden
        className="absolute -right-[60px] -top-[60px] size-[220px] rounded-full bg-white/[0.12]"
      />
      <p className="text-[11.5px] uppercase tracking-[1.4px] opacity-90">
        {sobrenome}
      </p>
      <h1 className="mb-0.5 mt-1 text-[25px] font-black">{titulo}</h1>
      {subtitulo && (
        <p className="max-w-[640px] text-[13.5px] opacity-90">{subtitulo}</p>
      )}
      <div className="relative z-[1] mt-3.5 flex flex-wrap gap-[26px]">
        {valores.map((v) => (
          <div key={v.rotulo} className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.6px] opacity-85">
              {v.rotulo}
            </p>
            <p className="tabular mt-0.5 text-[20px] font-extrabold">
              {v.valor}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** `.grid-4`: quatro KPIs, dois abaixo de 1050, um abaixo de 760. */
export function GrelhaKpis({ children }: { children: ReactNode }) {
  return (
    <div className="revelar-grelha mb-4 grid grid-cols-1 gap-3.5 min-[760px]:grid-cols-2 min-[1050px]:grid-cols-4">
      {children}
    </div>
  );
}

/** `.dash-grid.cols-3`: dois cartões, 2fr para o da esquerda. */
export function GrelhaPainel({
  children,
  larga,
}: {
  children: ReactNode;
  /** `true` dá 2fr ao primeiro cartão; `false` reparte a meio. */
  larga?: boolean;
}) {
  return (
    <div
      className={`mb-3.5 grid items-start gap-3.5 ${
        larga ? "min-[900px]:grid-cols-[2fr_1fr]" : "min-[900px]:grid-cols-2"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * O `chartDonut` do Piloto: anel de 132px à esquerda, legenda à direita.
 *
 * Escrito à mão e não com o Recharts porque o desenho depende disso — um anel
 * pequeno ao lado da legenda, com o total lá dentro. São dois `circle` com
 * `stroke-dasharray`; não há biblioteca nenhuma a acrescentar.
 */
export function Donut({
  segmentos,
  centro,
  centroSub,
  formatar,
}: {
  segmentos: { nome: string; valor: string; cor: string }[];
  centro: string;
  centroSub: string;
  formatar: (v: string) => string;
}) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const visiveis = segmentos.filter((s) => !big(s.valor).abs().eq(0));
  const total = visiveis.reduce((s, x) => s.plus(big(x.valor).abs()), big("0"));

  let offset = 0;
  const arcos = visiveis.map((s) => {
    const comprimento = total.eq(0)
      ? 0
      : Number(big(s.valor).abs().div(total).toString()) * C;
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
        {visiveis.map((s) => (
          <div key={s.nome} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-[11px] flex-none rounded-[3px]"
              style={{ background: s.cor }}
            />
            <span className="flex-1 truncate text-texto-suave">{s.nome}</span>
            <b className="tabular">{formatar(s.valor)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** O `chartBars` do Piloto: rótulo de 150px, barra, valor à direita. */
export function Barras({
  itens,
  formatar,
}: {
  itens: { rotulo: string; valor: string; texto?: string; cor?: string }[];
  formatar: (v: string) => string;
}) {
  const maximo = itens.reduce(
    (m, i) => Math.max(m, Math.abs(Number(i.valor))),
    1,
  );

  return (
    <div className="mt-1 flex flex-col gap-2.5">
      {itens.map((i, k) => (
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
                background: i.cor ?? CORES[k % CORES.length],
              }}
            />
          </div>
          <div className="tabular whitespace-nowrap text-[13px] font-bold">
            {i.texto ?? formatar(i.valor)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** `.dash-list`: título, subtítulo e valor por linha. */
export function ListaPainel({
  linhas,
  vazio = "Sem dados.",
}: {
  linhas: { titulo: string; sub?: string; valor?: string }[];
  vazio?: string;
}) {
  if (linhas.length === 0)
    return (
      <p className="py-10 text-center text-sm text-texto-suave">{vazio}</p>
    );

  return (
    <div className="flex flex-col">
      {linhas.map((l) => (
        <div
          key={`${l.titulo}-${l.sub ?? ""}`}
          className="flex items-center gap-2.5 border-b border-borda px-0.5 py-[9px] last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">
              {l.titulo}
            </div>
            {l.sub && (
              <div className="text-[12px] text-texto-suave">{l.sub}</div>
            )}
          </div>
          {l.valor && <b className="tabular whitespace-nowrap">{l.valor}</b>}
        </div>
      ))}
    </div>
  );
}

/** A `CHART_CORES` do Piloto, pela mesma ordem. */
export const CORES = [
  "var(--grafico-1)",
  "var(--grafico-2)",
  "var(--grafico-3)",
  "var(--grafico-4)",
  "var(--grafico-5)",
  "var(--grafico-6)",
  "var(--grafico-7)",
];

/** `2026-08-09` → `09/08/2026`, sem passar pelo fuso do browser. */
export function dataCurta(iso: string | null | undefined): string {
  const [a, m, d] = (iso ?? "").split("-");
  return d ? `${d}/${m}/${a}` : (iso ?? "—");
}
