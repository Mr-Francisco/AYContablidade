"use client";

import { Search, Undo2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { Confirmar, DialogoMestre } from "@/components/ui/CrudMestre";
import {
  BarraPaginacao,
  CaixaHistorico,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda, multiplica, soma } from "@/lib/dinheiro";
import { useArtigos, useExercicios } from "@/lib/hooks";
import { numeroLimpo } from "@/lib/texto";

interface Armazem {
  id: string;
  codigo: string;
  nome: string;
  localizacao: string | null;
}

interface Movimento {
  id: string;
  numero: string;
  tipo: string;
  data: string;
  artigo_desc: string | null;
  armazem_id: string;
  armazem_destino_id: string | null;
  qtd: string;
  unidade: string | null;
  custo_unit: string;
  valor: string;
  documento: string | null;
  entidade: string | null;
  numero_op: string | null;
  /** Preenchido quando este movimento já foi anulado. */
  estornado_em: string | null;
  /** Preenchido quando ESTE movimento é a anulação de outro. */
  estorna_id: string | null;
}

export interface ConfigMovimento {
  tipo: "entrada" | "saida" | "transferencia" | "ajuste";
  titulo: string;
  descricao: string;
  /** Só nos ajustes: positivo soma ao stock, negativo tira. */
  sinal?: 1 | -1;
  /** Quem indica o custo unitário. */
  custoEditavel: boolean;
  /** A que valor cai o custo quando o utilizador não o preenche. */
  custoPadrao?: "compra" | "cump";
  pedeDestino?: boolean;
  pedeEntidade?: boolean;
  pedeIva?: boolean;
  /** Explica o efeito contabilístico, para não ser uma caixa preta. */
  efeito: string;
}

export function PaginaMovimento({ config }: { config: ConfigMovimento }) {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const { artigos, porId } = useArtigos();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: armazens } = useSWR<Armazem[]>(
    "/api/logistica/armazens",
    buscador,
    { revalidateOnFocus: false },
  );
  const pag = usePaginacao();
  const {
    data: pagina,
    isLoading,
    mutate,
  } = useSWR<Pagina<Movimento>>(
    `/api/logistica/movimentos?tipo=${config.tipo}&${pag.query}`,
    buscador,
  );
  const movimentos = pagina?.linhas;

  const [artigoId, setArtigoId] = useState("");
  const [armazemId, setArmazemId] = useState("");
  const [armazemDestinoId, setArmazemDestinoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [custoUnit, setCustoUnit] = useState("");
  const [ivaPerc, setIvaPerc] = useState("14");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [documento, setDocumento] = useState("");
  const [entidade, setEntidade] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [procura, setProcura] = useState("");
  const [aberto, setAberto] = useState(false);
  const [aAnular, setAAnular] = useState<Movimento | null>(null);

  const artigo = artigoId ? porId.get(artigoId) : undefined;

  // Stock actual do artigo no armazém escolhido — evita descobrir só ao gravar
  // que não há existências suficientes.
  const { data: stock } = useSWR<{ stock: string; custo_medio: string }>(
    artigoId
      ? `/api/logistica/stock/${artigoId}${armazemId ? `?armazem_id=${armazemId}` : ""}`
      : null,
    buscador,
  );

  // Só para o KPI «Valor de stock» — o Piloto mostra-o em todas as páginas de
  // movimento, para se ver a escala do que se está a mexer.
  const { data: existencias } = useSWR<{ valor_total: string }>(
    "/api/logistica/existencias",
    buscador,
    { revalidateOnFocus: false },
  );

  const nomeArmazem = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of armazens ?? []) m.set(a.id, `${a.codigo} — ${a.nome}`);
    return m;
  }, [armazens]);

  // Espelha exactamente o que o backend faz na ausência de custo indicado:
  // saídas e transferências saem sempre ao CUMP, os acertos negativos caem no
  // CUMP, e as entradas e acertos positivos caem no preço de compra da ficha.
  const custoPadrao =
    !config.custoEditavel || config.custoPadrao === "cump"
      ? (stock?.custo_medio ?? "0")
      : (artigo?.preco_compra ?? "0");

  const valorEstimado = useMemo(
    () =>
      multiplica(
        qtd || "0",
        (config.custoEditavel && custoUnit) || custoPadrao,
      ),
    [qtd, custoUnit, custoPadrao, config.custoEditavel],
  );

  async function submeter() {
    setErro(null);
    setSucesso(null);
    if (!artigoId) return setErro("Escolha o artigo.");
    if (!armazemId) return setErro("Escolha o armazém.");
    if (!qtd || big(qtd).lte(0))
      return setErro("Indique uma quantidade maior do que zero.");
    if (config.pedeDestino && !armazemDestinoId) {
      return setErro("Escolha o armazém de destino.");
    }
    if (config.pedeDestino && armazemDestinoId === armazemId) {
      return setErro("O armazém de destino tem de ser diferente da origem.");
    }

    setOcupado(true);
    try {
      // Nos acertos, o sinal da quantidade é o que distingue ganho de quebra.
      const quantidade = config.sinal === -1 ? `-${qtd}` : qtd;
      const r = await api.post<{
        numero: string;
        valor: string;
        custo_unit: string;
      }>("/api/logistica/movimentos", {
        tipo: config.tipo,
        artigo_id: artigoId,
        armazem_id: armazemId,
        armazem_destino_id: config.pedeDestino ? armazemDestinoId : undefined,
        qtd: quantidade,
        data,
        custo_unit: config.custoEditavel && custoUnit ? custoUnit : undefined,
        iva_perc: config.pedeIva ? ivaPerc : undefined,
        documento: documento || undefined,
        entidade: config.pedeEntidade ? entidade || undefined : undefined,
        descricao: descricao || undefined,
        exercicio_id: activo?.id,
      });
      setSucesso(
        `${config.titulo} ${r.numero} registada — ${formataMoeda(r.valor, moeda)} ao custo de ${formataMoeda(r.custo_unit, moeda)}.`,
      );
      setQtd("");
      setCustoUnit("");
      setDocumento("");
      setDescricao("");
      setAberto(false);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível registar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function anular() {
    if (!aAnular) return;
    setErro(null);
    setOcupado(true);
    try {
      const r = await api.post<{
        compensacao: string;
        numero_op: string | null;
      }>(`/api/logistica/movimentos/${aAnular.id}/anular`, {});
      setSucesso(
        `Movimento ${aAnular.numero} anulado — foi criado o movimento ` +
          `contrário ${r.compensacao}` +
          (r.numero_op ? `, com o lançamento ${r.numero_op}.` : "."),
      );
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível anular.",
      );
    } finally {
      setOcupado(false);
      setAAnular(null);
    }
  }

  // A pesquisa é sobre o número e o artigo, como no Piloto.
  const listados = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    if (!termo) return movimentos ?? [];
    return (movimentos ?? []).filter((m) =>
      `${m.numero} ${m.artigo_desc ?? ""}`.toLowerCase().includes(termo),
    );
  }, [movimentos, procura]);

  const totalQtd = listados.reduce(
    (s, m) => s.plus(big(m.qtd).abs()),
    big("0"),
  );
  const totalValor = soma(...listados.map((m) => m.valor));

  return (
    <>
      <CabecalhoPagina titulo={config.titulo} descricao={config.descricao} />

      {/* Os quatro KPIs do `stock-ui.js`: quantos movimentos, que quantidade,
          que valor, e o valor total das existências para dar escala. */}
      <GrelhaKpis>
        <Kpi
          rotulo={`${config.titulo} (nº)`}
          valor={String(listados.length)}
          detalhe="movimentos"
          cor={config.sinal === -1 ? "#c0392b" : "#16a085"}
        />
        <Kpi
          rotulo="Quantidade"
          valor={totalQtd.toString()}
          detalhe="unidades"
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Valor"
          valor={formataMoeda(totalValor.toString(), moeda, 0)}
          detalhe="custo"
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Valor de stock"
          valor={formataMoeda(existencias?.valor_total ?? "0", moeda, 0)}
          detalhe="total"
          cor="var(--color-sucesso)"
        />
      </GrelhaKpis>

      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Cartao className="mb-4">
        <BarraFiltros>
          <Campo rotulo="" className="min-w-[220px] flex-1">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
                aria-hidden
              />
              <Entrada
                type="search"
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Pesquisar…"
                className="pl-9"
              />
            </div>
          </Campo>
          {pode("logistica.gerir") && (
            <Botao variante="acento" onClick={() => setAberto(true)}>
              + {config.titulo}
            </Botao>
          )}
        </BarraFiltros>
      </Cartao>

      <Cartao className="p-0">
        <TituloCartao className="px-5 pt-5" extra="Últimos 100">
          Histórico
        </TituloCartao>
        {isLoading ? (
          <ACarregar />
        ) : listados.length === 0 ? (
          <Vazio>Ainda não há movimentos deste tipo.</Vazio>
        ) : (
          <CaixaHistorico altura={460}>
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Número</Th>
                    <Th>Data</Th>
                    <Th>Artigo</Th>
                    <Th>Armazém</Th>
                    {config.pedeDestino && <Th>Destino</Th>}
                    <Th numerico>Qtd.</Th>
                    <Th numerico>Custo unit.</Th>
                    <Th numerico>Valor</Th>
                    <Th>Nº Operação</Th>
                    {pode("logistica.gerir") && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {listados.map((m) => (
                    <Tr key={m.id}>
                      <Td className="tabular font-bold">{m.numero}</Td>
                      <Td className="tabular">
                        {new Date(m.data).toLocaleDateString("pt-PT")}
                      </Td>
                      <Td className="max-w-[240px] truncate">
                        {m.artigo_desc || "—"}
                      </Td>
                      <Td className="max-w-[160px] truncate text-texto-suave">
                        {nomeArmazem.get(m.armazem_id) ?? "—"}
                      </Td>
                      {config.pedeDestino && (
                        <Td className="max-w-[160px] truncate text-texto-suave">
                          {m.armazem_destino_id
                            ? (nomeArmazem.get(m.armazem_destino_id) ?? "—")
                            : "—"}
                        </Td>
                      )}
                      {/* Sem zeros à direita: uma quantidade não é dinheiro, e
                        «40,0000 Un» lê-se pior do que «40 Un». */}
                      <Td numerico>
                        {numeroLimpo(m.qtd)} {m.unidade ?? ""}
                      </Td>
                      <Td numerico>{formataMoeda(m.custo_unit, moeda)}</Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(m.valor, moeda)}
                      </Td>
                      {/* O nº de operação LIGA ao lançamento — é o que fecha o
                        circuito entre o stock e a contabilidade. */}
                      <Td className="tabular text-texto-suave">
                        {m.numero_op ? (
                          <Link
                            href="/contabilidade/movimentos"
                            className="font-semibold text-marca hover:underline"
                          >
                            {m.numero_op}
                          </Link>
                        ) : (
                          <Selo cor="#62657a">sem lançamento</Selo>
                        )}
                      </Td>
                      {/* Anular uma vez. Um movimento já anulado, ou que É a
                        anulação de outro, não se anula de novo — e diz-se
                        aqui, para não se descobrir só depois de carregar. */}
                      {pode("logistica.gerir") && (
                        <Td numerico>
                          {m.estornado_em ? (
                            <Selo cor="#c0392b">Anulado</Selo>
                          ) : m.estorna_id ? (
                            <Selo cor="#62657a">Anulação</Selo>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAAnular(m)}
                              title="Anular este movimento"
                              className="rounded-md border border-borda px-2 py-1 text-[11.5px] font-semibold text-texto-suave hover:border-perigo hover:text-perigo"
                            >
                              <Undo2 size={12} className="mr-1 inline" />
                              Anular
                            </button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          </CaixaHistorico>
        )}
        <BarraPaginacao pagina={pagina} nome="movimentos" {...pag.controlos} />
      </Cartao>
      {aAnular && (
        <Confirmar
          aberto
          aoMudar={(a) => {
            if (!a) setAAnular(null);
          }}
          titulo={`Anular o movimento ${aAnular.numero}?`}
          rotuloConfirmar="Anular"
          rotuloOcupado="A anular…"
          variante="perigo"
          aoConfirmar={anular}
          ocupado={ocupado}
        >
          O movimento <b>não é apagado</b>: fica no histórico marcado como
          anulado, e é criado um movimento contrário que o reverte. Se tiver
          lançamento, ele é estornado com as mesmas contas e os valores
          trocados. É o que permite responder mais tarde a quem pergunte o que
          se passou — uma linha apagada não responde a nada.
        </Confirmar>
      )}

      {aberto && (
        <DialogoMestre
          titulo={config.titulo}
          aoFechar={() => {
            setAberto(false);
            setErro(null);
          }}
          aoSubmeter={(e) => {
            e.preventDefault();
            submeter();
          }}
          aGravar={ocupado}
          erro={erro}
          rotuloGravar="Registar"
          aviso={
            <>
              {!config.custoEditavel && (
                <Alerta tipo="info">
                  O custo unitário não é editável nesta operação — sai sempre ao
                  Custo Médio Ponderado corrente do armazém de origem. É essa
                  regra que mantém a valorização das existências coerente.
                </Alerta>
              )}
              <Alerta tipo="info">{config.efeito}</Alerta>
              {/* O «resumo» do Piloto: stock actual, CUMP e valor, os três
                  números que dizem se o movimento faz sentido antes de o
                  gravar. */}
              <div className="flex flex-wrap justify-end gap-4 text-[13px] text-texto-suave">
                <span>
                  Stock actual{" "}
                  <b className="tabular text-texto">
                    {stock?.stock ?? "—"} {artigo?.unidade ?? ""}
                  </b>
                </span>
                {!config.custoEditavel && (
                  <span>
                    CUMP do armazém{" "}
                    <b className="tabular text-texto">
                      {formataMoeda(stock?.custo_medio ?? "0", moeda)}
                    </b>
                  </span>
                )}
                <span>
                  Valor{" "}
                  <b className="tabular text-texto">
                    {formataMoeda(valorEstimado, moeda)}
                  </b>
                </span>
              </div>
            </>
          }
        >
          <Selector
            rotulo="Artigo"
            valor={artigoId}
            aoMudar={setArtigoId}
            opcoes={artigos.map((a) => ({
              valor: a.id,
              rotulo: `${a.codigo} — ${a.descricao}`,
            }))}
            placeholder="Escolher artigo…"
            larguraMinima="16rem"
          />
          <Selector
            rotulo={config.pedeDestino ? "Armazém de origem" : "Armazém"}
            valor={armazemId}
            aoMudar={setArmazemId}
            opcoes={(armazens ?? []).map((a) => ({
              valor: a.id,
              rotulo: `${a.codigo} — ${a.nome}`,
            }))}
            placeholder="Escolher armazém…"
          />
          {config.pedeDestino && (
            <Selector
              rotulo="Armazém de destino"
              valor={armazemDestinoId}
              aoMudar={setArmazemDestinoId}
              opcoes={(armazens ?? [])
                .filter((a) => a.id !== armazemId)
                .map((a) => ({
                  valor: a.id,
                  rotulo: `${a.codigo} — ${a.nome}`,
                }))}
              placeholder="Escolher destino…"
            />
          )}
          <Campo
            rotulo={`Quantidade${artigo?.unidade ? ` (${artigo.unidade})` : ""}`}
            dica={
              stock
                ? `Em stock: ${stock.stock} · custo médio ${formataMoeda(stock.custo_medio, moeda)}`
                : undefined
            }
          >
            <Entrada
              type="number"
              step="0.0001"
              min="0"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          {config.custoEditavel && (
            <Campo
              rotulo="Custo unitário"
              dica={
                artigo
                  ? config.custoPadrao === "cump"
                    ? `Em branco usa o custo médio: ${formataMoeda(custoPadrao, moeda)}`
                    : `Em branco usa o preço de compra da ficha: ${formataMoeda(artigo.preco_compra, moeda)}`
                  : undefined
              }
            >
              <Entrada
                type="number"
                step="0.01"
                min="0"
                value={custoUnit}
                onChange={(e) => setCustoUnit(e.target.value)}
                placeholder={artigo ? custoPadrao : ""}
                className="text-right tabular"
              />
            </Campo>
          )}
          {config.pedeIva && (
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
          )}
          <Campo rotulo="Data">
            <Entrada
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Campo>
          {config.pedeEntidade && (
            <Campo rotulo="Fornecedor">
              <Entrada
                value={entidade}
                onChange={(e) => setEntidade(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </Campo>
          )}
          <Campo rotulo="Documento">
            <Entrada
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Referência externa"
            />
          </Campo>
          <Campo rotulo="Descrição" className="sm:col-span-2">
            <Entrada
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>
        </DialogoMestre>
      )}
    </>
  );
}
