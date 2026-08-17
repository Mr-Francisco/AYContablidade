"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePeriodos } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Os doze períodos que são meses do calendário. Os outros não têm dias. */
const MESES_REAIS = new Set([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
]);

/**
 * Quantos dias tem o período.
 *
 * `new Date(ano, mes, 0)` é o último dia do mês anterior ao índice — com `mes`
 * de 1 a 12 dá exactamente o último dia desse mês, e trata os anos bissextos
 * sem tabela nenhuma.
 *
 * Os períodos 00, 13, 14 e 15 não são meses: não têm um número de dias
 * próprio, e lançam-se tipicamente no primeiro ou no último dia do exercício.
 * Para esses ficam os 31, que é o que o Piloto sempre ofereceu.
 */
function diasDoPeriodo(ano: number, mes: string): number {
  if (!MESES_REAIS.has(mes)) return 31;
  return new Date(ano, Number(mes), 0).getDate();
}

/**
 * Nome curto para os períodos que não são meses.
 *
 * Cortar às cegas pelo comprimento punha «Apuramento de Resultados» e
 * «Apuramento de Imposto e Resultado Líquido» a dar os dois «Apuramento d.» —
 * dois botões diferentes com a mesma legenda. Tira-se o «Apuramento de », que
 * é a parte que se repete, e fica a parte que distingue. O nome inteiro
 * continua no `title`.
 */
function encurtar(nome: string, max: number): string {
  const curto = nome.replace(/^Apuramento de\s+/i, "Apur. ");
  return curto.length <= max ? curto : `${curto.slice(0, max - 1).trimEnd()}.`;
}

/**
 * Selector de mês e dia do movimento — o `dpPicker` do Piloto.
 *
 * NÃO é um calendário. O que se escolhe aqui é o **período contabilístico**
 * (00 a 15, onde 13–15 são de rectificação e apuramento e não existem no
 * calendário) e o dia. Um `<input type="date">` não sabe representar «período
 * 14» e obrigava a separar os dois campos.
 *
 * DUAS COISAS QUE O PILOTO FAZ E AQUI NÃO SE COPIARAM:
 *
 * 1. Os dias iam sempre até 31. Escolher Abril e 31 dava uma data que não
 *    existe, e ninguém avisava — o erro só aparecia ao gravar, ou pior, não
 *    aparecia de todo. O número de dias passa a ser o do mês escolhido, com os
 *    anos bissextos incluídos, e o dia baixa sozinho quando deixa de caber.
 *
 * 2. Os dezasseis períodos estavam numa grelha de números soltos, de 0 a 15,
 *    sem nada que dissesse que o 13 não é Janeiro nem que o 0 não é um mês. Os
 *    meses passam a mostrar o nome, e os quatro períodos que não são meses
 *    ficam à parte, com o seu nome.
 *
 * Fecha ao carregar fora ou com `Escape`, como no Piloto.
 */
export function SelectorData({
  ano,
  mes,
  dia,
  aoMudarAno,
  aoMudarMes,
  aoMudarDia,
}: {
  ano: number;
  mes: string;
  dia: string;
  aoMudarAno: (v: number) => void;
  aoMudarMes: (v: string) => void;
  aoMudarDia: (v: string) => void;
}) {
  const { periodos, sessaoCaiu, falhou } = usePeriodos();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoEscapar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    // `capture`: o mesmo do Piloto. Sem isto, um clique num botão que pára a
    // propagação deixava o selector aberto por cima do resto.
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", aoEscapar, true);
    return () => {
      document.removeEventListener("mousedown", fora, true);
      document.removeEventListener("keydown", aoEscapar, true);
    };
  }, [aberto]);

  const { meses, especiais } = useMemo(
    () => ({
      meses: periodos.filter((p) => MESES_REAIS.has(p.codigo)),
      especiais: periodos.filter((p) => !MESES_REAIS.has(p.codigo)),
    }),
    [periodos],
  );

  const nomeDoMes = periodos.find((p) => p.codigo === mes)?.nome ?? "";
  const nDias = diasDoPeriodo(ano, mes);

  /** Escolhe o período e, se o dia deixar de existir nele, recua-o. */
  function escolherMes(codigo: string) {
    aoMudarMes(codigo);
    const limite = diasDoPeriodo(ano, codigo);
    if (Number(dia) > limite) aoMudarDia(String(limite).padStart(2, "0"));
  }

  /** O mesmo para o ano: 29 de Fevereiro só existe de quatro em quatro. */
  function escolherAno(novo: number) {
    aoMudarAno(novo);
    const limite = diasDoPeriodo(novo, mes);
    if (Number(dia) > limite) aoMudarDia(String(limite).padStart(2, "0"));
  }

  return (
    <div ref={caixa} className="relative flex items-center gap-1.5">
      <input
        type="number"
        min={2000}
        max={2100}
        value={ano}
        onChange={(e) => escolherAno(Number(e.target.value) || ano)}
        aria-label="Ano"
        className="tabular w-[70px] rounded-[10px] border border-borda bg-superficie px-2 py-2.5 text-sm outline-none focus:border-acento"
      />
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cn(
          "flex min-w-[190px] items-center gap-2 rounded-[10px] border bg-superficie px-3 py-2.5 text-left text-sm font-semibold outline-none transition-colors",
          aberto ? "border-acento" : "border-borda hover:border-acento",
        )}
      >
        <CalendarDays size={15} className="shrink-0 text-texto-suave" />
        <span className="tabular">
          {dia} / {mes}
        </span>
        <span className="truncate text-texto-suave">· {nomeDoMes}</span>
      </button>

      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[262px] rounded-xl border border-borda bg-superficie p-2.5 shadow-forte">
          {/* Os períodos que se mostram são sempre os mesmos — são o modelo
              contabilístico, não dados da empresa. Quando o servidor não
              confirma, diz-se: calar-se era deixar a pessoa a lançar sem saber
              que a sessão pode já ter caído, e a descobri-lo ao gravar. */}
          {(sessaoCaiu || falhou) && (
            <p className="mb-2 rounded-lg border border-[var(--color-aviso)]/40 bg-[var(--color-aviso)]/10 px-2 py-1.5 text-[11px] leading-relaxed text-texto">
              {sessaoCaiu ? (
                <>
                  <b>A sessão expirou.</b> Os períodos abaixo são os de sempre e
                  pode continuar a escolher, mas gravar vai falhar — volte a
                  entrar primeiro.
                </>
              ) : (
                <>
                  Não se conseguiu falar com o servidor. Estes são os períodos
                  de sempre, que não mudam; a escolha é válida.
                </>
              )}
            </p>
          )}

          <Seccao rotulo="Mês" extra={`${nDias} dias`}>
            <div className="grid grid-cols-4 gap-1">
              {meses.map((p) => (
                <Celula
                  key={p.codigo}
                  activa={p.codigo === mes}
                  titulo={`${p.codigo} · ${p.nome}`}
                  onClick={() => escolherMes(p.codigo)}
                >
                  <span className="tabular text-[10px] leading-none opacity-70">
                    {p.codigo}
                  </span>
                  <span className="text-[12px] leading-none">
                    {p.nome.slice(0, 3)}
                  </span>
                </Celula>
              ))}
            </div>
          </Seccao>

          {/* Os que não são meses ficam à parte e com nome. Misturados na
              mesma grelha, o «13» lia-se como um dia 13 e o «0» como nada. */}
          {especiais.length > 0 && (
            <Seccao rotulo="Períodos especiais">
              <div className="grid grid-cols-2 gap-1">
                {especiais.map((p) => (
                  <Celula
                    key={p.codigo}
                    activa={p.codigo === mes}
                    titulo={`${p.codigo} · ${p.nome}`}
                    onClick={() => escolherMes(p.codigo)}
                    className="flex-row items-center gap-1 px-1.5"
                  >
                    <span className="tabular text-[10px] opacity-70">
                      {p.codigo}
                    </span>
                    <span className="truncate text-[11.5px] leading-none">
                      {encurtar(p.nome, 13)}
                    </span>
                  </Celula>
                ))}
              </div>
            </Seccao>
          )}

          <Seccao rotulo="Dia">
            {/* Sete colunas: é o ritmo de uma semana, e é por semanas que se
                procura um dia — mesmo sem os nomes dos dias por cima. */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: nDias }, (_, i) =>
                String(i + 1).padStart(2, "0"),
              ).map((d) => (
                <Celula
                  key={d}
                  activa={d === dia}
                  onClick={() => aoMudarDia(d)}
                  className="py-1"
                >
                  <span className="tabular text-[12.5px] leading-none">
                    {Number(d)}
                  </span>
                </Celula>
              ))}
            </div>
          </Seccao>
        </div>
      )}
    </div>
  );
}

function Seccao({
  rotulo,
  extra,
  children,
}: {
  rotulo: string;
  extra?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between">
        <b className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-texto-suave">
          {rotulo}
        </b>
        {extra && (
          <span className="tabular text-[10.5px] text-texto-suave">
            {extra}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Uma célula do selector.
 *
 * Com moldura e fundo próprios, como no Piloto: as células sem contorno que
 * aqui estavam liam-se como texto solto, e não se percebia onde acabava uma e
 * começava a seguinte.
 */
function Celula({
  activa,
  titulo,
  onClick,
  className,
  children,
}: {
  activa: boolean;
  titulo?: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-px rounded-md border py-0.5 font-semibold transition-colors",
        activa
          ? "border-marca bg-marca text-white shadow-suave"
          : "border-borda bg-superficie-2 text-texto hover:border-acento hover:text-acento",
        className,
      )}
    >
      {children}
    </button>
  );
}
