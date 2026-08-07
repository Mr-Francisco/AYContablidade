"use client";

import { Plus, Search, X } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";

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
import { formataMoeda } from "@/lib/dinheiro";
import { useContas } from "@/lib/hooks";
import type { Artigo } from "@/types";

const TIPOS = ["Mercadoria", "Produto acabado", "Matéria-prima", "Serviço"];
const UNIDADES = ["Un", "Cx", "Kg", "L", "M", "M²", "Par"];

export default function Artigos() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [vista, setVista] = useState("familia");
  const [novoAberto, setNovoAberto] = useState(false);

  const { data, isLoading, mutate } = useSWR<Artigo[]>(
    "/api/logistica/artigos",
    buscador,
  );

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    if (!t) return data ?? [];
    return (data ?? []).filter(
      (a) =>
        a.descricao.toLowerCase().includes(t) ||
        a.codigo.toLowerCase().includes(t) ||
        (a.familia ?? "").toLowerCase().includes(t),
    );
  }, [data, procura]);

  // Agrupar por família é a vista por defeito do Piloto: num catálogo com
  // centenas de artigos, a lista corrida não diz nada sobre a sua estrutura.
  const grupos = useMemo(() => {
    const m = new Map<string, Artigo[]>();
    for (const a of filtrados) {
      const chave = a.familia?.trim() || "Sem família";
      const lista = m.get(chave);
      if (lista) lista.push(a);
      else m.set(chave, [a]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt"));
  }, [filtrados]);

  return (
    <>
      <CabecalhoPagina
        titulo="Artigos"
        descricao="Catálogo de artigos, preços e contas de contabilização."
        accoes={
          pode("logistica.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo artigo
            </Botao>
          )
        }
      />

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
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código, descrição ou família…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Vista"
          valor={vista}
          aoMudar={setVista}
          opcoes={[
            { valor: "familia", rotulo: "Agrupar por família" },
            { valor: "lista", rotulo: "Lista simples" },
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !filtrados.length ? (
        <Cartao>
          <Vazio>
            {procura.trim()
              ? "Nenhum artigo corresponde à pesquisa."
              : "Ainda não há artigos no catálogo."}
          </Vazio>
        </Cartao>
      ) : vista === "lista" ? (
        <Cartao className="p-0">
          <TabelaArtigos artigos={filtrados} moeda={moeda} />
        </Cartao>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map(([familia, artigos]) => (
            <Cartao key={familia} className="p-0">
              <div className="flex items-center justify-between border-b border-borda px-5 py-3">
                <h2 className="text-[15px] font-bold">{familia}</h2>
                <span className="text-xs text-texto-suave">
                  {artigos.length} {artigos.length === 1 ? "artigo" : "artigos"}
                </span>
              </div>
              <TabelaArtigos artigos={artigos} moeda={moeda} />
            </Cartao>
          ))}
        </div>
      )}

      {novoAberto && (
        <FormularioArtigo
          aoFechar={() => setNovoAberto(false)}
          aoGravar={() => {
            setNovoAberto(false);
            mutate();
          }}
        />
      )}
    </>
  );
}

function TabelaArtigos({
  artigos,
  moeda,
}: {
  artigos: Artigo[];
  moeda: string;
}) {
  return (
    <EnvolveTabela className="rounded-none border-0">
      <Tabela>
        <thead>
          <tr>
            <Th>Código</Th>
            <Th>Descrição</Th>
            <Th>Tipo</Th>
            <Th>Un.</Th>
            <Th numerico>Preço venda</Th>
            <Th numerico>Preço compra</Th>
            <Th numerico>IVA</Th>
            <Th numerico>Stock mín.</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {artigos.map((a) => (
            <Tr key={a.id}>
              <Td className="tabular font-bold">{a.codigo}</Td>
              <Td className="max-w-[300px] truncate font-semibold">
                {a.descricao}
              </Td>
              <Td className="text-texto-suave">{a.tipo_artigo || "—"}</Td>
              <Td>{a.unidade || "—"}</Td>
              <Td numerico>{formataMoeda(a.preco_venda, moeda)}</Td>
              <Td numerico>{formataMoeda(a.preco_compra, moeda)}</Td>
              <Td numerico>{a.taxa_iva} %</Td>
              <Td numerico>{a.stock_min}</Td>
              <Td>
                <Selo cor={a.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}>
                  {a.estado === "activo" ? "Activo" : "Inactivo"}
                </Selo>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabela>
    </EnvolveTabela>
  );
}

const SEPARADOR =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-texto-suave data-[state=active]:bg-superficie data-[state=active]:text-texto data-[state=active]:shadow-suave";

function FormularioArtigo({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { contas } = useContas({ soMovimento: true });
  // Mesma chave da listagem: o SWR devolve da cache, não repete o pedido.
  const { data: existentes } = useSWR<Artigo[]>(
    "/api/logistica/artigos",
    buscador,
  );
  const familias = useMemo(() => {
    const nomes = (existentes ?? [])
      .map((a) => a.familia?.trim())
      .filter((f): f is string => !!f);
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt"));
  }, [existentes]);

  const [campos, setCampos] = useState({
    codigo: "",
    descricao: "",
    tipo_artigo: "Mercadoria",
    familia: "",
    subfamilia: "",
    unidade: "Un",
    cod_barras: "",
    estado: "activo",
    preco_venda: "0",
    preco_compra: "0",
    taxa_iva: "14",
    stock_min: "0",
    conta_existencia: "",
    conta_custo: "",
    conta_proveito: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  // A margem é informativa e não se grava: é sempre derivável dos dois preços,
  // e guardá-la deixaria três campos que se podem contradizer.
  const margem = useMemo(() => {
    const v = Number(campos.preco_venda);
    const c = Number(campos.preco_compra);
    if (!c || !v) return null;
    return (((v - c) / c) * 100).toFixed(2);
  }, [campos.preco_venda, campos.preco_compra]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!campos.descricao.trim()) return setErro("Indique a descrição.");
    setAGravar(true);
    try {
      await api.post("/api/logistica/artigos", {
        ...campos,
        codigo: campos.codigo.trim() || null,
        descricao: campos.descricao.trim(),
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

  const opcoesContas = contas.map((c) => ({
    valor: c.codigo,
    rotulo: `${c.codigo} — ${c.nome}`,
  }));

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo artigo
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
            id="form-artigo"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <Tabs.Root defaultValue="geral">
              <Tabs.List className="mb-4 inline-flex gap-1 rounded-xl bg-fundo p-1">
                <Tabs.Trigger value="geral" className={SEPARADOR}>
                  Geral
                </Tabs.Trigger>
                <Tabs.Trigger value="precos" className={SEPARADOR}>
                  Preços
                </Tabs.Trigger>
                <Tabs.Trigger value="contas" className={SEPARADOR}>
                  Contabilização
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="geral">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Código"
                    dica="Em branco atribui o próximo número livre."
                  >
                    <Entrada
                      value={campos.codigo}
                      onChange={(e) => alterar("codigo", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                  <Selector
                    rotulo="Tipo de artigo"
                    valor={campos.tipo_artigo}
                    aoMudar={(v) => alterar("tipo_artigo", v)}
                    opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))}
                  />
                  <Campo rotulo="Descrição" className="sm:col-span-2">
                    <Entrada
                      value={campos.descricao}
                      onChange={(e) => alterar("descricao", e.target.value)}
                      required
                      autoFocus
                    />
                  </Campo>
                  <Campo rotulo="Família">
                    <Entrada
                      value={campos.familia}
                      onChange={(e) => alterar("familia", e.target.value)}
                      list="familias-existentes"
                    />
                    <datalist id="familias-existentes">
                      {familias.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </Campo>
                  <Campo rotulo="Subfamília">
                    <Entrada
                      value={campos.subfamilia}
                      onChange={(e) => alterar("subfamilia", e.target.value)}
                    />
                  </Campo>
                  <Selector
                    rotulo="Unidade"
                    valor={campos.unidade}
                    aoMudar={(v) => alterar("unidade", v)}
                    opcoes={UNIDADES.map((u) => ({ valor: u, rotulo: u }))}
                  />
                  <Campo rotulo="Código de barras">
                    <Entrada
                      value={campos.cod_barras}
                      onChange={(e) => alterar("cod_barras", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                  <Selector
                    rotulo="Estado"
                    valor={campos.estado}
                    aoMudar={(v) => alterar("estado", v)}
                    opcoes={[
                      { valor: "activo", rotulo: "Activo" },
                      { valor: "inactivo", rotulo: "Inactivo" },
                    ]}
                  />
                </div>
              </Tabs.Content>

              <Tabs.Content value="precos">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Preço de venda">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.preco_venda}
                      onChange={(e) => alterar("preco_venda", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo rotulo="Preço de compra">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.preco_compra}
                      onChange={(e) => alterar("preco_compra", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo rotulo="Taxa de IVA (%)">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.taxa_iva}
                      onChange={(e) => alterar("taxa_iva", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo rotulo="Stock mínimo">
                    <Entrada
                      type="number"
                      step="0.0001"
                      min="0"
                      value={campos.stock_min}
                      onChange={(e) => alterar("stock_min", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                </div>
                {margem && (
                  <Alerta tipo="info" className="mt-3">
                    Margem sobre o preço de compra:{" "}
                    <b className="tabular">{margem} %</b>. É calculada dos dois
                    preços, não se grava.
                  </Alerta>
                )}
              </Tabs.Content>

              <Tabs.Content value="contas">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Selector
                    rotulo="Conta de existências"
                    valor={campos.conta_existencia}
                    aoMudar={(v) => alterar("conta_existencia", v)}
                    opcoes={opcoesContas}
                    placeholder="Usar a da configuração"
                    larguraMinima="100%"
                  />
                  <Selector
                    rotulo="Conta de custo"
                    valor={campos.conta_custo}
                    aoMudar={(v) => alterar("conta_custo", v)}
                    opcoes={opcoesContas}
                    placeholder="Usar a da configuração"
                    larguraMinima="100%"
                  />
                  <Selector
                    rotulo="Conta de proveito"
                    valor={campos.conta_proveito}
                    aoMudar={(v) => alterar("conta_proveito", v)}
                    opcoes={opcoesContas}
                    placeholder="Usar a do tipo de documento"
                    larguraMinima="100%"
                  />
                </div>
                <Alerta tipo="info" className="mt-3">
                  Deixe em branco para o artigo seguir as contas definidas na
                  configuração do módulo. Só vale a pena preencher aqui quando
                  este artigo tem de ir para contas diferentes dos restantes.
                </Alerta>
              </Tabs.Content>
            </Tabs.Root>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-artigo"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar artigo"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
