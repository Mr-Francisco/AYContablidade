"use client";

import {
  ArrowRight,
  BookOpen,
  FileText,
  Scale,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Kpi,
  Selector,
  Selo,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balanco, Resumo } from "@/types";

const ATALHOS = [
  {
    href: "/contabilidade/movimentos",
    rotulo: "Movimentos",
    descricao: "Lançar e consultar partidas dobradas",
    Icone: FileText,
  },
  {
    href: "/contabilidade/balancete",
    rotulo: "Balancete Geral",
    descricao: "Débito, crédito e saldo por conta",
    Icone: Scale,
  },
  {
    href: "/contabilidade/razao",
    rotulo: "Razão",
    descricao: "Movimentos de uma conta com saldo corrido",
    Icone: BookOpen,
  },
  {
    href: "/contabilidade/resultados",
    rotulo: "Demonstração de Resultados",
    descricao: "Resultados por naturezas",
    Icone: TrendingUp,
  },
];

export default function PainelContabilidade() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState<string | undefined>();

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";
  const q = exId ? `?exercicio_id=${exId}` : "";

  const { data: resumo, isLoading } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: balanco } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );
  const exercicio = exercicios.find((e) => e.id === exId) ?? activo;

  return (
    <>
      <CabecalhoPagina
        titulo="Contabilidade"
        descricao="Visão geral do exercício."
        accoes={
          exercicio?.apuramento ? (
            <Selo cor="#1a9c5f">Exercício apurado</Selo>
          ) : (
            <Selo cor="#c98a10">Por apurar</Selo>
          )
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}${e.estado === "fechado" ? " · fechado" : ""}`,
          }))}
          larguraMinima="15rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : (
        <>
          <div className="revelar-grelha grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Proveitos"
                valor={formataCompacto(resumo?.proveitos, moeda)}
                detalhe="Classe 6"
                cor="var(--grafico-6)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Custos"
                valor={formataCompacto(resumo?.custos, moeda)}
                detalhe="Classe 7"
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Resultado"
                valor={formataCompacto(resumo?.resultado, moeda)}
                detalhe={big(resumo?.resultado).gte(0) ? "Lucro" : "Prejuízo"}
                tendencia={big(resumo?.resultado).gte(0) ? "sobe" : "desce"}
                cor={
                  big(resumo?.resultado).gte(0)
                    ? "var(--grafico-4)"
                    : "var(--grafico-1)"
                }
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Total do Activo"
                valor={formataCompacto(balanco?.total_activo, moeda)}
                detalhe={
                  balanco?.equilibrado ? "Balanço equilibrado" : "NÃO equilibra"
                }
                tendencia={
                  balanco && !balanco.equilibrado ? "desce" : undefined
                }
                cor="var(--grafico-2)"
              />
            </div>
          </div>

          {balanco && !balanco.equilibrado && (
            <Alerta tipo="erro" className="mt-4">
              O Balanço não equilibra:{" "}
              {formataMoeda(balanco.total_activo, moeda)} de activo contra{" "}
              {formataMoeda(balanco.total_cp_passivo, moeda)} de capital próprio
              e passivo.
            </Alerta>
          )}

          <Cartao className="mt-4">
            <TituloCartao>Aceder</TituloCartao>
            <div className="revelar-grelha grid gap-3 sm:grid-cols-2">
              {ATALHOS.map(({ href, rotulo, descricao, Icone }) => (
                <div key={href} className="min-w-0">
                  <Link
                    href={href}
                    className="group flex min-w-0 items-center gap-3 rounded-xl border border-borda p-3.5 transition-colors hover:border-acento"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-marca">
                      <Icone size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {rotulo}
                      </span>
                      <span className="block truncate text-[12.5px] text-texto-suave">
                        {descricao}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      className="shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              ))}
            </div>
          </Cartao>
        </>
      )}
    </>
  );
}
