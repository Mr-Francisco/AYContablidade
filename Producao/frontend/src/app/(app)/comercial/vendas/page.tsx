"use client";

import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

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
import { RodapeHistorico, useHistorico } from "@/components/ui/Historico";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { ResumoComercial, Venda } from "@/types";

import { FormularioVenda } from "./FormularioVenda";

const CORES_ESTADO: Record<string, string> = {
  rascunho: "#c98a10",
  emitida: "#1a9c5f",
};

/** O que se pede ao servidor. Quando a resposta vem com este tamanho
 *  exacto, é sinal de que foi cortada — e o rodapé diz que pode haver mais,
 *  em vez de apresentar um total que não é o total. */
const LIMITE_PEDIDO = 1000;

export default function Vendas() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";

  const [estado, setEstado] = useState("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [aEmitir, setAEmitir] = useState<Venda | null>(null);
  const [aEliminar, setAEliminar] = useState<Venda | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const chave = `/api/comercial/vendas?limite=${LIMITE_PEDIDO}${
    estado !== "todos" ? `&estado=${estado}` : ""
  }`;
  const { data: vendas, isLoading, mutate } = useSWR<Venda[]>(chave, buscador);
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

  const historico = useHistorico(vendas);

  return (
    <>
      <CabecalhoPagina
        titulo="Vendas"
        descricao="Documentos do Regime Jurídico das Facturas (Decreto Presidencial n.º 71/25)."
        accoes={
          pode("comercial.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo documento
            </Botao>
          )
        }
      />

      {resumo && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Total facturado"
              valor={formataCompacto(resumo.total_faturado, moeda)}
              detalhe={`${resumo.n_faturadas} documentos emitidos`}
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Por facturar"
              valor={formataCompacto(resumo.por_faturar, moeda)}
              detalhe="Em rascunho"
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Documentos"
              valor={String(resumo.n_vendas)}
              detalhe="Total no sistema"
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Valor total"
              valor={formataCompacto(resumo.total_vendas, moeda)}
              detalhe="Emitidos e rascunhos"
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
                    <Th numerico>Subtotal</Th>
                    <Th numerico>IVA</Th>
                    <Th numerico>Total</Th>
                    <Th>Estado</Th>
                    <Th>Nº Operação</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {historico.visiveis.map((v) => (
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
                        {v.estado === "rascunho" && pode("comercial.gerir") && (
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
            <RodapeHistorico
              {...historico}
              truncadoNoServidor={(vendas?.length ?? 0) >= LIMITE_PEDIDO}
              nome="documentos"
            />
          </>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioVenda
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
