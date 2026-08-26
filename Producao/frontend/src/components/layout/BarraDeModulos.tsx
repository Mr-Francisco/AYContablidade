"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { iconeNav } from "@/components/layout/iconesNav";
import { type GrupoNav, itemActivo } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Os módulos, em baixo.

   PORQUE EM BAIXO. Estavam numa fila do cabeçalho, entre o logótipo e os
   campos da secção, e essa fila valia 42 px do alto do ecrã — o sítio mais
   caro da página, porque é dali que o conteúdo desce.

   Trocar de módulo é o gesto MENOS frequente da aplicação: quem entra na
   Contabilidade fica na Contabilidade durante a manhã. O que se faz muitas
   vezes por hora é olhar para os dados; o que se faz duas vezes por dia é
   mudar de módulo. Dar o topo do ecrã ao gesto raro era ao contrário.

   Em baixo continua sempre à vista, sem nunca disputar o espaço onde os
   números aparecem — e fica perto do polegar em tablet, que é onde a barra
   inferior é a convenção.

   NÃO SE RECOLHE. Uma aplicação onde não se vê como sair do módulo em que se
   está é uma aplicação onde se fica preso; e 44 px em baixo não são os mesmos
   44 px em cima, porque não empurram nada.
--------------------------------------------------------------------------- */

export function BarraDeModulos({
  grupos,
  grupoActivo,
  hrefDoGrupo,
}: {
  grupos: GrupoNav[];
  grupoActivo: GrupoNav | null;
  hrefDoGrupo: (g: GrupoNav) => string;
}) {
  const caminho = usePathname();

  return (
    <nav
      className="sem-imprimir fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      style={{ height: "var(--altura-modulos)" }}
      aria-label="Módulos"
    >
      {/* `justify-center` com scroll horizontal por baixo: com poucos módulos
          fica centrado, com muitos rola em vez de os espremer até ilegíveis. */}
      <div className="mx-auto flex h-full max-w-[1360px] items-stretch justify-center gap-0.5 overflow-x-auto px-2">
        {grupos.map((g) => {
          const activo =
            g === grupoActivo || (g.href && itemActivo(caminho, g.href));
          const traco = iconeNav(g.icone);
          return (
            <Link
              key={g.rotulo}
              href={hrefDoGrupo(g)}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "relative flex min-w-[68px] shrink-0 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-lg px-2.5 text-[11.5px] font-semibold transition-colors",
                activo
                  ? // A marca é uma barra EM CIMA, do lado do conteúdo: é para
                    // lá que a pessoa olha, e um sublinhado colado ao fundo do
                    // ecrã fica fora do campo de visão.
                    "text-marca before:absolute before:inset-x-2 before:top-0 before:h-[3px] before:rounded-full before:bg-marca before:content-['']"
                  : "text-texto-suave hover:bg-superficie-2 hover:text-marca",
              )}
            >
              <span className="flex h-[19px] items-center justify-center">
                {traco ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado SVG constante do nosso próprio iconesNav.ts — não há entrada de utilizador neste caminho.
                    dangerouslySetInnerHTML={{ __html: traco }}
                  />
                ) : (
                  <span className="size-[18px]" />
                )}
              </span>
              {g.rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
