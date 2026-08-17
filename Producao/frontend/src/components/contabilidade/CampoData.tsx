"use client";

import { useMemo } from "react";

import { SelectorData } from "@/components/contabilidade/SelectorData";
import { useExercicios } from "@/lib/hooks";

/**
 * Uma data em qualquer ecrã da Contabilidade — o mesmo selector do Movimento.
 *
 * A REGRA CENTRAL É A DO MOVIMENTO, e agora é literalmente o mesmo componente:
 * meses com nome, os quatro períodos que não são meses (00 Abertura,
 * 13 Regularizações, 14 e 15 Apuramentos) à parte e com o seu nome, e os dias
 * do mês escolhido — não trinta e um em todos.
 *
 * Antes, cada consulta usava um `<input type="date">` do browser. Três coisas
 * estavam mal com isso, e a terceira é a que se via:
 *
 * 1. **Não sabe o que é o período 14.** Um ano contabilístico tem dezasseis
 *    posições e o calendário só conhece doze.
 * 2. **Aceitava 31 de Abril**, e a data inválida só aparecia no servidor.
 * 3. **Era outro objecto.** Quem lança um movimento e depois abre o Extrato
 *    encontrava dois selectores de data diferentes na mesma aplicação.
 *
 * PERÍODOS 13 A 15 NUMA CONSULTA: não têm dia no calendário — são
 * regularizações e apuramentos, lançados ao fecho. Escolher um deles põe a
 * data no **último dia do exercício**, que é onde esses movimentos vivem, e o
 * selector di-lo por baixo em vez de mudar o número em silêncio.
 */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
  exercicioId,
  className,
}: {
  rotulo: string;
  /** Data em ISO (`AAAA-MM-DD`). Vazio é permitido — «sem limite». */
  valor: string;
  aoMudar: (iso: string) => void;
  /** O exercício em causa. Sem ele vale o activo. */
  exercicioId?: string;
  className?: string;
}) {
  const { exercicios, activo } = useExercicios();
  const ex = exercicioId
    ? (exercicios.find((e) => e.id === exercicioId) ?? activo)
    : activo;

  // Sem data escrita, mostra-se o princípio do exercício — o selector precisa
  // sempre de um ponto de partida, e o princípio do exercício é o que uma
  // consulta sem limite significa.
  const base = valor || ex?.inicio || `${new Date().getFullYear()}-01-01`;
  const [ano, mes, dia] = base.split("-");

  const ultimoDoExercicio = ex?.fim ?? `${ano}-12-31`;

  /*
   * O que dizer por baixo do campo.
   *
   * Escolher 13, 14 ou 15 leva a data ao último dia do exercício — e a partir
   * daí o selector mostra «31 / 12 · Dezembro», porque é isso que a consulta
   * vai usar. Sem uma palavra a explicar, parece que o clique foi ignorado.
   * Deriva-se da própria data, sem estado a mais para manter.
   */
  const nota = useMemo(() => {
    if (!ex) return null;
    if (base === ex.fim)
      return "Último dia do exercício — apanha regularizações e apuramentos (13 a 15).";
    if (base === ex.inicio)
      return "Primeiro dia do exercício — apanha a abertura (00).";
    return `Dentro de ${ex.nome}.`;
  }, [base, ex]);

  return (
    <div className={className}>
      <span className="text-[12.5px] font-semibold text-texto-suave">
        {rotulo}
      </span>
      <SelectorData
        ano={Number(ano)}
        mes={mes}
        dia={dia}
        aoMudarAno={(v) => aoMudar(`${v}-${mes}-${dia}`)}
        aoMudarMes={(v) => {
          // 00, 13, 14 e 15 não são meses. Numa consulta, o que se quer dizer
          // com eles é «até ao fecho» — e o fecho é o último dia do exercício.
          if (["00", "13", "14", "15"].includes(v)) {
            aoMudar(v === "00" ? (ex?.inicio ?? base) : ultimoDoExercicio);
            return;
          }
          // O dia baixa sozinho quando o mês novo não o tem — 31 de Março
          // seguido de Abril daria 31 de Abril.
          const nDias = new Date(Number(ano), Number(v), 0).getDate();
          const diaSeguro = String(Math.min(Number(dia), nDias)).padStart(
            2,
            "0",
          );
          aoMudar(`${ano}-${v}-${diaSeguro}`);
        }}
        aoMudarDia={(v) => aoMudar(`${ano}-${mes}-${v}`)}
      />
      {nota && (
        <p className="mt-1 text-[11px] leading-tight text-texto-suave">{nota}</p>
      )}
    </div>
  );
}
