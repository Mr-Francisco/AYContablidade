"use client";

import { Hammer, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  BarraProgresso,
  FichaAtivo,
} from "@/components/imobilizados/FichaAtivo";
import { ObraEmCurso } from "@/components/imobilizados/ObraEmCurso";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
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
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import { numeroLimpo } from "@/lib/texto";
import type { Ativo } from "@/types";

export default function Ativos() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [estado, setEstado] = useState("todos");
  const [aEditar, setAEditar] = useState<Ativo | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [aEliminar, setAEliminar] = useState<Ativo | null>(null);
  /** A obra em curso aberta, com os seus itens e o botão de fecho. */
  const [obra, setObra] = useState<Ativo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, mutate } = useSWR<Ativo[]>(
    "/api/imobilizados/ativos",
    buscador,
  );

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data ?? []).filter((a) => {
      if (estado !== "todos" && a.estado !== estado) return false;
      if (!t) return true;
      return (
        a.designacao.toLowerCase().includes(t) ||
        a.codigo.toLowerCase().includes(t) ||
        (a.fornecedor ?? "").toLowerCase().includes(t)
      );
    });
  }, [data, procura, estado]);

  const totais = useMemo(
    () => ({
      bruto: soma(...filtrados.map((a) => a.valor_aquisicao)),
      acumulada: soma(...filtrados.map((a) => a.amort_acumulada)),
      liquido: soma(...filtrados.map((a) => a.valor_liquido)),
    }),
    [filtrados],
  );

  async function eliminar(a: Ativo) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/imobilizados/ativos/${a.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAEliminar(null);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Ficha de Ativos"
        descricao="Bens do imobilizado, com valor de aquisição, amortização acumulada e valor líquido."
        accoes={
          pode("imob.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo activo
            </Botao>
          )
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Valor de aquisição"
            valor={formataCompacto(totais.bruto, moeda)}
            detalhe={`${filtrados.length} activos`}
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Amortização acumulada"
            valor={formataCompacto(totais.acumulada, moeda)}
            detalhe="Já reconhecida em custos"
            cor="var(--grafico-4)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Valor líquido"
            valor={formataCompacto(totais.liquido, moeda)}
            detalhe="Por amortizar"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Abatidos"
            valor={String(
              (data ?? []).filter((a) => a.estado === "abatido").length,
            )}
            detalhe="Deixam de amortizar"
            cor="var(--grafico-2)"
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[240px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Designação, código ou fornecedor…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Estado"
          valor={estado}
          aoMudar={setEstado}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "activo", rotulo: "Activos" },
            { valor: "abatido", rotulo: "Abatidos" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !filtrados.length ? (
          <Vazio>
            {procura.trim() || estado !== "todos"
              ? "Nenhum activo corresponde aos filtros."
              : "Ainda não há activos registados."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Designação</Th>
                  <Th>Aquisição</Th>
                  <Th numerico>Valor bruto</Th>
                  <Th numerico>Taxa</Th>
                  <Th>Método</Th>
                  <Th numerico>Amort. acum.</Th>
                  <Th numerico>Valor líquido</Th>
                  <Th>Amortizado</Th>
                  <Th>Estado</Th>
                  {pode("imob.gerir") && <Th />}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <Tr key={a.id}>
                    <Td className="tabular font-bold">{a.codigo}</Td>
                    <Td className="max-w-[240px] truncate font-semibold">
                      {a.designacao}
                    </Td>
                    <Td className="tabular">
                      {a.data_aquisicao
                        ? new Date(a.data_aquisicao).toLocaleDateString("pt-PT")
                        : "—"}
                    </Td>
                    <Td numerico>{formataMoeda(a.valor_aquisicao, moeda)}</Td>
                    <Td numerico>{numeroLimpo(a.taxa)} %</Td>
                    <Td className="text-texto-suave">
                      {a.metodo === "degressivas"
                        ? "Quotas decrescentes"
                        : "Quotas constantes"}
                    </Td>
                    <Td numerico>{formataMoeda(a.amort_acumulada, moeda)}</Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(a.valor_liquido, moeda)}
                    </Td>
                    <Td>
                      <BarraProgresso valor={a.percent_amortizado} />
                    </Td>
                    <Td>
                      {/* EM CURSO GANHA AO ESTADO. Um activo em curso está
                          «activo», mas o que interessa saber ao correr a lista
                          é que ainda não é património e não amortiza. */}
                      {a.em_curso ? (
                        <Selo cor="#c98a10">Em curso</Selo>
                      ) : (
                        <Selo
                          cor={a.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {a.estado === "activo" ? "Activo" : "Abatido"}
                        </Selo>
                      )}
                    </Td>
                    {pode("imob.gerir") && (
                      <Td numerico>
                        <div className="flex justify-end gap-1.5">
                          {a.em_curso && (
                            <Botao
                              tamanho="pequeno"
                              variante="neutro"
                              onClick={() => setObra(a)}
                              aria-label={`Itens da obra ${a.designacao}`}
                              title="Custos da obra, e fecho"
                            >
                              <Hammer size={13} />
                            </Botao>
                          )}
                          <Botao
                            tamanho="pequeno"
                            onClick={() => setAEditar(a)}
                            aria-label={`Editar ${a.designacao}`}
                          >
                            <Pencil size={13} />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            variante="perigo"
                            onClick={() => setAEliminar(a)}
                            aria-label={`Eliminar ${a.designacao}`}
                          >
                            <Trash2 size={13} />
                          </Botao>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {obra && (
        <ObraEmCurso
          ativo={obra}
          moeda={moeda}
          podeGerir={pode("imob.gerir")}
          aoFechar={() => setObra(null)}
          aoMudar={() => {
            // A obra fechou: a linha da listagem passa a mostrar «Activo» e o
            // valor de aquisição passa a ser o acumulado.
            setObra(null);
            mutate();
          }}
        />
      )}

      {(novoAberto || aEditar) && (
        <FichaAtivo
          ativo={aEditar}
          aoFechar={() => {
            setNovoAberto(false);
            setAEditar(null);
          }}
          aoGravar={() => {
            setNovoAberto(false);
            setAEditar(null);
            mutate();
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aEliminar}
        onOpenChange={(a) => !a && setAEliminar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Eliminar {aEliminar?.designacao}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              A ficha desaparece, mas as amortizações já lançadas na
              contabilidade ficam — são documentos de exercícios que podem já
              estar fechados. Se o bem foi vendido ou deixou de existir, o
              correcto é passá-lo a <b>abatido</b>: deixa de amortizar e o
              histórico mantém-se legível.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => aEliminar && eliminar(aEliminar)}
                >
                  Eliminar mesmo assim
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
