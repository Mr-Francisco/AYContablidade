"use client";

import { Plus } from "lucide-react";
import { Tabs } from "radix-ui";
import { useId, useMemo } from "react";
import useSWR from "swr";

import { Alerta, Selo } from "@/components/ui";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useCentros, useDiarios, useDocumentos } from "@/lib/hooks";
import { cn } from "@/lib/utils";

import { GrelhaGeral, linhaPreenchida } from "./GrelhaGeral";
import { SelectorData } from "./SelectorData";
import type { EstadoEditor, Linha } from "./tipos";

/** Contas monetárias: 43 (Depósitos à Ordem) e 45 (Caixa) e subcontas. */
export const CONTA_MONETARIA = /^4[35]/;

const SEPARADOR =
  "rounded-none border-b-2 border-transparent px-3 pb-2 pt-1 text-sm font-semibold text-texto-suave data-[state=active]:border-marca data-[state=active]:text-texto";

const ROTULO = "text-[12.5px] font-semibold text-texto-suave";
const CAMPO_CABECA =
  "w-full rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/25 disabled:opacity-60";

interface Fluxo {
  codigo: string;
  descricao: string;
}

/**
 * O editor de movimento — a `mov-editor` do Piloto.
 *
 * Cabeça em duas filas, três separadores e a grelha. O QUE AQUI IMPORTA e não é
 * óbvio: o campo **Diário** é o código escrito à mão, com o nome ao lado a
 * confirmar que se acertou. É mais rápido do que abrir uma lista de vinte
 * diários quando se sabe que compras é o 21 — e quem não sabe tem as sugestões
 * do `datalist`. Foi assim que o Piloto o fez, e não é por acaso.
 *
 * Nos Movimentos o **F4 só existe na célula da conta** — no diário não abre
 * nada, e não há F2 em lado nenhum. Verificado contra o Piloto a correr.
 */
export function EditorLancamento({
  estado,
  aoMudar,
  aoPedirCriacaoDeConta,
  erro,
  soLeitura,
}: {
  estado: EstadoEditor;
  aoMudar: (parcial: Partial<EstadoEditor>) => void;
  aoPedirCriacaoDeConta: (codigo: string) => void;
  erro: string | null;
  soLeitura: boolean;
}) {
  const { diarios } = useDiarios();
  const { documentos } = useDocumentos(estado.diario || undefined);
  const { centros } = useCentros();
  const { data: fluxos } = useSWR<Fluxo[]>(
    "/api/contabilidade/fluxos",
    buscador,
    {
      revalidateOnFocus: false,
    },
  );
  const idDiarios = useId();

  const nomeDiario =
    diarios.find((d) => d.codigo === estado.diario)?.nome ?? "—";

  const [ano, mes, dia] = estado.data.split("-");

  function alterarLinha(i: number, campo: keyof Linha, valor: string) {
    aoMudar({
      linhas: estado.linhas.map((l, k) => {
        if (k !== i) return l;
        const nova = { ...l, [campo]: valor };
        // Débito e crédito são exclusivos: preencher um limpa o outro. Deixar
        // os dois na mesma linha seria sempre erro de lançamento.
        if (campo === "debito" && valor) nova.credito = "";
        if (campo === "credito" && valor) nova.debito = "";
        return nova;
      }),
    });
  }

  function removerLinha(i: number) {
    const restantes = estado.linhas.filter((_, k) => k !== i);
    // O Piloto nunca deixa a grelha com menos de duas linhas.
    while (restantes.length < 2) restantes.push(linhaNova());
    aoMudar({ linhas: restantes });
  }

  const preenchidas = useMemo(
    () => estado.linhas.filter(linhaPreenchida),
    [estado.linhas],
  );

  return (
    <section className="flex min-w-0 flex-col rounded-[14px] border border-borda bg-superficie p-4 shadow-suave">
      {/* Fila 1 — Data, Lançamento, Diário, Documento */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <span className={ROTULO}>Data</span>
          <SelectorData
            ano={Number(ano)}
            mes={estado.mes || mes}
            dia={dia}
            aoMudarAno={(v) =>
              aoMudar({ data: `${v}-${estado.data.slice(5)}` })
            }
            aoMudarMes={(v) => aoMudar({ mes: v })}
            aoMudarDia={(v) =>
              aoMudar({ data: `${estado.data.slice(0, 8)}${v}` })
            }
          />
        </div>

        <div className="w-[11rem] min-w-0">
          <span className={ROTULO}>Lançamento</span>
          <input
            value={estado.numeroOp ?? "(automático)"}
            disabled
            aria-label="Número do lançamento"
            className={cn(CAMPO_CABECA, "tabular mt-1")}
          />
        </div>

        {/* O código escreve-se; o nome ao lado confirma que se acertou. */}
        <div className="min-w-0">
          <span className={ROTULO}>Diário</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={estado.diario}
              onChange={(e) =>
                aoMudar({ diario: e.target.value.trim(), documento: "" })
              }
              list={idDiarios}
              placeholder="Cód."
              disabled={soLeitura}
              className={cn(CAMPO_CABECA, "tabular w-[5rem]")}
            />
            <datalist id={idDiarios}>
              {diarios.map((d) => (
                <option key={d.id} value={d.codigo}>
                  {d.nome}
                </option>
              ))}
            </datalist>
            <span
              className={cn(
                "truncate text-[13px] font-semibold",
                estado.diario && nomeDiario !== "—"
                  ? "text-marca"
                  : "text-texto-suave",
              )}
            >
              {nomeDiario}
            </span>
          </div>
        </div>

        <div className="min-w-[16rem] flex-1">
          <span className={ROTULO}>Documento</span>
          <select
            value={estado.documento}
            onChange={(e) => aoMudar({ documento: e.target.value })}
            disabled={soLeitura || !estado.diario}
            aria-label="Documento"
            className={cn(CAMPO_CABECA, "mt-1")}
          >
            <option value="">— Documento —</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.codigo}>
                {d.codigo} · {d.descricao}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Fila 2 — Descrição, Nº Documento, Diferido */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[18rem] flex-1">
          <span className={ROTULO}>Descrição</span>
          <input
            value={estado.descricao}
            onChange={(e) => aoMudar({ descricao: e.target.value })}
            placeholder="Descrição do movimento"
            disabled={soLeitura}
            className={cn(CAMPO_CABECA, "mt-1")}
          />
        </div>
        <div className="w-[12rem]">
          <span className={ROTULO}>Nº Documento</span>
          <input
            value={estado.documentoRef}
            onChange={(e) => aoMudar({ documentoRef: e.target.value })}
            placeholder="Ex.: FT 2026/1"
            disabled={soLeitura}
            className={cn(CAMPO_CABECA, "mt-1")}
          />
        </div>
        <label
          className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm"
          title="Fica pendente de integração — não entra no balancete, razão, extracto nem apuramentos até ser integrado"
        >
          <input
            type="checkbox"
            checked={estado.diferido}
            onChange={(e) => aoMudar({ diferido: e.target.checked })}
            disabled={soLeitura}
            className="size-4 accent-[var(--color-marca)]"
          />
          Diferido
        </label>
      </div>

      <Tabs.Root defaultValue="geral">
        <Tabs.List className="mb-3 flex gap-1 border-b border-borda">
          <Tabs.Trigger value="geral" className={SEPARADOR}>
            Geral
          </Tabs.Trigger>
          <Tabs.Trigger value="cc" className={SEPARADOR}>
            Centros de Custo
          </Tabs.Trigger>
          <Tabs.Trigger value="fluxos" className={SEPARADOR}>
            Fluxos Caixa
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="geral">
          <GrelhaGeral
            linhas={estado.linhas}
            aoAlterar={alterarLinha}
            aoRemover={removerLinha}
            aoAdicionar={() =>
              aoMudar({ linhas: [...estado.linhas, linhaNova()] })
            }
            aoPedirCriacaoDeConta={aoPedirCriacaoDeConta}
            soLeitura={soLeitura}
          />
          {!soLeitura && (
            <button
              type="button"
              onClick={() =>
                aoMudar({ linhas: [...estado.linhas, linhaNova()] })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-borda px-3 py-1.5 text-[12.5px] font-semibold hover:border-acento"
            >
              <Plus size={14} />
              Linha
            </button>
          )}
        </Tabs.Content>

        <Tabs.Content value="cc">
          <p className="mb-2 text-[13px] text-texto-suave">
            Imputação a centros de custo / analítica (por linha).
          </p>
          <TabelaPorLinha
            linhas={estado.linhas}
            titulo="Centro de custo"
            vazio="Sem linhas com conta."
            render={(l, i) => (
              <select
                value={l.centro_codigo}
                onChange={(e) =>
                  alterarLinha(i, "centro_codigo", e.target.value)
                }
                disabled={soLeitura}
                aria-label="Centro de custo"
                className={cn(CAMPO_CABECA, "py-1.5")}
              >
                <option value="">— Sem centro —</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.codigo}>
                    {c.codigo} · {c.nome}
                  </option>
                ))}
              </select>
            )}
          />
        </Tabs.Content>

        <Tabs.Content value="fluxos">
          <p className="mb-2 text-[13px] text-texto-suave">
            Classificação de fluxos de caixa (linhas de contas monetárias —
            caixa/bancos). <b>Obrigatório</b> em qualquer linha das contas 43
            (Depósitos à Ordem) ou 45 (Caixa) e respectivas subcontas.
          </p>
          <TabelaPorLinha
            linhas={estado.linhas}
            titulo="Rúbrica de fluxo"
            vazio="Sem linhas com conta."
            esbaterQuando={(l) => !CONTA_MONETARIA.test(l.conta_codigo)}
            marcarConta={(l) =>
              CONTA_MONETARIA.test(l.conta_codigo) ? (
                <span
                  className="ml-1 text-perigo"
                  title="Obrigatório para contas 43/45"
                >
                  *
                </span>
              ) : null
            }
            render={(l, i) => {
              const emFalta =
                CONTA_MONETARIA.test(l.conta_codigo) && !l.fluxo_codigo;
              return (
                <select
                  value={l.fluxo_codigo}
                  onChange={(e) =>
                    alterarLinha(i, "fluxo_codigo", e.target.value)
                  }
                  disabled={soLeitura}
                  aria-label="Rúbrica de fluxo"
                  className={cn(
                    CAMPO_CABECA,
                    "py-1.5",
                    emFalta && "border-perigo",
                  )}
                >
                  <option value="">—</option>
                  {(fluxos ?? []).map((f) => (
                    <option key={f.codigo} value={f.codigo}>
                      {f.codigo} · {f.descricao}
                    </option>
                  ))}
                </select>
              );
            }}
          />
        </Tabs.Content>
      </Tabs.Root>

      {estado.origem !== "manual" && (
        <div className="mt-3">
          <Alerta tipo="aviso">
            Movimento gerado automaticamente (<b>{estado.origem}</b>) — só se
            altera no documento que o originou, para a contabilidade e esse
            documento não se contradizerem.
          </Alerta>
        </div>
      )}

      {erro && (
        <div className="mt-3">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      )}

      {preenchidas.length > 0 && (
        <p className="mt-3 text-[12.5px] text-texto-suave">
          {preenchidas.length} linha{preenchidas.length === 1 ? "" : "s"} com
          conta e valor · total{" "}
          <b className="tabular text-texto">
            {formataMoeda(
              preenchidas.reduce(
                (s, l) => s + Number(l.debito || l.credito || 0),
                0,
              ),
            )}
          </b>
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
/** Tabela dos separadores CC e Fluxos: só linhas com conta e valor. */
function TabelaPorLinha({
  linhas,
  titulo,
  vazio,
  render,
  esbaterQuando,
  marcarConta,
}: {
  linhas: Linha[];
  titulo: string;
  vazio: string;
  render: (l: Linha, i: number) => React.ReactNode;
  esbaterQuando?: (l: Linha) => boolean;
  marcarConta?: (l: Linha) => React.ReactNode;
}) {
  const comConta = linhas
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => linhaPreenchida(l));

  if (comConta.length === 0) {
    return (
      <p className="rounded-[10px] border border-borda py-8 text-center text-sm text-texto-suave">
        {vazio}
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-[10px] border border-borda">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-superficie-2">
            {["Conta", "Descrição", "Valor", titulo].map((h, k) => (
              <th
                key={h}
                className={cn(
                  "whitespace-nowrap border-b border-borda/40 px-3 py-2 text-left text-[11.5px] font-bold uppercase tracking-[0.4px] text-texto-suave",
                  k === 2 && "text-right",
                  k === 3 && "w-[34%]",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comConta.map(({ l, i }) => (
            <tr
              key={l.id}
              className={cn(
                "border-b border-borda/40 last:border-b-0",
                esbaterQuando?.(l) && "opacity-60",
              )}
            >
              <td className="tabular px-3 py-1.5 font-bold">
                {l.conta_codigo}
                {marcarConta?.(l)}
              </td>
              <td className="px-3 py-1.5 text-texto-suave">
                {l.descricao || "—"}
              </td>
              <td className="tabular px-3 py-1.5 text-right">
                {formataMoeda(l.debito || l.credito || "0", "")}
              </td>
              <td className="px-3 py-1.5">{render(l, i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function linhaNova(): Linha {
  return {
    id: crypto.randomUUID(),
    conta_codigo: "",
    debito: "",
    credito: "",
    iva_perc: "",
    perc_nao_ded: "",
    iva_autoliq: "",
    tipo_entidade: "",
    entidade: "",
    moeda: "AKZ",
    cambio: "1",
    descricao: "",
    centro_codigo: "",
    fluxo_codigo: "",
  };
}

/** Selo do estado do movimento, na barra de acções. */
export function SeloEstado({ texto, tipo }: { texto: string; tipo: string }) {
  const cores: Record<string, string> = {
    aviso: "#c98a10",
    ok: "#1a9c5f",
    erro: "#c62828",
    vazio: "#8a8a8a",
  };
  return <Selo cor={cores[tipo] ?? cores.vazio}>{texto}</Selo>;
}
