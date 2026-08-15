"use client";

import { Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useDeferredValue, useState } from "react";
import useSWR from "swr";
import { SelectorDeCliente } from "@/components/comercial/SelectorDeCliente";
import { GrelhaKpis } from "@/components/painel";
import {
  ACarregar,
  BarraFiltros,
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
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { numeroLimpo } from "@/lib/texto";
import type { TipoDocumento, Venda } from "@/types";

/**
 * A resposta da listagem de vendas.
 *
 * Os `totais` são do conjunto filtrado inteiro e não da página: os quatro
 * indicadores no topo contam o que o filtro apanhou, e contar só as
 * vinte e cinco linhas à vista seria dar um número errado com ar de certo.
 */
interface PaginaVendas extends Pagina<Venda> {
  totais: { total: string; iva: string; clientes: number };
}

export default function ConsultaFaturas() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [clienteId, setClienteId] = useState("");
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const procuraAdiada = useDeferredValue(procura);

  const { data: tipos } = useSWR<TipoDocumento[]>(
    "/api/comercial/tipos-documento",
    buscador,
    { revalidateOnFocus: false },
  );
  // Só documentos emitidos: um rascunho não é uma factura.
  //
  // O FILTRO É DO SERVIDOR e não do cliente. Antes vinham quinhentas facturas
  // e filtravam-se aqui: quem tivesse mais do que quinhentas procurava dentro
  // das quinhentas mais recentes e não sabia. Agora procura-se em todas, e o
  // que volta é uma página.
  const p = usePaginacao();
  const chave = `/api/comercial/vendas?estado=emitida&${p.query}${
    tipo !== "todos" ? `&tipo_doc=${encodeURIComponent(tipo)}` : ""
  }${clienteId ? `&cliente_id=${clienteId}` : ""}${procuraAdiada.trim() ? `&procura=${encodeURIComponent(procuraAdiada.trim())}` : ""}`;
  const { data: pagina, isLoading } = useSWR<PaginaVendas>(chave, buscador);
  const visiveis = pagina?.linhas ?? [];

  return (
    <>
      <CabecalhoPagina
        titulo="Consulta de Facturas"
        descricao="Documentos emitidos. Procure por número, cliente, código de validação ou nº de operação."
      />

      {/* Os quatro do Piloto: contam sempre o QUE ESTÁ FILTRADO, não o total —
          é o que faz do filtro uma ferramenta de análise e não só de procura. */}
      <GrelhaKpis>
        <Kpi
          rotulo="Documentos"
          valor={String(pagina?.total ?? 0)}
          detalhe="emitidos (filtro)"
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Total faturado"
          valor={formataMoeda(pagina?.totais.total ?? "0", moeda, 0)}
          cor="#16a085"
        />
        <Kpi
          rotulo="Total IVA"
          valor={formataMoeda(pagina?.totais.iva ?? "0", moeda, 0)}
          detalhe="liquidado"
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Clientes"
          valor={String(pagina?.totais.clientes ?? 0)}
          detalhe="distintos"
          cor="var(--grafico-1)"
        />
      </GrelhaKpis>

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[260px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              // Reiniciar aqui e não num efeito: ficar na página 3 de um
              // conjunto que a pesquisa reduziu a meia dúzia de linhas dá uma
              // lista vazia sem explicação nenhuma.
              onChange={(e) => {
                setProcura(e.target.value);
                p.reiniciar();
              }}
              placeholder="FT 2026/0001, cliente, código…"
              className="pl-9"
            />
          </div>
        </Campo>
        {/* Selector com procura, e não uma caixa de opções: numa empresa com
            quatrocentos clientes, a caixa obriga a rolar uma lista que não se
            pode filtrar. */}
        <SelectorDeCliente
          valor={clienteId}
          aoMudar={(id) => {
            setClienteId(id);
            p.reiniciar();
          }}
        />
        <Selector
          rotulo="Tipo"
          valor={tipo}
          aoMudar={(v) => {
            setTipo(v);
            p.reiniciar();
          }}
          opcoes={[
            { valor: "todos", rotulo: "Todos os tipos" },
            ...(tipos ?? []).map((t) => ({
              valor: t.cod,
              rotulo: `${t.cod} — ${t.nome}`,
            })),
          ]}
          larguraMinima="16rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : visiveis.length === 0 ? (
          <Vazio>
            {procura.trim()
              ? "Nenhum documento corresponde à pesquisa."
              : "Ainda não há documentos emitidos."}
          </Vazio>
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
                    <Th numerico>Total</Th>
                    <Th>Cód. validação</Th>
                    <Th>Nº Operação</Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((v) => (
                    <Tr
                      key={v.id}
                      className="cursor-pointer"
                      onClick={() => setDetalhe(v.id)}
                    >
                      <Td className="tabular font-bold">{v.numero}</Td>
                      <Td>
                        <Selo cor="#3d7fe0">{v.tipo_doc}</Selo>
                      </Td>
                      <Td className="tabular">
                        {new Date(v.data).toLocaleDateString("pt-PT")}
                      </Td>
                      <Td className="max-w-[240px] truncate">
                        {v.cliente_nome || (
                          <span className="text-texto-suave">
                            Consumidor final
                          </span>
                        )}
                      </Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(v.total, moeda)}
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {v.codigo_validacao ?? "—"}
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {v.numero_op ?? "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <BarraPaginacao pagina={pagina} {...p.controlos} nome="facturas" />
          </>
        )}
      </Cartao>

      {detalhe && (
        <DetalheFactura
          id={detalhe}
          moeda={moeda}
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </>
  );
}

function DetalheFactura({
  id,
  moeda,
  aoFechar,
}: {
  id: string;
  moeda: string;
  aoFechar: () => void;
}) {
  const { data, isLoading } = useSWR<Venda>(
    `/api/comercial/vendas/${id}`,
    buscador,
  );

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(820px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="truncate text-[15px] font-bold">
              {data?.tipo_doc} {data?.numero}
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
                  <Info rotulo="Cliente">
                    {data.cliente_nome || "Consumidor final"}
                  </Info>
                  <Info rotulo="Natureza">
                    {data.tipo === "servicos" ? "Serviços" : "Mercadorias"}
                  </Info>
                  <Info rotulo="Nº Operação">{data.numero_op ?? "—"}</Info>
                  <Info rotulo="Código de validação">
                    {data.codigo_validacao ?? "—"}
                  </Info>
                  <Info rotulo="Taxa de IVA">{data.iva_perc ?? "0"} %</Info>
                  <Info rotulo="Emitido em">
                    {data.emitido_em
                      ? new Date(data.emitido_em).toLocaleString("pt-PT")
                      : "—"}
                  </Info>
                  <Info rotulo="Estado">
                    {data.estado === "emitida" ? "Emitido" : "Rascunho"}
                  </Info>
                </dl>

                <EnvolveTabela>
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Descrição</Th>
                        <Th>Un.</Th>
                        <Th numerico>Qtd.</Th>
                        <Th numerico>Preço</Th>
                        <Th numerico>Total</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.linhas?.map((l) => (
                        <Tr key={l.ordem}>
                          <Td className="max-w-[320px] truncate">
                            {l.descricao || "—"}
                          </Td>
                          <Td className="text-texto-suave">
                            {l.unidade || "—"}
                          </Td>
                          <Td numerico>{numeroLimpo(l.qtd)}</Td>
                          <Td numerico>{formataMoeda(l.preco, moeda)}</Td>
                          <Td numerico className="font-semibold">
                            {formataMoeda(l.total, moeda)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <Td colSpan={4} className="text-right text-texto-suave">
                          Subtotal
                        </Td>
                        <Td numerico>{formataMoeda(data.subtotal, moeda)}</Td>
                      </tr>
                      <tr>
                        <Td colSpan={4} className="text-right text-texto-suave">
                          IVA
                        </Td>
                        <Td numerico>{formataMoeda(data.iva, moeda)}</Td>
                      </tr>
                      <tr className="bg-superficie-2 font-extrabold">
                        <Td colSpan={4} className="text-right">
                          TOTAL
                        </Td>
                        <Td numerico>{formataMoeda(data.total, moeda)}</Td>
                      </tr>
                    </tfoot>
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
