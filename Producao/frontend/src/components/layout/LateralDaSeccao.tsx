"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "radix-ui";
import { Fragment } from "react";

import { iconeNav } from "@/components/layout/iconesNav";
import { type GrupoNav, type ItemNav, itemActivo } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Os campos do módulo, na lateral esquerda.

   PORQUE MUDOU DE SÍTIO. Num portátil de 1366×768 — que é o que a maior parte
   das pessoas tem à frente — o cabeçalho ocupava 193 px em três filas: o
   logótipo, os módulos, e esta faixa de campos. Com a faixa de aviso por baixo,
   somavam 279 px: mais de um terço do ecrã gasto antes de a página começar.

   Medido no balancete: **92% da altura do ecrã era consumida antes de aparecer
   o primeiro número**, e viam-se DUAS linhas de setenta. O resto era scroll.

   O ecrã de quem trabalha é largo e baixo. A altura é o que falta; a largura
   sobra — o conteúdo usava 1351 px dos 1366 e ainda assim rolava três ecrãs.
   Trocar a faixa horizontal por uma coluna lateral é passar a moldura do eixo
   que escasseia para o que sobra.

   RECOLHIDA, FICA SÓ COM OS SÍMBOLOS. Um balancete deitado precisa da largura
   toda, e há dias em que ninguém navega — abre-se uma página e trabalha-se lá.
   Nessa altura a coluna encolhe para 56 px e os nomes passam a aparecer ao
   passar o rato.
--------------------------------------------------------------------------- */

export function LateralDaSeccao({
  grupo,
  visivel,
  recolhida,
  aoRecolher,
}: {
  grupo: GrupoNav | null;
  visivel: (i: ItemNav) => boolean;
  recolhida: boolean;
  aoRecolher: (v: boolean) => void;
}) {
  const caminho = usePathname();
  const itens = (grupo?.filhos ?? []).filter(visivel);

  // SEM CAMPOS, SEM COLUNA. O Painel não tem sub-páginas, e uma coluna vazia
  // ao lado do conteúdo era um risco a dizer que faltava alguma coisa.
  if (!itens.length) return null;

  const seccoes: { nome: string; itens: ItemNav[] }[] = [];
  for (const item of itens) {
    let s = seccoes.find((x) => x.nome === item.seccao);
    if (!s) {
      s = { nome: item.seccao, itens: [] };
      seccoes.push(s);
    }
    s.itens.push(item);
  }

  return (
    <aside
      // `sem-imprimir` além do `<aside>`: as regras de impressão dos mapas já
      // escondem `aside`, mas as do documento fiscal escondem por outra via.
      className={cn(
        // ALTURA TODA, e não a do conteúdo. Com poucas secções a coluna
        // acabava a meio e o fundo da página aparecia por baixo dela — um
        // rectângulo a menos no canto, que dava à moldura um ar de inacabado.
        // Agora vai do cabeçalho à barra dos módulos, tenha dois campos ou
        // vinte, e rola por dentro quando não cabem.
        "sem-imprimir sticky top-[var(--altura-cabecalho)] hidden h-[calc(100vh-var(--altura-cabecalho)-var(--altura-modulos))] shrink-0 flex-col overflow-y-auto border-r border-borda bg-superficie-2 transition-[width] duration-200 lg:flex",
        recolhida ? "w-[56px]" : "w-[212px]",
      )}
      aria-label={`Secções de ${grupo?.rotulo ?? ""}`}
    >
      {/* O BOTÃO EM CIMA, alinhado com o logótipo. É o primeiro da coluna e
          está sempre no mesmo sítio, com ou sem secções por baixo — em baixo
          mudava de altura consoante a página e obrigava a procurá-lo. */}
      <button
        type="button"
        onClick={() => aoRecolher(!recolhida)}
        title={
          recolhida
            ? "Mostrar os nomes das secções"
            : "Encolher a coluna e dar a largura ao conteúdo"
        }
        aria-label={recolhida ? "Alargar a coluna" : "Encolher a coluna"}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-borda px-3 py-2.5 text-[12.5px] font-semibold text-texto-suave hover:text-marca",
          recolhida && "justify-center px-0",
        )}
      >
        {recolhida ? (
          <PanelLeftOpen size={16} />
        ) : (
          <>
            <PanelLeftClose size={16} />
            Encolher
          </>
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {seccoes.map((s, i) => (
          <Fragment key={s.nome}>
            {/* O NOME DA SECÇÃO separa os grupos de campos, como no ribbon que
                aqui estava. Recolhida, vira um traço: o nome não cabe, mas a
                separação continua a fazer falta. */}
            {recolhida ? (
              i > 0 && (
                <span aria-hidden className="mx-2 my-1.5 h-px bg-borda" />
              )
            ) : (
              <span
                className={cn(
                  "px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.7px] text-texto-suave",
                  i > 0 && "mt-3 border-t border-borda pt-3",
                )}
              >
                {s.nome}
              </span>
            )}

            {s.itens.map((item) => (
              <Campo
                key={item.href}
                item={item}
                activo={itemActivo(caminho, item.href)}
                recolhida={recolhida}
              />
            ))}
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}

function Campo({
  item,
  activo,
  recolhida,
}: {
  item: ItemNav;
  activo: boolean;
  recolhida: boolean;
}) {
  const traco = iconeNav(item.icone);

  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-semibold transition-colors",
        recolhida && "justify-center px-0",
        activo
          ? "gradiente-marca text-white"
          : "text-texto-suave hover:bg-superficie hover:text-marca",
      )}
      aria-current={activo ? "page" : undefined}
    >
      <span className="flex size-[22px] shrink-0 items-center justify-center">
        {traco ? (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-[19px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado SVG constante do nosso próprio iconesNav.ts — não há entrada de utilizador neste caminho.
            dangerouslySetInnerHTML={{ __html: traco }}
          />
        ) : (
          <span className="size-[19px]" />
        )}
      </span>
      {!recolhida && <span className="truncate">{item.rotulo}</span>}
    </Link>
  );

  // Recolhida, o nome só existe no rato — sem isto a coluna passava a ser uma
  // fila de símbolos por adivinhar.
  if (!recolhida) return link;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={6}
          className="z-50 rounded-lg border border-borda bg-superficie px-2.5 py-1.5 text-[12.5px] font-semibold text-texto shadow-forte"
        >
          {item.rotulo}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
