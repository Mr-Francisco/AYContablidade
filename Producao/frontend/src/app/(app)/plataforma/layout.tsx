"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Alerta, Botao, CabecalhoPagina, Cartao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

/** Área da plataforma. Fechada enquanto o superadmin não tiver 2FA.
 *
 * Quem manda é o backend — `exigir_superadmin` recusa todas estas rotas sem
 * segundo factor. Isto aqui existe para não deixar o operador bater contra
 * páginas vazias e uma sequência de 403 sem explicação: mostra o que falta e
 * leva-o ao sítio onde se resolve.
 */
export default function LayoutPlataforma({
  children,
}: {
  children: ReactNode;
}) {
  const { utilizador } = useAuth();

  if (
    utilizador &&
    utilizador.perfil === "superadmin" &&
    !utilizador.totp_ativo
  ) {
    return (
      <>
        <CabecalhoPagina
          titulo="Administração da plataforma"
          descricao="Falta um passo antes de poder continuar."
        />
        <Cartao className="max-w-[640px]">
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-aviso)]/12 text-[var(--color-aviso)]">
              <ShieldAlert size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold leading-tight">
                Active a verificação em dois passos
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-texto-suave">
                Esta conta administra a plataforma inteira: gera licenças,
                altera contratos e vê a auditoria de todas as empresas. Uma
                palavra-passe descoberta chegaria para tudo isso, e por isso o
                segundo factor é obrigatório aqui.
              </p>
            </div>
          </div>

          <Alerta tipo="info" className="mb-4">
            O resto do sistema continua acessível. Só as páginas de
            administração da plataforma é que ficam fechadas até activar.
          </Alerta>

          <Botao variante="primario" comoFilho>
            <Link href="/perfil">Ir ao meu perfil e activar</Link>
          </Botao>
        </Cartao>
      </>
    );
  }

  return <>{children}</>;
}
