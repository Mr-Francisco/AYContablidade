"use client";

import { useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import { TabelaFolha } from "@/components/rh/TabelaFolha";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Kpi,
  Selector,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto } from "@/lib/dinheiro";
import type { Folha } from "@/types";

export default function Simulacao() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [soAtivos, setSoAtivos] = useState("true");

  const { data: folha, isLoading } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=${soAtivos}`,
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Simulação"
        descricao="Vê a folha de um mês sem processar nada. Não grava, não lança e não altera estados."
      />

      <Alerta tipo="info" className="mb-4">
        Esta página é só de leitura. Os valores são calculados na hora com as
        remunerações actuais e as alterações já registadas para o mês — serve
        para conferir antes de processar, não substitui o processamento.
      </Alerta>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          opcoes={ultimosMeses().map((m) => ({
            valor: m,
            rotulo: mesPorExtenso(m),
          }))}
          larguraMinima="14rem"
        />
        <Selector
          rotulo="Colaboradores"
          valor={soAtivos}
          aoMudar={setSoAtivos}
          opcoes={[
            { valor: "true", rotulo: "Só activos" },
            { valor: "false", rotulo: "Todos" },
          ]}
        />
      </BarraFiltros>

      {folha && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="min-w-0">
            <Kpi
              rotulo="Bruto"
              valor={formataCompacto(folha.totais.bruto, moeda)}
              detalhe={`${folha.linhas.length} colaboradores`}
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="INSS trabalhador"
              valor={formataCompacto(folha.totais.inss, moeda)}
              detalhe="3% do salário base"
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="IRT"
              valor={formataCompacto(folha.totais.irt, moeda)}
              detalhe="Retido na fonte"
              cor="var(--grafico-4)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Líquido a pagar"
              valor={formataCompacto(folha.totais.liquido, moeda)}
              detalhe="Depois de descontos"
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="INSS empresa"
              valor={formataCompacto(folha.totais.inss_empresa, moeda)}
              detalhe="8% — custo da entidade"
              cor="var(--grafico-3)"
            />
          </div>
        </div>
      )}

      <Cartao className="p-0">
        <TituloCartao className="px-5 pt-5" extra={mesPorExtenso(mes)}>
          Folha simulada
        </TituloCartao>
        {isLoading || !folha ? (
          <ACarregar />
        ) : (
          <TabelaFolha folha={folha} moeda={moeda} />
        )}
      </Cartao>
    </>
  );
}
