"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CriarTerceiroRapido,
  LADO_FORNECEDOR,
} from "@/components/comercial/CriarTerceiroRapido";
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
  Tr,
} from "@/components/ui";
import { CampoEntidade, type Registo } from "@/components/ui/CampoEntidade";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda, multiplica, soma } from "@/lib/dinheiro";
import { useArtigos } from "@/lib/hooks";
import type { DocumentoCompra } from "@/types";

interface Linha {
  /** Chave estável: com o índice, apagar uma linha faz as seguintes herdarem
   *  os campos da que saiu. */
  chave: string;
  artigo_id: string;
  descricao: string;
  unidade: string;
  qtd: string;
  preco: string;
}

function linhaVazia(): Linha {
  return {
    chave: crypto.randomUUID(),
    artigo_id: "",
    descricao: "",
    unidade: "",
    qtd: "1",
    preco: "0",
  };
}

export function FormularioCompra({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  // A LISTA INTEIRA DEIXOU DE SER PEDIDA — a procura é do servidor. `porId`
  // fica: a linha guarda o `artigo_id` e o campo precisa do código e da
  // descrição para os mostrar sem ir perguntar outra vez.
  const { porId } = useArtigos();

  const { data: documentos } = useSWR<DocumentoCompra[]>(
    "/api/compras/documentos",
    buscador,
    { revalidateOnFocus: false },
  );

  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [documentoCodigo, setDocumentoCodigo] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [armazemId, setArmazemId] = useState("");
  /** Os registos escolhidos nas tabelas de pesquisa — guardam código e nome
   *  para o campo os mostrar sem ir buscar a lista toda. */
  const [fornecedor, setFornecedor] = useState<Registo | null>(null);
  /** O nome escrito na pesquisa quando se pediu para criar — não se perde. */
  const [aCriarFornecedor, setACriarFornecedor] = useState<string | null>(null);
  const [armazem, setArmazem] = useState<Registo | null>(null);
  const [ivaPerc, setIvaPerc] = useState("14");
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterarLinha(chave: string, campo: keyof Linha, valor: string) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, [campo]: valor };
        // Escolher o artigo preenche o resto, mas sem trancar: o preço de uma
        // compra é o que o fornecedor cobrou hoje, não o da ficha.
        if (campo === "artigo_id") {
          const a = porId.get(valor);
          if (a) {
            nova.descricao = a.descricao;
            nova.unidade = a.unidade ?? "";
            nova.preco = a.preco_compra;
          }
        }
        return nova;
      }),
    );
  }

  const totais = useMemo(() => {
    const subtotal = soma(
      ...linhas.map((l) => multiplica(l.qtd || "0", l.preco || "0")),
    );
    const iva = subtotal
      .times(big(ivaPerc || "0"))
      .div(100)
      .round(2);
    return { subtotal, iva, total: subtotal.plus(iva) };
  }, [linhas, ivaPerc]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!documentoCodigo) return setErro("Escolha o tipo de documento.");
    if (!armazemId) return setErro("Escolha o armazém de entrada.");
    if (!fornecedorId) return setErro("Escolha o fornecedor.");

    const uteis = linhas.filter((l) => l.artigo_id && Number(l.qtd) > 0);
    if (!uteis.length) {
      return setErro(
        "Adicione pelo menos uma linha com artigo e quantidade — a compra tem de movimentar stock.",
      );
    }

    setAGravar(true);
    try {
      await api.post("/api/compras", {
        data,
        documento_codigo: documentoCodigo,
        fornecedor_id: fornecedorId,
        armazem_id: armazemId,
        iva_perc: ivaPerc || "0",
        linhas: uteis.map((l) => ({
          artigo_id: l.artigo_id,
          descricao: l.descricao || null,
          unidade: l.unidade || null,
          qtd: l.qtd,
          preco: l.preco,
        })),
      });
      aoGravar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(980px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Nova compra
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

          <form
            onSubmit={submeter}
            id="form-compra"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Selector
                rotulo="Tipo de documento"
                valor={documentoCodigo}
                aoMudar={setDocumentoCodigo}
                opcoes={(documentos ?? []).map((d) => ({
                  valor: d.codigo,
                  rotulo: `${d.codigo} — ${d.descricao}`,
                }))}
                placeholder="Escolher documento…"
                larguraMinima="100%"
              />
              <Campo rotulo="Data">
                <Entrada
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                />
              </Campo>
              <Campo
                rotulo="Fornecedor"
                dica="F4 ou duplo clique para procurar na tabela de fornecedores."
              >
                <CampoEntidade
                  valor={fornecedor}
                  aoEscolher={(r) => {
                    setFornecedor(r);
                    setFornecedorId(r?.id ?? "");
                  }}
                  fonte="/api/logistica/fornecedores/tabela"
                  titulo="Fornecedores"
                  placeholder="Fornecedor (F4)"
                  colunas={["Nº", "Nome", "NIF · País"]}
                  // O mesmo gesto que já existia nas vendas: descobre-se a
                  // meio da compra que o fornecedor não está registado, e cria-
                  // se sem perder o documento que se estava a preencher.
                  aoCriar={(termo) => setACriarFornecedor(termo)}
                  rotuloCriar="Criar fornecedor"
                />
              </Campo>
              <Campo
                rotulo="Armazém de entrada"
                dica="F4 para procurar na tabela de armazéns."
              >
                <CampoEntidade
                  valor={armazem}
                  aoEscolher={(r) => {
                    setArmazem(r);
                    setArmazemId(r?.id ?? "");
                  }}
                  fonte="/api/logistica/armazens/tabela"
                  titulo="Armazéns"
                  placeholder="Armazém (F4)"
                  colunas={["Código", "Nome", "Localização"]}
                />
              </Campo>
              <Campo rotulo="IVA dedutível (%)">
                <Entrada
                  type="number"
                  step="0.01"
                  min="0"
                  value={ivaPerc}
                  onChange={(e) => setIvaPerc(e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
            </div>

            <EnvolveTabela>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Artigo</Th>
                    <Th>Descrição</Th>
                    <Th>Un.</Th>
                    <Th numerico>Qtd.</Th>
                    <Th numerico>Preço</Th>
                    <Th numerico>Total</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <Tr key={l.chave}>
                      <Td className="min-w-[220px]">
                        <CampoEntidade
                          valor={
                            l.artigo_id
                              ? {
                                  id: l.artigo_id,
                                  codigo: porId.get(l.artigo_id)?.codigo ?? "",
                                  nome: porId.get(l.artigo_id)?.descricao ?? "",
                                }
                              : null
                          }
                          aoEscolher={(r) =>
                            alterarLinha(l.chave, "artigo_id", r?.id ?? "")
                          }
                          fonte="/api/logistica/artigos/tabela"
                          titulo="Artigos"
                          placeholder="Artigo (F4)"
                          colunas={["Código", "Descrição", "Unidade · Preço"]}
                          emGrelha
                          semBotao
                        />
                      </Td>
                      <Td className="min-w-[200px]">
                        <Entrada
                          value={l.descricao}
                          onChange={(e) =>
                            alterarLinha(l.chave, "descricao", e.target.value)
                          }
                        />
                      </Td>
                      <Td className="w-20">
                        <Entrada
                          value={l.unidade}
                          onChange={(e) =>
                            alterarLinha(l.chave, "unidade", e.target.value)
                          }
                        />
                      </Td>
                      <Td className="w-28">
                        <Entrada
                          type="number"
                          step="0.0001"
                          min="0"
                          value={l.qtd}
                          onChange={(e) =>
                            alterarLinha(l.chave, "qtd", e.target.value)
                          }
                          className="text-right tabular"
                        />
                      </Td>
                      <Td className="w-32">
                        <Entrada
                          type="number"
                          step="0.01"
                          min="0"
                          value={l.preco}
                          onChange={(e) =>
                            alterarLinha(l.chave, "preco", e.target.value)
                          }
                          className="text-right tabular"
                        />
                      </Td>
                      <Td numerico className="whitespace-nowrap font-semibold">
                        {formataMoeda(
                          multiplica(l.qtd || "0", l.preco || "0"),
                          moeda,
                        )}
                      </Td>
                      <Td numerico>
                        <Botao
                          tamanho="pequeno"
                          variante="perigo"
                          aria-label="Remover linha"
                          disabled={linhas.length === 1}
                          motivoBloqueio="A compra tem de ter pelo menos uma linha."
                          onClick={() =>
                            setLinhas((ls) =>
                              ls.filter((x) => x.chave !== l.chave),
                            )
                          }
                        >
                          <Trash2 size={13} />
                        </Botao>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <Botao onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>
                <Plus size={15} />
                Adicionar linha
              </Botao>

              <dl className="min-w-[220px] text-sm">
                <div className="flex justify-between py-1">
                  <dt className="text-texto-suave">Subtotal</dt>
                  <dd className="tabular">
                    {formataMoeda(totais.subtotal, moeda)}
                  </dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-texto-suave">IVA ({ivaPerc || 0} %)</dt>
                  <dd className="tabular">{formataMoeda(totais.iva, moeda)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-borda pt-2 font-bold">
                  <dt>Total</dt>
                  <dd className="tabular">
                    {formataMoeda(totais.total, moeda)}
                  </dd>
                </div>
              </dl>
            </div>

            <Alerta tipo="info" className="mt-3">
              Grava como rascunho. Só a emissão dá entrada em armazém e
              contabiliza a factura — até lá, nada mexe no stock.
            </Alerta>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-compra"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar rascunho"}
            </Botao>
          </div>

          {aCriarFornecedor !== null && (
            <CriarTerceiroRapido
              lado={LADO_FORNECEDOR}
              nomeInicial={aCriarFornecedor}
              aoFechar={() => setACriarFornecedor(null)}
              aoCriar={(f) => {
                // Criar e USAR: o fornecedor novo fica escolhido na compra que
                // estava a ser preenchida. Criar e obrigar a procurá-lo outra
                // vez na lista era metade do trabalho.
                setFornecedor({
                  id: f.id,
                  codigo: f.numero,
                  nome: f.nome,
                  detalhe: [f.nif, f.pais].filter(Boolean).join(" · "),
                });
                setFornecedorId(f.id);
                setACriarFornecedor(null);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
