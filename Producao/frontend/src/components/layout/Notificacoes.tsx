"use client";

import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { Selo } from "@/components/ui";
import { CaixaHistorico, type Pagina } from "@/components/ui/Paginacao";
import { api, buscador } from "@/lib/api";

export interface Notificacao {
  id: string;
  tipo: string;
  origem: string;
  titulo: string;
  texto: string;
  ligacao: string | null;
  criado_em: string;
  resolvida_em: string | null;
  lida: boolean;
}

interface Resposta extends Pagina<Notificacao> {
  por_ler: number;
}

/**
 * O sino do cabeçalho, com o contador do que está por ler.
 *
 * O CONTADOR CONTA O QUE ESTÁ POR RESOLVER E POR LER. Uma notificação já
 * atendida não deve puxar ninguém para um problema que já não existe — mas
 * continua no histórico, porque foi essa a regra pedida: nada desaparece por
 * ter sido lido.
 *
 * A lista só se pede quando o painel abre. O cabeçalho está em todas as
 * páginas, e um pedido por página seria pagar caro por um número; o contador
 * vem de um pedido leve, que se refaz de meio em meio minuto.
 */
export function Notificacoes() {
  const [aberto, setAberto] = useState(false);

  // O sino mostra as DEZ mais recentes e nada mais: é um aviso, não um
  // histórico. Quem quiser o resto tem o «Ver todas», que pagina.
  const { data, mutate } = useSWR<Resposta>(
    "/api/notificacoes?limite=10",
    buscador,
    { refreshInterval: 30_000, shouldRetryOnError: false },
  );

  const porLer = data?.por_ler ?? 0;
  const lista = data?.linhas ?? [];

  async function marcarLida(n: Notificacao) {
    // Optimista: a marca é do utilizador e não muda nada do lado do negócio.
    mutate(
      (d) =>
        d && {
          ...d,
          por_ler: Math.max(0, d.por_ler - (n.lida ? 0 : 1)),
          linhas: d.linhas.map((x) =>
            x.id === n.id ? { ...x, lida: true } : x,
          ),
        },
      { revalidate: false },
    );
    await api.post(`/api/notificacoes/${n.id}/lida`, {});
    mutate();
  }

  async function marcarTodas() {
    await api.post("/api/notificacoes/lidas", {});
    mutate();
  }

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Notificações"
          aria-label={
            porLer > 0 ? `Notificações — ${porLer} por ler` : "Notificações"
          }
          className="relative flex size-[38px] items-center justify-center rounded-[10px] border border-borda bg-superficie-2 text-texto transition-colors hover:border-acento"
        >
          <Bell size={17} />
          {porLer > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-perigo px-1 text-[10px] font-extrabold leading-[18px] text-white">
              {porLer > 9 ? "9+" : porLer}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[340px] overflow-hidden rounded-[14px] border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-center justify-between gap-2 border-b border-borda px-4 py-3">
            <b className="text-sm">Notificações</b>
            {porLer > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-[12px] font-semibold text-marca hover:underline"
              >
                Marcar todas lidas
              </button>
            )}
          </div>

          <CaixaHistorico altura={380}>
            {lista.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-texto-suave">
                Nada por avisar. As notificações aparecem quando uma operação de
                um módulo deixa trabalho por fazer noutro.
              </p>
            ) : (
              lista.map((n) => (
                <Linha
                  key={n.id}
                  n={n}
                  aoLer={() => marcarLida(n)}
                  aoIr={() => setAberto(false)}
                />
              ))
            )}
          </CaixaHistorico>

          <div className="border-t border-borda px-4 py-2.5 text-center">
            <Link
              href="/notificacoes"
              onClick={() => setAberto(false)}
              className="text-[12.5px] font-semibold text-marca hover:underline"
            >
              Ver todas
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Linha({
  n,
  aoLer,
  aoIr,
}: {
  n: Notificacao;
  aoLer: () => void;
  aoIr: () => void;
}) {
  const corpo = (
    <>
      <div className="flex items-start gap-2">
        {!n.lida && (
          <span
            aria-hidden
            className="mt-1.5 size-2 shrink-0 rounded-full bg-marca"
          />
        )}
        <div className={`min-w-0 flex-1 ${n.lida ? "pl-4" : ""}`}>
          <b className="block text-[13px] leading-tight">{n.titulo}</b>
          <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-texto-suave">
            {n.texto}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[11px] text-texto-suave">
              {dataHora(n.criado_em)}
            </span>
            {n.resolvida_em && <Selo cor="#1a9c5f">Atendida</Selo>}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="border-b border-borda px-4 py-3 last:border-b-0 hover:bg-superficie-2">
      {n.ligacao ? (
        <Link
          href={n.ligacao}
          onClick={() => {
            aoLer();
            aoIr();
          }}
          className="block"
        >
          {corpo}
        </Link>
      ) : (
        corpo
      )}
      {!n.lida && (
        <button
          type="button"
          onClick={aoLer}
          className="mt-1.5 flex items-center gap-1 pl-4 text-[11.5px] font-semibold text-texto-suave hover:text-marca"
        >
          <Check size={12} />
          Marcar lida
        </button>
      )}
    </div>
  );
}

/** `2026-08-14T17:54:10Z` → `14/08 17:54`. */
function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
