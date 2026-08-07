"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Cabecalho } from "@/components/layout/Cabecalho";
import { ACarregar } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

export default function LayoutAplicacao({
  children,
}: {
  children: React.ReactNode;
}) {
  const { utilizador, aCarregar } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // O `proxy.ts` já barra quem não tem cookie. Isto apanha o caso em que o
    // cookie existe mas o token foi revogado — o /auth/me falha e ficamos sem
    // utilizador.
    if (!aCarregar && !utilizador) router.replace("/entrar");
  }, [aCarregar, utilizador, router]);

  if (aCarregar) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ACarregar texto="A repor a sessão…" />
      </div>
    );
  }

  if (!utilizador) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecalho />
      {/* min-w-0 impede que uma tabela larga alargue o main e crie barra
          horizontal na página inteira. */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto min-w-0 max-w-[1400px] px-5 pb-16">
          {children}
        </div>
      </main>
    </div>
  );
}
