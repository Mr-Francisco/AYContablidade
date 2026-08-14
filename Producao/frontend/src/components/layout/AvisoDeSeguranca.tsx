"use client";

import { KeyRound, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";

/** Chave por conta: dispensar o aviso numa não o dispensa noutra, e um
 *  computador partilhado não esconde o aviso ao colega seguinte. */
const chave = (id: string) => `aycontab_aviso_seguranca_${id}`;

/** Aviso de segurança no acesso, sem trancar nada.
 *
 * Aparece a quem tem a palavra-passe definida por outra pessoa — recuperação de
 * acesso ou conta criada por um administrador — e a quem ainda não activou a
 * verificação em dois passos.
 *
 * NÃO É UM BLOQUEIO, de propósito. Obrigar a mudar a palavra-passe punha um
 * obstáculo em frente a quem acabou de recuperar o acesso, que é precisamente
 * quem menos precisa de mais um passo. Sugere-se, e a decisão é da pessoa.
 */
export function AvisoDeSeguranca() {
  const { utilizador } = useAuth();
  const [dispensado, setDispensado] = useState(true);

  const id = utilizador?.id;
  const provisoria = utilizador?.password_provisoria ?? false;
  const semSegundoFactor = !(utilizador?.totp_ativo ?? true);
  const relevante = Boolean(id) && (provisoria || semSegundoFactor);

  // A leitura fica no efeito e o estado começa dispensado: ler o
  // `sessionStorage` durante o render dava markup diferente no servidor e no
  // cliente, e o React reclamava da hidratação.
  useEffect(() => {
    if (!id) return;
    setDispensado(sessionStorage.getItem(chave(id)) === "1");
  }, [id]);

  if (!relevante || dispensado || !id) return null;

  function dispensar() {
    // Só nesta sessão do separador: a conta continua por proteger, e no
    // próximo acesso o aviso volta.
    if (id) sessionStorage.setItem(chave(id), "1");
    setDispensado(true);
  }

  return (
    <div className="border-b border-[var(--color-aviso)]/30 bg-[var(--color-aviso)]/10">
      <div className="mx-auto flex max-w-[1360px] items-start gap-3 px-5 py-3">
        <span className="mt-0.5 shrink-0 text-[var(--color-aviso)]">
          <ShieldCheck size={17} />
        </span>

        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          {provisoria && (
            <p>
              <b>A sua palavra-passe foi definida por outra pessoa.</b>{" "}
              Sugerimos que a mude por uma só sua, mais segura — enquanto não o
              fizer, há mais alguém que a conhece.
            </p>
          )}
          {semSegundoFactor && (
            <p className={provisoria ? "mt-1" : undefined}>
              Sugerimos também que active a <b>verificação em dois passos</b>:
              passa a ser preciso um código do seu telemóvel para entrar, e uma
              palavra-passe descoberta deixa de chegar.
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/perfil"
              className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 py-1.5 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
            >
              {provisoria ? <KeyRound size={13} /> : <ShieldCheck size={13} />}
              Ir ao meu perfil
            </Link>
          </div>
        </div>

        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar aviso"
          title="Dispensar até ao próximo acesso"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie hover:text-texto"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
