"use client";

import { Plus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
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
import { formataMoeda } from "@/lib/dinheiro";
import { useDiarios, useExercicios } from "@/lib/hooks";
import type { Lancamento } from "@/types";

import { FormularioLancamento } from "./FormularioLancamento";

const ORIGENS: Record<string, { rotulo: string; cor: string }> = {
  manual: { rotulo: "Manual", cor: "#62657a" },
  comercial: { rotulo: "Comercial", cor: "#2980b9" },
  logistica: { rotulo: "Logística", cor: "#d68910" },
  rh: { rotulo: "RH", cor: "#16a085" },
  imobilizado: { rotulo: "Imobilizado", cor: "#7a3aab" },
  apuramento: { rotulo: "Apuramento", cor: "#e6007e" },
};

export default function Movimentos() {
  const { pode, empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { diarios } = useDiarios();

  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [diario, setDiario] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [incluirDiferidos, setIncluirDiferidos] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const parametros = new URLSearchParams();
  if (exId) parametros.set("exercicio_id", exId);
  if (diario !== "todos") parametros.set("diario", diario);
  if (de) parametros.set("de", de);
  if (ate) parametros.set("ate", ate);
  if (incluirDiferidos) parametros.set("incluir_diferidos", "true");

  const chave = `/api/contabilidade/lancamentos?${parametros}`;
  const {
    data: lancamentos,
    isLoading,
    mutate,
  } = useSWR<Lancamento[]>(chave, buscador);

  return (
    <>
      <CabecalhoPagina
        titulo="Movimentos"
        descricao="Lançamentos em partidas dobradas."
        accoes={
          pode("contab.lancar") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo movimento
            </Botao>
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
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Selector
          rotulo="Diário"
          valor={diario}
          aoMudar={setDiario}
          opcoes={[
            { valor: "todos", rotulo: "Todos os diários" },
            ...diarios.map((d) => ({
              valor: d.codigo,
              rotulo: `${d.codigo} — ${d.nome}`,
            })),
          ]}
          larguraMinima="15rem"
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
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-[13px] text-texto-suave">
          <input
            type="checkbox"
            checked={incluirDiferidos}
            onChange={(e) => setIncluirDiferidos(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-marca)]"
          />
          Incluir diferidos
        </label>
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !lancamentos?.length ? (
          <Vazio>Sem movimentos no período seleccionado.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nº Operação</Th>
                  <Th>Data</Th>
                  <Th>Per.</Th>
                  <Th>Diário</Th>
                  <Th>Doc.</Th>
                  <Th>Descrição</Th>
                  <Th>Referência</Th>
                  <Th>Origem</Th>
                  <Th numerico>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => {
                  const o = ORIGENS[l.origem] ?? {
                    rotulo: l.origem,
                    cor: "#62657a",
                  };
                  return (
                    <Tr
                      key={l.id}
                      onClick={() => setDetalhe(l.id)}
                      className="cursor-pointer"
                    >
                      <Td className="font-bold tabular">
                        {l.numero_op ?? l.numero}
                        {l.diferido && (
                          <Selo cor="#c98a10" className="ml-2">
                            Diferido
                          </Selo>
                        )}
                      </Td>
                      <Td className="tabular">
                        {new Date(l.data).toLocaleDateString("pt-PT")}
                      </Td>
                      <Td className="tabular text-texto-suave">{l.mes}</Td>
                      <Td className="tabular">{l.diario_codigo}</Td>
                      <Td className="tabular">{l.documento_codigo}</Td>
                      <Td className="max-w-[300px] truncate">
                        <span title={l.descricao ?? ""}>
                          {l.descricao ?? "—"}
                        </span>
                      </Td>
                      <Td className="text-texto-suave">
                        {l.documento_ref ?? "—"}
                      </Td>
                      <Td>
                        <Selo cor={o.cor}>{o.rotulo}</Selo>
                      </Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(l.total, moeda)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioLancamento
          exercicioId={exId}
          aoFechar={() => setNovoAberto(false)}
          aoGravar={() => {
            setNovoAberto(false);
            mutate();
          }}
        />
      )}

      {detalhe && (
        <DetalheLancamento
          id={detalhe}
          moeda={moeda}
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </>
  );
}

function DetalheLancamento({
  id,
  moeda,
  aoFechar,
}: {
  id: string;
  moeda: string;
  aoFechar: () => void;
}) {
  const { data, isLoading } = useSWR<Lancamento>(
    `/api/contabilidade/lancamentos/${id}`,
    buscador,
  );

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(920px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
            <Dialog.Title className="truncate text-[15px] font-bold">
              Movimento {data?.numero_op ?? ""}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-w-0 overflow-auto p-5">
            {isLoading || !data ? (
              <ACarregar />
            ) : (
              <>
                <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Info rotulo="Data">
                    {new Date(data.data).toLocaleDateString("pt-PT")}
                  </Info>
                  <Info rotulo="Período">{data.mes}</Info>
                  <Info rotulo="Diário">{data.diario_codigo}</Info>
                  <Info rotulo="Documento">{data.documento_codigo}</Info>
                  <Info rotulo="Referência">{data.documento_ref ?? "—"}</Info>
                  <Info rotulo="Origem">{data.origem}</Info>
                  <Info rotulo="Estado">
                    {data.diferido ? "Diferido" : "Integrado"}
                  </Info>
                  <Info rotulo="Nº interno">{data.numero}</Info>
                </dl>

                {data.descricao && (
                  <p className="mb-4 text-sm text-texto-suave">
                    {data.descricao}
                  </p>
                )}

                <EnvolveTabela>
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Conta</Th>
                        <Th>Designação</Th>
                        <Th>Descrição</Th>
                        <Th>Entidade</Th>
                        <Th>Centro</Th>
                        <Th numerico>Débito</Th>
                        <Th numerico>Crédito</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.linhas?.map((x) => (
                        <Tr key={`${x.ordem}-${x.conta_codigo}`}>
                          <Td className="font-bold tabular">
                            {x.conta_codigo}
                          </Td>
                          <Td className="max-w-[220px] truncate text-texto-suave">
                            {x.conta_nome ?? "—"}
                          </Td>
                          <Td className="max-w-[200px] truncate">
                            {x.descricao ?? "—"}
                          </Td>
                          <Td className="max-w-[160px] truncate">
                            {x.entidade || "—"}
                          </Td>
                          <Td className="text-texto-suave">
                            {x.centro_codigo || "—"}
                          </Td>
                          <Td numerico>
                            {x.debito === "0.00"
                              ? ""
                              : formataMoeda(x.debito, moeda)}
                          </Td>
                          <Td numerico>
                            {x.credito === "0.00"
                              ? ""
                              : formataMoeda(x.credito, moeda)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tabela>
                </EnvolveTabela>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Info({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] uppercase tracking-[0.4px] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="truncate text-sm font-semibold">{children}</dd>
    </div>
  );
}
