"use client";

import { KeyRound, ShieldCheck, ShieldOff, UserCog, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import { SegredoUmaVez } from "@/components/plataforma/SegredoUmaVez";
import {
  ACarregar,
  Alerta,
  Botao,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import type { EmpresaPlataforma, UtilizadorDaEmpresa } from "@/types";

/** Janela de gestão das contas de uma empresa.
 *
 * Existe para um caso concreto: o administrador de uma empresa não tem ninguém
 * acima dele lá dentro. Se perder a palavra-passe ou o telemóvel do 2FA, sem
 * isto a única saída era mexer à mão na base de dados.
 *
 * Só contas e acessos — nada de dados de negócio.
 */
export function UtilizadoresDaEmpresa({
  empresa,
  aoFechar,
}: {
  empresa: EmpresaPlataforma;
  aoFechar: () => void;
}) {
  const rota = `/api/licencas/empresas/${empresa.id}/utilizadores`;
  const { data, isLoading, mutate } = useSWR<UtilizadorDaEmpresa[]>(
    rota,
    buscador,
  );

  const [erro, setErro] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<{
    nome: string;
    valor: string;
  } | null>(null);

  const membros = data ?? [];
  const admins = membros.filter((m) => m.perfil === "admin" && m.ativo);

  function falhou(e: unknown, alternativa: string) {
    setErro(e instanceof ErroApi ? e.mensagemUtilizador : alternativa);
  }

  async function promover(m: UtilizadorDaEmpresa) {
    setErro(null);
    try {
      await api.post(`${rota}/${m.id}/perfil`, { perfil: "admin" });
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível mudar o perfil.");
    }
  }

  async function novaPassword(m: UtilizadorDaEmpresa) {
    setErro(null);
    try {
      const r = await api.post<{ password_temporaria: string }>(
        `${rota}/${m.id}/password`,
      );
      setSegredo({ nome: m.nome, valor: r.password_temporaria });
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível gerar a palavra-passe.");
    }
  }

  async function reporFactor(m: UtilizadorDaEmpresa) {
    setErro(null);
    try {
      await api.delete(`${rota}/${m.id}/2fa`);
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível repor a verificação em dois passos.");
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(880px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="min-w-0 truncate text-[15px] font-bold">
              Contas de {empresa.nome}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-w-0 flex-1 overflow-auto p-5">
            {segredo ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-texto-suave">
                  Palavra-passe temporária de <b>{segredo.nome}</b>. As sessões
                  abertas dessa conta foram terminadas.
                </p>
                <SegredoUmaVez
                  valor={segredo.valor}
                  titulo="Guarde esta palavra-passe agora."
                  nota="Peça a quem a receber que a mude no primeiro acesso."
                />
                <div>
                  <Botao variante="primario" onClick={() => setSegredo(null)}>
                    Voltar às contas
                  </Botao>
                </div>
              </div>
            ) : (
              <>
                <Alerta tipo="info" className="mb-3">
                  Aqui gerem-se <b>contas e acessos</b>, não dados de negócio.
                  Serve para devolver o acesso a quem o perdeu — o administrador
                  de uma empresa não tem ninguém acima dele lá dentro.
                </Alerta>

                {!isLoading && !admins.length && (
                  <Alerta tipo="aviso" className="mb-3">
                    Esta empresa <b>não tem nenhum administrador activo</b>.
                    Promova um membro para que volte a haver quem a gere.
                  </Alerta>
                )}

                {erro && (
                  <Alerta tipo="erro" className="mb-3">
                    {erro}
                  </Alerta>
                )}

                {isLoading ? (
                  <ACarregar />
                ) : !membros.length ? (
                  <Vazio>Esta empresa ainda não tem utilizadores.</Vazio>
                ) : (
                  <EnvolveTabela>
                    <Tabela>
                      <thead>
                        <tr>
                          <Th>Nome</Th>
                          <Th>E-mail</Th>
                          <Th>Perfil</Th>
                          <Th>Dois passos</Th>
                          <Th>Último acesso</Th>
                          <Th numerico>Acções</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {membros.map((m) => (
                          <Tr key={m.id}>
                            <Td className="font-semibold">{m.nome}</Td>
                            <Td className="max-w-[200px] truncate text-texto-suave">
                              {m.email}
                            </Td>
                            <Td>
                              <Selo
                                cor={
                                  m.perfil === "admin" ? "#6c2fb0" : "#62657a"
                                }
                              >
                                {m.perfil}
                              </Selo>
                              {!m.ativo && (
                                <span className="ml-1.5 text-xs text-texto-suave">
                                  inactivo
                                </span>
                              )}
                            </Td>
                            <Td>
                              {m.totp_ativo ? (
                                <ShieldCheck
                                  size={14}
                                  className="text-[var(--color-sucesso)]"
                                  aria-label="Com verificação em dois passos"
                                />
                              ) : (
                                <span className="text-xs text-texto-suave">
                                  <span className="sr-only">
                                    Sem verificação em dois passos
                                  </span>
                                  <span aria-hidden>—</span>
                                </span>
                              )}
                            </Td>
                            <Td className="tabular text-texto-suave">
                              {m.ultimo_login
                                ? new Date(m.ultimo_login).toLocaleDateString(
                                    "pt-PT",
                                  )
                                : "nunca"}
                            </Td>
                            <Td>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {m.perfil !== "admin" && (
                                  <Accao
                                    titulo="Promover a administrador"
                                    onClick={() => promover(m)}
                                  >
                                    <UserCog size={13} />
                                  </Accao>
                                )}
                                <Accao
                                  titulo="Gerar palavra-passe temporária"
                                  onClick={() => novaPassword(m)}
                                >
                                  <KeyRound size={13} />
                                </Accao>
                                {m.totp_ativo && (
                                  <Accao
                                    titulo="Repor a verificação em dois passos"
                                    onClick={() => reporFactor(m)}
                                  >
                                    <ShieldOff size={13} />
                                  </Accao>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Tabela>
                  </EnvolveTabela>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Accao({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-borda transition-colors hover:border-marca hover:text-marca"
    >
      {children}
    </button>
  );
}
