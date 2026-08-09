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
import { AccoesDaLinha, ConfirmarEliminar } from "@/components/ui/CrudMestre";
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

export default function Clientes() {
  const { pode } = useAuth();
  const [procura, setProcura] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Terceiro | null>(null);
  const [aApagar, setAApagar] = useState<Terceiro | null>(null);
  const [erroAccao, setErroAccao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("comercial.gerir");

  async function eliminarRegisto() {
    if (!aApagar) return;
    setErroAccao(null);
    setOcupado(true);
    try {
      await api.delete(`/api/comercial/clientes/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErroAccao(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAApagar(null);
    }
  }

  const chave = `/api/comercial/clientes${procura.trim() ? `?procura=${encodeURIComponent(procura.trim())}` : ""}`;
  const { data, isLoading, mutate } = useSWR<Terceiro[]>(chave, buscador);

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Ficha de cliente. A conta corrente é criada automaticamente na primeira facturação."
        accoes={
          pode("comercial.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo cliente
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
              ? "Nenhum cliente corresponde à pesquisa."
              : "Ainda não há clientes registados."}
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
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <Tr key={c.id}>
                    <Td className="tabular font-bold">{c.numero}</Td>
                    <Td className="max-w-[280px] truncate font-semibold">
                      {c.nome}
                    </Td>
                    <Td className="tabular">{c.nif || "—"}</Td>
                    <Td>{c.localidade || "—"}</Td>
                    <Td className="tabular">{c.telefone || "—"}</Td>
                    <Td className="tabular">
                      {c.conta ? (
                        <a
                          href={`/contabilidade/extrato?conta=${c.conta}`}
                          className="font-semibold text-marca hover:underline"
                        >
                          {c.conta}
                        </a>
                      ) : (
                        <span className="text-texto-suave">
                          na 1.ª facturação
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Selo cor={c.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}>
                        {c.estado === "activo" ? "Activo" : "Inactivo"}
                      </Selo>
                    </Td>
                    {podeGerir && (
                      <Td>
                        <AccoesDaLinha
                          nome={`cliente ${c.numero}`}
                          aoEditar={() => setEmEdicao(c)}
                          aoApagar={() => setAApagar(c)}
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
        <FormularioCliente
          registo={emEdicao}
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

      {erroAccao && (
        <div className="mt-4">
          <Alerta tipo="erro">{erroAccao}</Alerta>
        </div>
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar cliente ${aApagar?.nome ?? ""}?`}
        aoConfirmar={eliminarRegisto}
        ocupado={ocupado}
      >
        Um cliente <b>com documentos de venda não pode ser eliminado</b> — as
        facturas emitidas ficariam sem titular. Nesse caso o servidor recusa.
      </ConfirmarEliminar>
    </>
  );
}

function FormularioCliente({
  registo,
  aoFechar,
  aoGravar,
}: {
  registo: Terceiro | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = registo === null;
  const { data: provincias } = useSWR<string[]>(
    "/api/comercial/provincias",
    buscador,
    { revalidateOnFocus: false },
  );

  const [campos, setCampos] = useState({
    nome: registo?.nome ?? "",
    nif: registo?.nif ?? "",
    morada: registo?.morada ?? "",
    localidade: registo?.localidade ?? "",
    provincia: registo?.provincia ?? "Luanda",
    telefone: registo?.telefone ?? "",
    email: registo?.email ?? "",
    condicoes_pagamento: "30 dias",
    dias_credito: "30",
    limite_credito: "0",
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
      const corpo = {
        ...campos,
        nif: campos.nif || null,
        dias_credito: Number(campos.dias_credito) || 30,
        limite_credito: campos.limite_credito || "0",
      };
      if (novo) {
        await api.post("/api/comercial/clientes", corpo);
      } else {
        // O número fica de fora: identifica o registo nos documentos já
        // emitidos e é o que forma a conta corrente.
        await api.patch(`/api/comercial/clientes/${registo.id}`, {
          nome: corpo.nome,
          nif: corpo.nif,
          morada: corpo.morada,
          localidade: corpo.localidade,
          provincia: corpo.provincia,
          telefone: corpo.telefone,
          email: corpo.email,
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo ? "Novo cliente" : `Alterar ${registo.nome}`}
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
            className="min-w-0 flex-1 overflow-auto p-5"
            id="form-cliente"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome / Designação" className="sm:col-span-2">
                <Entrada
                  value={campos.nome}
                  onChange={(e) => alterar("nome", e.target.value)}
                  required
                  autoFocus
                />
              </Campo>
              <Campo
                rotulo="NIF"
                dica="Pessoa colectiva: 10 dígitos a começar por 5."
              >
                <Entrada
                  value={campos.nif}
                  onChange={(e) => alterar("nif", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Telefone">
                <Entrada
                  value={campos.telefone}
                  onChange={(e) => alterar("telefone", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Morada" className="sm:col-span-2">
                <Entrada
                  value={campos.morada}
                  onChange={(e) => alterar("morada", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Localidade">
                <Entrada
                  value={campos.localidade}
                  onChange={(e) => alterar("localidade", e.target.value)}
                />
              </Campo>
              <Selector
                rotulo="Província"
                valor={campos.provincia}
                aoMudar={(v) => alterar("provincia", v)}
                opcoes={(provincias ?? []).map((p) => ({
                  valor: p,
                  rotulo: p,
                }))}
              />
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
              />
              <Campo rotulo="Dias de crédito">
                <Entrada
                  type="number"
                  min="0"
                  value={campos.dias_credito}
                  onChange={(e) => alterar("dias_credito", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Limite de crédito">
                <Entrada
                  type="number"
                  step="0.01"
                  min="0"
                  value={campos.limite_credito}
                  onChange={(e) => alterar("limite_credito", e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
            </div>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-cliente"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar cliente"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
