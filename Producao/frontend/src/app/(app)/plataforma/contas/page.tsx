"use client";

import {
  KeyRound,
  Power,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import { SegredoUmaVez } from "@/components/plataforma/SegredoUmaVez";
import {
  ACarregar,
  Alerta,
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
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { ConfirmarEliminar } from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import type { ContaPlataforma, ContaPlataformaCriada } from "@/types";

const LIMITE = 3;

export default function ContasDaPlataforma() {
  const { utilizador } = useAuth();
  const { data, isLoading, mutate } = useSWR<ContaPlataforma[]>(
    "/api/licencas/superadmins",
    buscador,
  );

  const [aCriar, setACriar] = useState(false);
  // Duas acções desta página valiam um clique só, e são das mais sérias do
  // sistema: remover quem administra a plataforma, e tirar o segundo factor a
  // outra pessoa. Passam a pedir confirmação.
  const [aRemover, setARemover] = useState<ContaPlataforma | null>(null);
  const [aReporFactor, setAReporFactor] = useState<ContaPlataforma | null>(
    null,
  );
  const [criada, setCriada] = useState<ContaPlataformaCriada | null>(null);
  const [segredo, setSegredo] = useState<{
    conta: string;
    valor: string;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const contas = data ?? [];
  const activas = contas.filter((c) => c.ativo).length;
  const semSegundoFactor = contas.filter((c) => c.ativo && !c.totp_ativo);

  function falhou(e: unknown, alternativa: string) {
    setErro(e instanceof ErroApi ? e.mensagemUtilizador : alternativa);
  }

  async function alternar(conta: ContaPlataforma) {
    setErro(null);
    try {
      await api.patch(`/api/licencas/superadmins/${conta.id}`, {
        ativo: !conta.ativo,
      });
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível alterar a conta.");
    }
  }

  async function remover(conta: ContaPlataforma) {
    setErro(null);
    try {
      await api.delete(`/api/licencas/superadmins/${conta.id}`);
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível remover a conta.");
    }
  }

  async function novaPassword(conta: ContaPlataforma) {
    setErro(null);
    try {
      const r = await api.post<{ password_temporaria: string }>(
        `/api/licencas/superadmins/${conta.id}/password`,
      );
      setSegredo({ conta: conta.nome, valor: r.password_temporaria });
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível gerar a palavra-passe.");
    }
  }

  async function reporFactor(conta: ContaPlataforma) {
    setErro(null);
    try {
      await api.delete(`/api/licencas/superadmins/${conta.id}/2fa`);
      mutate();
    } catch (e) {
      falhou(e, "Não foi possível repor a verificação em dois passos.");
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Contas de administração"
        descricao="Quem pode administrar a plataforma inteira."
      />

      <Alerta tipo="info" className="mb-4">
        Uma só conta é um ponto único de falha: perder-lhe a palavra-passe deixa
        a plataforma sem operador. Podem existir até <b>{LIMITE}</b>, cada uma
        com dono conhecido, para que a conta inicial não seja a de todos os
        dias. Cada uma tem de activar a verificação em dois passos antes de
        administrar seja o que for.
      </Alerta>

      {semSegundoFactor.length > 0 && (
        <Alerta tipo="aviso" className="mb-4">
          {semSegundoFactor.length === 1
            ? "Uma conta activa ainda não"
            : `${semSegundoFactor.length} contas activas ainda não`}{" "}
          activou a verificação em dois passos, por isso não consegue
          administrar nada: {semSegundoFactor.map((c) => c.email).join(", ")}.
        </Alerta>
      )}

      {erro && (
        <Alerta tipo="erro" className="mb-4">
          {erro}
        </Alerta>
      )}

      <Cartao className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <TituloCartao
            className="mb-0"
            extra={`${activas} de ${contas.length} activas`}
          >
            Contas
          </TituloCartao>
          <Botao
            variante="primario"
            tamanho="pequeno"
            onClick={() => setACriar(true)}
            disabled={contas.length >= LIMITE}
            motivoBloqueio={`Limite de ${LIMITE} contas de plataforma atingido. Remova uma conta antes de criar outra.`}
          >
            <UserPlus size={14} />
            Criar conta
          </Botao>
        </div>

        {isLoading ? (
          <ACarregar />
        ) : !contas.length ? (
          <Vazio>Não há contas de administração.</Vazio>
        ) : (
          <EnvolveTabela className="mt-4 rounded-none border-0 border-t">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>E-mail</Th>
                  <Th>Estado</Th>
                  <Th>Dois passos</Th>
                  <Th>Último acesso</Th>
                  <Th numerico>Acções</Th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => {
                  const sou = c.id === utilizador?.id;
                  return (
                    <Tr key={c.id}>
                      <Td className="font-semibold">
                        {c.nome}
                        {sou && (
                          <span className="ml-2 text-xs font-normal text-texto-suave">
                            (a sua conta)
                          </span>
                        )}
                      </Td>
                      <Td className="text-texto-suave">{c.email}</Td>
                      <Td>
                        <Selo cor={c.ativo ? "#1a9c5f" : "#8a8a8a"}>
                          {c.ativo ? "activa" : "inactiva"}
                        </Selo>
                      </Td>
                      <Td>
                        {c.totp_ativo ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-sucesso)]">
                            <ShieldCheck size={13} /> activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-aviso)]">
                            <ShieldOff size={13} /> por activar
                          </span>
                        )}
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {c.ultimo_login
                          ? new Date(c.ultimo_login).toLocaleString("pt-PT", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "nunca"}
                      </Td>
                      <Td>
                        {/* A própria conta não se gere a si mesma — é o que
                            impede a plataforma de ficar sem operador. Mostrar
                            os botões só levaria a um 409. */}
                        {sou ? (
                          <span className="block text-right text-xs text-texto-suave">
                            geridas por outra conta
                          </span>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Accao
                              titulo="Gerar palavra-passe"
                              onClick={() => novaPassword(c)}
                            >
                              <KeyRound size={13} />
                            </Accao>
                            {c.totp_ativo && (
                              <Accao
                                titulo="Repor a verificação em dois passos"
                                onClick={() => setAReporFactor(c)}
                              >
                                <ShieldOff size={13} />
                              </Accao>
                            )}
                            <Accao
                              titulo={c.ativo ? "Desactivar" : "Reactivar"}
                              onClick={() => alternar(c)}
                            >
                              <Power size={13} />
                            </Accao>
                            <Accao
                              titulo="Remover"
                              perigo
                              onClick={() => setARemover(c)}
                            >
                              <Trash2 size={13} />
                            </Accao>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {aCriar && (
        <DialogoCriar
          aoFechar={() => setACriar(false)}
          aoCriar={(c) => {
            setACriar(false);
            setCriada(c);
            mutate();
          }}
        />
      )}

      {criada && (
        <DialogoSegredo
          titulo={`Conta criada: ${criada.nome}`}
          intro={`Entregue estes dados a ${criada.email}.`}
          valor={criada.password_inicial}
          aoFechar={() => setCriada(null)}
        />
      )}

      {segredo && (
        <DialogoSegredo
          titulo={`Palavra-passe de ${segredo.conta}`}
          intro="As sessões abertas dessa conta foram terminadas."
          valor={segredo.valor}
          aoFechar={() => setSegredo(null)}
        />
      )}
      <ConfirmarEliminar
        aberto={aRemover !== null}
        aoMudar={(a) => !a && setARemover(null)}
        titulo={`Remover ${aRemover?.nome ?? ""}?`}
        aoConfirmar={() => {
          const alvo = aRemover;
          setARemover(null);
          if (alvo) remover(alvo);
        }}
      >
        Esta conta administra a plataforma inteira: licenças, empresas,
        auditoria e configurações. Removê-la <b>não se desfaz</b>, e a
        plataforma fica com menos um operador. Se o objectivo é só tirar-lhe o
        acesso por agora, <b>desactive-a</b>.
      </ConfirmarEliminar>

      <ConfirmarEliminar
        aberto={aReporFactor !== null}
        aoMudar={(a) => !a && setAReporFactor(null)}
        titulo={`Repor o segundo factor de ${aReporFactor?.nome ?? ""}?`}
        aoConfirmar={() => {
          const alvo = aReporFactor;
          setAReporFactor(null);
          if (alvo) reporFactor(alvo);
        }}
      >
        A verificação em dois passos desta conta é desligada e a pessoa terá de
        a configurar outra vez ao entrar. Faça-o quando alguém perdeu o
        telemóvel e os códigos de recuperação —{" "}
        <b>
          enquanto estiver reposta, a conta fica protegida só pela palavra-passe
        </b>
        .
      </ConfirmarEliminar>
    </>
  );
}

function Accao({
  titulo,
  perigo,
  onClick,
  children,
}: {
  titulo: string;
  perigo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-borda transition-colors ${
        perigo
          ? "hover:border-perigo hover:text-perigo"
          : "hover:border-marca hover:text-marca"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
function DialogoCriar({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void;
  aoCriar: (c: ContaPlataformaCriada) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      aoCriar(
        await api.post<ContaPlataformaCriada>("/api/licencas/superadmins", {
          nome: nome.trim(),
          email: email.trim(),
          password_actual: password,
        }),
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível criar a conta.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Envolucro titulo="Criar conta de administração" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="aviso">
          Esta conta vai poder gerar licenças, alterar contratos e ver a
          auditoria de todas as empresas. A palavra-passe inicial é gerada
          automaticamente e mostrada uma única vez — guarde-a nesse momento.
        </Alerta>

        <Campo rotulo="Nome">
          <Entrada
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            minLength={2}
            maxLength={120}
            required
            autoFocus
            placeholder="Maria Fernandes"
          />
        </Campo>

        <Campo rotulo="E-mail">
          <Entrada
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="maria@plataforma.ao"
          />
        </Campo>

        <Campo
          rotulo="Confirme com a sua palavra-passe"
          dica="Um ecrã deixado aberto não pode bastar para criar uma conta destas."
        >
          <Entrada
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Campo>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex gap-2">
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A criar…" : "Criar conta"}
          </Botao>
          <Botao type="button" variante="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Envolucro>
  );
}

function DialogoSegredo({
  titulo,
  intro,
  valor,
  aoFechar,
}: {
  titulo: string;
  intro: string;
  valor: string;
  aoFechar: () => void;
}) {
  const [guardei, setGuardei] = useState(false);

  return (
    <Envolucro titulo={titulo} aoFechar={aoFechar}>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-texto-suave">{intro}</p>

        <SegredoUmaVez
          valor={valor}
          titulo="Guarde esta palavra-passe agora."
          nota="Peça a quem a receber que a mude no primeiro acesso."
        />

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={guardei}
            onChange={(e) => setGuardei(e.target.checked)}
            className="mt-0.5 accent-[var(--color-marca)]"
          />
          <span>Já a copiei para a entregar.</span>
        </label>

        <div>
          <Botao
            variante="primario"
            onClick={aoFechar}
            disabled={!guardei}
            motivoBloqueio="Confirme, na caixa acima, que já copiou a palavra-passe — depois de fechar não volta a ser mostrada."
          >
            Concluir
          </Botao>
        </div>
      </div>
    </Envolucro>
  );
}

function Envolucro({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(520px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-auto rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
