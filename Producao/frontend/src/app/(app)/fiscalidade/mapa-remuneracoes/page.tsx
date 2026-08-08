"use client";

import { Download, Printer } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selector,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";

interface LinhaMapa {
  colaborador_id: string;
  nif: string;
  nome: string;
  num_ss: string;
  provincia: string;
  municipio: string;
  salario_base: string;
  descontos_falta: string;
  sub_nao_suj: string;
  sub_suj: string;
  salario_iliquido: string;
  base_ss: string;
  contrib_ss: string;
  base_irt: string;
  irt: string;
  isento_irt: boolean;
  nao_sujeito_ss: boolean;
  [chave: string]: unknown;
}

interface MapaIrt {
  mes: string;
  rubricas_nao_sujeitas: string[];
  rubricas_sujeitas: string[];
  linhas: LinhaMapa[];
  totais: Record<string, string>;
}

export default function MapaRemuneracoes() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [soAtivos, setSoAtivos] = useState("true");

  const { data, isLoading } = useSWR<MapaIrt>(
    `/api/rh/mapa-irt?mes=${mes}&so_ativos=${soAtivos}`,
    buscador,
  );

  function exportarCsv() {
    if (!data) return;
    const cabecalho = [
      "NIF",
      "Nome",
      "Nº Seg. Social",
      "Província",
      "Município",
      "Salário base",
      "Descontos por falta",
      "Subsídios não sujeitos",
      "Subsídios sujeitos",
      "Salário ilíquido",
      "Base SS",
      "Contribuição SS",
      "Base IRT",
      "IRT",
    ];
    const linhas = data.linhas.map((l) => [
      l.nif,
      l.nome,
      l.num_ss,
      l.provincia,
      l.municipio,
      l.salario_base,
      l.descontos_falta,
      l.sub_nao_suj,
      l.sub_suj,
      l.salario_iliquido,
      l.base_ss,
      l.contrib_ss,
      l.base_irt,
      l.irt,
    ]);
    // Ponto e vírgula: o Excel em português usa-o como separador, e com vírgula
    // abriria tudo numa coluna só. O BOM é o que faz os acentos aparecerem.
    const csv = [cabecalho, ...linhas]
      .map((r) =>
        r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `mapa-remuneracoes-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa de Remunerações"
        descricao="Modelo IRT A2.1 (AGT) — remunerações, base contributiva e IRT retido, por colaborador."
        accoes={
          data?.linhas.length ? (
            <div className="flex gap-2">
              <Botao onClick={exportarCsv}>
                <Download size={16} />
                Exportar CSV
              </Botao>
              <Botao onClick={() => window.print()}>
                <Printer size={16} />
                Imprimir
              </Botao>
            </div>
          ) : undefined
        }
      />

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

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Salário ilíquido"
              valor={formataCompacto(
                data.totais.salario_iliquido ?? "0",
                moeda,
              )}
              detalhe={`${data.linhas.length} colaboradores`}
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Base contributiva"
              valor={formataCompacto(data.totais.base_ss ?? "0", moeda)}
              detalhe="Sobre a qual incide a SS"
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Contribuição SS"
              valor={formataCompacto(data.totais.contrib_ss ?? "0", moeda)}
              detalhe="Parte do trabalhador"
              cor="var(--grafico-4)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="IRT retido"
              valor={formataCompacto(data.totais.irt ?? "0", moeda)}
              detalhe="A entregar ao Estado"
              cor="var(--grafico-6)"
            />
          </div>
        </div>
      )}

      <Alerta tipo="info" className="mb-4">
        As colunas seguem o modelo da AGT. Repare que a{" "}
        <b>base do IRT não é o salário ilíquido</b>: os subsídios não sujeitos
        ficam de fora e a contribuição para a Segurança Social é deduzida. É
        essa diferença que o modelo pede que fique visível.
      </Alerta>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !data?.linhas.length ? (
          <Vazio>Sem colaboradores para {mesPorExtenso(mes)}.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>NIF</Th>
                  <Th>Nome</Th>
                  <Th>Nº Seg. Social</Th>
                  <Th>Localização</Th>
                  <Th numerico>Salário base</Th>
                  <Th numerico>Faltas</Th>
                  <Th numerico>Subs. não sujeitos</Th>
                  <Th numerico>Subs. sujeitos</Th>
                  <Th numerico>Ilíquido</Th>
                  <Th numerico>Base SS</Th>
                  <Th numerico>Contrib. SS</Th>
                  <Th numerico>Base IRT</Th>
                  <Th numerico>IRT</Th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((l) => (
                  <Tr key={l.colaborador_id}>
                    <Td className="tabular">{l.nif || "—"}</Td>
                    <Td className="max-w-[200px] truncate font-semibold">
                      {l.nome}
                    </Td>
                    <Td className="tabular">{l.num_ss || "—"}</Td>
                    <Td className="max-w-[160px] truncate text-texto-suave">
                      {[l.municipio, l.provincia].filter(Boolean).join(", ") ||
                        "—"}
                    </Td>
                    <Td numerico>{formataMoeda(l.salario_base, moeda)}</Td>
                    <Td numerico className="text-texto-suave">
                      {l.descontos_falta === "0.00"
                        ? "—"
                        : formataMoeda(l.descontos_falta, moeda)}
                    </Td>
                    <Td numerico>{formataMoeda(l.sub_nao_suj, moeda)}</Td>
                    <Td numerico>{formataMoeda(l.sub_suj, moeda)}</Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(l.salario_iliquido, moeda)}
                    </Td>
                    <Td numerico>{formataMoeda(l.base_ss, moeda)}</Td>
                    <Td numerico>
                      {l.nao_sujeito_ss ? (
                        <span className="text-texto-suave">não sujeito</span>
                      ) : (
                        formataMoeda(l.contrib_ss, moeda)
                      )}
                    </Td>
                    <Td numerico>{formataMoeda(l.base_irt, moeda)}</Td>
                    <Td numerico className="font-bold">
                      {l.isento_irt ? (
                        <span className="font-normal text-texto-suave">
                          isento
                        </span>
                      ) : (
                        formataMoeda(l.irt, moeda)
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda font-bold">
                  <Td colSpan={4}>Totais</Td>
                  <Td numerico>
                    {formataMoeda(data.totais.salario_base ?? "0", moeda)}
                  </Td>
                  <Td />
                  <Td numerico>
                    {formataMoeda(data.totais.sub_nao_suj ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.sub_suj ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.salario_iliquido ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.base_ss ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.contrib_ss ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.base_irt ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data.totais.irt ?? "0", moeda)}
                  </Td>
                </tr>
              </tfoot>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
