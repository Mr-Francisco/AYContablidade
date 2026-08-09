"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useMemo, useState } from "react";

import { CampoConta } from "@/components/contabilidade/CampoConta";
import { CriarContaEmFalta } from "@/components/contabilidade/CriarContaEmFalta";
import {
  Alerta,
  Botao,
  Campo,
  Entrada,
  EnvolveTabela,
  Selector,
  Tabela,
  Td,
  Th,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { big, formataMoeda, paraApi, soma, subtrai } from "@/lib/dinheiro";
import {
  useCentros,
  useDiarios,
  useDocumentos,
  usePeriodos,
} from "@/lib/hooks";

interface Linha {
  /** Identidade estável da linha.
   *
   * Sem ela, a chave do React seria o índice: ao remover a 2.ª de três linhas,
   * a 3.ª passa a ocupar o índice 2 e o React reutiliza os campos da linha
   * removida — os valores saltam de linha. */
  id: string;
  conta_codigo: string;
  descricao: string;
  debito: string;
  credito: string;
  entidade: string;
  centro_codigo: string;
}

function linhaVazia(): Linha {
  return {
    id: crypto.randomUUID(),
    conta_codigo: "",
    descricao: "",
    debito: "",
    credito: "",
    entidade: "",
    centro_codigo: "",
  };
}

export function FormularioLancamento({
  exercicioId,
  aoFechar,
  aoGravar,
}: {
  exercicioId?: string;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { diarios } = useDiarios();
  const { centros } = useCentros();
  const { periodos } = usePeriodos();

  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [diario, setDiario] = useState("");
  const [documento, setDocumento] = useState("");
  const [mes, setMes] = useState("");
  const [descricao, setDescricao] = useState("");
  const [referencia, setReferencia] = useState("");
  const [diferido, setDiferido] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia(), linhaVazia()]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const { documentos } = useDocumentos(diario || undefined);

  /** Código que se escreveu e não existe — abre o diálogo de criação. */
  const [aCriarConta, setACriarConta] = useState<string | null>(null);

  const totais = useMemo(() => {
    const d = soma(...linhas.map((l) => l.debito));
    const c = soma(...linhas.map((l) => l.credito));
    return { debito: d, credito: c, diferenca: subtrai(d, c) };
  }, [linhas]);

  const equilibrado = totais.diferenca.eq(0) && totais.debito.gt(0);
  const preenchidas = linhas.filter(
    (l) => l.conta_codigo && (big(l.debito).gt(0) || big(l.credito).gt(0)),
  );

  function alterar(i: number, campo: keyof Linha, valor: string) {
    setLinhas((atual) =>
      atual.map((l, k) => {
        if (k !== i) return l;
        const nova = { ...l, [campo]: valor };
        // Débito e crédito são exclusivos na mesma linha: preencher um limpa o
        // outro. Deixar os dois seria sempre um erro de lançamento.
        if (campo === "debito" && valor) nova.credito = "";
        if (campo === "credito" && valor) nova.debito = "";
        return nova;
      }),
    );
  }

  async function submeter() {
    setErro(null);

    if (!diario) return setErro("Indique o diário.");
    if (!documento) return setErro("Indique o documento.");
    if (preenchidas.length < 2) {
      return setErro(
        "Um lançamento precisa de pelo menos duas linhas com conta e valor.",
      );
    }
    if (!equilibrado) {
      return setErro(
        `Lançamento não equilibrado: diferença de ${formataMoeda(totais.diferenca, moeda)}.`,
      );
    }

    setAGravar(true);
    try {
      await api.post("/api/contabilidade/lancamentos", {
        data,
        diario_codigo: diario,
        documento_codigo: documento,
        mes: mes || undefined,
        descricao: descricao || undefined,
        documento_ref: referencia || undefined,
        exercicio_id: exercicioId,
        diferido,
        linhas: preenchidas.map((l) => ({
          conta_codigo: l.conta_codigo,
          debito: paraApi(l.debito),
          credito: paraApi(l.credito),
          descricao: l.descricao || undefined,
          entidade: l.entidade || undefined,
          centro_codigo: l.centro_codigo || undefined,
        })),
      });
      aoGravar();
    } catch (e) {
      // O servidor devolve 422 com a regra contabilística violada em português
      // — mostra-se tal como vem.
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(1100px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo movimento
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

          <div className="min-w-0 flex-1 overflow-auto p-5">
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Data">
                <Entrada
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </Campo>
              <Selector
                rotulo="Diário"
                valor={diario}
                aoMudar={(v) => {
                  setDiario(v);
                  setDocumento("");
                }}
                opcoes={diarios.map((d) => ({
                  valor: d.codigo,
                  rotulo: `${d.codigo} — ${d.nome}`,
                }))}
                placeholder="Escolher diário…"
              />
              <Selector
                rotulo="Documento"
                valor={documento}
                aoMudar={setDocumento}
                opcoes={documentos.map((d) => ({
                  valor: d.codigo,
                  rotulo: `${d.codigo} — ${d.descricao}`,
                }))}
                placeholder={
                  diario ? "Escolher documento…" : "Escolha o diário primeiro"
                }
              />
              <Selector
                rotulo="Período contabilístico"
                valor={mes}
                aoMudar={setMes}
                opcoes={periodos.map((p) => ({
                  valor: p.codigo,
                  rotulo: `${p.codigo} — ${p.nome}`,
                }))}
                placeholder="Pelo mês da data"
              />
              <Campo rotulo="Referência do documento">
                <Entrada
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Ex.: FT 2026/0001"
                />
              </Campo>
              <Campo rotulo="Descrição" className="sm:col-span-2 lg:col-span-1">
                <Entrada
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descrição do movimento"
                />
              </Campo>
            </div>

            <EnvolveTabela>
              <Tabela>
                <thead>
                  <tr>
                    <Th className="w-[240px]">Conta</Th>
                    <Th>Descrição</Th>
                    <Th className="w-[150px]">Entidade</Th>
                    <Th className="w-[120px]">Centro</Th>
                    <Th numerico className="w-[130px]">
                      Débito
                    </Th>
                    <Th numerico className="w-[130px]">
                      Crédito
                    </Th>
                    <Th className="w-[44px]" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr
                      key={l.id}
                      className="border-b border-borda last:border-b-0"
                    >
                      <Td className="p-2">
                        <CampoConta
                          valor={l.conta_codigo}
                          aoMudar={(v) => alterar(i, "conta_codigo", v)}
                          aoPedirCriacao={setACriarConta}
                          className="w-[15rem]"
                        />
                      </Td>
                      <Td className="p-2">
                        <Entrada
                          value={l.descricao}
                          onChange={(e) =>
                            alterar(i, "descricao", e.target.value)
                          }
                          placeholder="Descrição da linha"
                        />
                      </Td>
                      <Td className="p-2">
                        <Entrada
                          value={l.entidade}
                          onChange={(e) =>
                            alterar(i, "entidade", e.target.value)
                          }
                          placeholder="Entidade"
                        />
                      </Td>
                      <Td className="p-2">
                        <Selector
                          valor={l.centro_codigo}
                          aoMudar={(v) => alterar(i, "centro_codigo", v)}
                          opcoes={[
                            { valor: "", rotulo: "—" },
                            ...centros.map((c) => ({
                              valor: c.codigo,
                              rotulo: c.codigo,
                            })),
                          ]}
                          placeholder="—"
                          larguraMinima="6rem"
                        />
                      </Td>
                      <Td className="p-2">
                        <Entrada
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.debito}
                          onChange={(e) => alterar(i, "debito", e.target.value)}
                          className="text-right tabular"
                        />
                      </Td>
                      <Td className="p-2">
                        <Entrada
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.credito}
                          onChange={(e) =>
                            alterar(i, "credito", e.target.value)
                          }
                          className="text-right tabular"
                        />
                      </Td>
                      <Td className="p-2">
                        <button
                          type="button"
                          aria-label={`Remover linha ${i + 1}`}
                          disabled={linhas.length <= 2}
                          onClick={() =>
                            setLinhas((a) => a.filter((_, k) => k !== i))
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda text-texto-suave hover:border-perigo hover:text-perigo disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-superficie-2 font-bold">
                    <Td colSpan={4}>Totais</Td>
                    <Td numerico>{formataMoeda(totais.debito, moeda)}</Td>
                    <Td numerico>{formataMoeda(totais.credito, moeda)}</Td>
                    <Td />
                  </tr>
                </tfoot>
              </Tabela>
            </EnvolveTabela>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Botao
                tamanho="pequeno"
                onClick={() => setLinhas((a) => [...a, linhaVazia()])}
              >
                <Plus size={14} />
                Adicionar linha
              </Botao>

              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-texto-suave">
                <input
                  type="checkbox"
                  checked={diferido}
                  onChange={(e) => setDiferido(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-marca)]"
                />
                Gravar como diferido (não entra nos relatórios até ser
                integrado)
              </label>
            </div>

            {/* O estado do equilíbrio é permanente, não só ao submeter: o
                utilizador vê a diferença a fechar enquanto escreve. */}
            {totais.debito.gt(0) || totais.credito.gt(0) ? (
              equilibrado ? (
                <Alerta tipo="sucesso">
                  Equilibrado — débito e crédito somam{" "}
                  {formataMoeda(totais.debito, moeda)}.
                </Alerta>
              ) : (
                <Alerta tipo="aviso">
                  Diferença de {formataMoeda(totais.diferenca, moeda)} entre
                  débito e crédito.
                </Alerta>
              )
            ) : null}

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </div>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              variante="primario"
              onClick={submeter}
              disabled={aGravar || !equilibrado}
            >
              {aGravar ? "A gravar…" : "Gravar movimento"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {aCriarConta && (
        <CriarContaEmFalta
          codigo={aCriarConta}
          aoFechar={() => setACriarConta(null)}
          aoCriar={() => setACriarConta(null)}
        />
      )}
    </Dialog.Root>
  );
}
