"use client";

import Link from "next/link";
import useSWR from "swr";
import { Kpi, TituloCartao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
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
        icone: "✍️",
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
        icone: "📄",
        nome: "Extratos de Conta",
        sub: "Conta corrente por conta",
        href: "/contabilidade/extrato",
      },
      {
        icone: "📗",
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
        icone: "⚖️",
        nome: "Balancete Geral",
        sub: "Verificação · duplo clique → extrato",
        href: "/contabilidade/balancete",
      },
      {
        icone: "📘",
        nome: "Balancete do Razão",
        sub: "Por classe (contas do razão)",
        href: "/contabilidade/balancete-razao",
      },
      {
        icone: "🏛️",
        nome: "Balanço",
        sub: "Activo · Capital Próprio · Passivo",
        href: "/contabilidade/balanco",
      },
      {
        icone: "📈",
        nome: "Demonstração de Resultados",
        sub: "Por naturezas",
        href: "/contabilidade/resultados",
      },
      {
        icone: "📝",
        nome: "Notas às Contas",
        sub: "Composição das rubricas",
        href: "/contabilidade/notas",
      },
      {
        icone: "💧",
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
        icone: "🧾",
        nome: "Plano de Contas",
        sub: "PGC Angola",
        href: "/contabilidade/plano-contas",
      },
      {
        icone: "📚",
        nome: "Diários",
        sub: "Tabela de diários",
        href: "/contabilidade/diarios",
      },
      {
        icone: "🗂️",
        nome: "Documentos",
        sub: "Documentos afetos a diários",
        href: "/contabilidade/documentos",
      },
      {
        icone: "📅",
        nome: "Exercícios",
        sub: "Abrir, fechar e reabrir exercícios",
        href: "/contabilidade/exercicios",
      },
    ],
  },
];

export default function Explorador() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();
  const sufixo = activo ? `?exercicio_id=${activo.id}` : "";
  const moeda = empresa?.moeda ?? "Kz";
  // `formatKz` do Piloto: nesta página nenhum número leva cêntimos.
  const kz = (v: string) => formataMoeda(v, moeda, 0);

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
      {/* `.mo-cover`: a capa do módulo, com o nome da empresa por cima do
          título e os dois números que resumem o exercício à direita. */}
      <div className="gradiente-marca mb-5 mt-1 flex flex-wrap items-center gap-5 rounded-[14px] px-6 py-5 text-white shadow-forte">
        <div className="min-w-[220px] flex-1">
          <div className="text-[12px] uppercase tracking-[1px] opacity-85">
            {empresa?.nome}
          </div>
          <h1 className="mb-0.5 mt-1 text-[26px] font-black">Contabilidade</h1>
          <div className="text-[13px] opacity-90">
            Framework de contabilidade geral — PGC Angola ·{" "}
            {activo?.nome ?? "sem exercício"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ValorDaCapa
            rotulo="Movimentos"
            valor={String(resumo?.lancamentos ?? 0)}
          />
          <ValorDaCapa
            rotulo="Resultado"
            valor={kz(resumo?.resultado ?? "0")}
          />
        </div>
      </div>

      <div className="mb-[18px] grid gap-3.5 min-[560px]:grid-cols-2 min-[1050px]:grid-cols-4">
        <Kpi
          rotulo="Proveitos"
          valor={kz(resumo?.proveitos ?? "0")}
          detalhe="classe 6"
          cor="var(--grafico-6)"
        />
        {/* `--chart-amber` do Piloto é rosa, não âmbar: o nome enganou-nos. */}
        <Kpi
          rotulo="Custos"
          valor={kz(resumo?.custos ?? "0")}
          detalhe="classe 7"
          cor="var(--grafico-1)"
        />
        <Kpi
          rotulo="Resultado"
          valor={kz(resumo?.resultado ?? "0")}
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
            {/* `.modules-grid`: quatro, dois abaixo de 1050, um abaixo de 560. */}
            <div className="grid gap-3 min-[560px]:grid-cols-2 min-[1050px]:grid-cols-4">
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

function ValorDaCapa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[78px] rounded-[10px] border border-white/[0.28] bg-white/[0.14] px-3.5 py-2 text-center">
      <div className="tabular text-[22px] font-black leading-none">{valor}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.5px] opacity-85">
        {rotulo}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
/** `.module-card`: ícone grande, nome, descrição e a seta à direita. */
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
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[14px] border border-borda bg-superficie p-3.5 transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-marca hover:shadow-forte"
    >
      <span aria-hidden className="text-[26px] leading-none">
        {icone}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-[1.25]">
        <b className="truncate text-[14.5px]">{nome}</b>
        <small className="truncate text-[12px] text-texto-suave">{sub}</small>
      </span>
      <span className="shrink-0 text-[20px] font-extrabold text-acento">→</span>
    </Link>
  );
}
