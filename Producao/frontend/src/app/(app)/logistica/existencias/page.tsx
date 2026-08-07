"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import type { Armazem, Existencias } from "@/types";

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

  return (
    <>
      <CabecalhoPagina
        titulo="Existências"
        descricao="Stock e valorização ao Custo Médio Ponderado, calculado a partir dos movimentos."
      />

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
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
        ) : !linhas.length ? (
          <Vazio>
            {soRutura === "sim"
              ? "Nenhum artigo está em ruptura."
              : "Sem existências para mostrar."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Descrição</Th>
                  <Th>Un.</Th>
                  <Th numerico>Stock</Th>
                  <Th numerico>Stock mín.</Th>
                  <Th numerico>Custo médio</Th>
                  <Th numerico>Valor</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <Tr key={l.artigo_id}>
                    <Td className="tabular font-bold">{l.codigo}</Td>
                    <Td className="max-w-[300px] truncate font-semibold">
                      {l.descricao}
                    </Td>
                    <Td>{l.unidade || "—"}</Td>
                    <Td numerico className={l.rutura ? "text-perigo" : ""}>
                      {l.stock}
                    </Td>
                    <Td numerico className="text-texto-suave">
                      {l.stock_min}
                    </Td>
                    <Td numerico>{formataMoeda(l.custo_medio, moeda)}</Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(l.valor, moeda)}
                    </Td>
                    <Td>
                      {l.rutura ? (
                        <Selo cor="#c62828">
                          <AlertTriangle size={11} aria-hidden />
                          Ruptura
                        </Selo>
                      ) : (
                        <Selo cor="#1a9c5f">Normal</Selo>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
