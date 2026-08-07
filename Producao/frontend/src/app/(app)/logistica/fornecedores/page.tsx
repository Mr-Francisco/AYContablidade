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
import type { Terceiro } from "@/types";

const CONDICOES = [
  "Pronto pagamento",
  "15 dias",
  "30 dias",
  "60 dias",
  "90 dias",
];

export default function Fornecedores() {
  const { pode } = useAuth();
  const [procura, setProcura] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);

  const chave = `/api/compras/fornecedores${procura.trim() ? `?procura=${encodeURIComponent(procura.trim())}` : ""}`;
  const { data, isLoading, mutate } = useSWR<Terceiro[]>(chave, buscador);

  return (
    <>
      <CabecalhoPagina
        titulo="Fornecedores"
        descricao="Ficha de fornecedor. A conta corrente é criada na primeira recepção."
        accoes={
          pode("logistica.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo fornecedor
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
              placeholder="Nome ou NIF…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !data?.length ? (
          <Vazio>
            {procura.trim()
              ? "Nenhum fornecedor corresponde à pesquisa."
              : "Ainda não há fornecedores registados."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Nome</Th>
                  <Th>NIF</Th>
                  <Th>Localidade</Th>
                  <Th>Telefone</Th>
                  <Th>Conta corrente</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <Tr key={f.id}>
                    <Td className="tabular font-bold">{f.numero}</Td>
                    <Td className="max-w-[280px] truncate font-semibold">
                      {f.nome}
                    </Td>
                    <Td className="tabular">{f.nif || "—"}</Td>
                    <Td>{f.localidade || "—"}</Td>
                    <Td className="tabular">{f.telefone || "—"}</Td>
                    <Td className="tabular">
                      {f.conta ? (
                        <a
                          href={`/contabilidade/extrato?conta=${f.conta}`}
                          className="font-semibold text-marca hover:underline"
                        >
                          {f.conta}
                        </a>
                      ) : (
                        <span className="text-texto-suave">
                          na 1.ª recepção
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Selo cor={f.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}>
                        {f.estado === "activo" ? "Activo" : "Inactivo"}
                      </Selo>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioFornecedor
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

function FormularioFornecedor({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [campos, setCampos] = useState({
    nome: "",
    nif: "",
    localidade: "",
    telefone: "",
    email: "",
    condicoes_pagamento: "30 dias",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.post("/api/compras/fornecedores", {
        ...campos,
        nome: campos.nome.trim(),
        nif: campos.nif.trim() || null,
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(620px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo fornecedor
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome / Designação" className="sm:col-span-2">
                <Entrada
                  value={campos.nome}
                  onChange={(e) => alterar("nome", e.target.value)}
                  required
                  autoFocus
                />
              </Campo>
              <Campo rotulo="NIF">
                <Entrada
                  value={campos.nif}
                  onChange={(e) => alterar("nif", e.target.value)}
                  className="tabular"
                />
              </Campo>
              <Campo rotulo="Telefone">
                <Entrada
                  value={campos.telefone}
                  onChange={(e) => alterar("telefone", e.target.value)}
                  className="tabular"
                />
              </Campo>
              <Campo rotulo="Localidade">
                <Entrada
                  value={campos.localidade}
                  onChange={(e) => alterar("localidade", e.target.value)}
                />
              </Campo>
              <Campo rotulo="E-mail">
                <Entrada
                  type="email"
                  value={campos.email}
                  onChange={(e) => alterar("email", e.target.value)}
                />
              </Campo>
              <Selector
                rotulo="Condições de pagamento"
                valor={campos.condicoes_pagamento}
                aoMudar={(v) => alterar("condicoes_pagamento", v)}
                opcoes={CONDICOES.map((c) => ({ valor: c, rotulo: c }))}
                larguraMinima="100%"
              />
            </div>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="mt-1 flex justify-end gap-2">
              <Botao onClick={aoFechar}>Cancelar</Botao>
              <Botao type="submit" variante="primario" disabled={aGravar}>
                {aGravar ? "A gravar…" : "Gravar fornecedor"}
              </Botao>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
