"use client";

import Link from "next/link";
import useSWR from "swr";
import { iconeNav } from "@/components/layout/iconesNav";
import { CabecalhoPagina, Kpi, TituloCartao } from "@/components/ui";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balancete, Resumo } from "@/types";

/**
 * Explorador da Contabilidade — o `contabilidade.html` do Piloto.
 *
 * É o índice do módulo: quatro KPIs em cima e, por baixo, as páginas agrupadas
 * pelo que se vai lá fazer — editar, consultar, imprimir mapas, manter tabelas.
 * O ribbon leva a todo o lado, mas leva a dezasseis sítios de uma vez; esta
 * página diz o que cada um é.
 *
 * As secções, a ordem, os nomes e as descrições vêm do Piloto tal e qual.
 */

const SECCOES: {
  titulo: string;
  itens: { icone: string; nome: string; sub: string; href: string }[];
}[] = [
  {
    titulo: "Movimentos (Edição)",
    itens: [
      {
        icone: "movimentos",
        nome: "Movimentos",
        sub: "Registo em partidas dobradas",
        href: "/contabilidade/movimentos",
      },
    ],
  },
  {
    titulo: "Consultas",
    itens: [
      {
        icone: "extratos",
        nome: "Extratos de Conta",
        sub: "Conta corrente por conta",
        href: "/contabilidade/extrato",
      },
      {
        icone: "livro",
        nome: "Razão",
        sub: "Movimentos por conta",
        href: "/contabilidade/razao",
      },
    ],
  },
  {
    titulo: "Mapas",
    itens: [
      {
        icone: "balancete",
        nome: "Balancete Geral",
        sub: "Verificação · duplo clique → extrato",
        href: "/contabilidade/balancete",
      },
      {
        icone: "livro",
        nome: "Balancete do Razão",
        sub: "Por classe (contas do razão)",
        href: "/contabilidade/balancete-razao",
      },
      {
        icone: "balanco",
        nome: "Balanço",
        sub: "Activo · Capital Próprio · Passivo",
        href: "/contabilidade/balanco",
      },
      {
        icone: "resultados",
        nome: "Demonstração de Resultados",
        sub: "Por naturezas",
        href: "/contabilidade/resultados",
      },
      {
        icone: "notas",
        nome: "Notas às Contas",
        sub: "Composição das rubricas",
        href: "/contabilidade/notas",
      },
      {
        icone: "fluxos",
        nome: "Fluxos de Caixa",
        sub: "Demonstração de fluxos",
        href: "/contabilidade/fluxos-caixa",
      },
    ],
  },
  {
    titulo: "Tabelas",
    itens: [
      {
        icone: "plano",
        nome: "Plano de Contas",
        sub: "PGC Angola",
        href: "/contabilidade/plano-contas",
      },
      {
        icone: "diarios",
        nome: "Diários",
        sub: "Tabela de diários",
        href: "/contabilidade/diarios",
      },
      {
        icone: "documentos",
        nome: "Documentos",
        sub: "Documentos afetos a diários",
        href: "/contabilidade/documentos",
      },
      {
        icone: "calendario",
        nome: "Exercícios",
        sub: "Abrir, fechar e reabrir exercícios",
        href: "/contabilidade/exercicios",
      },
    ],
  },
];

export default function Explorador() {
  const { activo } = useExercicios();
  const sufixo = activo ? `?exercicio_id=${activo.id}` : "";

  const { data: resumo } = useSWR<Resumo>(
    `/api/relatorios/resumo${sufixo}`,
    buscador,
  );
  const { data: balancete } = useSWR<Balancete>(
    `/api/relatorios/balancete${sufixo}`,
    buscador,
  );

  const equilibrado =
    balancete != null && balancete.totais.debito === balancete.totais.credito;
  const resultado = Number(resumo?.resultado ?? 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Contabilidade"
        descricao={`Framework de contabilidade geral — PGC Angola · ${activo?.nome ?? "sem exercício"}`}
      />

      <div className="mb-[18px] grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Proveitos"
          valor={formataMoeda(resumo?.proveitos ?? "0")}
          detalhe="classe 6"
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Custos"
          valor={formataMoeda(resumo?.custos ?? "0")}
          detalhe="classe 7"
          cor="var(--color-aviso)"
        />
        <Kpi
          rotulo="Resultado"
          valor={formataMoeda(resumo?.resultado ?? "0")}
          detalhe={resultado >= 0 ? "lucro" : "prejuízo"}
          cor={resultado >= 0 ? "#16a085" : "#c0392b"}
        />
        <Kpi
          rotulo="Balancete"
          valor={equilibrado ? "✓ Equilibrado" : "✗ Desequilíbrio"}
          detalhe="D = C"
          cor={equilibrado ? "#16a085" : "#c0392b"}
        />
      </div>

      <div className="flex flex-col gap-4">
        {SECCOES.map((s) => (
          <div
            key={s.titulo}
            className="rounded-[14px] border border-borda bg-superficie p-5 shadow-suave"
          >
            <TituloCartao>{s.titulo}</TituloCartao>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {s.itens.map((i) => (
                <CartaoModulo key={i.href} {...i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function CartaoModulo({
  icone,
  nome,
  sub,
  href,
}: {
  icone: string;
  nome: string;
  sub: string;
  href: string;
}) {
  const traco = iconeNav(icone);
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-borda bg-fundo px-3.5 py-3 transition-colors hover:border-acento hover:bg-superficie-2"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-borda bg-superficie text-texto-suave group-hover:text-acento">
        {traco ? (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[19px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado SVG constante do nosso próprio iconesNav.ts — não há entrada de utilizador neste caminho.
            dangerouslySetInnerHTML={{ __html: traco }}
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <b className="truncate text-sm">{nome}</b>
        <small className="truncate text-[12px] text-texto-suave">{sub}</small>
      </span>
      <span className="ml-auto shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5 group-hover:text-acento">
        →
      </span>
    </Link>
  );
}
