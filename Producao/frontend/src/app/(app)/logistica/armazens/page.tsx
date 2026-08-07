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
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import type { Armazem } from "@/types";

export default function Armazens() {
  const { pode } = useAuth();
  const [novoAberto, setNovoAberto] = useState(false);

  const { data, isLoading, mutate } = useSWR<Armazem[]>(
    "/api/logistica/armazens",
    buscador,
  );

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

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !data?.length ? (
          <Vazio>Ainda não há armazéns registados.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Localização</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <Tr key={a.id}>
                    <Td className="tabular font-bold">{a.codigo}</Td>
                    <Td className="font-semibold">{a.nome}</Td>
                    <Td className="text-texto-suave">{a.localizacao || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioArmazem
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

function FormularioArmazem({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.post("/api/logistica/armazens", {
        codigo: codigo.trim(),
        nome: nome.trim(),
        localizacao: localizacao.trim() || null,
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo armazém
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
            <Campo rotulo="Código">
              <Entrada
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
                autoFocus
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
