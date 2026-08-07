"use client";

import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { FormularioCompra } from "@/components/logistica/FormularioCompra";
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
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Compra, ResumoCompras } from "@/types";

export default function Compras() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";

  const [estado, setEstado] = useState("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [aEmitir, setAEmitir] = useState<Compra | null>(null);
  const [aEliminar, setAEliminar] = useState<Compra | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const {
    data: compras,
    isLoading,
    mutate,
  } = useSWR<Compra[]>(
    `/api/compras${estado !== "todos" ? `?estado=${estado}` : ""}`,
    buscador,
  );
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

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Estado"
          valor={estado}
          aoMudar={setEstado}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "rascunho", rotulo: "Rascunhos" },
            { valor: "emitida", rotulo: "Emitidos" },
          ]}
          larguraMinima="12rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !compras?.length ? (
          <Vazio>Sem documentos de compra.</Vazio>
        ) : (
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
                {compras.map((c) => (
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
