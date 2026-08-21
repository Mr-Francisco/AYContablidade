"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { FichaTerceiro } from "@/components/comercial/FichaTerceiro";
import { GrelhaTerceiros } from "@/components/comercial/GrelhaTerceiros";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
} from "@/components/ui";
import { ConfirmarEliminar } from "@/components/ui/CrudMestre";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
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
  const { data, isLoading, error, mutate } = useSWR<Terceiro[]>(
    chave,
    buscador,
  );

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
        ) : error ? (
          // UMA TABELA VAZIA NÃO É UMA RESPOSTA. Sem isto, quem não tem
          // permissão para o Comercial via «0 registos» — a mesma coisa que
          // uma empresa sem clientes nenhuns. Passava por avaria, e era só
          // falta de acesso.
          <div className="p-4">
            <FalhaAoCarregar erro={error} oQue="os clientes" />
          </div>
        ) : (
          <GrelhaTerceiros
            registos={data ?? []}
            singular="cliente"
            semConta="na 1.ª facturação"
            vazio={
              procura.trim()
                ? "Nenhum cliente corresponde à pesquisa."
                : "Ainda não há clientes registados."
            }
            accoes={
              podeGerir
                ? { editar: setEmEdicao, apagar: setAApagar, ocupado }
                : undefined
            }
          />
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
