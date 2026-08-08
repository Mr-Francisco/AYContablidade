"use client";

import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { CentroCusto, MapaAnalitico } from "@/types";

export default function Centros() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { activo } = useExercicios();

  const { data: centros, isLoading } = useSWR<CentroCusto[]>(
    "/api/contabilidade/centros",
    buscador,
  );
  const { data: mapa } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${activo?.id ? `?exercicio_id=${activo.id}` : ""}`,
    buscador,
  );

  // Cruzar a ficha com o movimento: um centro sem movimento nenhum é tão útil
  // de ver como um com movimento — costuma ser sinal de que ninguém o usa.
  const movimento = new Map(
    (mapa?.linhas ?? []).map((l) => [l.codigo, l] as const),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Centros de Custo"
        descricao="Ficha dos centros e o movimento que cada um acumulou no exercício."
      />

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !centros?.length ? (
          <Vazio>
            Ainda não há centros de custo definidos. Sem centros, todas as
            linhas das classes 6 e 7 caem em "(Sem centro)" no mapa.
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Tipo</Th>
                  <Th>Responsável</Th>
                  <Th numerico>Linhas</Th>
                  <Th numerico>Custos</Th>
                  <Th numerico>Proveitos</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {centros.map((c) => {
                  const m = movimento.get(c.codigo);
                  return (
                    <Tr key={c.id}>
                      <Td className="tabular font-bold">{c.codigo}</Td>
                      <Td className="max-w-[240px] truncate font-semibold">
                        {c.nome}
                      </Td>
                      <Td className="text-texto-suave">{c.tipo || "—"}</Td>
                      <Td>{c.responsavel || "—"}</Td>
                      <Td numerico className="text-texto-suave">
                        {m?.n ?? 0}
                      </Td>
                      <Td numerico>
                        {m ? (
                          formataMoeda(m.debito, moeda)
                        ) : (
                          <span className="text-texto-suave">
                            sem movimento
                          </span>
                        )}
                      </Td>
                      <Td numerico>
                        {m ? formataMoeda(m.credito, moeda) : "—"}
                      </Td>
                      <Td>
                        <Selo
                          cor={c.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {c.estado === "activo" ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      <Alerta tipo="info" className="mt-4">
        O centro é escolhido na linha do lançamento, não na conta. É por isso
        que a mesma conta de custo pode aparecer repartida por vários centros —
        e que uma linha sem centro atribuído continua a ser um lançamento
        válido, só não entra na análise por centro.
      </Alerta>
    </>
  );
}
