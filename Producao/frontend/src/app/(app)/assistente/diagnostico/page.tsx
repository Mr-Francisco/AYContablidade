"use client";

import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Kpi,
  Selector,
  Selo,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { AchadoDiagnostico, Diagnostico } from "@/types";

const GRAVIDADES: Record<
  string,
  { rotulo: string; cor: string; Icone: typeof ShieldAlert }
> = {
  erro: { rotulo: "Erro", cor: "#c62828", Icone: ShieldAlert },
  aviso: { rotulo: "Aviso", cor: "#c98a10", Icone: AlertTriangle },
  sugestao: { rotulo: "Sugestão", cor: "#3d7fe0", Icone: Info },
};

export default function DiagnosticoPagina() {
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState("");
  const [gravidade, setGravidade] = useState("todas");

  const exId = exercicioId || activo?.id || "";
  const { data, isLoading } = useSWR<Diagnostico>(
    `/api/ia/diagnostico${exId ? `?exercicio_id=${exId}` : ""}`,
    buscador,
  );

  const achados = (data?.achados ?? []).filter((a) =>
    gravidade === "todas" ? true : a.gravidade === gravidade,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Diagnóstico"
        descricao="Detecção de erros e incoerências nos dados, por regras operacionais."
      />

      <Alerta tipo="info" className="mb-4">
        Este diagnóstico corre <b>inteiramente no servidor</b>, por regras — não
        contacta nenhuma API externa e funciona sem chave de IA configurada.
        Nada daqui é enviado para lado nenhum.
      </Alerta>

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Erros"
              valor={String(data.resumo.erro ?? 0)}
              detalhe="Exigem correcção"
              cor={
                (data.resumo.erro ?? 0) > 0
                  ? "var(--color-perigo)"
                  : "var(--grafico-6)"
              }
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Avisos"
              valor={String(data.resumo.aviso ?? 0)}
              detalhe="Vale a pena olhar"
              cor="var(--color-aviso)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Sugestões"
              valor={String(data.resumo.sugestao ?? 0)}
              detalhe="Melhorias possíveis"
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Total"
              valor={String(data.total)}
              detalhe={`${achados.length} a mostrar`}
              cor="var(--grafico-1)"
            />
          </div>
        </div>
      )}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos os exercícios" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="14rem"
        />
        <Selector
          rotulo="Gravidade"
          valor={gravidade}
          aoMudar={setGravidade}
          opcoes={[
            { valor: "todas", rotulo: "Todas" },
            { valor: "erro", rotulo: "Só erros" },
            { valor: "aviso", rotulo: "Só avisos" },
            { valor: "sugestao", rotulo: "Só sugestões" },
          ]}
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !achados.length ? (
        <Cartao>
          {data && data.total === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <ShieldCheck size={36} className="text-sucesso" aria-hidden />
              <div>
                <p className="text-base font-bold">Nada a assinalar.</p>
                <p className="mt-1 text-sm text-texto-suave">
                  Nenhuma das regras encontrou incoerências neste exercício.
                  Isto não certifica as contas — cobre apenas o que as regras
                  sabem verificar.
                </p>
              </div>
            </div>
          ) : (
            <Vazio>Nenhum achado com esta gravidade.</Vazio>
          )}
        </Cartao>
      ) : (
        <div className="flex flex-col gap-3">
          {achados.map((a) => (
            <CartaoAchado key={`${a.regra}-${a.titulo}`} achado={a} />
          ))}
        </div>
      )}
    </>
  );
}

function CartaoAchado({ achado: a }: { achado: AchadoDiagnostico }) {
  const g = GRAVIDADES[a.gravidade] ?? GRAVIDADES.sugestao;
  const { Icone } = g;

  return (
    <Cartao
      className="min-w-0 border-l-[3px]"
      style={{ borderLeftColor: g.cor }}
    >
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icone
            size={17}
            className="mt-0.5 shrink-0"
            style={{ color: g.cor }}
            aria-hidden
          />
          <h2 className="text-[15px] font-bold leading-snug">{a.titulo}</h2>
        </div>
        <span className="flex shrink-0 gap-1.5">
          <Selo cor={g.cor}>{g.rotulo}</Selo>
          <Selo cor="#62657a">{a.modulo}</Selo>
        </span>
      </header>

      <p className="text-sm">{a.detalhe}</p>

      {a.itens.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-marca">
            {plural(a.itens.length, "item afectado", "itens afectados")}
          </summary>
          <ul className="mt-2 flex flex-col gap-1 border-t border-borda pt-2">
            {a.itens.slice(0, 50).map((item, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: os itens são valores opacos vindos do backend e a lista é estática
                key={i}
                className="tabular text-xs text-texto-suave"
              >
                {typeof item === "string" ? item : JSON.stringify(item)}
              </li>
            ))}
            {a.itens.length > 50 && (
              <li className="text-xs italic text-texto-suave">
                … e mais {a.itens.length - 50}.
              </li>
            )}
          </ul>
        </details>
      )}

      {a.accao && (
        <p className="mt-2 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm">
          <b>O que fazer:</b> {a.accao}
        </p>
      )}
    </Cartao>
  );
}
