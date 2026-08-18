"use client";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

import { IconeDeLinha } from "@/components/layout/IconeDeLinha";
import { useTema } from "@/contexts/TemaContext";

/* ---------------------------------------------------------------------------
   A moldura dos ecrãs públicos: entrar, pedir acesso, activar licença.

   Os três são a primeira coisa que alguém vê do produto, e estavam a dizer
   coisas diferentes: o de entrar tinha o painel azul de dois lados, e os
   outros dois eram um cartão solto ao meio de uma página vazia. Quem activava
   uma licença via um ecrã pior do que o de entrar — logo no momento em que
   está a decidir se confia no sistema.

   Passa a haver uma moldura só. O painel da esquerda muda de texto conforme o
   ecrã; a coluna da direita leva o formulário.
--------------------------------------------------------------------------- */

export type PontoDeVenda = { icone: string; texto: string };

export function MolduraPublica({
  titulo,
  subtitulo,
  pontos,
  children,
}: {
  /** O que se diz no painel azul. Duas linhas, no máximo. */
  titulo: React.ReactNode;
  subtitulo: string;
  pontos: PontoDeVenda[];
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr] min-[860px]:grid-cols-[1.05fr_0.95fr] min-[860px]:grid-rows-1">
      <Faixa titulo={titulo} subtitulo={subtitulo} pontos={pontos} />

      <section className="relative flex items-center justify-center bg-fundo px-5 py-10 min-[860px]:px-10">
        <BotaoTema />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-[440px]"
        >
          {children}
        </motion.div>
      </section>
    </main>
  );
}

function Faixa({
  titulo,
  subtitulo,
  pontos,
}: {
  titulo: React.ReactNode;
  subtitulo: string;
  pontos: PontoDeVenda[];
}) {
  return (
    <section className="gradiente-marca relative flex flex-col justify-between overflow-hidden px-[22px] py-[26px] text-white min-[860px]:px-12 min-[860px]:py-[52px]">
      <span
        aria-hidden
        className="absolute -right-[130px] -top-[150px] size-[440px] rounded-full bg-white/[0.08]"
      />
      <span
        aria-hidden
        className="absolute -bottom-[130px] -left-[90px] size-[320px] rounded-full bg-black/10"
      />

      <a href="/" className="relative z-[1] flex w-fit items-center gap-3">
        <span className="rounded-xl bg-black/30 px-3.5 py-1.5 text-[30px] font-black leading-none tracking-[-1px]">
          SGD
        </span>
        <span className="flex flex-col leading-[1.05]">
          <b className="text-[15px] tracking-[4px]">SGD</b>
          <span className="text-[9.5px] tracking-[2px] opacity-85">
            SOFTWARE DE GESTÃO DIRIGIDA
          </span>
        </span>
      </a>

      <div className="relative z-[1] my-4 min-[860px]:my-0">
        <h2 className="mb-3 text-2xl font-extrabold leading-[1.15] min-[860px]:text-[34px]">
          {titulo}
        </h2>
        <p className="max-w-[430px] text-[15px] leading-[1.55] opacity-90">
          {subtitulo}
        </p>
        <ul className="mt-7 hidden list-none flex-col gap-[13px] p-0 min-[860px]:flex">
          {pontos.map((p) => (
            <li
              key={p.texto}
              className="flex items-center gap-3 text-[14.5px] font-medium"
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-white/[0.18]">
                <IconeDeLinha nome={p.icone} tamanho={19} />
              </span>
              {p.texto}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-[1] hidden text-[12.5px] opacity-80 min-[860px]:block">
        © {new Date().getFullYear()} SGD · Software de Gestão Dirigida
      </div>
    </section>
  );
}

function BotaoTema() {
  const { tema, alternar } = useTema();
  return (
    <button
      type="button"
      onClick={alternar}
      title="Alternar tema"
      aria-label={
        tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"
      }
      className="absolute right-[18px] top-[18px] flex size-[38px] items-center justify-center rounded-[10px] border border-borda bg-superficie-2 text-texto transition-colors hover:border-acento"
    >
      {tema === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

/** Os passos de um formulário longo, para se ver onde se está. */
export function Passos({
  actual,
  total,
  rotulos,
}: {
  actual: number;
  total: number;
  rotulos: string[];
}) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Passos">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const feito = n < actual;
        const aqui = n === actual;
        return (
          <li key={rotulos[i]} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1 rounded-full transition-colors ${
                feito || aqui ? "bg-marca" : "bg-borda"
              }`}
            />
            <span
              className={`text-[11px] font-semibold ${
                aqui ? "text-marca" : "text-texto-suave"
              }`}
            >
              {rotulos[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
