"use client";

import { CalendarClock, ExternalLink, Info, Repeat } from "lucide-react";
import { useMemo } from "react";
import useSWR from "swr";
import { FaixaPainel } from "@/components/painel";
import { ACarregar, Cartao, Vazio } from "@/components/ui";
import { buscador } from "@/lib/api";
import { plural } from "@/lib/texto";
import { cn } from "@/lib/utils";
import type { CatalogoFiscal } from "@/types";

/**
 * Calendário fiscal — o ano de uma vez.
 *
 * Estava uma grelha de cartões todos iguais, e por isso ilegível: «Mensal»,
 * com quatro obrigações que se repetem doze vezes por ano, tinha o mesmo peso
 * que «Abril», com uma. E a ordem era a do ficheiro.
 *
 * Passa a separar o que se repete do que tem data: o recorrente fica em
 * destaque no topo, e o resto é uma linha do tempo por ordem de calendário,
 * com o período em curso assinalado — que é a pergunta que se traz para aqui.
 */

const ORDEM = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Em que mês do ano cai um rótulo do calendário. Trimestres contam pelo fim. */
function mesDe(rotulo: string): number {
  const i = ORDEM.findIndex((m) => rotulo.startsWith(m));
  if (i >= 0) return i + 1;
  const trimestre = /^(\d)\.[ºo]\s*Trimestre/i.exec(rotulo);
  if (trimestre) return Number(trimestre[1]) * 3;
  return 99;
}

export default function Calendario() {
  const { data, isLoading } = useSWR<CatalogoFiscal>(
    "/api/fiscalidade/catalogo",
    buscador,
    { revalidateOnFocus: false },
  );

  const mesActual = new Date().getMonth() + 1;

  const { recorrentes, datados } = useMemo(() => {
    const todos = data?.calendario ?? [];
    return {
      recorrentes: todos.filter((c) => mesDe(c.mes) === 99),
      datados: [...todos]
        .filter((c) => mesDe(c.mes) !== 99)
        .sort((a, b) => mesDe(a.mes) - mesDe(b.mes)),
    };
  }, [data]);

  return (
    <>
      <FaixaPainel
        sobrenome="Fiscalidade · Calendário"
        titulo="Calendário Fiscal"
        subtitulo="Principais obrigações declarativas e de pagamento ao longo do ano. Confirme as datas no Calendário Fiscal oficial da AGT."
        valores={[]}
      />

      {isLoading || !data ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !data.calendario.length ? (
        <Cartao>
          <Vazio>Sem calendário definido.</Vazio>
        </Cartao>
      ) : (
        <div className="revelar-grelha flex flex-col gap-4">
          {/* O que se repete todos os meses — em destaque, e uma só vez. */}
          {recorrentes.map((c) => (
            <Cartao
              key={c.mes}
              className="min-w-0 border-l-[3px] border-l-acento"
            >
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <Repeat size={16} className="text-acento" aria-hidden />
                <h2 className="text-[15px] font-bold">
                  Todos os meses{c.mes !== "Mensal" ? ` · ${c.mes}` : ""}
                </h2>
                <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-[11px] font-semibold text-texto-suave">
                  {plural(c.itens.length, "obrigação", "obrigações")}
                </span>
              </header>
              <ul className="grid gap-2 sm:grid-cols-2">
                {c.itens.map((i) => (
                  <Obrigacao key={i} texto={i} />
                ))}
              </ul>
            </Cartao>
          ))}

          {/* O que tem data, por ordem do ano. */}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {datados.map((c) => {
              const agora = mesDe(c.mes) === mesActual;
              return (
                <Cartao
                  key={c.mes}
                  className={cn(
                    "min-w-0 transition-transform hover:-translate-y-0.5",
                    agora && "border-acento ring-1 ring-acento/40",
                  )}
                >
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarClock
                        size={15}
                        className={agora ? "text-acento" : "text-texto-suave"}
                        aria-hidden
                      />
                      <h2 className="text-[14px] font-bold">{c.mes}</h2>
                    </div>
                    {agora && (
                      <span className="rounded-full bg-acento/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.4px] text-acento">
                        Em curso
                      </span>
                    )}
                  </header>
                  <ul className="flex flex-col gap-2">
                    {c.itens.map((i) => (
                      <Obrigacao key={i} texto={i} pequeno />
                    ))}
                  </ul>
                </Cartao>
              );
            })}
          </div>

          {/* O aviso vale para tudo o que está acima — fica no fim, discreto,
              e não a empurrar o calendário para baixo da dobra. */}
          <p className="flex items-start gap-2 rounded-[10px] border border-borda bg-superficie px-4 py-3 text-[12.5px] leading-relaxed text-texto-suave">
            <Info
              size={15}
              className="mt-0.5 shrink-0 text-aviso"
              aria-hidden
            />
            <span>
              Confirme sempre as datas no{" "}
              <b className="text-texto">Calendário Fiscal oficial da AGT</b> —
              os prazos mudam e um dia útil de diferença muda a data limite. As
              obrigações mensais estão no primeiro cartão, e não repetidas em
              cada mês.
            </span>
          </p>
        </div>
      )}

      {data?.fontes?.length ? (
        <Cartao className="mt-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
            Fontes
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.fontes.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-marca hover:underline"
              >
                {f.nome}
                <ExternalLink size={12} aria-hidden />
              </a>
            ))}
          </div>
        </Cartao>
      ) : null}
    </>
  );
}

/**
 * Uma obrigação, com o imposto separado do resto.
 *
 * As entradas vêm como «IVA — Declaração periódica e pagamento (último dia
 * útil…)». O que se procura numa lista destas é o imposto; fica em destaque, e
 * o prazo entre parênteses fica em segundo plano.
 */
function Obrigacao({ texto, pequeno }: { texto: string; pequeno?: boolean }) {
  const m = /^(.{2,28}?)\s+[—–-]\s+(.*)$/.exec(texto);
  const imposto = m?.[1];
  const resto = m?.[2] ?? texto;
  const prazo = /\(([^)]*)\)\s*$/.exec(resto)?.[1];
  const corpo = prazo ? resto.replace(/\s*\([^)]*\)\s*$/, "") : resto;

  return (
    <li className="flex gap-2">
      <span
        aria-hidden
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-marca"
      />
      <span className={cn("min-w-0", pequeno ? "text-[12.5px]" : "text-sm")}>
        {imposto && (
          <>
            {/* Espaço a sério e não margem: o que se copia da página tem de
                ler-se «IVA Declaração…» e não «IVADeclaração…». */}
            <b>{imposto}</b>{" "}
          </>
        )}
        {corpo}
        {prazo && (
          <span className="mt-0.5 block text-[11.5px] text-texto-suave">
            {prazo}
          </span>
        )}
      </span>
    </li>
  );
}
