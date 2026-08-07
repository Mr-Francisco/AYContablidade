"use client";

import { ChevronDown, Pencil, RotateCcw } from "lucide-react";
import { Accordion } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";

interface Rubrica {
  codigo: string;
  nome: string;
  valor: string;
  amort?: boolean;
}

interface Nota {
  n: number;
  grupo: "BL" | "DR";
  titulo: string;
  rubricas: Rubrica[];
  total: string;
  analise?: string;
  texto?: string;
  narrativa?: boolean;
  automatico: string;
  editada: boolean;
}

export default function Notas() {
  const { empresa, pode } = useAuth();
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [grupo, setGrupo] = useState("todos");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";
  const q = exId ? `?exercicio_id=${exId}` : "";

  const { data, isLoading, mutate } = useSWR<Nota[]>(
    `/api/relatorios/notas${q}`,
    buscador,
  );

  const visiveis = (data ?? []).filter(
    (n) => grupo === "todos" || n.grupo === grupo,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Notas às Contas"
        descricao="Composição de cada rubrica do Balanço e da Demonstração de Resultados."
        accoes={data && <Selo cor="#3d7fe0">{data.length} notas</Selo>}
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
          rotulo="Grupo"
          valor={grupo}
          aoMudar={setGrupo}
          opcoes={[
            { valor: "todos", rotulo: "Todas as notas" },
            { valor: "BL", rotulo: "Balanço" },
            { valor: "DR", rotulo: "Demonstração de Resultados" },
          ]}
          larguraMinima="16rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">Não foi possível carregar as notas.</Alerta>
      ) : (
        <Cartao className="p-0">
          <Accordion.Root type="multiple" className="min-w-0">
            {visiveis.map((n) => (
              <ItemNota
                key={n.n}
                nota={n}
                moeda={moeda}
                exercicioId={exId}
                podeEditar={pode("contab.lancar")}
                aoGravar={() => mutate()}
              />
            ))}
          </Accordion.Root>
        </Cartao>
      )}
    </>
  );
}

function ItemNota({
  nota,
  moeda,
  exercicioId,
  podeEditar,
  aoGravar,
}: {
  nota: Nota;
  moeda: string;
  exercicioId?: string;
  podeEditar: boolean;
  aoGravar: () => void;
}) {
  const [aEditar, setAEditar] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const conteudo = nota.narrativa ? nota.texto : nota.analise;
  const q = exercicioId ? `?exercicio_id=${exercicioId}` : "";

  async function gravar() {
    setOcupado(true);
    setErro(null);
    try {
      await api.put(`/api/relatorios/notas/${nota.n}${q}`, { texto });
      setAEditar(false);
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function repor() {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/relatorios/notas/${nota.n}${q}`);
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.mensagemUtilizador : "Não foi possível repor.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Accordion.Item
      value={String(nota.n)}
      className="border-b border-borda last:border-b-0"
    >
      <Accordion.Header>
        <Accordion.Trigger className="group flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-superficie-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-[12px] font-extrabold text-marca">
            {nota.n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">
              {nota.titulo}
            </span>
            <span className="block text-[11.5px] text-texto-suave">
              {nota.grupo === "BL" ? "Balanço" : "Demonstração de Resultados"}
              {nota.editada && " · texto editado"}
            </span>
          </span>
          {!nota.narrativa && (
            <span className="shrink-0 text-sm font-bold tabular">
              {formataMoeda(nota.total, moeda)}
            </span>
          )}
          <ChevronDown
            size={16}
            className="shrink-0 text-texto-suave transition-transform group-data-[state=open]:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content className="overflow-hidden">
        <div className="min-w-0 border-t border-borda bg-superficie-2/40 px-4 py-4">
          {nota.rubricas.length > 0 && (
            <div className="mb-4 min-w-0 overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-borda bg-superficie-2 px-3 py-2 text-left text-[11.5px] uppercase tracking-[0.4px] text-texto-suave">
                      Conta
                    </th>
                    <th className="border-b border-borda bg-superficie-2 px-3 py-2 text-left text-[11.5px] uppercase tracking-[0.4px] text-texto-suave">
                      Designação
                    </th>
                    <th className="border-b border-borda bg-superficie-2 px-3 py-2 text-right text-[11.5px] uppercase tracking-[0.4px] text-texto-suave">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {nota.rubricas.map((r) => (
                    <tr
                      key={`${r.codigo}-${r.nome}`}
                      className="border-b border-borda last:border-b-0"
                    >
                      <td className="px-3 py-2 tabular font-semibold">
                        {r.codigo || "—"}
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2">
                        {r.nome}
                        {r.amort && (
                          <span className="ml-2 text-[11px] text-texto-suave">
                            (a deduzir)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {formataMoeda(r.valor, moeda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-superficie-2 font-extrabold">
                    <td colSpan={2} className="px-3 py-2">
                      TOTAL
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {formataMoeda(nota.total, moeda)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {aEditar ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={6}
                className="w-full min-w-0 rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-sm text-texto focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/25"
              />
              {erro && <Alerta tipo="erro">{erro}</Alerta>}
              <div className="flex flex-wrap gap-2">
                <Botao
                  variante="primario"
                  tamanho="pequeno"
                  onClick={gravar}
                  disabled={ocupado}
                >
                  Gravar texto
                </Botao>
                <Botao tamanho="pequeno" onClick={() => setAEditar(false)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            <>
              {conteudo ? (
                <p className="text-[13.5px] leading-relaxed text-texto-suave">
                  {conteudo}
                </p>
              ) : (
                <p className="text-[13.5px] italic text-texto-suave">
                  Sem valores nesta rubrica no exercício.
                </p>
              )}

              {podeEditar && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Botao
                    tamanho="pequeno"
                    onClick={() => {
                      setTexto(conteudo ?? "");
                      setAEditar(true);
                    }}
                  >
                    <Pencil size={13} />
                    Editar texto
                  </Botao>
                  {/* Só faz sentido repor quando há um texto manual a
                      substituir o automático. */}
                  {nota.editada && (
                    <Botao tamanho="pequeno" onClick={repor} disabled={ocupado}>
                      <RotateCcw size={13} />
                      Repor automático
                    </Botao>
                  )}
                </div>
              )}
              {erro && <Alerta tipo="erro">{erro}</Alerta>}
            </>
          )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
