"use client";

import { Tabs } from "radix-ui";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import { TabelaFolha } from "@/components/rh/TabelaFolha";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Kpi,
  Selector,
  Tabela,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import type { Colaborador, Folha, LinhaRecibo } from "@/types";

/**
 * Simulação — duas coisas diferentes, uma em cada separador.
 *
 * A Produção tinha a folha do mês inteira, só de leitura, para conferir antes
 * de processar. O Piloto (`rh-simulacao.html`) tem outra coisa: uma
 * calculadora de «quanto sobra de um bruto destes?», que não depende de mês
 * nenhum e serve para negociar um salário ou responder a uma pergunta de
 * corredor. As duas fazem falta, e não são a mesma — ficam lado a lado.
 */
export default function Simulacao() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [aba, setAba] = useState("folha");
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

      <Tabs.Root value={aba} onValueChange={setAba}>
        <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
          {[
            { v: "folha", r: "Folha do mês" },
            { v: "salario", r: "Simulador de salário" },
          ].map((x) => (
            <Tabs.Trigger
              key={x.v}
              value={x.v}
              className="-mb-0.5 rounded-t-lg border-b-2 border-transparent px-4 py-2 text-[13.5px] font-semibold text-texto-suave hover:text-texto data-[state=active]:border-acento data-[state=active]:text-texto"
            >
              {x.r}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {aba === "folha" ? (
        <>
          <Alerta tipo="info" className="mb-4">
            Esta página é só de leitura. Os valores são calculados na hora com
            as remunerações actuais e as alterações já registadas para o mês —
            serve para conferir antes de processar, não substitui o
            processamento.
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
      ) : (
        <SimuladorDeSalario moeda={moeda} />
      )}
    </>
  );
}

/** O simulador do Piloto: dois números à esquerda, o recibo à direita. */
function SimuladorDeSalario({ moeda }: { moeda: string }) {
  const [colaboradorId, setColaboradorId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [base, setBase] = useState("250000");
  const [subsidios, setSubsidios] = useState("70000");
  const [r, setR] = useState<LinhaRecibo | null>(null);

  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
    { revalidateOnFocus: false },
  );

  // A conta vem do servidor, a mesma que processa a folha — uma calculadora
  // que responda outra coisa não serve para simular.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      api
        .post<LinhaRecibo>("/api/rh/simular-salario", {
          salario_base: base || "0",
          subsidios: subsidios || "0",
        })
        .then((x) => vivo && setR(x))
        .catch(() => vivo && setR(null));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [base, subsidios]);

  function escolher(id: string) {
    setColaboradorId(id);
    const c = colaboradores?.find((x) => x.id === id);
    if (!c) return;
    setBase(c.salario_base);
    setSubsidios(c.subsidios);
    setCategoria(c.categoria ?? "");
  }

  const bruto = Number(r?.bruto ?? 0);
  // Vírgula decimal: em português «18.5%» não se escreve.
  const taxa = bruto
    ? ((100 * (Number(r?.inss ?? 0) + Number(r?.irt ?? 0))) / bruto)
        .toFixed(1)
        .replace(".", ",")
    : "0";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Cartao>
        <TituloCartao>Dados</TituloCartao>
        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            rotulo="Colaborador (opcional)"
            valor={colaboradorId}
            aoMudar={escolher}
            opcoes={[
              { valor: "", rotulo: "— Manual —" },
              ...(colaboradores ?? []).map((c) => ({
                valor: c.id,
                rotulo: `${c.numero} · ${c.nome}`,
              })),
            ]}
            larguraMinima="100%"
          />
          <Campo rotulo="Categoria">
            <Entrada
              value={categoria}
              placeholder="—"
              onChange={(e) => setCategoria(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Salário base">
            <Entrada
              type="number"
              step="1000"
              min="0"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Subsídios">
            <Entrada
              type="number"
              step="1000"
              min="0"
              value={subsidios}
              onChange={(e) => setSubsidios(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
        </div>
        <p className="mt-3 text-[12.5px] text-texto-suave">
          O INSS do trabalhador (3%) incide sobre o salário base. A matéria
          colectável do IRT = bruto − INSS.
        </p>
      </Cartao>

      <Cartao>
        <TituloCartao>Simulação</TituloCartao>
        {!r ? (
          <ACarregar />
        ) : (
          <>
            <EnvolveTabela>
              <Tabela>
                <tbody>
                  <LinhaSim
                    rotulo="Salário base"
                    valor={r.base}
                    moeda={moeda}
                  />
                  <LinhaSim rotulo="Subsídios" valor={r.subs} moeda={moeda} />
                  <tr className="border-t-2 border-borda font-bold">
                    <td className="px-4 py-2">Remuneração bruta</td>
                    <td className="tabular px-4 py-2 text-right">
                      {formataMoeda(r.bruto, moeda)}
                    </td>
                  </tr>
                  <LinhaSim
                    rotulo="INSS (3%)"
                    valor={r.inss}
                    moeda={moeda}
                    negativo
                  />
                  <LinhaSim
                    rotulo="Matéria colectável IRT"
                    valor={r.materia}
                    moeda={moeda}
                  />
                  <LinhaSim rotulo="IRT" valor={r.irt} moeda={moeda} negativo />
                  <tr className="border-t-2 border-borda bg-superficie-2 font-bold">
                    <td className="px-4 py-2.5">Líquido a receber</td>
                    <td className="tabular px-4 py-2.5 text-right text-[15px]">
                      {formataMoeda(r.liquido, moeda)}
                    </td>
                  </tr>
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <p className="mt-3 text-[12.5px] leading-relaxed text-texto-suave">
              Taxa efectiva de retenção: <b className="text-texto">{taxa}%</b> ·
              INSS a cargo da empresa (8%):{" "}
              <b className="tabular text-texto">
                {formataMoeda(r.inss_empresa, moeda)}
              </b>{" "}
              · Custo total para a empresa:{" "}
              <b className="tabular text-texto">
                {formataMoeda(
                  (Number(r.bruto) + Number(r.inss_empresa)).toFixed(2),
                  moeda,
                )}
              </b>
              .
            </p>
          </>
        )}
      </Cartao>
    </div>
  );
}

function LinhaSim({
  rotulo,
  valor,
  moeda,
  negativo,
}: {
  rotulo: string;
  valor: string;
  moeda: string;
  negativo?: boolean;
}) {
  return (
    <tr className="border-b border-borda/60">
      <td className="px-4 py-2 text-sm">{rotulo}</td>
      <td className="tabular px-4 py-2 text-right text-sm">
        {negativo
          ? `(${formataMoeda(valor, moeda)})`
          : formataMoeda(valor, moeda)}
      </td>
    </tr>
  );
}
