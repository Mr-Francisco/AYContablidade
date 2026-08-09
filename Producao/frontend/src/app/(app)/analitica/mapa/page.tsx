"use client";

import { useState } from "react";
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
  Tr,
  Vazio,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { MapaAnalitico } from "@/types";

export default function MapaCustos() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();

  const [exercicioId, setExercicioId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const exId = exercicioId || activo?.id || "";
  const params = new URLSearchParams();
  if (exId) params.set("exercicio_id", exId);
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);

  const { data, isLoading } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${params.size ? `?${params}` : ""}`,
    buscador,
  );

  const semCentro = data?.linhas.find((l) => l.codigo === "—");
  const totalMovimentos = (data?.linhas ?? []).reduce((s, l) => s + l.n, 0);
  const porClassificar = semCentro?.n ?? 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa de Custos"
        descricao="Custos e proveitos por centro de custo. Só entram as contas das classes 6 e 7."
        accoes={<AccoesDoMapa />}
      />

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Custos (classe 6)"
              valor={formataCompacto(data.totais.debito, moeda)}
              detalhe="Total a débito"
              cor="var(--grafico-4)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Proveitos (classe 7)"
              valor={formataCompacto(data.totais.credito, moeda)}
              detalhe="Total a crédito"
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Resultado analítico"
              valor={formataCompacto(data.totais.saldo, moeda)}
              detalhe={
                Number(data.totais.saldo) < 0
                  ? "Proveitos acima dos custos"
                  : "Custos acima dos proveitos"
              }
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Por classificar"
              valor={String(porClassificar)}
              detalhe={`de ${plural(totalMovimentos, "linha")}`}
              cor={
                porClassificar > 0 ? "var(--color-aviso)" : "var(--grafico-2)"
              }
            />
          </div>
        </div>
      )}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos os exercícios" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="14rem"
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

      {porClassificar > 0 && (
        <Alerta tipo="aviso" className="mb-4">
          Há <b>{porClassificar}</b> linhas de custo ou proveito sem centro
          atribuído. Aparecem na linha <b>(Sem centro)</b> em vez de
          desaparecerem — é assim que se vê o que falta classificar. Enquanto lá
          estiverem, o mapa por centro não conta a história toda.
        </Alerta>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !data?.linhas.length ? (
          <Vazio>
            Ainda não há movimentos nas classes 6 e 7 para este período.
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Centro</Th>
                  <Th>Designação</Th>
                  <Th numerico>Linhas</Th>
                  <Th numerico>Custos</Th>
                  <Th numerico>Proveitos</Th>
                  <Th numerico>Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((l) => (
                  <Tr
                    key={l.codigo}
                    className={l.codigo === "—" ? "bg-aviso/6" : undefined}
                  >
                    <Td className="tabular font-bold">{l.codigo}</Td>
                    <Td className="max-w-[280px] truncate font-semibold">
                      {l.nome}
                    </Td>
                    <Td numerico className="text-texto-suave">
                      {l.n}
                    </Td>
                    <Td numerico>{formataMoeda(l.debito, moeda)}</Td>
                    <Td numerico>{formataMoeda(l.credito, moeda)}</Td>
                    <Td
                      numerico
                      className={`font-bold ${Number(l.saldo) < 0 ? "text-sucesso" : ""}`}
                    >
                      {formataMoeda(l.saldo, moeda)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda font-bold">
                  <Td colSpan={3}>Totais</Td>
                  <Td numerico>{formataMoeda(data.totais.debito, moeda)}</Td>
                  <Td numerico>{formataMoeda(data.totais.credito, moeda)}</Td>
                  <Td numerico>{formataMoeda(data.totais.saldo, moeda)}</Td>
                </tr>
              </tfoot>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      <Alerta tipo="info" className="mt-4">
        O resultado por centro é <b>custos menos proveitos</b>, pelo que um
        valor negativo é um centro que gerou mais proveito do que consumiu.
        Centros de estrutura mostram sempre um valor positivo — não têm proveito
        próprio.
      </Alerta>
    </>
  );
}
