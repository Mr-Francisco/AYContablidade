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

export default function Fornecedores() {
  const { pode } = useAuth();
  const [procura, setProcura] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Terceiro | null>(null);
  const [aApagar, setAApagar] = useState<Terceiro | null>(null);
  const [erroAccao, setErroAccao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("logistica.gerir");

  async function eliminarRegisto() {
    if (!aApagar) return;
    setErroAccao(null);
    setOcupado(true);
    try {
      await api.delete(`/api/compras/fornecedores/${aApagar.id}`);
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

  const chave = `/api/compras/fornecedores${procura.trim() ? `?procura=${encodeURIComponent(procura.trim())}` : ""}`;
  const { data, isLoading, error, mutate } = useSWR<Terceiro[]>(
    chave,
    buscador,
  );

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
        ) : error ? (
          // Ver a nota igual nos Clientes: uma tabela vazia e uma falta de
          // permissão não se podem ler da mesma maneira.
          <div className="p-4">
            <FalhaAoCarregar erro={error} oQue="os fornecedores" />
          </div>
        ) : (
          <GrelhaTerceiros
            registos={data ?? []}
            singular="fornecedor"
            semConta="na 1.ª recepção"
            vazio={
              procura.trim()
                ? "Nenhum fornecedor corresponde à pesquisa."
                : "Ainda não há fornecedores registados."
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
          rota="/api/compras/fornecedores"
          tipoPorOmissao="Fornecedor"
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
        titulo={`Eliminar fornecedor ${aApagar?.nome ?? ""}?`}
        aoConfirmar={eliminarRegisto}
        ocupado={ocupado}
      >
        Um fornecedor <b>com documentos de compra não pode ser eliminado</b>.
        Nesse caso o servidor recusa.
      </ConfirmarEliminar>
    </>
  );
}
