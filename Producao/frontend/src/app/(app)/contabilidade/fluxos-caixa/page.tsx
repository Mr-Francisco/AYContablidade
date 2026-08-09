"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

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
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";

interface DemonstracaoFluxos {
  grupos: Record<string, Record<string, string>>;
  subtotais: Record<string, string>;
  variacao: string;
  saldo_inicial: string;
  saldo_final: string;
}

interface LinhaMapa {
  codigo: string;
  descricao: string;
  tipo: "R" | "I" | "M";
  valor: string;
}

const CORES_GRUPO: Record<string, string> = {
  Operacional: "var(--grafico-6)",
  Investimento: "var(--grafico-2)",
  Financiamento: "var(--grafico-3)",
};

export default function FluxosCaixa() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);

  const { data, isLoading } = useSWR<DemonstracaoFluxos>(
    `/api/relatorios/fluxos-caixa?${p}`,
    buscador,
  );
  const { data: mapa } = useSWR<LinhaMapa[]>(
    `/api/relatorios/mapa-fluxos?${p}`,
    buscador,
  );

  // Só as rubricas com movimento — o mapa tem 35 linhas e a maioria fica a zero.
  const mapaComValor = useMemo(
    () => (mapa ?? []).filter((l) => !big(l.valor).eq(0)),
    [mapa],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Fluxos de Caixa"
        descricao="Movimentos de caixa e bancos, categorizados pela contrapartida."
        accoes={<AccoesDoMapa />}
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
        <Campo rotulo="De">
          <Entrada
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Até">
          <Entrada
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </Campo>
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">
          Não foi possível carregar os fluxos de caixa.
        </Alerta>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Saldo inicial"
                valor={formataCompacto(data.saldo_inicial, moeda)}
                detalhe={de ? `Antes de ${de}` : "Início do período"}
                cor="var(--grafico-7)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Variação"
                valor={formataCompacto(data.variacao, moeda)}
                detalhe={
                  big(data.variacao).gte(0)
                    ? "Entrada líquida"
                    : "Saída líquida"
                }
                tendencia={big(data.variacao).gte(0) ? "sobe" : "desce"}
                cor={
                  big(data.variacao).gte(0)
                    ? "var(--grafico-6)"
                    : "var(--grafico-1)"
                }
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Saldo final"
                valor={formataCompacto(data.saldo_final, moeda)}
                detalhe="Caixa e bancos"
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Operacional"
                valor={formataCompacto(data.subtotais.Operacional, moeda)}
                detalhe="Actividade corrente"
                cor="var(--grafico-6)"
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <Cartao className="min-w-0 p-0">
              <TituloCartao className="px-5 pt-5">
                Demonstração de Fluxos de Caixa
              </TituloCartao>
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Rubrica</Th>
                      <Th numerico>Valor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.grupos).map(
                      ([nomeGrupo, rubricas]) => {
                        const entradas = Object.entries(rubricas);
                        return (
                          <FragmentoGrupo
                            key={nomeGrupo}
                            nome={nomeGrupo}
                            entradas={entradas}
                            subtotal={data.subtotais[nomeGrupo]}
                            moeda={moeda}
                          />
                        );
                      },
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-superficie-2 font-extrabold">
                      <Td>VARIAÇÃO DE TESOURARIA</Td>
                      <Td numerico>{formataMoeda(data.variacao, moeda)}</Td>
                    </tr>
                  </tfoot>
                </Tabela>
              </EnvolveTabela>
            </Cartao>

            <Cartao className="min-w-0 p-0">
              <TituloCartao
                className="px-5 pt-5"
                extra="Só linhas com rubrica atribuída"
              >
                Mapa por rubrica
              </TituloCartao>
              {mapaComValor.length === 0 ? (
                <Vazio>
                  Nenhum movimento tem rubrica de fluxo atribuída manualmente.
                </Vazio>
              ) : (
                <EnvolveTabela className="rounded-none border-0 border-t">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Código</Th>
                        <Th>Descrição</Th>
                        <Th numerico>Valor</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapaComValor.map((l) => (
                        <Tr key={l.codigo}>
                          <Td className="tabular font-semibold">{l.codigo}</Td>
                          <Td
                            className={
                              l.tipo === "M"
                                ? "pl-6 text-texto-suave"
                                : "font-bold"
                            }
                          >
                            {l.descricao}
                          </Td>
                          <Td numerico>{formataMoeda(l.valor, moeda)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tabela>
                </EnvolveTabela>
              )}
            </Cartao>
          </div>
        </>
      )}
    </>
  );
}

function FragmentoGrupo({
  nome,
  entradas,
  subtotal,
  moeda,
}: {
  nome: string;
  entradas: [string, string][];
  subtotal: string;
  moeda: string;
}) {
  const total = subtotal ?? soma(...entradas.map(([, v]) => v)).toString();

  return (
    <>
      <tr>
        <td
          colSpan={2}
          className="border-b border-borda bg-superficie-2 px-3.5 py-2 text-[12.5px] font-bold uppercase tracking-[0.4px]"
          style={{ color: CORES_GRUPO[nome] }}
        >
          Actividades de {nome}
        </td>
      </tr>
      {entradas.length === 0 ? (
        <tr className="border-b border-borda">
          <td
            colSpan={2}
            className="px-3.5 py-2 text-[13px] italic text-texto-suave"
          >
            Sem movimentos.
          </td>
        </tr>
      ) : (
        entradas.map(([rubrica, valor]) => (
          <Tr key={`${nome}-${rubrica}`}>
            <Td className="pl-7">{rubrica}</Td>
            <Td numerico>{formataMoeda(valor, moeda)}</Td>
          </Tr>
        ))
      )}
      <Tr className="font-bold">
        <Td>Subtotal — {nome}</Td>
        <Td numerico>{formataMoeda(total, moeda)}</Td>
      </Tr>
    </>
  );
}
