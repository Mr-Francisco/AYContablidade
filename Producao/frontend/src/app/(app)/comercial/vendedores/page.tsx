"use client";

import { Plus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
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
import { AccoesDaLinha, ConfirmarEliminar } from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import type { Comissao, Vendedor } from "@/types";

export default function Vendedores() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Vendedor | null>(null);
  const [aApagar, setAApagar] = useState<Vendedor | null>(null);
  const [erroAccao, setErroAccao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("comercial.gerir");

  async function eliminarVendedor() {
    if (!aApagar) return;
    setErroAccao(null);
    setOcupado(true);
    try {
      await api.delete(`/api/comercial/vendedores/${aApagar.id}`);
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

  const {
    data: vendedores,
    isLoading,
    mutate,
  } = useSWR<Vendedor[]>("/api/comercial/vendedores", buscador);
  const { data: comissoes, mutate: mutateComissoes } = useSWR<Comissao[]>(
    "/api/comercial/comissoes",
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Vendedores"
        descricao="Vendedores e comissões sobre o subtotal das vendas facturadas."
        accoes={
          pode("comercial.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo vendedor
            </Botao>
          )
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5">Vendedores</TituloCartao>
          {isLoading ? (
            <ACarregar />
          ) : !vendedores?.length ? (
            <Vazio>Ainda não há vendedores registados.</Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Tipo de comissão</Th>
                    <Th numerico>Valor</Th>
                    <Th>Estado</Th>
                    {podeGerir && <Th> </Th>}
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => (
                    <Tr key={v.id}>
                      <Td className="max-w-[220px] truncate font-semibold">
                        {v.nome}
                      </Td>
                      <Td className="text-texto-suave">
                        {v.tipo_comissao === "fixo"
                          ? "Valor fixo por venda"
                          : "Percentagem do subtotal"}
                      </Td>
                      <Td numerico>
                        {v.tipo_comissao === "fixo"
                          ? formataMoeda(v.comissao_perc, moeda)
                          : `${v.comissao_perc} %`}
                      </Td>
                      <Td>
                        <Selo
                          cor={v.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {v.estado === "activo" ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                      {podeGerir && (
                        <Td>
                          <AccoesDaLinha
                            nome={`vendedor ${v.nome}`}
                            aoEditar={() => setEmEdicao(v)}
                            aoApagar={() => setAApagar(v)}
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

        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5" extra="Só vendas facturadas">
            Comissões apuradas
          </TituloCartao>
          {!comissoes?.length ? (
            <Vazio>
              Sem comissões. Só contam documentos emitidos que geram proveito —
              as notas de crédito anulam vendas, não as criam.
            </Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Vendedor</Th>
                    <Th numerico>Vendas</Th>
                    <Th numerico>Base</Th>
                    <Th numerico>Comissão</Th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => (
                    <Tr key={c.vendedor}>
                      <Td className="max-w-[200px] truncate font-semibold">
                        {c.vendedor}
                      </Td>
                      <Td numerico>{c.vendas}</Td>
                      <Td numerico>{formataMoeda(c.base, moeda)}</Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(c.comissao, moeda)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          )}
        </Cartao>
      </div>

      {(novoAberto || emEdicao) && (
        <FormularioVendedor
          vendedor={emEdicao}
          aoFechar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
            mutate();
            mutateComissoes();
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
        titulo={`Eliminar o vendedor ${aApagar?.nome ?? ""}?`}
        aoConfirmar={eliminarVendedor}
        ocupado={ocupado}
      >
        Um vendedor <b>com vendas associadas não pode ser eliminado</b> — as
        comissões já calculadas ficariam sem destinatário. Nesse caso o servidor
        recusa, e a alternativa é pô-lo inactivo.
      </ConfirmarEliminar>
    </>
  );
}

function FormularioVendedor({
  vendedor,
  aoFechar,
  aoGravar,
}: {
  vendedor: Vendedor | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = vendedor === null;
  const [nome, setNome] = useState(vendedor?.nome ?? "");
  const [tipoComissao, setTipoComissao] = useState<string>(
    vendedor?.tipo_comissao ?? "percentagem",
  );
  const [valor, setValor] = useState(vendedor?.comissao_perc ?? "3");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      const corpo = {
        nome: nome.trim(),
        tipo_comissao: tipoComissao,
        comissao_perc: valor || "0",
      };
      if (novo) {
        await api.post("/api/comercial/vendedores", corpo);
      } else {
        await api.patch(`/api/comercial/vendedores/${vendedor.id}`, corpo);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(500px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo ? "Novo vendedor" : `Alterar ${vendedor.nome}`}
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
            <Campo rotulo="Nome">
              <Entrada
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoFocus
              />
            </Campo>
            <Selector
              rotulo="Tipo de comissão"
              valor={tipoComissao}
              aoMudar={setTipoComissao}
              opcoes={[
                { valor: "percentagem", rotulo: "Percentagem do subtotal" },
                { valor: "fixo", rotulo: "Valor fixo por venda" },
              ]}
            />
            <Campo
              rotulo={
                tipoComissao === "fixo" ? "Valor por venda" : "Percentagem (%)"
              }
            >
              <Entrada
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-right tabular"
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
