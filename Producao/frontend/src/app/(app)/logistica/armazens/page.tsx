"use client";

import { Plus, Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
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
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { AccoesDaLinha, ConfirmarEliminar } from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import type { Armazem } from "@/types";

const ROTA = "/api/logistica/armazens";

export default function Armazens() {
  const { pode, empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Armazem | null>(null);
  const [aApagar, setAApagar] = useState<Armazem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("logistica.gerir");

  const { data, isLoading, mutate } = useSWR<Armazem[]>(ROTA, buscador);
  const { data: resumo } = useSWR<
    { codigo: string; artigos: number; valor: string }[]
  >("/api/logistica/armazens/resumo", buscador, { revalidateOnFocus: false });

  const [procura, setProcura] = useState("");
  const conteudo = new Map((resumo ?? []).map((r) => [r.codigo, r] as const));
  const visiveis = (data ?? []).filter((a) => {
    const q = procura.trim().toLowerCase();
    if (!q) return true;
    return (
      a.codigo.toLowerCase().includes(q) ||
      a.nome.toLowerCase().includes(q) ||
      (a.localizacao ?? "").toLowerCase().includes(q)
    );
  });

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`${ROTA}/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAApagar(null);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Armazéns"
        descricao="Locais de existências. O stock e o custo médio são calculados por armazém."
        accoes={
          pode("logistica.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo armazém
            </Botao>
          )
        }
      />

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[16rem] flex-1">
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código, nome ou localização…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      {erro && (
        <div className="mb-4">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !visiveis.length ? (
          <Vazio>
            {procura.trim()
              ? "Nenhum armazém corresponde à pesquisa."
              : "Ainda não há armazéns registados."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Localização</Th>
                  <Th numerico>Artigos</Th>
                  <Th numerico>Valor em stock</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((a) => (
                  <Tr key={a.id}>
                    <Td className="tabular font-bold">{a.codigo}</Td>
                    <Td className="font-semibold">{a.nome}</Td>
                    <Td className="text-texto-suave">{a.localizacao || "—"}</Td>
                    {/* O que o armazém tem lá dentro. Uma lista de armazéns
                        sem isto responde «onde» e não responde «o quê» — e é a
                        segunda a pergunta que se faz. */}
                    <Td numerico className="text-texto-suave">
                      {conteudo.get(a.codigo)?.artigos ?? 0}
                    </Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(
                        conteudo.get(a.codigo)?.valor ?? "0",
                        moeda,
                      )}
                    </Td>
                    {podeGerir && (
                      <Td>
                        <AccoesDaLinha
                          nome={`armazém ${a.codigo}`}
                          aoEditar={() => setEmEdicao(a)}
                          aoApagar={() => setAApagar(a)}
                          desactivado={ocupado}
                        />
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {(novoAberto || emEdicao) && (
        <FormularioArmazem
          armazem={emEdicao}
          aoFechar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
            mutate();
          }}
        />
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar o armazém ${aApagar?.codigo ?? ""}?`}
        aoConfirmar={eliminar}
        ocupado={ocupado}
      >
        Um armazém <b>com movimentos de stock não pode ser eliminado</b> — as
        existências ficariam atribuídas a um destino que já não existe. Nesse
        caso o servidor recusa.
      </ConfirmarEliminar>
    </>
  );
}

function FormularioArmazem({
  armazem,
  aoFechar,
  aoGravar,
}: {
  armazem: Armazem | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = armazem === null;
  const [codigo, setCodigo] = useState(armazem?.codigo ?? "");
  const [nome, setNome] = useState(armazem?.nome ?? "");
  const [localizacao, setLocalizacao] = useState(armazem?.localizacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      if (novo) {
        await api.post(ROTA, {
          codigo: codigo.trim(),
          nome: nome.trim(),
          localizacao: localizacao.trim() || null,
        });
      } else {
        // O código fica de fora: é o que identifica o armazém nos movimentos
        // já registados.
        await api.patch(`${ROTA}/${armazem.id}`, {
          nome: nome.trim(),
          localizacao: localizacao.trim() || null,
        });
      }
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo ? "Novo armazém" : `Alterar armazém ${armazem.codigo}`}
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

          <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
            <Campo
              rotulo="Código"
              dica={
                novo ? undefined : "Não se altera: os movimentos guardam-no."
              }
            >
              <Entrada
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
                disabled={!novo}
                autoFocus={novo}
                className="tabular"
              />
            </Campo>
            <Campo rotulo="Nome">
              <Entrada
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </Campo>
            <Campo rotulo="Localização">
              <Entrada
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="mt-1 flex justify-end gap-2">
              <Botao onClick={aoFechar}>Cancelar</Botao>
              <Botao type="submit" variante="primario" disabled={aGravar}>
                {aGravar ? "A gravar…" : "Gravar"}
              </Botao>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
