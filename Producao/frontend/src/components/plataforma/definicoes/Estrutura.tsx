"use client";

import { Check, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { IconeDeLinha } from "@/components/layout/IconeDeLinha";
import { Botao } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   As peças das Configurações da plataforma.

   O ecrã era uma grelha de cartões todos ao mesmo nível: o interruptor geral
   do assistente, o tamanho das respostas, os prazos de limpeza e uma caixa de
   texto explicativo, tudo à vista ao mesmo tempo e tudo com o mesmo peso.
   Quem lá chegava para mudar uma coisa tinha de a procurar entre as outras, e
   nada dizia quais eram as decisões importantes.

   Passa a haver DUAS coisas separadas:

   - uma **navegação por categorias**, que é o índice do que se pode definir e
     mostra o valor actual de cada uma sem se entrar lá;
   - uma **secção de cada vez**, com o seu formulário e o seu botão.

   E um comportamento consistente em todas: enquanto não se muda nada, gravar
   está bloqueado e diz porquê; assim que se muda, aparece «por gravar» e a
   hipótese de desfazer. É o que separa o estado de leitura do de edição sem
   obrigar a carregar num botão «editar».
--------------------------------------------------------------------------- */

export type Categoria = {
  id: string;
  icone: string;
  rotulo: string;
  /** O valor actual, para se ver sem entrar. */
  resumo: string;
  /** Chama a atenção quando o estado merece — por exemplo, sem certificação. */
  alerta?: boolean;
};

export function NavegacaoDefinicoes({
  categorias,
  activa,
  aoEscolher,
}: {
  categorias: Categoria[];
  activa: string;
  aoEscolher: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Categorias de configuração"
      // Em ecrã largo é uma coluna à esquerda; em ecrã estreito passa a uma
      // fila que se percorre na horizontal, para não empurrar o formulário
      // para baixo do que se vê.
      className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {categorias.map((c) => {
        const aqui = c.id === activa;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => aoEscolher(c.id)}
            aria-current={aqui ? "true" : undefined}
            className={cn(
              "flex min-w-[190px] shrink-0 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors lg:min-w-0 lg:w-full",
              aqui
                ? "border-marca bg-marca/[0.07]"
                : "border-transparent hover:border-borda hover:bg-superficie-2",
            )}
          >
            <span
              className={cn(
                "flex size-9 flex-none items-center justify-center rounded-[10px]",
                aqui
                  ? "bg-marca text-white"
                  : "bg-superficie-2 text-texto-suave",
              )}
            >
              <IconeDeLinha nome={c.icone} tamanho={18} />
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-[14px] font-bold leading-tight",
                  aqui ? "text-marca" : "text-texto",
                )}
              >
                {c.rotulo}
              </span>
              <span
                className={cn(
                  "mt-0.5 block truncate text-[12px] leading-tight",
                  c.alerta ? "text-aviso" : "text-texto-suave",
                )}
              >
                {c.resumo}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function Seccao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-borda bg-superficie">
      <header className="border-b border-borda px-6 py-5">
        <h2 className="text-[19px] font-extrabold tracking-[-0.3px]">
          {titulo}
        </h2>
        <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-texto-suave">
          {descricao}
        </p>
      </header>
      <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
    </section>
  );
}

/** Um grupo de campos dentro de uma secção, com o seu próprio título. */
export function Grupo({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[14px] font-bold">{titulo}</h3>
        {nota && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-texto-suave">
            {nota}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** A barra de acções no fim de um formulário.
 *
 *  É a mesma em todas as secções de propósito: o botão no mesmo sítio, com as
 *  mesmas palavras e o mesmo comportamento. Antes cada cartão tinha o seu, uns
 *  a dizer «Gravar» e outros «Gravar prazos», e uns com aviso de bloqueio e
 *  outros sem. */
export function BarraDeAccoes({
  mudou,
  valido,
  aGravar,
  gravado,
  aoDesfazer,
  rotulo = "Guardar alterações",
}: {
  mudou: boolean;
  valido: boolean;
  aGravar: boolean;
  gravado: boolean;
  aoDesfazer: () => void;
  rotulo?: string;
}) {
  return (
    <div className="-mx-6 -mb-5 mt-1 flex flex-wrap items-center gap-3 border-t border-borda bg-superficie-2/60 px-6 py-4">
      <Estado mudou={mudou} gravado={gravado} />
      <span className="flex-1" />
      {mudou && (
        <Botao type="button" variante="contorno" onClick={aoDesfazer}>
          <RotateCcw size={15} />
          Desfazer
        </Botao>
      )}
      <Botao
        type="submit"
        variante="primario"
        disabled={aGravar || !mudou || !valido}
        motivoBloqueio={
          aGravar
            ? "A guardar — aguarde."
            : !valido
              ? "Há valores por corrigir antes de guardar."
              : !mudou
                ? "Não alterou nada."
                : undefined
        }
      >
        {aGravar ? "A guardar…" : rotulo}
      </Botao>
    </div>
  );
}

/** O que está a acontecer, dito ao lado do botão e não numa faixa a saltar. */
function Estado({ mudou, gravado }: { mudou: boolean; gravado: boolean }) {
  if (gravado && !mudou) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sucesso">
        <Check size={15} />
        Guardado
      </span>
    );
  }
  if (mudou) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-aviso">
        <span className="size-2 rounded-full bg-aviso" aria-hidden />
        Alterações por guardar
      </span>
    );
  }
  return null;
}
