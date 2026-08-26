"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { CriarClienteRapido } from "@/components/comercial/CriarClienteRapido";
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
import { CampoEntidade, type Registo } from "@/components/ui/CampoEntidade";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda, multiplica, paraApi, soma } from "@/lib/dinheiro";
import { useArtigos } from "@/lib/hooks";
import type { TipoDocumento } from "@/types";

interface Linha {
  id: string;
  artigo_id: string;
  descricao: string;
  unidade: string;
  qtd: string;
  preco: string;
}

function linhaVazia(): Linha {
  return {
    id: crypto.randomUUID(),
    artigo_id: "",
    descricao: "",
    unidade: "",
    qtd: "1",
    preco: "",
  };
}

export function FormularioVenda({
  aoFechar,
  aoGravar,
  emPagina = false,
}: {
  aoFechar: () => void;
  aoGravar: (id: string) => void;
  /**
   * Desenha-se DENTRO DA PÁGINA e não numa janela.
   *
   * Emitir uma factura não é uma operação de passagem: escolhe-se o cliente,
   * escrevem-se as linhas, confere-se o IVA e o total. Numa janela a meio do
   * ecrã, isso fazia-se por um postigo — com a lista de documentos por trás a
   * competir pela atenção e sem largura para as linhas.
   */
  emPagina?: boolean;
}) {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: tipos } = useSWR<TipoDocumento[]>(
    "/api/comercial/tipos-documento",
    buscador,
    { revalidateOnFocus: false },
  );
  // AS LISTAS INTEIRAS DEIXARAM DE SER PEDIDAS. Vinham todos os clientes,
  // todos os vendedores e todos os artigos só para encher três caixas de
  // opções — e com mil artigos era um megabyte para mostrar quinze. A procura
  // passou para o servidor, e o que se pede é o que se vê.
  //
  // `porId` fica: a linha guarda o `artigo_id` e o campo precisa do código e
  // da descrição para os mostrar sem ir perguntar outra vez.
  const { porId } = useArtigos();

  const [tipoDoc, setTipoDoc] = useState("FT");
  const [tipo, setTipo] = useState("mercadorias");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  /** O registo escolhido nas tabelas de pesquisa. Guarda-se o registo inteiro
   *  e não só o id: o campo mostra «001 · Nome» sem ter de ir buscar a lista
   *  toda para traduzir um identificador. */
  const [cliente, setCliente] = useState<Registo | null>(null);
  const [vendedor, setVendedor] = useState<Registo | null>(null);
  /** Criar um cliente sem sair daqui, a partir do que já se escreveu. */
  const [aCriarCliente, setACriarCliente] = useState<string | null>(null);
  const [ivaPerc, setIvaPerc] = useState("14");
  const [docOrigem, setDocOrigem] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const td = useMemo(
    () => tipos?.find((t) => t.cod === tipoDoc),
    [tipos, tipoDoc],
  );

  // Um documento sem IVA (recibo, guia) não deve mostrar campo de taxa — o
  // backend força a zero de qualquer forma.
  const temIva = td?.iva !== false;
  const exigeCliente = td?.exige_cliente === true;
  const exigeReferencia = td?.ref === true;

  const totais = useMemo(() => {
    const subtotal = soma(
      ...linhas.map((l) => multiplica(l.qtd || "0", l.preco || "0")),
    );
    const iva = temIva
      ? subtotal
          .times(big(ivaPerc || "0"))
          .div(100)
          .round(2)
      : big(0);
    return { subtotal, iva, total: subtotal.plus(iva) };
  }, [linhas, ivaPerc, temIva]);

  function alterar(id: string, campo: keyof Linha, valor: string) {
    setLinhas((atual) =>
      atual.map((l) => {
        if (l.id !== id) return l;
        const nova = { ...l, [campo]: valor };
        // Escolher artigo preenche descrição, unidade e preço de venda — o
        // utilizador ainda os pode alterar linha a linha.
        if (campo === "artigo_id" && valor) {
          const a = porId.get(valor);
          if (a) {
            nova.descricao = a.descricao;
            nova.unidade = a.unidade ?? "";
            if (!nova.preco || big(nova.preco).eq(0))
              nova.preco = a.preco_venda;
          }
        }
        return nova;
      }),
    );
  }

  const preenchidas = linhas.filter(
    (l) => (l.descricao || l.artigo_id) && big(l.qtd).gt(0),
  );

  async function submeter() {
    setErro(null);
    if (exigeCliente && !clienteId && !clienteNome.trim()) {
      return setErro(
        `${td?.nome ?? "Este documento"} exige a identificação do cliente.`,
      );
    }
    if (exigeReferencia && !docOrigem.trim()) {
      return setErro(
        `${td?.nome ?? "Este documento"} deve referir o documento de origem.`,
      );
    }
    if (!preenchidas.length) return setErro("Adicione pelo menos uma linha.");
    if (totais.total.lte(0)) return setErro("O documento não tem valor.");

    setAGravar(true);
    try {
      const r = await api.post<{ id: string }>("/api/comercial/vendas", {
        data,
        tipo_doc: tipoDoc,
        tipo,
        cliente_id: clienteId || undefined,
        cliente_nome: clienteId ? undefined : clienteNome.trim() || undefined,
        vendedor_id: vendedorId || undefined,
        iva_perc: temIva ? paraApi(ivaPerc) : "0",
        doc_origem_num: docOrigem.trim() || undefined,
        linhas: preenchidas.map((l) => ({
          artigo_id: l.artigo_id || undefined,
          descricao: l.descricao || undefined,
          unidade: l.unidade || undefined,
          qtd: paraApi(l.qtd, 4),
          preco: paraApi(l.preco),
        })),
      });
      aoGravar(r.id);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  const corpo = (
    <>
      <div
        className={
          emPagina ? "min-w-0 p-5" : "min-w-0 flex-1 overflow-auto p-5"
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Selector
            rotulo="Tipo de documento"
            valor={tipoDoc}
            aoMudar={setTipoDoc}
            opcoes={(tipos ?? []).map((t) => ({
              valor: t.cod,
              rotulo: `${t.cod} — ${t.nome}`,
            }))}
            larguraMinima="16rem"
          />
          <Campo rotulo="Data">
            <Entrada
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Campo>
          <Selector
            rotulo="Natureza"
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { valor: "mercadorias", rotulo: "Mercadorias" },
              { valor: "servicos", rotulo: "Prestação de serviços" },
            ]}
          />
          {/* CLIENTE — tabela de clientes, com F4.
                  Era uma lista de opções com «— Consumidor final —» à cabeça.
                  Com trezentos clientes, escolher era rolar; e não havia forma
                  de criar um sem abandonar a factura. */}
          <Campo
            rotulo={`Cliente${exigeCliente ? "" : " (opcional)"}`}
            dica="F4 ou duplo clique para procurar. Em branco: consumidor final."
            className="min-w-[16rem]"
          >
            <CampoEntidade
              valor={cliente}
              aoEscolher={(r) => {
                setCliente(r);
                setClienteId(r?.id ?? "");
                setClienteNome("");
              }}
              fonte="/api/comercial/clientes/tabela"
              titulo="Clientes"
              placeholder="Consumidor final (F4)"
              colunas={["Nº", "Nome", "NIF · País"]}
              aoCriar={(termo) => setACriarCliente(termo)}
              rotuloCriar="Criar cliente"
            />
          </Campo>
          {!clienteId && (
            <Campo
              rotulo="Nome do cliente"
              dica={
                exigeCliente
                  ? "Obrigatório neste tipo de documento."
                  : "Só se quiser identificar sem ficha."
              }
            >
              <Entrada
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
              />
            </Campo>
          )}
          <Campo
            rotulo="Vendedor"
            dica="F4 para procurar na tabela de vendedores."
          >
            <CampoEntidade
              valor={vendedor}
              aoEscolher={(r) => {
                setVendedor(r);
                setVendedorId(r?.id ?? "");
              }}
              fonte="/api/comercial/vendedores/tabela"
              titulo="Vendedores"
              placeholder="Sem vendedor (F4)"
              colunas={["Sigla", "Nome", "Comissão"]}
            />
          </Campo>
          {temIva && (
            <Campo rotulo="Taxa de IVA (%)">
              <Entrada
                type="number"
                step="0.01"
                min="0"
                value={ivaPerc}
                onChange={(e) => setIvaPerc(e.target.value)}
                className="text-right tabular"
              />
            </Campo>
          )}
          {exigeReferencia && (
            <Campo
              rotulo="Documento de origem"
              dica="A factura que este documento corrige ou liquida."
            >
              <Entrada
                value={docOrigem}
                onChange={(e) => setDocOrigem(e.target.value)}
                placeholder="Ex.: FT 2026/0001"
              />
            </Campo>
          )}
        </div>

        <EnvolveTabela>
          <Tabela>
            <thead>
              <tr>
                <Th className="w-[260px]">Artigo</Th>
                <Th>Descrição</Th>
                <Th className="w-[90px]">Un.</Th>
                <Th numerico className="w-[110px]">
                  Qtd.
                </Th>
                <Th numerico className="w-[140px]">
                  Preço
                </Th>
                <Th numerico className="w-[140px]">
                  Total
                </Th>
                <Th className="w-[44px]" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-borda last:border-b-0"
                >
                  <Td className="p-2">
                    {/* ARTIGO — tabela de artigos, com F4. Era uma lista
                            de opções com todos os artigos lá dentro: com mil
                            artigos, escolher um era percorrer mil. Aqui
                            procura-se por código, descrição ou referência. */}
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
                        alterar(l.id, "artigo_id", r?.id ?? "")
                      }
                      fonte="/api/logistica/artigos/tabela"
                      titulo="Artigos"
                      placeholder="Linha livre (F4)"
                      colunas={["Código", "Descrição", "Unidade · Preço"]}
                      emGrelha
                      semBotao
                    />
                  </Td>
                  <Td className="p-2">
                    <Entrada
                      value={l.descricao}
                      onChange={(e) =>
                        alterar(l.id, "descricao", e.target.value)
                      }
                      placeholder="Descrição"
                    />
                  </Td>
                  <Td className="p-2">
                    <Entrada
                      value={l.unidade}
                      onChange={(e) => alterar(l.id, "unidade", e.target.value)}
                    />
                  </Td>
                  <Td className="p-2">
                    <Entrada
                      type="number"
                      step="0.0001"
                      min="0"
                      value={l.qtd}
                      onChange={(e) => alterar(l.id, "qtd", e.target.value)}
                      className="text-right tabular"
                    />
                  </Td>
                  <Td className="p-2">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.preco}
                      onChange={(e) => alterar(l.id, "preco", e.target.value)}
                      className="text-right tabular"
                    />
                  </Td>
                  <Td numerico className="font-semibold">
                    {formataMoeda(
                      multiplica(l.qtd || "0", l.preco || "0"),
                      moeda,
                    )}
                  </Td>
                  <Td className="p-2">
                    <button
                      type="button"
                      aria-label="Remover linha"
                      disabled={linhas.length <= 1}
                      onClick={() =>
                        setLinhas((a) => a.filter((x) => x.id !== l.id))
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda text-texto-suave hover:border-perigo hover:text-perigo disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </EnvolveTabela>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <Botao
            tamanho="pequeno"
            onClick={() => setLinhas((a) => [...a, linhaVazia()])}
          >
            <Plus size={14} />
            Adicionar linha
          </Botao>

          <div className="min-w-[240px] rounded-xl border border-borda bg-superficie-2 p-3">
            <LinhaTotal
              rotulo="Subtotal"
              valor={totais.subtotal}
              moeda={moeda}
            />
            {temIva && (
              <LinhaTotal
                rotulo={`IVA (${ivaPerc || 0}%)`}
                valor={totais.iva}
                moeda={moeda}
              />
            )}
            <div className="mt-2 border-t border-borda pt-2">
              <LinhaTotal
                rotulo="Total"
                valor={totais.total}
                moeda={moeda}
                destaque
              />
            </div>
          </div>
        </div>

        {td && (
          <Alerta tipo="info" className="mt-3">
            {td.contab === "nenhum"
              ? `${td.nome} não gera lançamento contabilístico.`
              : `${td.nome} vai gerar um lançamento na contabilidade quando for emitido.`}
            {tipo === "mercadorias" &&
              (td.contab === "venda" || td.contab === "venda_pronto") &&
              " As linhas ligadas a artigos dão baixa de stock e lançam o CMVMC."}
          </Alerta>
        )}

        {erro && <Alerta tipo="erro">{erro}</Alerta>}
      </div>

      <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={submeter} disabled={aGravar}>
          {aGravar ? "A gravar…" : "Gravar rascunho"}
        </Botao>
      </div>
      {aCriarCliente !== null && (
        <CriarClienteRapido
          nomeInicial={aCriarCliente}
          aoFechar={() => setACriarCliente(null)}
          aoCriar={(c) => {
            // Criar e USAR: o cliente novo fica escolhido na factura que estava
            // a ser preenchida. Criar e deixar a pessoa escolhê-lo outra vez na
            // lista era metade do trabalho.
            setCliente({
              id: c.id,
              codigo: c.numero,
              nome: c.nome,
              detalhe: [c.nif, c.pais].filter(Boolean).join(" · "),
            });
            setClienteId(c.id);
            setClienteNome("");
            setACriarCliente(null);
          }}
        />
      )}
    </>
  );

  // DENTRO DA PÁGINA: sem janela, sem sombra e sem fundo escuro por trás. O
  // separador já diz onde se está, e o cartão é o mesmo de todos os outros
  // ecrãs.
  if (emPagina) {
    return (
      <div className="min-w-0 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-suave">
        {corpo}
      </div>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(1100px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo documento de venda
            </Dialog.Title>
            <button
              type="button"
              aria-label="Fechar"
              onClick={aoFechar}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
            >
              <X size={15} />
            </button>
          </div>
          {corpo}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LinhaTotal({
  rotulo,
  valor,
  moeda,
  destaque,
}: {
  rotulo: string;
  valor: unknown;
  moeda: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={
          destaque ? "text-sm font-extrabold" : "text-[13px] text-texto-suave"
        }
      >
        {rotulo}
      </span>
      <span
        className={
          destaque ? "text-base font-extrabold tabular" : "text-sm tabular"
        }
      >
        {formataMoeda(valor as string, moeda)}
      </span>
    </div>
  );
}
