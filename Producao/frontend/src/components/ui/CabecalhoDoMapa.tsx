"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useExercicios, usePeriodos } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * O cabeçalho de um mapa — do Piloto (`.bal-cabecalho`), que o tem em catorze
 * páginas com a mesma forma.
 *
 * O QUE RESOLVE. Um mapa impresso saía da Produção com o título e mais nada:
 * «Balancete Geral». De que empresa, de que exercício, de que período, em que
 * moeda — nada disso ia ao papel, porque estava tudo nos campos de filtro, e
 * os campos não se imprimem. Uma folha assim não se arquiva: daqui a três
 * meses ninguém sabe a que se refere, e um balancete sem período não serve
 * para conferir coisa nenhuma.
 *
 * A FORMA É A DO PILOTO, e é a de qualquer mapa contabilístico:
 *
 *     A Minha Empresa, Lda.                     Valores em Kz · Período …
 *     Balancete Geral — Exercício 2026
 *     ────────────────────────────────────────────────────────────────────
 *
 * À esquerda quem emite e o que é; à direita o que é preciso para ler os
 * números. No ecrã fica igual — não é um bloco só para a impressora, é o
 * cabeçalho do mapa, e vê-lo no ecrã é o que garante que está certo antes de
 * se gastar papel.
 */
export function CabecalhoDoMapa({
  titulo,
  exercicioId,
  periodoCodigo,
  periodo,
  detalhe,
  className,
}: {
  /** O que o mapa é: «Balancete Geral», «Mapa de Retenções na Fonte». */
  titulo: string;
  /**
   * O exercício a que o mapa se refere. O NOME vem daqui de dentro — todas as
   * páginas já têm o `id` à mão e nenhuma precisa de ir buscar o nome só para
   * o escrever no cabeçalho.
   */
  exercicioId?: string | null;
  /**
   * O período contabilístico (`00`–`15`), quando o mapa é de um. Escreve-se
   * `08 · Agosto`, que é a forma usada em toda a aplicação e no Piloto — e
   * resolvida aqui para não haver duas maneiras de a escrever.
   */
  periodoCodigo?: string | null;
  /** O que mais o restringe: o armazém, a conta, um intervalo de datas. */
  periodo?: string | null;
  /**
   * À direita. Por omissão, a moeda — que é o que a maioria dos mapas do
   * Piloto lá põe. Os mapas fiscais põem o NIF, porque é o que a AGT procura
   * primeiro numa folha entregue.
   */
  detalhe?: ReactNode;
  className?: string;
}) {
  const { empresa } = useAuth();
  const { exercicios } = useExercicios();
  const { periodos } = usePeriodos();
  const moeda = empresa?.moeda ?? "Kz";

  // O exercício primeiro, o resto a seguir — a ordem do Piloto. Junta-se com
  // um ponto do meio, que é o que ele usa entre o exercício e o período.
  const p = periodos.find((x) => x.codigo === periodoCodigo);
  const contexto = [
    exercicios.find((e) => e.id === exercicioId)?.nome,
    p && `${p.codigo} · ${p.nome}`,
    periodo,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "cabecalho-mapa mb-3 flex flex-wrap items-start justify-between gap-3 border-b-2 border-borda pb-2.5",
        className,
      )}
    >
      <div className="min-w-0">
        <b className="text-[15px]">{empresa?.nome ?? "—"}</b>
        <span className="block text-[13px] text-texto-suave">
          {titulo}
          {contexto && ` — ${contexto}`}
        </span>
      </div>
      <div className="text-[13px] text-texto-suave">
        {detalhe ?? `Valores em ${moeda}`}
      </div>
    </div>
  );
}
