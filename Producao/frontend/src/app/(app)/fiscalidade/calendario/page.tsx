"use client";

import { CalendarDays, ExternalLink } from "lucide-react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Cartao,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import type { CatalogoFiscal } from "@/types";

export default function Calendario() {
  const { data, isLoading } = useSWR<CatalogoFiscal>(
    "/api/fiscalidade/catalogo",
    buscador,
    { revalidateOnFocus: false },
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Calendário Fiscal"
        descricao="Principais obrigações declarativas e de pagamento ao longo do ano."
      />

      <Alerta tipo="aviso" className="mb-4">
        Confirme sempre as datas no <b>Calendário Fiscal oficial da AGT</b> — os
        prazos mudam e um dia útil de diferença muda a data limite. As
        obrigações mensais estão no primeiro cartão, e não repetidas em cada
        mês.
      </Alerta>

      {isLoading || !data ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !data.calendario.length ? (
        <Cartao>
          <Vazio>Sem calendário definido.</Vazio>
        </Cartao>
      ) : (
        <div className="revelar-grelha grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.calendario.map((c) => (
            <Cartao key={c.mes} className="min-w-0">
              <header className="mb-3 flex items-center gap-2 border-b border-borda pb-3">
                <CalendarDays size={16} className="text-marca" aria-hidden />
                <h2 className="text-[15px] font-bold">{c.mes}</h2>
              </header>
              <ul className="flex flex-col gap-2">
                {c.itens.map((i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span
                      aria-hidden
                      className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-marca"
                    />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          ))}
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
