"use client";

import { CheckCircle2, Plus, Search, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { AlertDialog, Tabs } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { FormularioCompra } from "@/components/logistica/FormularioCompra";
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
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Compra, ResumoCompras } from "@/types";

export default function Compras() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";

  const [aba, setAba] = useState("lancamento");
  const [estado, setEstado] = useState("todos");
  const [procura, setProcura] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [aEmitir, setAEmitir] = useState<Compra | null>(null);
  const [aEliminar, setAEliminar] = useState<Compra | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: fornecedores } = useSWR<{ id: string; nome: string }[]>(
    "/api/compras/fornecedores",
    buscador,
    { revalidateOnFocus: false },
  );
  const p = usePaginacao();

  // O SEPARADOR MANDA NO PEDIDO. «Lançamento» é a bancada de trabalho: só os
  // rascunhos, o que está por confirmar. «Consultas» é o arquivo: tudo, com os
  // filtros todos. Era isto que faltava — uma lista só, com um filtro de
  // estado, obrigava a procurar o trabalho de hoje no meio do histórico.
  const emLancamento = aba === "lancamento";
  const filtros = new URLSearchParams(p.query);
  if (emLancamento) {
    filtros.set("estado", "rascunho");
  } else {
    if (estado !== "todos") filtros.set("estado", estado);
    if (fornecedorId) filtros.set("fornecedor_id", fornecedorId);
    if (de) filtros.set("de", de);
    if (ate) filtros.set("ate", ate);
    if (valorMin) filtros.set("valor_min", valorMin);
    if (valorMax) filtros.set("valor_max", valorMax);
  }
  if (procura.trim()) filtros.set("procura", procura.trim());
  const chaveDaLista = `/api/compras?${filtros}`;

  function limparFiltros() {
    setProcura("");
    setFornecedorId("");
    setDe("");
    setAte("");
    setValorMin("");
    setValorMax("");
    setEstado("todos");
    p.reiniciar();
  }
  const {
    data: pagina,
    isLoading,
    mutate,
  } = useSWR<Pagina<Compra>>(chaveDaLista, buscador);
  const compras = pagina?.linhas;
  const { data: resumo, mutate: mutateResumo } = useSWR<ResumoCompras>(
    "/api/compras/resumo",
    buscador,
  );

  async function emitir(c: Compra) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.post<{ numero: string; movimentos: number }>(
        `/api/compras/${c.id}/emitir`,
        { exercicio_id: activo?.id },
      );
      setAviso(
        `Compra ${r.numero} emitida — ${r.movimentos} ${r.movimentos === 1 ? "entrada" : "entradas"} em armazém.`,
      );
      mutate();
      mutateResumo();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível emitir.",
      );
    } finally {
      setOcupado(false);
      setAEmitir(null);
    }
  }

  async function eliminar(c: Compra) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/compras/${c.id}`);
      mutate();
      mutateResumo();
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
        titulo="Compras"
        descricao="Documentos de compra. A emissão dá entrada em armazém e contabiliza a factura do fornecedor."
        accoes={
          pode("logistica.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Nova compra
            </Botao>
          )
        }
      />

      {resumo && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Total comprado"
              valor={formataCompacto(resumo.total_compras, moeda)}
              detalhe={`${resumo.n_compras} documentos`}
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Recepcionado"
              valor={formataCompacto(resumo.total_rececionado, moeda)}
              detalhe={`${resumo.n_emitidas} emitidos`}
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Por emitir"
              valor={formataCompacto(resumo.por_emitir, moeda)}
              detalhe="Ainda em rascunho"
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Documentos"
              valor={String(resumo.n_compras)}
              detalhe="Total no sistema"
              cor="var(--grafico-4)"
            />
          </div>
        </div>
      )}

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Os dois separadores do Piloto. */}
      <Tabs.Root
        value={aba}
        onValueChange={(v) => {
          setAba(v);
          p.reiniciar();
        }}
      >
        <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
          {[
            { v: "lancamento", r: "Lançamento" },
            { v: "consultas", r: "Consultas" },
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

      <BarraFiltros className="mb-2">
        <Campo rotulo="Pesquisar" className="min-w-[15rem] flex-1">
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => {
                setProcura(e.target.value);
                p.reiniciar();
              }}
              placeholder="Nº ou fornecedor…"
              className="pl-9"
            />
          </div>
        </Campo>

        {!emLancamento && (
          <>
            <Campo rotulo="De">
              <Entrada
                type="date"
                value={de}
                onChange={(e) => {
                  setDe(e.target.value);
                  p.reiniciar();
                }}
              />
            </Campo>
            <Campo rotulo="Até">
              <Entrada
                type="date"
                value={ate}
                onChange={(e) => {
                  setAte(e.target.value);
                  p.reiniciar();
                }}
              />
            </Campo>
            <Selector
              rotulo="Fornecedor"
              valor={fornecedorId}
              aoMudar={(v) => {
                setFornecedorId(v);
                p.reiniciar();
              }}
              opcoes={[
                { valor: "", rotulo: "Todos" },
                ...(fornecedores ?? []).map((f) => ({
                  valor: f.id,
                  rotulo: f.nome,
                })),
              ]}
              larguraMinima="14rem"
            />
            <Selector
              rotulo="Estado"
              valor={estado}
              aoMudar={(v) => {
                setEstado(v);
                p.reiniciar();
              }}
              opcoes={[
                { valor: "todos", rotulo: "Todos" },
                { valor: "rascunho", rotulo: "Rascunho" },
                { valor: "emitida", rotulo: "Emitida" },
              ]}
              larguraMinima="11rem"
            />
            <Campo rotulo="Valor mín.">
              <Entrada
                type="number"
                min="0"
                value={valorMin}
                onChange={(e) => {
                  setValorMin(e.target.value);
                  p.reiniciar();
                }}
                className="w-[7rem] text-right tabular"
              />
            </Campo>
            <Campo rotulo="Valor máx.">
              <Entrada
                type="number"
                min="0"
                value={valorMax}
                onChange={(e) => {
                  setValorMax(e.target.value);
                  p.reiniciar();
                }}
                className="w-[7rem] text-right tabular"
              />
            </Campo>
            <Botao className="self-end" onClick={limparFiltros}>
              Limpar filtros
            </Botao>
          </>
        )}

        {emLancamento && pode("logistica.gerir") && (
          <>
            <span className="flex-1" />
            <Botao
              comoFilho
              variante="neutro"
              className="self-end"
              title="Diário, documento e contas usados ao emitir uma compra"
            >
              <Link href="/configuracoes?acordeao=parametrizacoes">
                <Settings size={15} />
                Configurações
              </Link>
            </Botao>
          </>
        )}
      </BarraFiltros>

      {/* A frase do Piloto, que explica porque é que esta lista é curta. */}
      <p className="mb-4 text-[13px] text-texto-suave">
        {emLancamento
          ? "Documentos por confirmar (rascunho) — os já emitidos ficam disponíveis em Consultas."
          : "Pesquisa sobre todo o histórico de compras (rascunho e emitidas)."}
      </p>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !compras?.length ? (
          <Vazio>
            {emLancamento
              ? "Sem compras por confirmar."
              : "Nenhuma compra corresponde aos filtros."}
          </Vazio>
        ) : (
          <>
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Documento</Th>
                    <Th>Data</Th>
                    <Th>Fornecedor</Th>
                    <Th numerico>Subtotal</Th>
                    <Th numerico>IVA</Th>
                    <Th numerico>Total</Th>
                    <Th>Estado</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {(compras ?? []).map((c) => (
                    <Tr key={c.id}>
                      <Td className="tabular font-bold">
                        {c.numero ?? (
                          <span className="font-normal italic text-texto-suave">
                            por emitir
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Selo cor="#3d7fe0">{c.documento_codigo}</Selo>
                      </Td>
                      <Td className="tabular">
                        {new Date(c.data).toLocaleDateString("pt-PT")}
                      </Td>
                      <Td className="max-w-[220px] truncate">
                        {c.fornecedor_nome || "—"}
                      </Td>
                      <Td numerico>{formataMoeda(c.subtotal, moeda)}</Td>
                      <Td numerico>{formataMoeda(c.iva, moeda)}</Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(c.total, moeda)}
                      </Td>
                      <Td>
                        <Selo
                          cor={c.estado === "emitida" ? "#1a9c5f" : "#c98a10"}
                        >
                          {c.estado === "emitida" ? "Emitido" : "Rascunho"}
                        </Selo>
                      </Td>
                      <Td numerico>
                        {c.estado === "rascunho" && pode("logistica.gerir") && (
                          <div className="flex justify-end gap-1.5">
                            <Botao
                              tamanho="pequeno"
                              variante="primario"
                              onClick={() => setAEmitir(c)}
                            >
                              <CheckCircle2 size={13} />
                              Emitir
                            </Botao>
                            <Botao
                              tamanho="pequeno"
                              variante="perigo"
                              onClick={() => setAEliminar(c)}
                              aria-label="Eliminar rascunho"
                            >
                              <Trash2 size={13} />
                            </Botao>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <BarraPaginacao
              pagina={pagina}
              {...p.controlos}
              nome="documentos"
            />
          </>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioCompra
          aoFechar={() => setNovoAberto(false)}
          aoGravar={() => {
            setNovoAberto(false);
            mutate();
            mutateResumo();
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aEmitir}
        onOpenChange={(a) => !a && setAEmitir(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Emitir compra de {formataMoeda(aEmitir?.total ?? "0", moeda)}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              Cada linha dá entrada em armazém ao preço indicado, o que
              recalcula o Custo Médio Ponderado dos artigos, e a factura do
              fornecedor é contabilizada. Depois de emitida, a compra não pode
              ser eliminada.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="primario"
                  disabled={ocupado}
                  onClick={() => aEmitir && emitir(aEmitir)}
                >
                  {ocupado ? "A emitir…" : "Emitir compra"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={!!aEliminar}
        onOpenChange={(a) => !a && setAEliminar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Eliminar este rascunho?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              A compra ainda não deu entrada em armazém nem foi contabilizada,
              por isso não deixa rasto. Esta acção não se desfaz.
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
                  Eliminar
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
