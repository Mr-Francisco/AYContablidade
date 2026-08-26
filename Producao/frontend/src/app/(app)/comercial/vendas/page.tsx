"use client";

import { CheckCircle2, Plus, Search, Trash2 } from "lucide-react";
import { AlertDialog, Tabs } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";
import { GrelhaKpis } from "@/components/painel";
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
import { CampoEntidade, type Registo } from "@/components/ui/CampoEntidade";
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { ResumoComercial, Terceiro, Venda } from "@/types";

import { FormularioVenda } from "./FormularioVenda";

const CORES_ESTADO: Record<string, string> = {
  rascunho: "#c98a10",
  emitida: "#1a9c5f",
};

export default function Vendas() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";

  /* DOIS SEPARADORES, e não uma lista com um botão que abre uma janela.
     Emitir uma factura e consultar as que já se emitiram são dois trabalhos
     diferentes, com ecrãs diferentes: um preenche-se, o outro percorre-se.
     Estavam ambos na mesma página, e o segundo abria-se por um postigo a meio
     do ecrã com a lista a competir por trás. */
  const [aba, setAba] = useState("consulta");

  const [estado, setEstado] = useState("todos");
  const [procura, setProcura] = useState("");
  const [tipoDoc, setTipoDoc] = useState("todos");
  /** O cliente escolhido por F4 — filtra pelo `id` e não pelo nome escrito. */
  const [cliente, setCliente] = useState<Registo | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [aEmitir, setAEmitir] = useState<Venda | null>(null);
  const [aEliminar, setAEliminar] = useState<Venda | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = usePaginacao();
  // Procura e tipo VÃO AO SERVIDOR. O Piloto filtra em memória porque tem
  // tudo em memória; aqui a lista vem paginada, e filtrar o que já veio
  // procurava dentro de vinte e cinco linhas.
  const chave = `/api/comercial/vendas?${p.query}${
    estado !== "todos" ? `&estado=${estado}` : ""
  }${tipoDoc !== "todos" ? `&tipo_doc=${encodeURIComponent(tipoDoc)}` : ""}${
    procura.trim() ? `&procura=${encodeURIComponent(procura.trim())}` : ""
  }${cliente ? `&cliente_id=${cliente.id}` : ""}${de ? `&de=${de}` : ""}${
    ate ? `&ate=${ate}` : ""
  }`;
  const {
    data: pagina,
    isLoading,
    mutate,
  } = useSWR<Pagina<Venda>>(chave, buscador);
  const vendas = pagina?.linhas;
  const { data: tipos } = useSWR<{ cod: string; nome: string }[]>(
    "/api/comercial/tipos-documento",
    buscador,
    { revalidateOnFocus: false },
  );
  const { data: resumo, mutate: mutateResumo } = useSWR<ResumoComercial>(
    "/api/comercial/resumo",
    buscador,
  );

  async function emitir(v: Venda) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.post<{
        numero: string;
        codigo_validacao?: string;
        avisos_stock: string[];
      }>(`/api/comercial/vendas/${v.id}/emitir`, {
        exercicio_id: activo?.id,
      });
      // Os avisos de stock NÃO impedem a emissão: o documento já está numerado
      // e não pode ser desfeito. Mostram-se para o utilizador corrigir depois.
      setAviso(
        r.avisos_stock.length
          ? `Documento ${r.numero} emitido, mas com avisos no stock: ${r.avisos_stock.join(" · ")}`
          : `Documento ${r.numero} emitido${r.codigo_validacao ? ` — código de validação ${r.codigo_validacao}` : ""}.`,
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

  async function eliminar(v: Venda) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/comercial/vendas/${v.id}`);
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

  const kz = (v: string) => formataMoeda(v, moeda, 0);
  // O Piloto conta os clientes no KPI; a lista já é pedida noutro lado, o SWR
  // devolve a mesma resposta sem novo pedido.
  const { data: clientes } = useSWR<Terceiro[]>(
    "/api/comercial/clientes",
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Vendas"
        descricao="Documentos do Regime Jurídico das Facturas (Decreto Presidencial n.º 71/25)."
      />

      {/* OS INDICADORES FICAM NOS DOIS SEPARADORES. São o retrato do mês, e
          quem está a emitir uma factura também quer saber quanto já facturou —
          foi o que o cliente disse: «aquele dashboard pode deixar da maneira
          que está». */}
      <GrelhaKpis>
        <Kpi
          rotulo="Faturado (emitido)"
          valor={kz(resumo?.total_faturado ?? "0")}
          detalhe={plural(resumo?.n_faturadas ?? 0, "documento")}
          cor="#16a085"
        />
        <Kpi
          rotulo="Por emitir"
          valor={kz(resumo?.por_faturar ?? "0")}
          detalhe={plural(
            (resumo?.n_vendas ?? 0) - (resumo?.n_faturadas ?? 0),
            "rascunho",
          )}
          cor="var(--grafico-1)"
        />
        <Kpi
          rotulo="Total"
          valor={kz(resumo?.total_vendas ?? "0")}
          detalhe={plural(resumo?.n_vendas ?? 0, "documento")}
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Clientes"
          valor={String(clientes?.length ?? 0)}
          cor="var(--color-azul)"
        />
      </GrelhaKpis>

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Tabs.Root value={aba} onValueChange={setAba}>
        <Tabs.List className="mb-4 flex gap-1 border-b border-borda">
          {[
            { valor: "consulta", rotulo: "Consulta" },
            { valor: "emitir", rotulo: "Emitir documento" },
          ].map((t) => (
            <Tabs.Trigger
              key={t.valor}
              value={t.valor}
              className="relative -mb-px whitespace-nowrap px-4 py-2.5 text-sm font-semibold text-texto-suave transition-colors hover:text-marca data-[state=active]:text-marca data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-[3px] data-[state=active]:after:rounded-full data-[state=active]:after:bg-marca data-[state=active]:after:content-['']"
            >
              {t.rotulo}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="consulta">
          <BarraFiltros className="mb-4">
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
                  placeholder="Nº, cliente ou código…"
                  className="pl-9"
                />
              </div>
            </Campo>
            <Selector
              rotulo="Tipo"
              valor={tipoDoc}
              aoMudar={(v) => {
                setTipoDoc(v);
                p.reiniciar();
              }}
              opcoes={[
                { valor: "todos", rotulo: "Todos os tipos" },
                ...(tipos ?? []).map((td) => ({
                  valor: td.cod,
                  rotulo: `${td.cod} — ${td.nome}`,
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
                { valor: "rascunho", rotulo: "Rascunhos" },
                { valor: "emitida", rotulo: "Emitidos" },
              ]}
              larguraMinima="12rem"
            />
            {/* POR CLIENTE, com F4 e não escrevendo o nome. Filtra pelo registo e
            não pelo texto: dois clientes com nomes parecidos deixam de se
            misturar, e quem não sabe o nome de cor procura na tabela. */}
            <Campo rotulo="Cliente" className="min-w-[16rem]">
              <CampoEntidade
                valor={cliente}
                aoEscolher={(r) => {
                  setCliente(r);
                  p.reiniciar();
                }}
                fonte="/api/comercial/clientes/tabela"
                titulo="Clientes"
                placeholder="Todos os clientes (F4)"
                colunas={["Nº", "Nome", "NIF"]}
              />
            </Campo>
            {/* POR DATA DO DOCUMENTO. Quem procura «as facturas de Março» quer as
            que TÊM data de Março, mesmo que tenham sido lançadas em Abril. Os
            dois limites contam. */}
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
            {pode("comercial.gerir") && (
              <Botao variante="acento" onClick={() => setAba("emitir")}>
                <Plus size={16} />
                Emitir documento
              </Botao>
            )}
          </BarraFiltros>

          <Cartao className="p-0">
            {isLoading ? (
              <ACarregar />
            ) : !vendas?.length ? (
              <Vazio>Sem documentos de venda.</Vazio>
            ) : (
              <>
                <EnvolveTabela className="rounded-none border-0">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Número</Th>
                        <Th>Tipo</Th>
                        <Th>Data</Th>
                        <Th>Cliente</Th>
                        <Th numerico>Incidência</Th>
                        <Th numerico>IVA</Th>
                        <Th numerico>Total</Th>
                        <Th>Estado</Th>
                        <Th>Nº Operação</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {(vendas ?? []).map((v) => (
                        <Tr key={v.id}>
                          <Td className="tabular font-bold">
                            {v.numero ?? (
                              <span className="font-normal italic text-texto-suave">
                                por emitir
                              </span>
                            )}
                          </Td>
                          <Td>
                            <Selo cor="#3d7fe0">{v.tipo_doc}</Selo>
                          </Td>
                          <Td className="tabular">
                            {new Date(v.data).toLocaleDateString("pt-PT")}
                          </Td>
                          <Td className="max-w-[220px] truncate">
                            {v.cliente_nome || (
                              <span className="text-texto-suave">
                                Consumidor final
                              </span>
                            )}
                          </Td>
                          <Td numerico>{formataMoeda(v.subtotal, moeda)}</Td>
                          <Td numerico>{formataMoeda(v.iva, moeda)}</Td>
                          <Td numerico className="font-semibold">
                            {formataMoeda(v.total, moeda)}
                          </Td>
                          <Td>
                            <Selo cor={CORES_ESTADO[v.estado] ?? "#62657a"}>
                              {v.estado === "emitida" ? "Emitido" : "Rascunho"}
                            </Selo>
                          </Td>
                          <Td className="tabular text-texto-suave">
                            {v.numero_op ?? "—"}
                          </Td>
                          <Td numerico>
                            {v.estado === "rascunho" &&
                              pode("comercial.gerir") && (
                                <div className="flex justify-end gap-1.5">
                                  <Botao
                                    tamanho="pequeno"
                                    variante="primario"
                                    onClick={() => setAEmitir(v)}
                                  >
                                    <CheckCircle2 size={13} />
                                    Emitir
                                  </Botao>
                                  <Botao
                                    tamanho="pequeno"
                                    variante="perigo"
                                    onClick={() => setAEliminar(v)}
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
        </Tabs.Content>

        {/* EMITIR — o formulário inteiro, dentro da página.
            Gravado, salta-se para a consulta com o documento novo já na lista:
            é o que se quer ver a seguir, e ficar no formulário vazio parecia
            que nada tinha acontecido. */}
        <Tabs.Content value="emitir">
          {pode("comercial.gerir") ? (
            <FormularioVenda
              emPagina
              aoFechar={() => setAba("consulta")}
              aoGravar={() => {
                setAba("consulta");
                p.reiniciar();
                mutate();
                mutateResumo();
                setAviso("Rascunho gravado. Emita-o quando estiver conferido.");
              }}
            />
          ) : (
            <Cartao>
              <Vazio>
                Não tem permissão para emitir documentos de venda. Fale com quem
                administra a empresa.
              </Vazio>
            </Cartao>
          )}
        </Tabs.Content>
      </Tabs.Root>

      <AlertDialog.Root
        open={!!aEmitir}
        onOpenChange={(a) => !a && setAEmitir(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(500px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Emitir {aEmitir?.tipo_doc} de{" "}
              {formataMoeda(aEmitir?.total ?? "0", moeda)}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              O documento recebe o número sequencial definitivo e é lançado na
              contabilidade. Um documento emitido não pode ser eliminado nem
              renumerado — para o corrigir, emite-se uma nota de crédito.
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
                  {ocupado ? "A emitir…" : "Emitir documento"}
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
              O documento ainda não foi emitido nem contabilizado, por isso não
              deixa rasto. Esta acção não se desfaz.
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
