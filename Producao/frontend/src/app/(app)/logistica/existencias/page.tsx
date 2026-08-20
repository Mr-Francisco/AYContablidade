"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Kpi,
  Selector,
  Selo,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { type Coluna, Grelha } from "@/components/ui/Grelha";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import type { Armazem, Existencias, LinhaExistencia } from "@/types";

export default function ExistenciasPagina() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [armazemId, setArmazemId] = useState("");
  const [soAtivos, setSoAtivos] = useState("true");
  const [soRutura, setSoRutura] = useState("nao");

  const { data: armazens } = useSWR<Armazem[]>(
    "/api/logistica/armazens",
    buscador,
    { revalidateOnFocus: false },
  );

  const params = new URLSearchParams();
  if (armazemId) params.set("armazem_id", armazemId);
  if (soAtivos === "true") params.set("so_ativos", "true");
  const { data, isLoading } = useSWR<Existencias>(
    `/api/logistica/existencias${params.size ? `?${params}` : ""}`,
    buscador,
  );

  const linhas = (data?.linhas ?? []).filter((l) =>
    soRutura === "sim" ? l.rutura : true,
  );

  const colunas: Coluna<LinhaExistencia>[] = [
    {
      chave: "codigo",
      titulo: "Código",
      valor: (l) => l.codigo,
      largura: "120px",
      celula: (l) => <span className="tabular font-bold">{l.codigo}</span>,
    },
    {
      chave: "descricao",
      titulo: "Descrição",
      valor: (l) => l.descricao,
      celula: (l) => (
        <span className="block max-w-[300px] truncate font-semibold">
          {l.descricao}
        </span>
      ),
    },
    {
      chave: "unidade",
      titulo: "Un.",
      valor: (l) => l.unidade ?? "",
      largura: "80px",
      celula: (l) => l.unidade || "—",
    },
    {
      chave: "stock",
      titulo: "Stock",
      tipo: "numero",
      valor: (l) => Number(l.stock),
      celula: (l) => (
        <span className={l.rutura ? "text-perigo" : undefined}>{l.stock}</span>
      ),
    },
    {
      chave: "stock_min",
      titulo: "Stock mín.",
      tipo: "numero",
      valor: (l) => Number(l.stock_min),
      celula: (l) => <span className="text-texto-suave">{l.stock_min}</span>,
    },
    {
      chave: "custo_medio",
      titulo: "Custo médio",
      tipo: "numero",
      valor: (l) => Number(l.custo_medio),
      celula: (l) => formataMoeda(l.custo_medio, moeda),
    },
    {
      chave: "valor",
      titulo: "Valor",
      tipo: "numero",
      valor: (l) => Number(l.valor),
      celula: (l) => (
        <span className="font-semibold">{formataMoeda(l.valor, moeda)}</span>
      ),
    },
    {
      chave: "estado",
      titulo: "Estado",
      // Escrever «ruptura» no filtro deixa à vista o que falta comprar — é
      // para isto que se abre este mapa.
      valor: (l) => (l.rutura ? "Ruptura" : "Normal"),
      largura: "120px",
      celula: (l) =>
        l.rutura ? (
          <Selo cor="#c62828">
            <AlertTriangle size={11} aria-hidden />
            Ruptura
          </Selo>
        ) : (
          <Selo cor="#1a9c5f">Normal</Selo>
        ),
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Existências"
        descricao="Stock e valorização ao Custo Médio Ponderado, calculado a partir dos movimentos."
        accoes={<AccoesDoMapa />}
      />

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Valor das existências"
              valor={formataCompacto(data.valor_total, moeda)}
              detalhe={armazemId ? "No armazém escolhido" : "Todos os armazéns"}
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Artigos"
              valor={String(data.linhas.length)}
              detalhe={soAtivos === "true" ? "Só activos" : "Todos"}
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Em ruptura"
              valor={String(data.em_rutura)}
              detalhe="Stock igual ou abaixo do mínimo"
              cor={
                data.em_rutura > 0 ? "var(--color-perigo)" : "var(--grafico-4)"
              }
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Armazéns"
              valor={String(armazens?.length ?? 0)}
              detalhe="com ficha"
              cor="var(--grafico-3)"
            />
          </div>
        </div>
      )}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Armazém"
          valor={armazemId}
          aoMudar={setArmazemId}
          opcoes={[
            { valor: "", rotulo: "Todos os armazéns" },
            ...(armazens ?? []).map((a) => ({
              valor: a.id,
              rotulo: `${a.codigo} — ${a.nome}`,
            })),
          ]}
          larguraMinima="16rem"
        />
        <Selector
          rotulo="Artigos"
          valor={soAtivos}
          aoMudar={setSoAtivos}
          opcoes={[
            { valor: "true", rotulo: "Só activos" },
            { valor: "false", rotulo: "Todos" },
          ]}
        />
        <Selector
          rotulo="Ruptura"
          valor={soRutura}
          aoMudar={setSoRutura}
          opcoes={[
            { valor: "nao", rotulo: "Mostrar todos" },
            { valor: "sim", rotulo: "Só em ruptura" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-borda px-4 py-3">
              <div>
                <b>{empresa?.nome}</b>
                <br />
                <span className="text-[12.5px] text-texto-suave">
                  Mapa de Existências
                </span>
              </div>
              <span className="text-[12.5px] text-texto-suave">
                Valores em {moeda}
              </span>
            </div>
            <Grelha
              linhas={linhas}
              colunas={colunas}
              chaveDaLinha={(l) => l.artigo_id}
              altura={520}
              vazio={
                soRutura === "sim"
                  ? "Nenhum artigo está em ruptura."
                  : "Sem existências para mostrar."
              }
            />
          </>
        )}
      </Cartao>
    </>
  );
}
