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
import {
  BarraPaginacao,
  CaixaHistorico,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { api, buscador } from "@/lib/api";

interface Resposta extends Pagina<Notificacao> {
  por_ler: number;
  /** Quantas há em cada módulo — de TODAS, não só da página. */
  por_origem: { origem: string; total: number; por_resolver: number }[];
}

const ROTULO_ORIGEM: Record<string, string> = {
  comercial: "Comercial",
  compras: "Compras",
  logistica: "Logística",
  rh: "Recursos Humanos",
  imobilizado: "Imobilizados",
  contabilidade: "Contabilidade",
  // Faltava, e o ecrã mostrava o código cru «apuramento» ao lado de nomes
  // como «Contabilidade». Os apuramentos de IVA notificam com esta origem.
  apuramento: "Apuramentos",
};

/**
 * Gestão de notificações — o histórico completo.
 *
 * NADA SE APAGA AQUI, e não é esquecimento. Uma notificação fica para sempre:
 * «atendida» diz que a situação que a originou acabou, «lida» diz que alguém
 * a viu. São coisas diferentes e nenhuma das duas remove.
 *
 * ATENDIDA É O QUE POR DENTRO SE CHAMA «RESOLVIDA», e foi decisão do cliente
 * que fossem a mesma coisa: quem trata da notificação vai ao sítio onde o
 * problema está e trata-o, e o sistema dá-a por atendida quando volta a
 * verificar e já não o encontra. Não há um botão de «marcar como atendida»
 * porque não deve haver: marcá-la sem resolver o problema seria dizer que
 * está feito o que não está.
 *
 * É por isso que há «Marcar não lida»: quem abre uma notificação a correr e
 * não a pode tratar agora precisa de a poder voltar a pôr por ler.
 */
export default function GestaoNotificacoes() {
  const [filtro, setFiltro] = useState("todas");
  /** O MÓDULO DE ORIGEM. Vazio = todos. */
  const [origem, setOrigem] = useState("");
  const p = usePaginacao();

  // «Por resolver» e o MÓDULO filtram-se NO SERVIDOR, para a paginação contar
  // o conjunto certo. Filtrar o módulo no ecrã só filtrava a página carregada:
  // escolher «Comercial» devolvia as comerciais das últimas vinte e cinco e
  // mais nenhumas, e parecia que não havia mais.
  //
  // Os restantes são sobre o estado de LEITURA, que é por pessoa e não se
  // consulta em SQL — esses ficam do lado do ecrã, sobre a página.
  const q =
    (filtro === "por_resolver" ? "&apenas_por_resolver=true" : "") +
    (origem ? `&origem=${encodeURIComponent(origem)}` : "");
  const { data, isLoading, mutate } = useSWR<Resposta>(
    `/api/notificacoes?${p.query}${q}`,
    buscador,
  );

  const todas = data?.linhas ?? [];
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
          aoMudar={(v) => {
            setFiltro(v);
            p.reiniciar();
          }}
          opcoes={[
            { valor: "todas", rotulo: "Todas" },
            { valor: "por_ler", rotulo: "Por ler" },
            { valor: "lidas", rotulo: "Lidas" },
            { valor: "por_resolver", rotulo: "Por atender" },
            { valor: "resolvidas", rotulo: "Atendidas" },
          ]}
          larguraMinima="13rem"
        />

        {/* POR MÓDULO. A notificação já sabia de onde vinha — o módulo está
            guardado desde que ela nasce e aparece em cada linha —, mas não
            havia por onde filtrar. Com trinta avisos de cinco módulos, ver só
            os da contabilidade era percorrer a lista com os olhos.

            A CONTAGEM VEM DO SERVIDOR e é sobre TODAS, não sobre a página:
            «Comercial (3)» quando havia trinta seria pior do que não dizer
            número nenhum. */}
        <Selector
          rotulo="Módulo"
          valor={origem}
          aoMudar={(v) => {
            setOrigem(v);
            p.reiniciar();
          }}
          opcoes={[
            { valor: "", rotulo: "Todos os módulos" },
            ...(data?.por_origem ?? []).map((o) => ({
              valor: o.origem,
              rotulo: `${ROTULO_ORIGEM[o.origem] ?? o.origem} (${o.total})`,
            })),
          ]}
          larguraMinima="15rem"
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
        <Cartao className="p-0">
          {/* A caixa é que rola, não a página: com o histórico a crescer para
              sempre, a alternativa era uma página cada vez mais comprida. */}
          <CaixaHistorico altura={560} className="flex flex-col gap-3 p-4">
            {visiveis.map((n) => (
              <div
                key={n.id}
                className={`rounded-[10px] border border-borda p-3.5 ${n.lida ? "opacity-75" : ""}`}
              >
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
                        <Selo cor="#1a9c5f">Atendida</Selo>
                      ) : (
                        <Selo cor="#c98a10">Por atender</Selo>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-texto-suave">
                      {n.texto}
                    </p>
                    <p className="mt-1 text-[11.5px] text-texto-suave">
                      {dataHoraLonga(n.criado_em)}
                      {n.resolvida_em &&
                        ` · atendida em ${dataHoraLonga(n.resolvida_em)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {n.ligacao && (
                      <Link
                        href={n.ligacao}
                        className="rounded-lg bg-acento px-3 py-[7px] text-center text-[12.5px] font-bold text-[#241500] transition-opacity hover:opacity-90"
                      >
                        Atender
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
              </div>
            ))}
          </CaixaHistorico>
          <BarraPaginacao pagina={data} nome="notificações" {...p.controlos} />
        </Cartao>
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
