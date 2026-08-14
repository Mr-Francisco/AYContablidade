"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Selector,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, ehZero, formata } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";
import { CLASSES } from "@/lib/plano";

/** Os nove valores de uma linha: três colunas para cada um dos três grupos. */
interface Valores {
  ant_d: string;
  ant_c: string;
  ant_s: string;
  per_d: string;
  per_c: string;
  per_s: string;
  acu_d: string;
  acu_c: string;
  acu_s: string;
}

interface LinhaModelo extends Valores {
  tipo: "conta" | "subtotal";
  codigo: string;
  nome: string;
  nivel?: number;
  eh_mov?: boolean;
  classe?: string;
}

interface BalanceteModelo {
  linhas: LinhaModelo[];
  total: Valores;
}

/**
 * Os três grupos de colunas do modelo Primavera.
 *
 * ANTERIOR é o que já vinha de trás da data «De»; PERÍODO é o que aconteceu
 * entre «De» e «Até»; ACUMULADO é a soma dos dois — o saldo real da conta à
 * data. Sem a coluna Anterior, um balancete de Março mostra Março e faz
 * parecer que a conta nasceu a 1 de Março.
 */
const GRUPOS = {
  ant: { rotulo: "Anterior", d: "ant_d", c: "ant_c", s: "ant_s" },
  per: { rotulo: "Período", d: "per_d", c: "per_c", s: "per_s" },
  acu: { rotulo: "Acumulado", d: "acu_d", c: "acu_c", s: "acu_s" },
} as const satisfies Record<
  string,
  { rotulo: string; d: keyof Valores; c: keyof Valores; s: keyof Valores }
>;

type ChaveGrupo = keyof typeof GRUPOS;

const MODOS: Record<string, ChaveGrupo[]> = {
  completo: ["ant", "per", "acu"],
  periodo_acum: ["per", "acu"],
  periodo: ["per"],
  anterior_periodo: ["ant", "per"],
};

const OPCOES_MODO = [
  { valor: "completo", rotulo: "Anterior, Período e Acumulado" },
  { valor: "periodo_acum", rotulo: "Período e Acumulado" },
  { valor: "periodo", rotulo: "Período" },
  { valor: "anterior_periodo", rotulo: "Anterior e Período" },
];

const OPCOES_DETALHE = [
  { valor: "todas", rotulo: "Todas as contas" },
  { valor: "razao", rotulo: "Total razão (movimento)" },
  { valor: "sub", rotulo: "Sub total (integradoras)" },
  { valor: "classe", rotulo: "Total da classe" },
];

/** Zero não se escreve — um balancete cheio de «0,00» não se lê. */
function n(v: string): string {
  return ehZero(v) ? "" : formata(v);
}

/** Saldo sem sinal, com D de devedor ou C de credor à direita. */
function saldoDC(v: string): string {
  if (ehZero(v)) return "";
  return `${formata(big(v).abs())} ${big(v).lt(0) ? "C" : "D"}`;
}

/** `2026-03-31` → `31/03/2026`, sem passar pelo fuso horário do browser. */
function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

export default function PaginaBalancete() {
  const router = useRouter();
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();

  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [modo, setModo] = useState("completo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [mes, setMes] = useState("");
  const [contaDe, setContaDe] = useState("");
  const [contaAte, setContaAte] = useState("");
  const [detalhe, setDetalhe] = useState("todas");
  const [aviso, setAviso] = useState<string | null>(null);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";
  const grupos = MODOS[modo] ?? MODOS.completo;

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (mes) p.set("mes", mes);

  const { data, isLoading, mutate } = useSWR<BalanceteModelo>(
    `/api/relatorios/balancete-modelo?${p}`,
    buscador,
  );

  /**
   * Intervalo de contas e grau de detalhe — o `aplicarFiltros` do Piloto.
   *
   * O intervalo compara CÓDIGOS COMO TEXTO, e é de propósito: assim «31» a
   * «32» apanha 311, 3111 e 319 sem ter de os enumerar, porque a ordem
   * alfabética dos códigos é a ordem hierárquica do plano. O `startsWith` no
   * limite superior é o que faz «até 32» incluir o próprio 32 e os seus filhos.
   */
  const linhas = useMemo(() => {
    if (!data) return [];
    const cDe = contaDe.trim();
    const cAte = contaAte.trim();
    const noIntervalo = (cod: string) =>
      (!cDe || cod >= cDe) && (!cAte || cod <= cAte || cod.startsWith(cAte));

    // Total da classe: agrega os subtotais de 2 dígitos pela classe de 1.
    if (detalhe === "classe") {
      const porClasse = new Map<string, LinhaModelo>();
      for (const s of data.linhas) {
        if (s.tipo !== "subtotal" || !noIntervalo(s.codigo)) continue;
        const cl = s.codigo[0];
        const g = porClasse.get(cl);
        if (!g) {
          porClasse.set(cl, {
            ...s,
            codigo: cl,
            nome: `Classe ${cl} · ${CLASSES[cl] ?? ""}`,
          });
          continue;
        }
        // Só os quatro valores de base se somam; os saldos derivam deles.
        g.ant_d = big(g.ant_d).plus(s.ant_d).toString();
        g.ant_c = big(g.ant_c).plus(s.ant_c).toString();
        g.per_d = big(g.per_d).plus(s.per_d).toString();
        g.per_c = big(g.per_c).plus(s.per_c).toString();
      }
      return [...porClasse.values()]
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map((g) => ({ ...g, ...derivados(g) }));
    }

    const saida: LinhaModelo[] = [];
    let grupo: LinhaModelo[] = [];
    for (const l of data.linhas) {
      if (l.tipo === "conta") {
        if (!noIntervalo(l.codigo)) continue;
        if (detalhe === "sub") continue; // só subtotais
        if (detalhe === "razao" && !l.eh_mov) continue; // só contas de movimento
        grupo.push(l);
      } else {
        if (detalhe === "sub") {
          if (noIntervalo(l.codigo)) saida.push(l);
        } else if (grupo.length) {
          // O subtotal só aparece se alguma conta dele passou o filtro.
          saida.push(...grupo, l);
        }
        grupo = [];
      }
    }
    return saida;
  }, [data, contaDe, contaAte, detalhe]);

  const total = data?.total;
  const equilibrado = total ? big(total.acu_d).eq(total.acu_c) : true;

  const celulas = (o: Valores) =>
    grupos.map((g) => {
      const G = GRUPOS[g];
      return (
        <Fragment key={g}>
          <td className={NUM}>{n(o[G.d])}</td>
          <td className={NUM}>{n(o[G.c])}</td>
          <td className={NUM}>{saldoDC(o[G.s])}</td>
        </Fragment>
      );
    });

  function exportar() {
    const cabecalho = ["Conta", "Descrição"];
    for (const g of grupos) {
      const L = GRUPOS[g].rotulo;
      cabecalho.push(`Débito (${L})`, `Crédito (${L})`, `Saldo (${L})`);
    }
    const vals = (o: Valores) =>
      grupos.flatMap((g) => [o[GRUPOS[g].d], o[GRUPOS[g].c], o[GRUPOS[g].s]]);
    const corpo: (string | number)[][] = linhas.map((l) => [
      l.tipo === "subtotal" ? "" : l.codigo,
      l.nome,
      ...vals(l),
    ]);
    if (total) corpo.push(["", "Total", ...vals(total)]);
    return { cabecalho, linhas: corpo };
  }

  function limparFiltro() {
    setContaDe("");
    setContaAte("");
    setDetalhe("todas");
  }

  const colunas = 2 + grupos.length * 3;

  return (
    <>
      <CabecalhoPagina
        titulo="Balancete Geral"
        descricao="Modelo Primavera — período seleccionável. Duplo clique numa conta abre o extracto."
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
            larguraMinima="12rem"
          />
          <Selector
            rotulo="Análise"
            valor={modo}
            aoMudar={setModo}
            opcoes={OPCOES_MODO}
            larguraMinima="15rem"
          />
          <Campo rotulo="De">
            <Entrada
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Até">
            <Entrada
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </Campo>
          <Selector
            rotulo="Até ao mês"
            valor={mes}
            aoMudar={setMes}
            opcoes={[
              { valor: "", rotulo: "Todos (15 · Resultado Líquido)" },
              ...periodos.map((x) => ({
                valor: x.codigo,
                rotulo: `${x.codigo} · ${x.nome}`,
              })),
            ]}
            larguraMinima="15rem"
          />
          <span className="flex-1" />
          <Botao
            tamanho="pequeno"
            onClick={() => {
              mutate();
              setAviso("Balancete actualizado.");
            }}
          >
            <RefreshCw size={14} />
            Actualizar
          </Botao>
          <AccoesDoMapa
            aoExportar={exportar}
            nomeDoFicheiro="Balancete"
            desactivado={!data}
          />
        </BarraFiltros>
      </Cartao>

      {aviso && (
        <Alerta tipo="sucesso" className="mb-4">
          {aviso}
        </Alerta>
      )}

      {isLoading ? (
        <ACarregar />
      ) : !data || !total ? (
        <Alerta tipo="erro">Não foi possível carregar o balancete.</Alerta>
      ) : (
        <Cartao className="mb-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b-2 border-borda pb-2.5">
            <div>
              <b>{empresa?.nome}</b>
              <br />
              <span className="text-[13px] text-texto-suave">
                Balancete Geral (
                {grupos.map((g) => GRUPOS[g].rotulo).join(", ")})
                {activo && !exercicioId ? ` — ${activo.nome}` : ""}
                {exercicioId
                  ? ` — ${exercicios.find((e) => e.id === exercicioId)?.nome ?? ""}`
                  : ""}
              </span>
            </div>
            <div className="text-[13px] text-texto-suave">
              Valores em {moeda}
              {de || ate
                ? ` · Período ${de ? dataCurta(de) : "início"} a ${ate ? dataCurta(ate) : "fim"}`
                : ""}
              {mes
                ? ` · Até ao mês ${mes} · ${periodos.find((x) => x.codigo === mes)?.nome ?? ""}`
                : ""}
            </div>
          </div>

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th rowSpan={2} className={TH}>
                    Conta
                  </th>
                  <th rowSpan={2} className={TH}>
                    Descrição
                  </th>
                  {grupos.map((g) => (
                    <th key={g} colSpan={3} className={TH_GRUPO}>
                      {GRUPOS[g].rotulo}
                    </th>
                  ))}
                </tr>
                <tr>
                  {grupos.map((g) => (
                    <FragmentoCabecalho key={g} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colunas}
                      className="px-2 py-10 text-center text-texto-suave"
                    >
                      Sem movimentos.
                    </td>
                  </tr>
                ) : (
                  linhas.map((l) =>
                    l.tipo === "subtotal" ? (
                      <FragmentoSubtotal
                        key={`s-${l.codigo}`}
                        linha={l}
                        celulas={celulas(l)}
                        colunas={colunas}
                      />
                    ) : (
                      <tr
                        key={`c-${l.codigo}`}
                        // Duplo clique abre o extracto — o gesto do Piloto para
                        // saltar do mapa para os movimentos que o explicam.
                        onDoubleClick={() =>
                          router.push(
                            `/contabilidade/extrato?conta=${l.codigo}`,
                          )
                        }
                        title="Duplo clique: extracto"
                        className="cursor-pointer border-b border-borda hover:bg-marca/[0.07]"
                      >
                        <td className={cel(l.eh_mov)}>{l.codigo}</td>
                        <td className={cel(l.eh_mov)}>{l.nome}</td>
                        {celulas(l)}
                      </tr>
                    ),
                  )
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-acento bg-[color-mix(in_srgb,var(--color-acento)_12%,var(--color-superficie-2))] font-extrabold">
                  <td colSpan={2} className="px-2 py-1">
                    TOTAL{equilibrado ? "" : " — desequilíbrio"}
                  </td>
                  {celulas(total)}
                </tr>
              </tfoot>
            </table>
          </div>
        </Cartao>
      )}

      {/* Filtro de contas a analisar — no Piloto vive num cartão à parte, em
          baixo, porque se mexe nele depois de olhar para o mapa, não antes. */}
      <Cartao className="sem-imprimir">
        <BarraFiltros>
          <b className="text-[13.5px]">Analisar contas:</b>
          <Campo rotulo="De conta">
            <Entrada
              value={contaDe}
              onChange={(e) => setContaDe(e.target.value)}
              placeholder="ex.: 31"
              className="w-[120px]"
            />
          </Campo>
          <Campo rotulo="Até conta">
            <Entrada
              value={contaAte}
              onChange={(e) => setContaAte(e.target.value)}
              placeholder="ex.: 32"
              className="w-[120px]"
            />
          </Campo>
          <Selector
            rotulo="Grau de detalhe"
            valor={detalhe}
            aoMudar={setDetalhe}
            opcoes={OPCOES_DETALHE}
            larguraMinima="13rem"
          />
          <Botao variante="neutro" tamanho="pequeno" onClick={limparFiltro}>
            Limpar filtro
          </Botao>
        </BarraFiltros>
      </Cartao>
    </>
  );
}

// Repartido em três porque `text-left` e `text-center` na mesma string não se
// resolvem pela ordem em que se escrevem — o Tailwind gera as duas regras com
// a mesma especificidade e ganha a que sair mais abaixo na folha.
const TH_BASE =
  "sticky top-0 z-10 border-b border-borda bg-superficie-2 px-2 py-1 text-[11px] font-bold uppercase tracking-[.4px]";
const TH = `${TH_BASE} text-left text-texto-suave`;
const TH_NUM = `${TH_BASE} text-right text-texto-suave`;
const TH_GRUPO = `${TH_BASE} border-x border-borda text-center text-acento`;
const NUM =
  "border-l border-borda/50 px-2 py-1 text-right tabular-nums whitespace-nowrap";

/** Contas de integração a negrito — é assim que se lê a hierarquia sem indentar. */
function cel(ehMov: boolean | undefined) {
  return `px-2 py-1 whitespace-nowrap${ehMov ? "" : " font-bold"}`;
}

function FragmentoCabecalho() {
  return (
    <>
      <th className={TH_NUM}>Débito</th>
      <th className={TH_NUM}>Crédito</th>
      <th className={TH_NUM}>Saldo</th>
    </>
  );
}

function FragmentoSubtotal({
  linha,
  celulas,
  colunas,
}: {
  linha: LinhaModelo;
  celulas: ReactNode;
  colunas: number;
}) {
  return (
    <>
      <tr className="border-t border-borda bg-superficie-2 font-bold">
        <td className="px-2 py-1" />
        <td className="px-2 py-1">{linha.nome}</td>
        {celulas}
      </tr>
      {/* O respiro entre grupos do Piloto: seis pixéis de nada, que é o que
          separa uma classe da seguinte sem precisar de uma linha a mais. */}
      <tr>
        <td colSpan={colunas} className="h-1.5 border-0 p-0" />
      </tr>
    </>
  );
}

/** Saldos e acumulados a partir dos quatro valores de base. */
function derivados(g: Valores): Valores {
  const antD = big(g.ant_d);
  const antC = big(g.ant_c);
  const perD = big(g.per_d);
  const perC = big(g.per_c);
  return {
    ant_d: antD.toString(),
    ant_c: antC.toString(),
    ant_s: antD.minus(antC).toString(),
    per_d: perD.toString(),
    per_c: perC.toString(),
    per_s: perD.minus(perC).toString(),
    acu_d: antD.plus(perD).toString(),
    acu_c: antC.plus(perC).toString(),
    acu_s: antD.plus(perD).minus(antC.plus(perC)).toString(),
  };
}
