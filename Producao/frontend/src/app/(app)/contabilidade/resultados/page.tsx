"use client";

import { Calculator, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";
import { SelectorPeriodo } from "@/components/contabilidade/SelectorPeriodo";
import { TabelaDemonstracao } from "@/components/contabilidade/TabelaDemonstracao";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoDoMapa,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
  TituloCartao,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { Confirmar } from "@/components/ui/CrudMestre";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import {
  big,
  formataCompacto,
  formataMoeda,
  paraGrafico,
} from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { DemonstracaoResultados } from "@/types";

export default function Resultados() {
  const { empresa, pode } = useAuth();
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [mes, setMes] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (mes) p.set("mes", mes);

  const { data, isLoading, mutate, error } = useSWR<DemonstracaoResultados>(
    `/api/relatorios/demonstracao-resultados?${p}`,
    buscador,
  );

  const [aApurar, setAApurar] = useState(false);
  const [aReabrir, setAReabrir] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dataApuramento, setDataApuramento] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const exercicio = exercicios.find((e) => e.id === exId);
  const jaApurado = Boolean(exercicio?.apuramento);
  const podeApurar = pode("contab.fechar");

  /** Apurar transfere os saldos das classes 6 e 7 para o resultado, gerando
   *  lançamentos. Reabrir remove exactamente esses — é por isso que o
   *  exercício guarda os ids do apuramento. */
  async function apurar() {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const r = await api.post<{ resultado: string; lancamentos: number }>(
        "/api/apuramentos/resultados",
        { exercicio_id: exId, data: dataApuramento },
      );
      await mutate();
      setAviso(
        `Resultado apurado: ${formataMoeda(r.resultado, moeda)} — ${r.lancamentos} lançamento(s) gerados.`,
      );
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível apurar.",
      );
    } finally {
      setOcupado(false);
      setAApurar(false);
    }
  }

  async function reabrir() {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await api.delete(`/api/apuramentos/resultados/${exId}`);
      await mutate();
      setAviso(
        "Apuramento reaberto — os lançamentos que gerou foram removidos.",
      );
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível reabrir.",
      );
    } finally {
      setOcupado(false);
      setAReabrir(false);
    }
  }

  // Só as rubricas com valor entram no gráfico — um gráfico com dez barras a
  // zero não diz nada.
  const grafico = useMemo(() => {
    if (!data) return [];
    return data.linhas
      .filter((l) => l.tipo === "linha" && l.valor && !big(l.valor).eq(0))
      .map((l) => ({
        nome:
          l.designacao.length > 24
            ? `${l.designacao.slice(0, 22)}…`
            : l.designacao,
        completo: l.designacao,
        valor: paraGrafico(l.valor),
        cor: big(l.valor).lt(0) ? "var(--grafico-1)" : "var(--grafico-6)",
      }));
  }, [data]);

  return (
    <>
      <CabecalhoPagina
        titulo="Demonstração de Resultados"
        descricao="Resultados por naturezas — PGC-AR."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <Selo cor={big(data.liquido).gte(0) ? "#1a9c5f" : "#e0284f"}>
                Resultado líquido: {formataMoeda(data.liquido, moeda)}
              </Selo>
            )}
            {podeApurar &&
              (jaApurado ? (
                <Botao
                  variante="contorno"
                  onClick={() => setAReabrir(true)}
                  disabled={ocupado}
                >
                  <RotateCcw size={15} />
                  Reabrir apuramento
                </Botao>
              ) : (
                <Botao
                  variante="acento"
                  onClick={() => setAApurar(true)}
                  disabled={ocupado || !exId}
                >
                  <Calculator size={15} />
                  Apurar Resultados do Exercício
                </Botao>
              ))}
            <AccoesDoMapa />
          </div>
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <BarraFiltros className="mb-4">
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
        <SelectorPeriodo
          rotulo="Até ao período"
          valor={mes}
          aoMudar={setMes}
          rotuloTodos="Todo o exercício"
          larguraMinima="14rem"
        />
      </BarraFiltros>

      <CabecalhoDoMapa
        titulo="Demonstração de Resultados"
        exercicioId={exId}
        periodoCodigo={mes}
      />

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <FalhaAoCarregar erro={error} oQue="a demonstração de resultados" />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1.15fr_1fr]">
          <Cartao className="min-w-0 overflow-hidden p-0">
            <TabelaDemonstracao linhas={data.linhas} moeda={moeda} />
          </Cartao>

          <Cartao className="min-w-0">
            <TituloCartao>Rubricas com movimento</TituloCartao>
            {grafico.length === 0 ? (
              <p className="py-8 text-center text-sm text-texto-suave">
                Sem rubricas com valor no período.
              </p>
            ) : (
              <div style={{ height: Math.max(240, grafico.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={grafico}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-borda)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formataCompacto(v, "")}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={150}
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-superficie-2)" }}
                      contentStyle={{
                        background: "var(--color-superficie)",
                        border: "1px solid var(--color-borda)",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "var(--color-texto)",
                      }}
                      formatter={(v, _n, item) => [
                        formataMoeda(v as string | number, moeda),
                        (item?.payload as { completo?: string })?.completo ??
                          "",
                      ]}
                    />
                    <Bar dataKey="valor" radius={[0, 5, 5, 0]} maxBarSize={22}>
                      {grafico.map((d) => (
                        <Cell key={d.completo} fill={d.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>
        </div>
      )}
      <Confirmar
        aberto={aApurar}
        aoMudar={(a) => !a && setAApurar(false)}
        titulo="Apurar os resultados do exercício?"
        rotuloConfirmar="Apurar"
        rotuloOcupado="A apurar…"
        variante="primario"
        ocupado={ocupado}
        aoConfirmar={apurar}
      >
        Transfere os saldos das classes 6 e 7 para o resultado do exercício,
        gerando os lançamentos de apuramento com data de <b>{dataApuramento}</b>
        .
        <br />
        <br />
        Reabre-se depois, e os lançamentos gerados são removidos.
      </Confirmar>

      <Confirmar
        aberto={aReabrir}
        aoMudar={(a) => !a && setAReabrir(false)}
        titulo="Reabrir o apuramento?"
        rotuloConfirmar="Reabrir"
        rotuloOcupado="A reabrir…"
        ocupado={ocupado}
        aoConfirmar={reabrir}
      >
        Os lançamentos que o apuramento gerou são <b>removidos</b>. As classes 6
        e 7 voltam a ter os seus saldos, e o exercício fica por apurar.
      </Confirmar>
    </>
  );
}
