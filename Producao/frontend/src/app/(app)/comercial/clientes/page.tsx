"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { FichaTerceiro } from "@/components/comercial/FichaTerceiro";
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

const _CONDICOES = [
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
        <FichaTerceiro
          registo={emEdicao}
          rota="/api/comercial/clientes"
          tipoPorOmissao="Cliente"
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
