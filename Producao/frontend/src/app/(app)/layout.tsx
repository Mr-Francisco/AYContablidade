"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AcessoRapido } from "@/components/layout/AcessoRapido";
import { AvisoDeSeguranca } from "@/components/layout/AvisoDeSeguranca";
import { Cabecalho } from "@/components/layout/Cabecalho";
import { SessaoViva } from "@/components/layout/SessaoViva";
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
      <AvisoDeSeguranca />
      {/* min-w-0 impede que uma tabela larga alargue o main e crie barra
          horizontal na página inteira. */}
      <main className="min-w-0 flex-1">
        {/* A `.container-wide` do Piloto: 1360 px centrados, com 22 px de
            lado e 40 px em baixo. É o contentor de 36 das 58 páginas — as
            restantes usam a `.container` de 1200, mais estreita, e essas
            ajustam-se página a página. */}
        <div className="mx-auto min-w-0 max-w-[1360px] px-[22px] pb-10 pt-5">
          {children}
        </div>
      </main>

      {/* O «+» dos módulos. Aqui, e não em cada página: é o mesmo atalho em
          todo o lado, e num sítio só não há hipótese de divergir. */}
      <AcessoRapido />

      {/* Renova a sessão em silêncio enquanto se trabalha e avisa antes de ela
          atingir o limite. Não desenha nada até haver o que dizer. */}
      <SessaoViva />
    </div>
  );
}
