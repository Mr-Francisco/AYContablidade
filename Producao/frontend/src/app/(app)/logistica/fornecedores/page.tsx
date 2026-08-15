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
                  {podeGerir && <Th> </Th>}
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
                    {podeGerir && (
                      <Td>
                        <AccoesDaLinha
                          nome={`fornecedor ${f.numero}`}
                          aoEditar={() => setEmEdicao(f)}
                          aoApagar={() => setAApagar(f)}
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
