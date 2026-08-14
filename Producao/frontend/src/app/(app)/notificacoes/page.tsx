"use client";

import { Check, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { Notificacao } from "@/components/layout/Notificacoes";
import {
  ACarregar,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
  Vazio,
} from "@/components/ui";
import { api, buscador } from "@/lib/api";

interface Resposta {
  notificacoes: Notificacao[];
  por_ler: number;
}

const ROTULO_ORIGEM: Record<string, string> = {
  comercial: "Comercial",
  compras: "Compras",
  logistica: "Logística",
  rh: "Recursos Humanos",
  imobilizado: "Imobilizados",
  contabilidade: "Contabilidade",
};

/**
 * Gestão de notificações — o histórico completo.
 *
 * NADA SE APAGA AQUI, e não é esquecimento. Uma notificação fica para sempre:
 * «resolvida» diz que a situação que a originou acabou, «lida» diz que alguém
 * a viu. São coisas diferentes e nenhuma das duas remove.
 *
 * É por isso que há «Marcar não lida»: quem abre uma notificação a correr e
 * não a pode tratar agora precisa de a poder voltar a pôr por ler.
 */
export default function GestaoNotificacoes() {
  const [filtro, setFiltro] = useState("todas");

  const { data, isLoading, mutate } = useSWR<Resposta>(
    "/api/notificacoes?limite=200",
    buscador,
  );

  const todas = data?.notificacoes ?? [];
  const visiveis = todas.filter((n) => {
    if (filtro === "por_ler") return !n.lida;
    if (filtro === "lidas") return n.lida;
    if (filtro === "por_resolver") return !n.resolvida_em;
    if (filtro === "resolvidas") return !!n.resolvida_em;
    return true;
  });

  async function alternarLida(n: Notificacao) {
    if (n.lida) await api.delete(`/api/notificacoes/${n.id}/lida`);
    else await api.post(`/api/notificacoes/${n.id}/lida`, {});
    mutate();
  }

  async function marcarTodas() {
    await api.post("/api/notificacoes/lidas", {});
    mutate();
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Notificações"
        descricao="O que ficou por fazer, e o histórico do que já foi. Nada é apagado."
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Mostrar"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: "todas", rotulo: "Todas" },
            { valor: "por_ler", rotulo: "Por ler" },
            { valor: "lidas", rotulo: "Lidas" },
            { valor: "por_resolver", rotulo: "Por resolver" },
            { valor: "resolvidas", rotulo: "Resolvidas" },
          ]}
          larguraMinima="13rem"
        />
        <span className="flex-1" />
        {(data?.por_ler ?? 0) > 0 && (
          <Botao variante="neutro" tamanho="pequeno" onClick={marcarTodas}>
            <Check size={14} />
            Marcar todas lidas
          </Botao>
        )}
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : visiveis.length === 0 ? (
        <Cartao>
          <Vazio>
            {todas.length === 0
              ? "Nada por avisar. As notificações aparecem quando uma operação de um módulo deixa trabalho por fazer noutro."
              : "Nenhuma notificação neste filtro."}
          </Vazio>
        </Cartao>
      ) : (
        <div className="flex flex-col gap-3">
          {visiveis.map((n) => (
            <Cartao key={n.id} className={n.lida ? "opacity-75" : undefined}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[16rem] flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {!n.lida && (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full bg-marca"
                      />
                    )}
                    <b className="text-[14.5px]">{n.titulo}</b>
                    <Selo cor="#62657a">
                      {ROTULO_ORIGEM[n.origem] ?? n.origem}
                    </Selo>
                    {n.resolvida_em ? (
                      <Selo cor="#1a9c5f">Resolvida</Selo>
                    ) : (
                      <Selo cor="#c98a10">Por resolver</Selo>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-texto-suave">
                    {n.texto}
                  </p>
                  <p className="mt-1 text-[11.5px] text-texto-suave">
                    {dataHoraLonga(n.criado_em)}
                    {n.resolvida_em &&
                      ` · resolvida em ${dataHoraLonga(n.resolvida_em)}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {n.ligacao && (
                    <Link
                      href={n.ligacao}
                      className="rounded-lg bg-acento px-3 py-[7px] text-center text-[12.5px] font-bold text-[#241500] transition-opacity hover:opacity-90"
                    >
                      Resolver
                    </Link>
                  )}
                  <Botao
                    variante="neutro"
                    tamanho="pequeno"
                    onClick={() => alternarLida(n)}
                  >
                    {n.lida ? (
                      <>
                        <Undo2 size={13} />
                        Marcar não lida
                      </>
                    ) : (
                      <>
                        <Check size={13} />
                        Marcar lida
                      </>
                    )}
                  </Botao>
                </div>
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}

/** `2026-08-14T17:54:10Z` → `14/08/2026 17:54`. */
function dataHoraLonga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
