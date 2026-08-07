"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda, multiplica } from "@/lib/dinheiro";
import { useArtigos, useExercicios } from "@/lib/hooks";

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
  const {
    data: movimentos,
    isLoading,
    mutate,
  } = useSWR<Movimento[]>(
    `/api/logistica/movimentos?tipo=${config.tipo}&limite=100`,
    buscador,
  );

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

  const artigo = artigoId ? porId.get(artigoId) : undefined;

  // Stock actual do artigo no armazém escolhido — evita descobrir só ao gravar
  // que não há existências suficientes.
  const { data: stock } = useSWR<{ stock: string; custo_medio: string }>(
    artigoId
      ? `/api/logistica/stock/${artigoId}${armazemId ? `?armazem_id=${armazemId}` : ""}`
      : null,
    buscador,
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

  return (
    <>
      <CabecalhoPagina titulo={config.titulo} descricao={config.descricao} />

      {sucesso && <Alerta tipo="sucesso">{sucesso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {pode("logistica.gerir") && (
        <Cartao className="mb-4">
          <TituloCartao>Registar {config.titulo.toLowerCase()}</TituloCartao>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>

          {!config.custoEditavel && (
            <Alerta tipo="info" className="mt-3">
              O custo unitário não é editável nesta operação — sai sempre ao
              Custo Médio Ponderado corrente do armazém de origem. É essa regra
              que mantém a valorização das existências coerente.
            </Alerta>
          )}

          <Alerta tipo="info" className="mt-1">
            {config.efeito}
          </Alerta>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-texto-suave">
              Valor estimado:{" "}
              <b className="tabular text-texto">
                {formataMoeda(valorEstimado, moeda)}
              </b>
            </span>
            <Botao variante="primario" onClick={submeter} disabled={ocupado}>
              {ocupado
                ? "A registar…"
                : `Registar ${config.titulo.toLowerCase()}`}
            </Botao>
          </div>
        </Cartao>
      )}

      <Cartao className="p-0">
        <TituloCartao className="px-5 pt-5" extra="Últimos 100">
          Histórico
        </TituloCartao>
        {isLoading ? (
          <ACarregar />
        ) : !movimentos?.length ? (
          <Vazio>Ainda não há movimentos deste tipo.</Vazio>
        ) : (
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
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => (
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
                    <Td numerico>
                      {m.qtd} {m.unidade ?? ""}
                    </Td>
                    <Td numerico>{formataMoeda(m.custo_unit, moeda)}</Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(m.valor, moeda)}
                    </Td>
                    <Td className="tabular text-texto-suave">
                      {m.numero_op ?? <Selo cor="#62657a">sem lançamento</Selo>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
