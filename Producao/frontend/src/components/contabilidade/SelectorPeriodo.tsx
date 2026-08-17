"use client";

import { Selector } from "@/components/ui";
import { usePeriodos } from "@/lib/hooks";

/**
 * O período contabilístico — um só selector para toda a Contabilidade.
 *
 * A REGRA É A DO MOVIMENTO, e é aqui que passa a viver: períodos **00 a 15**,
 * onde 00 é a abertura, 01–12 são os meses, 13 são as regularizações e 14 e 15
 * são os apuramentos. Um ano contabilístico não tem doze posições, tem
 * dezasseis, e um `<select>` de meses não sabe disso.
 *
 * Porque é que isto existe: cada ecrã escrevia a sua versão do mesmo selector.
 * Uns diziam «Até ao mês», outros «Período», outros «Mês»; uns separavam o
 * código do nome com `·`, outros com `—`; a opção de ver tudo chamava-se
 * «Todos (15 · Resultado Líquido)» num sítio e «Todo o exercício» noutro. Era o
 * mesmo conceito com três aspectos e três nomes, e quem passa do Balancete
 * para as Retenções tinha de reaprender o filtro.
 *
 * `rotulo` continua a poder mudar — «Período» e «Até ao mês» não querem dizer o
 * mesmo, e essa diferença é real. O que não muda mais é a lista, a ordem, o
 * formato e as palavras.
 */
export function SelectorPeriodo({
  valor,
  aoMudar,
  rotulo = "Período",
  /** Texto da opção que não filtra nada. `null` tira-a: há ecrãs onde escolher
   *  um período é obrigatório e «todos» não significaria coisa nenhuma. */
  rotuloTodos = "Todo o exercício",
  className,
  larguraMinima = "15rem",
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: string;
  rotuloTodos?: string | null;
  className?: string;
  larguraMinima?: string;
}) {
  const { periodos } = usePeriodos();

  return (
    <Selector
      rotulo={rotulo}
      valor={valor}
      aoMudar={aoMudar}
      className={className}
      larguraMinima={larguraMinima}
      opcoes={[
        ...(rotuloTodos === null ? [] : [{ valor: "", rotulo: rotuloTodos }]),
        // `00 · Abertura`, e não `00 — Abertura` nem `00 Abertura`. Uma forma
        // só, em toda a aplicação.
        ...periodos.map((p) => ({
          valor: p.codigo,
          rotulo: `${p.codigo} · ${p.nome}`,
        })),
      ]}
    />
  );
}
