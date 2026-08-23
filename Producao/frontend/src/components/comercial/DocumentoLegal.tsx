"use client";

import { Printer, X } from "lucide-react";
import { Dialog } from "radix-ui";
import useSWR from "swr";
import { ExtractoDoRecibo } from "@/components/comercial/ExtractoDoRecibo";
import { Botao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formata, formataMoeda } from "@/lib/dinheiro";
import { valorPorExtenso } from "@/lib/extenso";

/**
 * O documento legal — factura, nota de crédito, recibo — como se imprime.
 *
 * O LAYOUT É O DO PILOTO (`assets/js/fatura-doc.js` + `.doc-legal` no
 * `style.css`), bloco a bloco: cabeçalho com a empresa à esquerda e o tipo de
 * documento à direita, cliente e metadados, tabela de linhas, resumo de
 * impostos ao lado dos totais, valor por extenso, dados de pagamento, e o
 * rodapé legal com o código de validação.
 *
 * O QUE MELHOROU, e só isto:
 *
 * 1. **O código impresso é o verdadeiro.** O Piloto imprimia um `hash` djb2 do
 *    número com o total — um código que parecia oficial e não era. Aqui é o
 *    `hash_controlo`, tirado da cadeia de resumos: quatro caracteres que
 *    conferem contra o sistema e mudam se o documento for alterado.
 * 2. **Fundo branco sempre.** O Piloto já o fazia; mantém-se, porque um
 *    documento fiscal impresso a partir do tema escuro sai ilegível.
 * 3. **Imprime só o documento.** `sem-imprimir` tira o resto do ecrã.
 *
 * O QR CODE fica para quando houver certificação: o conteúdo é uma URL de
 * consulta da AGT que só existe para documentos comunicados, e um QR que leva
 * a uma página de erro é pior do que nenhum. O sítio dele já está no rodapé.
 */

interface Linha {
  ordem: number;
  descricao: string | null;
  unidade: string | null;
  qtd: string;
  preco: string;
  total: string;
  taxa_perc?: string | null;
  motivo_isencao?: string | null;
}

export interface DocumentoParaImprimir {
  id: string;
  numero: string | null;
  tipo_doc: string;
  data: string;
  cliente_nome: string | null;
  cliente_id: string | null;
  subtotal: string;
  iva: string;
  iva_perc?: string;
  total: string;
  emitido_em?: string | null;
  hash_controlo?: string | null;
  codigo_validacao?: string | null;
  doc_origem_num?: string | null;
  local_operacao?: string | null;
  linhas?: Linha[];
}

interface TipoDoc {
  cod: string;
  nome: string;
  fiscal?: boolean;
  iva?: boolean;
}

const KEY = "text-[10.5px] uppercase tracking-[0.5px] text-[#888]";

/** «14%» e não «14.00%» — o ponto decimal inglês num documento em português. */
function percentagem(v: string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0%";
  const texto = Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(".", ",");
  return `${texto}%`;
}

export function DocumentoLegal({
  documento,
  aoFechar,
}: {
  documento: DocumentoParaImprimir;
  aoFechar: () => void;
}) {
  const { empresa } = useAuth();
  const { data: tipos } = useSWR<TipoDoc[]>(
    "/api/comercial/tipos-documento",
    buscador,
    { revalidateOnFocus: false },
  );
  const { data: completo } = useSWR<DocumentoParaImprimir>(
    `/api/comercial/vendas/${documento.id}`,
    buscador,
  );

  const doc = completo ?? documento;
  const td = tipos?.find((t) => t.cod === doc.tipo_doc);
  const nomeTipo = td?.nome ?? doc.tipo_doc;
  const fiscal = td?.fiscal !== false;
  /** Um recibo mostra o que regulariza, não linhas de artigo. */
  const ehRecibo = doc.tipo_doc === "RC";
  const moeda = empresa?.moeda ?? "Kz";

  const iniciais = (empresa?.nome ?? "SGD")
    .replace(/[^A-Za-zÀ-ÿ]/g, "")
    .slice(0, 2)
    .toUpperCase();

  const codigo = doc.hash_controlo || doc.codigo_validacao || "—";
  const hora = doc.emitido_em
    ? new Date(doc.emitido_em).toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="sem-imprimir fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[94vh] w-[min(880px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte print:max-h-none print:w-full print:translate-x-0 print:translate-y-0 print:border-0 print:shadow-none">
          <div className="sem-imprimir flex items-center justify-between border-b border-borda bg-superficie-2 px-5 py-3">
            <Dialog.Title className="text-[15px] font-bold">
              {nomeTipo} {doc.numero ?? "(rascunho)"}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <Botao tamanho="pequeno" onClick={() => window.print()}>
                <Printer size={14} />
                Imprimir
              </Botao>
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
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-fundo p-4 print:overflow-visible print:bg-white print:p-0">
            {/* O documento. Fundo branco e texto escuro sempre — um documento
                fiscal impresso a partir do tema escuro sai ilegível. */}
            <div className="mx-auto max-w-[780px] rounded-[10px] bg-white px-6 py-6 text-[13px] text-[#1a1a2e] shadow-suave print:max-w-none print:rounded-none print:shadow-none">
              {/* ---- Cabeçalho ---- */}
              <div className="flex items-start justify-between gap-4 border-b-2 border-[#1a1a2e] pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#e6007e,#4a4ecb)] text-[17px] font-black text-white">
                    {iniciais}
                  </div>
                  <div>
                    <b className="text-[15px]">{empresa?.nome}</b>
                    <span className="block text-[11.5px] text-[#555]">
                      {empresa?.morada || empresa?.localizacao || ""}
                    </span>
                    <span className="block text-[11.5px] text-[#555]">
                      NIF: {empresa?.nif ?? "—"}
                    </span>
                    {empresa?.telefone && (
                      <span className="block text-[11.5px] text-[#555]">
                        Telefone: {empresa.telefone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[20px] font-extrabold tracking-[0.5px]">
                    {nomeTipo}
                  </div>
                  <div className="tabular font-bold">
                    {doc.numero ?? "(rascunho)"}
                  </div>
                  <span className="mt-1 inline-block rounded border border-[#b8189355] px-1.5 py-px text-[10px] uppercase tracking-[1px] text-[#b81893]">
                    {fiscal ? "Original" : "Não fiscal"}
                  </span>
                </div>
              </div>

              {/* ---- Cliente e metadados ---- */}
              <div className="my-3 flex justify-between gap-5">
                <div className="min-w-0 text-[12.5px]">
                  <div className={KEY}>Exmo.(s) Sr.(s)</div>
                  <b>{doc.cliente_nome || "Consumidor final"}</b>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-[12px]">
                  <div>
                    <span className={`block ${KEY}`}>Data</span>
                    <b className="tabular">
                      {new Date(doc.data).toLocaleDateString("pt-PT")}
                      {hora && ` ${hora}`}
                    </b>
                  </div>
                  <div>
                    <span className={`block ${KEY}`}>Moeda</span>
                    <b>{moeda}</b>
                  </div>
                  {doc.doc_origem_num && (
                    <div>
                      <span className={`block ${KEY}`}>Doc. origem</span>
                      <b className="tabular">{doc.doc_origem_num}</b>
                    </div>
                  )}
                  {doc.local_operacao && (
                    <div>
                      <span className={`block ${KEY}`}>Local</span>
                      <b>{doc.local_operacao}</b>
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Recibo: os três blocos, no lugar das linhas ----

                  UM RECIBO NÃO TEM LINHAS DE ARTIGO. Tem facturas que
                  regulariza, e cada uma lê-se em três tempos: o que foi
                  facturado, o que este pagamento move, e o que fica. Desenhar
                  aqui a tabela de artigos — vazia — era mostrar um documento
                  que não diz o que faz. */}
              {ehRecibo ? (
                <ExtractoDoRecibo vendaId={doc.id} moeda={moeda} />
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {[
                        "Cód.",
                        "Descrição",
                        "Preço s/IVA",
                        "Qtd.",
                        "Uni.",
                        "Taxa(%)",
                        "Total",
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={`bg-[#1a1a2e] px-2 py-1.5 text-[11px] uppercase text-white ${
                            i >= 2 && i !== 4 ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.linhas ?? []).map((l, i) => (
                      <tr key={`${l.ordem}-${l.descricao}`}>
                        <td className="tabular border-b border-[#ddd] px-2 py-1.5">
                          {String(i + 1).padStart(3, "0")}
                        </td>
                        <td className="border-b border-[#ddd] px-2 py-1.5">
                          {l.descricao}
                          {l.motivo_isencao && (
                            <span className="block text-[10.5px] text-[#777]">
                              {l.motivo_isencao}
                            </span>
                          )}
                        </td>
                        <td className="tabular border-b border-[#ddd] px-2 py-1.5 text-right">
                          {formata(l.preco)}
                        </td>
                        <td className="tabular border-b border-[#ddd] px-2 py-1.5 text-right">
                          {formata(l.qtd, 0)}
                        </td>
                        <td className="border-b border-[#ddd] px-2 py-1.5">
                          {l.unidade || "UN"}
                        </td>
                        <td className="tabular border-b border-[#ddd] px-2 py-1.5 text-right">
                          {percentagem(l.taxa_perc ?? doc.iva_perc)}
                        </td>
                        <td className="tabular border-b border-[#ddd] px-2 py-1.5 text-right">
                          {formata(l.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* ---- Resumo de impostos e totais ---- */}
              <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
                <div className="text-[12px]">
                  <div className={KEY}>Resumo de Impostos</div>
                  <table className="mt-1 border-collapse">
                    <thead>
                      <tr>
                        {["Taxa(%)", "Incidência", "Imposto"].map((h) => (
                          <th
                            key={h}
                            className="border-b border-[#ddd] px-3 py-1 text-right text-[10.5px] uppercase text-[#666]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="tabular">
                        <td className="px-3 py-1 text-right">
                          {percentagem(doc.iva_perc)}
                        </td>
                        <td className="px-3 py-1 text-right">
                          {formata(doc.subtotal)}
                        </td>
                        <td className="px-3 py-1 text-right">
                          {formata(doc.iva)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="min-w-[260px] text-[12.5px]">
                  {[
                    ["Total Ilíquido", doc.subtotal],
                    ["Total Imposto", doc.iva],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between px-2 py-0.5">
                      <span className="text-[#555]">{k}</span>
                      <b className="tabular">{formata(v as string)}</b>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t-2 border-[#1a1a2e] px-2 pt-1.5 text-[15px]">
                    <span className="font-extrabold">Total da {nomeTipo}</span>
                    <b className="tabular font-extrabold">
                      {formataMoeda(doc.total, moeda)}
                    </b>
                  </div>
                </div>
              </div>

              {/* ---- Valor por extenso ---- */}
              <div className="mt-3 border-t border-dashed border-[#bbb] pt-2 text-[12px]">
                {/* POR EXTENSO quer dizer por extenso: «kwanzas», e não
                    «Kzs». O `Kz` é a abreviatura que se usa ao lado dos
                    números; num valor escrito por palavras seria um erro de
                    português num documento oficial. */}
                <b>{valorPorExtenso(doc.total, "kwanzas", "kwanza")}</b>
              </div>

              {/* ---- Rodapé legal ---- */}
              <div className="mt-4 flex items-center justify-between gap-4 border-t border-dashed border-[#bbb] pt-3">
                <div className="text-[11px] leading-relaxed text-[#555]">
                  Processado por programa validado — SGD · {empresa?.nome}
                  <br />
                  {fiscal ? (
                    <>
                      Ao abrigo do Decreto Presidencial n.º 71/25 (Regime
                      Jurídico das Facturas).
                    </>
                  ) : (
                    <b>Este documento não serve de factura.</b>
                  )}
                  <br />
                  Os bens ou serviços foram colocados à disposição do adquirente
                  na data do documento.
                  {fiscal && (
                    <>
                      <br />
                      Código de controlo:{" "}
                      <span className="font-mono font-bold text-[#1a1a2e]">
                        {codigo}
                      </span>
                    </>
                  )}
                </div>
                {fiscal && (
                  // O sítio do QR Code da AGT. Fica assinalado em vez de se
                  // desenhar um padrão que nenhum leitor lê — como o Piloto
                  // fazia. Entra quando houver certificação e comunicação.
                  <div className="flex size-[92px] shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-[#ccc] text-center text-[9px] leading-tight text-[#999]">
                    QR Code
                    <br />
                    AGT
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
