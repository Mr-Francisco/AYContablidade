"use client";

import { Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { Confirmar } from "@/components/ui/CrudMestre";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { ehZero, formata } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Exercicio } from "@/types";

interface Rubrica {
  codigo: string;
  nome: string;
  valor: string;
  amort?: boolean;
}

interface Nota {
  n: number;
  grupo: "BL" | "DR";
  titulo: string;
  rubricas: Rubrica[];
  total: string;
  analise?: string;
  texto?: string;
  narrativa?: boolean;
  automatico: string;
  editada: boolean;
}

/**
 * Notas às Contas — as 35 notas do Piloto.
 *
 * TODAS ABERTAS, cada uma no seu cartão. A Produção tinha-as num acordeão, o
 * que faz sentido para uma lista de opções e nenhum para um documento: as
 * notas lêem-se de seguida, imprimem-se de seguida, e são citadas pelo número.
 * Fechadas, é preciso abrir trinta e cinco para ler o documento e a impressão
 * sai vazia.
 *
 * A COLUNA DO ANO ANTERIOR é a razão de ser de uma nota. «Imobilizações
 * corpóreas: 8 500 000» não diz nada sozinho; ao lado do ano anterior diz se
 * a empresa investiu, amortizou ou vendeu. O Piloto tem-na e a Produção não
 * tinha. Vem do exercício anterior, ligado rubrica a rubrica pelo código de
 * conta — o número da nota é chave estável, porque a definição não depende
 * dos dados.
 */
export default function Notas() {
  const { pode } = useAuth();
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [grupo, setGrupo] = useState("todos");

  const exId = exercicioId ?? activo?.id;
  const exercicio = exercicios.find((e) => e.id === exId);
  const anterior = exercicioAnterior(exercicios, exercicio);

  const q = exId ? `?exercicio_id=${exId}` : "";
  const { data, isLoading, mutate, error } = useSWR<Nota[]>(
    `/api/relatorios/notas${q}`,
    buscador,
  );
  const { data: dadosAnteriores, mutate: mutateAnteriores } = useSWR<Nota[]>(
    anterior ? `/api/relatorios/notas?exercicio_id=${anterior.id}` : null,
    buscador,
  );

  // Por número da nota, e dentro dela por código de conta.
  const antPorNota = useMemo(() => {
    const m = new Map<
      number,
      { total: string; rubricas: Map<string, string> }
    >();
    for (const n of dadosAnteriores ?? []) {
      m.set(n.n, {
        total: n.total,
        rubricas: new Map(n.rubricas.map((r) => [r.codigo, r.valor])),
      });
    }
    return m;
  }, [dadosAnteriores]);

  const visiveis = (data ?? []).filter(
    (n) => grupo === "todos" || n.grupo === grupo,
  );

  const anoActual = (exercicio?.inicio ?? "").slice(0, 4);
  const anoAnterior = anterior
    ? (anterior.inicio ?? "").slice(0, 4)
    : anoActual
      ? String(Number(anoActual) - 1)
      : "";

  return (
    <>
      <CabecalhoPagina
        titulo="Notas às Contas"
        descricao="Composição de cada rubrica do Balanço e da Demonstração de Resultados — apurada das contas do exercício."
      />

      <Cartao className="mb-4">
        <BarraFiltros>
          <Selector
            rotulo="Exercício"
            valor={exId ?? ""}
            aoMudar={setExercicioId}
            opcoes={exercicios.map((e) => ({
              valor: e.id,
              rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
            }))}
            larguraMinima="13rem"
          />
          <Selector
            valor={grupo}
            aoMudar={setGrupo}
            opcoes={[
              { valor: "todos", rotulo: "Todas as notas" },
              { valor: "BL", rotulo: "Notas do Balanço" },
              { valor: "DR", rotulo: "Notas da Demonstração de Resultados" },
            ]}
            larguraMinima="18rem"
          />
          {/* «Ir para» — trinta e cinco notas não se percorrem à roda do rato,
              e citam-se pelo número. É o índice do Piloto. */}
          <span className="sem-imprimir min-w-0 flex-1 text-[12.5px] text-texto-suave">
            {visiveis.length > 0 && (
              <>
                Ir para:{" "}
                {visiveis.map((n, i) => (
                  <span key={n.n}>
                    {i > 0 && " · "}
                    <a
                      href={`#nota-${n.n}`}
                      className="font-semibold text-marca hover:underline"
                    >
                      {n.n}
                    </a>
                  </span>
                ))}
              </>
            )}
          </span>
          <Botao
            tamanho="pequeno"
            onClick={() => {
              mutate();
              mutateAnteriores();
            }}
          >
            <RefreshCw size={14} />
            Actualizar
          </Botao>
          <AccoesDoMapa desactivado={!data} />
        </BarraFiltros>
      </Cartao>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <FalhaAoCarregar erro={error} oQue="as notas" />
      ) : (
        <div className="flex flex-col gap-4">
          {visiveis.map((n) => (
            <CartaoNota
              key={n.n}
              nota={n}
              anterior={antPorNota.get(n.n)}
              anoActual={anoActual}
              anoAnterior={anoAnterior}
              exercicioId={exId}
              podeEditar={pode("contab.lancar")}
              aoGravar={() => mutate()}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function CartaoNota({
  nota,
  anterior,
  anoActual,
  anoAnterior,
  exercicioId,
  podeEditar,
  aoGravar,
}: {
  nota: Nota;
  anterior?: { total: string; rubricas: Map<string, string> };
  anoActual: string;
  anoAnterior: string;
  exercicioId?: string;
  podeEditar: boolean;
  aoGravar: () => void;
}) {
  const [aEditar, setAEditar] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Repor descarta o texto que alguém escreveu, e não há como o recuperar.
  const [aRepor, setARepor] = useState(false);

  const conteudo = nota.narrativa ? nota.texto : nota.analise;
  const q = exercicioId ? `?exercicio_id=${exercicioId}` : "";

  async function gravar() {
    setOcupado(true);
    setErro(null);
    try {
      await api.put(`/api/relatorios/notas/${nota.n}${q}`, { texto });
      setAEditar(false);
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function repor() {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/relatorios/notas/${nota.n}${q}`);
      setAEditar(false);
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.mensagemUtilizador : "Não foi possível repor.",
      );
    } finally {
      setOcupado(false);
      setARepor(false);
    }
  }

  /** Vazio escreve-se com travessão, não com «0,00»: é ausência, não zero. */
  const valorAnterior = (codigo: string) => {
    const v = anterior?.rubricas.get(codigo);
    return v && !ehZero(v) ? formata(v) : "—";
  };

  return (
    <Cartao id={`nota-${nota.n}`} className="scroll-mt-24">
      <div className="mb-3.5 flex flex-wrap items-center gap-2 text-[16px] font-extrabold">
        <span>
          {nota.n}. {nota.titulo}
        </span>
        <Selo cor="#62657a">{nota.grupo === "BL" ? "Balanço" : "Result."}</Selo>
        {nota.editada && (
          <Selo cor="#c98a10">
            <Pencil size={11} aria-hidden />
            editado
          </Selo>
        )}
        {podeEditar && !aEditar && (
          <Botao
            variante="contorno"
            tamanho="pequeno"
            className="sem-imprimir ml-auto"
            onClick={() => {
              setTexto(conteudo ?? "");
              setAEditar(true);
            }}
          >
            <Pencil size={13} />
            Editar
          </Botao>
        )}
      </div>

      {!nota.narrativa && (
        <div className="-mx-5 mb-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={TH}>Conta</th>
                <th className={TH}>Rubrica</th>
                <th className={`${TH} w-[150px] text-right`}>{anoActual}</th>
                <th className={`${TH} w-[120px] text-right`}>{anoAnterior}</th>
              </tr>
            </thead>
            <tbody>
              {nota.rubricas.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-texto-suave"
                  >
                    Sem movimento nesta rubrica.
                  </td>
                </tr>
              ) : (
                nota.rubricas.map((r) => (
                  <tr
                    key={`${r.codigo}-${r.nome}`}
                    className={`border-b border-borda ${r.amort ? "text-texto-suave" : ""}`}
                  >
                    <td className="tabular px-3 py-1.5">{r.codigo}</td>
                    <td className="px-3 py-1.5">{r.nome}</td>
                    <td className="tabular px-3 py-1.5 text-right">
                      {formata(r.valor)}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right text-texto-suave">
                      {anterior ? valorAnterior(r.codigo) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-acento bg-[color-mix(in_srgb,var(--color-acento)_12%,var(--color-superficie-2))] font-extrabold">
                <td colSpan={2} className="px-3 py-1.5">
                  Total
                </td>
                <td className="tabular px-3 py-1.5 text-right">
                  {formata(nota.total)}
                </td>
                <td className="tabular px-3 py-1.5 text-right">
                  {anterior && !ehZero(anterior.total)
                    ? formata(anterior.total)
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {aEditar ? (
        <div className="sem-imprimir">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder={`Escreva a ${nota.narrativa ? "nota" : "análise"}…`}
            className="w-full rounded-[10px] border border-borda bg-superficie p-3 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/25"
          />
          {erro && (
            <Alerta tipo="erro" className="mt-2">
              {erro}
            </Alerta>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Botao
              variante="primario"
              tamanho="pequeno"
              onClick={gravar}
              disabled={ocupado}
            >
              {ocupado ? "A guardar…" : "Guardar"}
            </Botao>
            <Botao
              variante="contorno"
              tamanho="pequeno"
              onClick={() => setARepor(true)}
              disabled={ocupado}
            >
              <RotateCcw size={13} />
              Repor automático
            </Botao>
            <Botao
              variante="contorno"
              tamanho="pequeno"
              onClick={() => {
                setAEditar(false);
                setErro(null);
              }}
              disabled={ocupado}
            >
              Cancelar
            </Botao>
          </div>
        </div>
      ) : nota.narrativa ? (
        <p className="text-sm leading-relaxed">{conteudo}</p>
      ) : conteudo ? (
        <div className="rounded-lg border-l-[3px] border-acento bg-[color-mix(in_srgb,var(--color-acento)_6%,var(--color-superficie))] px-3 py-2.5 text-[13px] leading-[1.6]">
          <b>Análise:</b> {conteudo}
        </div>
      ) : podeEditar ? (
        <p className="text-[13px] text-texto-suave">
          Sem análise — use «Editar» para acrescentar.
        </p>
      ) : null}

      {aRepor && (
        <Confirmar
          aberto
          aoMudar={(a) => {
            if (!a) setARepor(false);
          }}
          titulo={`Repor o texto automático da nota ${nota.n}?`}
          rotuloConfirmar="Repor"
          rotuloOcupado="A repor…"
          variante="perigo"
          aoConfirmar={repor}
          ocupado={ocupado}
        >
          O texto escrito à mão é apagado e a nota volta ao que o sistema apura
          das contas. Não há como o recuperar depois.
        </Confirmar>
      )}
    </Cartao>
  );
}

const TH =
  "border-b border-borda bg-superficie-2 px-3 py-1.5 text-left text-[11.5px] font-bold uppercase tracking-[0.4px] text-texto-suave";

/**
 * O exercício imediatamente anterior a este, pela data de início.
 *
 * Pela data e não pelo nome: «Exercício 2026» é convenção, não garantia, e há
 * empresas com exercícios que não coincidem com o ano civil.
 */
function exercicioAnterior(
  todos: Exercicio[],
  actual: Exercicio | undefined,
): Exercicio | undefined {
  if (!actual) return undefined;
  return todos
    .filter(
      (e) => e.id !== actual.id && (e.inicio ?? "") < (actual.inicio ?? ""),
    )
    .sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""))[0];
}
