"use client";

import { Campo, Entrada } from "@/components/ui";
import { useExercicios } from "@/lib/hooks";

/**
 * Uma data dentro do exercício — a mesma regra em toda a Contabilidade.
 *
 * A REGRA CENTRAL É A DO MOVIMENTO: uma data contabilística pertence a um
 * exercício, e fora dele não quer dizer nada. O Movimento nunca deixou escolher
 * um dia de outro ano; as consultas deixavam, cada uma à sua maneira, e uma
 * pesquisa de «01/01/2020 a hoje» num sistema com um exercício aberto devolvia
 * sempre o mesmo — com a diferença de que ninguém percebia porquê.
 *
 * `min` e `max` não bloqueiam em silêncio: o browser mostra os limites no
 * calendário e recusa a submissão dizendo o intervalo. Quem quiser ver outro
 * ano muda de exercício, que é onde essa decisão pertence.
 *
 * Sem exercício definido — uma empresa acabada de criar — não limita nada.
 * Limitar ao nada seria impedir de escrever qualquer data.
 */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
  exercicioId,
  dica,
  className,
  disabled,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** O exercício em causa. Sem ele vale o activo. */
  exercicioId?: string;
  dica?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { exercicios, activo } = useExercicios();
  const ex = exercicioId
    ? (exercicios.find((e) => e.id === exercicioId) ?? activo)
    : activo;

  return (
    <Campo
      rotulo={rotulo}
      className={className}
      dica={
        dica ??
        (ex ? `Dentro de ${ex.nome} (${ex.inicio} a ${ex.fim}).` : undefined)
      }
    >
      <Entrada
        type="date"
        value={valor}
        min={ex?.inicio}
        max={ex?.fim}
        disabled={disabled}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </Campo>
  );
}
