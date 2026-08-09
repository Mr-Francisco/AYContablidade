"use client";

import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
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
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { RodapeHistorico, useHistorico } from "@/components/ui/Historico";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";

interface LinhaRetencao {
  data: string;
  numero_op: string;
  tipo: string;
  conta: string;
  entidade: string;
  descricao: string | null;
  valor: string;
  lancamento_id: string;
}

interface MapaRetencoes {
  linhas: LinhaRetencao[];
  total: string;
  por_tipo: Record<string, string>;
}

const CORES_TIPO: Record<string, string> = {
  IRT: "#e6007e",
  "IRT (Lei 7/97)": "#b81893",
  "Imposto Industrial / IAC": "#1e5fcc",
  "Imposto de Selo": "#7a3aab",
};

export default function Retencoes() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [mes, setMes] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (mes) p.set("mes", mes);

  const { data, isLoading } = useSWR<MapaRetencoes>(
    `/api/apuramentos/retencoes?${p}`,
    buscador,
  );

  // A lista cresce com o exercício; o rodapé diz quantos são.
  const historico = useHistorico(data?.linhas);

  const tipos = Object.entries(data?.por_tipo ?? {});

  return (
    <>
      <CabecalhoPagina
        titulo="Retenções na Fonte"
        descricao="Impostos retidos no período, a entregar ao Estado até ao fim do mês seguinte."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <Selo cor="#e6007e">
                Total: {formataMoeda(data.total, moeda)}
              </Selo>
            )}
            <AccoesDoMapa />
          </div>
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Selector
          rotulo="Período"
          valor={mes}
          aoMudar={setMes}
          opcoes={[
            { valor: "", rotulo: "Todo o exercício" },
            ...periodos.map((x) => ({
              valor: x.codigo,
              rotulo: `${x.codigo} — ${x.nome}`,
            })),
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">Não foi possível carregar as retenções.</Alerta>
      ) : data.linhas.length === 0 ? (
        <Alerta tipo="info">Sem retenções no período seleccionado.</Alerta>
      ) : (
        <>
          {tipos.length > 0 && (
            <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tipos.map(([tipo, valor]) => (
                <div key={tipo} className="min-w-0">
                  <Kpi
                    rotulo={tipo}
                    valor={formataCompacto(valor, moeda)}
                    cor={CORES_TIPO[tipo] ?? "var(--grafico-7)"}
                  />
                </div>
              ))}
            </div>
          )}

          <Cartao className="p-0">
            {data.linhas.length === 0 ? (
              <Vazio>Sem retenções.</Vazio>
            ) : (
              <>
                <EnvolveTabela className="rounded-none border-0">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Data</Th>
                        <Th>Nº Operação</Th>
                        <Th>Imposto</Th>
                        <Th>Conta</Th>
                        <Th>Entidade</Th>
                        <Th>Descrição</Th>
                        <Th numerico>Valor retido</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.visiveis.map((l) => (
                        <Tr key={`${l.lancamento_id}-${l.conta}-${l.valor}`}>
                          <Td className="tabular">
                            {new Date(l.data).toLocaleDateString("pt-PT")}
                          </Td>
                          <Td className="tabular font-semibold">
                            {l.numero_op}
                          </Td>
                          <Td>
                            <Selo cor={CORES_TIPO[l.tipo] ?? "#62657a"}>
                              {l.tipo}
                            </Selo>
                          </Td>
                          <Td className="tabular">{l.conta}</Td>
                          <Td className="max-w-[180px] truncate">
                            {l.entidade || "—"}
                          </Td>
                          <Td className="max-w-[280px] truncate">
                            <span title={l.descricao ?? ""}>
                              {l.descricao || "—"}
                            </span>
                          </Td>
                          <Td numerico className="font-semibold">
                            {formataMoeda(l.valor, moeda)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-superficie-2 font-extrabold">
                        <Td colSpan={6}>TOTAL RETIDO</Td>
                        <Td numerico>{formataMoeda(data.total, moeda)}</Td>
                      </tr>
                    </tfoot>
                  </Tabela>
                </EnvolveTabela>
                <RodapeHistorico {...historico} nome="retenções" />
              </>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
