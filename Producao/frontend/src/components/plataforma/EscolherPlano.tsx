"use client";

import { Check, Infinity as Infinito, Users } from "lucide-react";
import useSWR from "swr";

import { Alerta, Campo, Selo } from "@/components/ui";
import { buscador } from "@/lib/api";
import { formataInteiro } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Escolher o plano de uma licença.

   Era uma lista com três palavras — «Base», «Profissional», «Enterprise» —
   escritas à mão neste ecrã e que não correspondiam a nada no servidor.
   Escolher uma ou outra dava exactamente a mesma licença.

   Agora cada plano diz a quem se destina, que módulos inclui e que limites
   traz, e escolher preenche a licença. Os campos abaixo continuam a poder ser
   ajustados: o plano preenche, não tranca — é o que permite dar um módulo a
   mais a um cliente sem inventar um plano para ele sozinho.
--------------------------------------------------------------------------- */

export interface PlanoCatalogo {
  codigo: string;
  nome: string;
  para_quem: string;
  modulos: string[];
  modulos_nomes: string[];
  todos_os_modulos: boolean;
  utilizadores: number | null;
  tokens_mes: number | null;
  custo_mes: string | null;
}

export function usePlanos() {
  return useSWR<PlanoCatalogo[]>("/api/licencas/planos", buscador, {
    revalidateOnFocus: false,
  });
}

export function EscolherPlano({
  valor,
  aoMudar,
  planos,
}: {
  valor: string;
  aoMudar: (codigo: string, plano: PlanoCatalogo) => void;
  planos: PlanoCatalogo[] | undefined;
}) {
  if (!planos?.length) {
    return (
      <Campo rotulo="Plano">
        <p className="text-sm text-texto-suave">A carregar os planos…</p>
      </Campo>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold">Plano</span>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {planos.map((p) => {
          const escolhido = p.codigo === valor;
          return (
            <button
              key={p.codigo}
              type="button"
              onClick={() => aoMudar(p.codigo, p)}
              aria-pressed={escolhido}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors",
                escolhido
                  ? "border-marca bg-marca/[0.07]"
                  : "border-borda hover:border-marca",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <b className="text-[15px]">{p.nome}</b>
                {escolhido && (
                  <Check
                    size={16}
                    className="shrink-0 text-marca"
                    aria-hidden
                  />
                )}
              </span>

              <span className="text-[12px] leading-relaxed text-texto-suave">
                {p.para_quem}
              </span>

              <span className="mt-0.5 flex flex-col gap-1 text-[12px]">
                <Linha
                  icone={<Users size={12} />}
                  texto={
                    p.utilizadores === null
                      ? "Utilizadores sem limite"
                      : `${p.utilizadores} utilizadores`
                  }
                />
                <Linha
                  icone={
                    p.tokens_mes === null ? (
                      <Infinito size={12} />
                    ) : (
                      <span className="text-[10px] font-bold">IA</span>
                    )
                  }
                  texto={
                    p.tokens_mes === null
                      ? "Assistente sem tecto"
                      : `${formataInteiro(p.tokens_mes)} tokens/mês`
                  }
                />
              </span>

              <span className="mt-1 flex flex-wrap gap-1">
                {p.todos_os_modulos ? (
                  <Selo cor="#1a9c5f">Todos os módulos</Selo>
                ) : (
                  p.modulos_nomes.map((m) => (
                    <span
                      key={m}
                      className="rounded-md bg-superficie-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-texto-suave"
                    >
                      {m}
                    </span>
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Linha({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-texto-suave">
      <span className="flex w-3.5 justify-center">{icone}</span>
      {texto}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Os módulos da licença — o campo QUE NÃO EXISTIA.

   Era a falha com consequência: sem campo, os módulos ficavam sempre na lista
   vazia, que o servidor entende como «todos». Toda a licença criada por aqui
   incluía todos os módulos, escolhesse-se que plano fosse. O mecanismo de
   limitar módulos estava construído e verificado no servidor, e não havia
   forma de o usar.
--------------------------------------------------------------------------- */

export const MODULOS: { valor: string; rotulo: string }[] = [
  { valor: "contabilidade", rotulo: "Contabilidade" },
  { valor: "fiscalidade", rotulo: "Fiscalidade" },
  { valor: "contasCorrentes", rotulo: "Contas Correntes" },
  { valor: "comercial", rotulo: "Comercial" },
  { valor: "logistica", rotulo: "Logística" },
  { valor: "imobilizados", rotulo: "Imobilizados" },
  { valor: "analitica", rotulo: "Analítica" },
  { valor: "rh", rotulo: "Recursos Humanos" },
];

export function EscolherModulos({
  valor,
  aoMudar,
  planoEscolhido,
}: {
  valor: string[];
  aoMudar: (modulos: string[]) => void;
  planoEscolhido: PlanoCatalogo | undefined;
}) {
  const todos = valor.length === 0;

  function alternar(m: string) {
    aoMudar(valor.includes(m) ? valor.filter((x) => x !== m) : [...valor, m]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold">Módulos incluídos</span>
        {planoEscolhido && (
          <button
            type="button"
            onClick={() => aoMudar([...planoEscolhido.modulos])}
            className="text-[12px] font-semibold text-marca hover:underline"
          >
            Voltar aos do plano {planoEscolhido.nome}
          </button>
        )}
      </span>

      <div className="flex flex-wrap gap-1.5">
        {MODULOS.map((m) => {
          const dentro = todos || valor.includes(m.valor);
          return (
            <button
              key={m.valor}
              type="button"
              onClick={() => alternar(m.valor)}
              aria-pressed={dentro}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                dentro
                  ? "border-marca bg-marca/[0.07] text-marca"
                  : "border-borda text-texto-suave hover:border-marca",
              )}
            >
              {m.rotulo}
            </button>
          );
        })}
      </div>

      {todos && (
        <Alerta tipo="info">
          Sem nenhum módulo escolhido, a licença inclui <b>todos</b> — incluindo
          os que vierem a existir. É o comportamento certo para o plano
          Completo; para os outros, escolha os módulos.
        </Alerta>
      )}
    </div>
  );
}
