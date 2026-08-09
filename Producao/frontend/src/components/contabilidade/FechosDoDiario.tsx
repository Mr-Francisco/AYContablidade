"use client";

import { Lock, LockOpen } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { ACarregar, Alerta, Botao, Selo } from "@/components/ui";
import { Confirmar } from "@/components/ui/CrudMestre";
import { api, buscador, ErroApi } from "@/lib/api";
import { usePeriodos } from "@/lib/hooks";
import type { Diario, Exercicio } from "@/types";

interface Fecho {
  id: string;
  diario_codigo: string;
  mes: string;
  exercicio_id: string | null;
  por: string | null;
  criado_em: string;
}

/** Chave do SWR. Exportada para quem precise de a invalidar de fora. */
export function chaveFechos(exercicioId: string) {
  return `/api/contabilidade/fechos?exercicio_id=${exercicioId}`;
}

export function useFechos(exercicioId: string | undefined) {
  const { data, isLoading, mutate } = useSWR<Fecho[]>(
    exercicioId ? chaveFechos(exercicioId) : null,
    buscador,
  );
  return { fechos: data ?? [], isLoading, mutate };
}

/**
 * Fechos mensais de um diário, num exercício.
 *
 * O QUE ISTO FAZ, e o que não faz: fechar um período impede lançamentos NESSE
 * diário NESSE mês — é o travão fino, ao lado do travão grosso que é fechar o
 * exercício inteiro (Configurações → Exercícios). A regra é aplicada por
 * `gravar_lancamento` no servidor; esta caixa só liga e desliga o interruptor.
 *
 * Os períodos são os 00–15 do PGC-AR e vêm do servidor: 00 é a abertura, 01–12
 * os meses, 13–15 os de rectificação e apuramento. Escrevê-los aqui à mão
 * deixava-os a divergir do que o backend aceita.
 */
export function DialogoFechos({
  diario,
  exercicio,
  podeFechar,
  aoFechar,
}: {
  diario: Diario;
  exercicio: Exercicio;
  podeFechar: boolean;
  aoFechar: () => void;
}) {
  const { periodos } = usePeriodos();
  const { fechos, isLoading, mutate } = useFechos(exercicio.id);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<{
    codigo: string;
    nome: string;
  } | null>(null);

  const porMes = new Map(
    fechos
      .filter((f) => f.diario_codigo === diario.codigo)
      .map((f) => [f.mes, f]),
  );

  async function fechar(mes: string) {
    setErro(null);
    setOcupado(mes);
    try {
      await api.post("/api/contabilidade/fechos", {
        diario_codigo: diario.codigo,
        mes,
        exercicio_id: exercicio.id,
      });
      await mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível fechar.",
      );
    } finally {
      setOcupado(null);
      setAConfirmar(null);
    }
  }

  async function reabrir(f: Fecho) {
    setErro(null);
    setOcupado(f.mes);
    try {
      await api.delete(`/api/contabilidade/fechos/${f.id}`);
      await mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível reabrir.",
      );
    } finally {
      setOcupado(null);
    }
  }

  const fechados = porMes.size;

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(640px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Fechos mensais — Diário {diario.codigo} · {diario.nome}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-[13px] text-texto-suave">
              {exercicio.nome}. Fechar um período impede lançamentos novos neste
              diário nesse mês — reabre-se a qualquer momento.
            </Dialog.Description>
          </div>

          <div className="min-w-0 flex-1 overflow-auto p-5">
            {erro && <Alerta tipo="erro">{erro}</Alerta>}
            {!podeFechar && (
              <Alerta tipo="info">
                O seu perfil vê os fechos mas não os altera.
              </Alerta>
            )}

            {isLoading ? (
              <ACarregar />
            ) : (
              <div className="overflow-hidden rounded-xl border border-borda">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-fundo text-left">
                      <th className="px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-texto-suave">
                        Período
                      </th>
                      <th className="px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-texto-suave">
                        Estado
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p) => {
                      const f = porMes.get(p.codigo);
                      const aTrabalhar = ocupado === p.codigo;
                      return (
                        <tr
                          key={p.codigo}
                          className="border-t border-borda hover:bg-fundo/60"
                        >
                          <td className="px-3 py-2">
                            <span className="tabular font-semibold">
                              {p.codigo}
                            </span>{" "}
                            <span className="text-texto-suave">{p.nome}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Selo cor={f ? "#8a8a8a" : "#1a9c5f"}>
                              {f ? "Fechado" : "Aberto"}
                            </Selo>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {podeFechar &&
                              (f ? (
                                <Botao
                                  variante="contorno"
                                  tamanho="pequeno"
                                  disabled={aTrabalhar}
                                  onClick={() => reabrir(f)}
                                >
                                  <LockOpen size={13} />
                                  Reabrir
                                </Botao>
                              ) : (
                                <Botao
                                  variante="neutro"
                                  tamanho="pequeno"
                                  disabled={aTrabalhar}
                                  onClick={() =>
                                    setAConfirmar({
                                      codigo: p.codigo,
                                      nome: p.nome,
                                    })
                                  }
                                >
                                  <Lock size={13} />
                                  Fechar
                                </Botao>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3.5">
            <p className="text-[13px] text-texto-suave">
              {fechados === 0
                ? "Todos os períodos abertos."
                : `${fechados} de ${periodos.length} períodos fechados.`}
            </p>
            <Dialog.Close asChild>
              <Botao variante="neutro">Fechar janela</Botao>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <Confirmar
        aberto={aConfirmar !== null}
        aoMudar={(a) => !a && setAConfirmar(null)}
        titulo={`Fechar ${aConfirmar?.nome ?? ""} no diário ${diario.codigo}?`}
        rotuloConfirmar="Fechar período"
        rotuloOcupado="A fechar…"
        ocupado={ocupado !== null}
        aoConfirmar={() => aConfirmar && fechar(aConfirmar.codigo)}
      >
        Deixa de aceitar lançamentos novos <b>neste diário</b> nesse período. Os
        outros diários e os outros meses não são afectados, e o que já está
        lançado mantém-se.
        <br />
        <br />
        Reabre-se aqui a qualquer momento.
      </Confirmar>
    </Dialog.Root>
  );
}
