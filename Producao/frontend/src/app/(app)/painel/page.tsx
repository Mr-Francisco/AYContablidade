"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
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

import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Cartao,
  GrelhaRevelada,
  ItemRevelado,
  Kpi,
  Selo,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import {
  big,
  formataCompacto,
  formataMoeda,
  paraGrafico,
} from "@/lib/dinheiro";
import type { Balanco, Diagnostico, Exercicio } from "@/types";

interface Resumo {
  custos: string;
  proveitos: string;
  resultado: string;
}

interface ContasCorrentes {
  totais: { debito: string; credito: string; saldo: string };
  com_saldo: number;
}

export default function Painel() {
  const { utilizador, empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: exercicios } = useSWR<Exercicio[]>(
    "/api/contabilidade/exercicios",
    buscador,
  );
  const exercicio = useMemo(
    () => exercicios?.find((e) => e.ativo) ?? exercicios?.[0],
    [exercicios],
  );
  const q = exercicio ? `?exercicio_id=${exercicio.id}` : "";

  const { data: resumo, isLoading } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: balanco } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );
  const { data: clientes } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=31&natureza=D${exercicio ? `&exercicio_id=${exercicio.id}` : ""}`,
    buscador,
  );
  const { data: fornecedores } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=32&natureza=C${exercicio ? `&exercicio_id=${exercicio.id}` : ""}`,
    buscador,
  );
  const { data: diagnostico } = useSWR<Diagnostico>(
    `/api/ia/diagnostico${q}`,
    buscador,
  );

  const dadosGrafico = useMemo(() => {
    if (!resumo) return [];
    return [
      {
        nome: "Proveitos",
        valor: paraGrafico(resumo.proveitos),
        cor: "var(--grafico-6)",
      },
      {
        nome: "Custos",
        valor: paraGrafico(resumo.custos),
        cor: "var(--grafico-1)",
      },
      {
        nome: "Resultado",
        valor: paraGrafico(resumo.resultado),
        cor: big(resumo.resultado).lt(0)
          ? "var(--grafico-1)"
          : "var(--grafico-4)",
      },
    ];
  }, [resumo]);

  const primeiroNome = utilizador?.nome.split(" ")[0] ?? "";

  return (
    <>
      {/* O `index.html` do Piloto é isto e mais nada: uma faixa de marca a
          60vh com o logótipo, o nome e os módulos. É o primeiro ecrã que um
          cliente vê ao entrar, e era o que mais denunciava dois sistemas
          diferentes.

          Os KPIs da Produção ficam POR BAIXO, e não no lugar dela: o Piloto
          não tem painel transversal nenhum, mas apagar o que já existe seria
          tirar função a troco de fidelidade. */}
      <div className="gradiente-marca mb-4 mt-5 flex h-[44vh] min-h-[260px] flex-col items-center justify-center gap-3.5 rounded-[14px] px-4 py-7 text-center shadow-suave min-[700px]:h-[60vh] min-[700px]:min-h-[360px] min-[700px]:px-6 min-[700px]:py-12">
        <div className="rounded-2xl bg-white/[0.16] px-5 py-2 text-[40px] font-black tracking-[2px] text-white min-[700px]:px-7 min-[700px]:py-2.5 min-[700px]:text-[56px]">
          SGD
        </div>
        <div className="text-[20px] font-bold uppercase tracking-[4px] text-white">
          Software de Gestão Dirigida
        </div>
        <p className="max-w-[560px] text-sm leading-[1.6] text-white/85">
          Contabilidade · Analítica · Contas Correntes · Comercial · Logística ·
          Imobilizados · RH — tudo num só sistema.
        </p>
      </div>

      <CabecalhoPagina
        titulo={`Bom dia, ${primeiroNome}`}
        descricao={
          empresa
            ? `${empresa.nome}${exercicio ? ` · ${exercicio.nome}` : ""}`
            : "Painel geral"
        }
      />

      {isLoading ? (
        <ACarregar />
      ) : (
        <>
          <GrelhaRevelada className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ItemRevelado className="min-w-0">
              <Kpi
                rotulo="Proveitos"
                valor={formataCompacto(resumo?.proveitos, moeda)}
                detalhe="Classe 6 do exercício"
                cor="var(--grafico-6)"
              />
            </ItemRevelado>
            <ItemRevelado className="min-w-0">
              <Kpi
                rotulo="Custos"
                valor={formataCompacto(resumo?.custos, moeda)}
                detalhe="Classe 7 do exercício"
                cor="var(--grafico-1)"
              />
            </ItemRevelado>
            <ItemRevelado className="min-w-0">
              <Kpi
                rotulo="Resultado"
                valor={formataCompacto(resumo?.resultado, moeda)}
                detalhe={big(resumo?.resultado).gte(0) ? "Lucro" : "Prejuízo"}
                tendencia={big(resumo?.resultado).gte(0) ? "sobe" : "desce"}
                cor={
                  big(resumo?.resultado).gte(0)
                    ? "var(--grafico-4)"
                    : "var(--grafico-1)"
                }
              />
            </ItemRevelado>
            <ItemRevelado className="min-w-0">
              <Kpi
                rotulo="Total do Activo"
                valor={formataCompacto(balanco?.total_activo, moeda)}
                detalhe={
                  balanco
                    ? balanco.equilibrado
                      ? "Balanço equilibrado"
                      : "Balanço NÃO equilibra"
                    : undefined
                }
                tendencia={
                  balanco && !balanco.equilibrado ? "desce" : undefined
                }
                cor="var(--grafico-2)"
              />
            </ItemRevelado>
          </GrelhaRevelada>

          {balanco && !balanco.equilibrado && (
            <Alerta tipo="erro" className="mt-4">
              O Balanço não equilibra: activo de{" "}
              {formataMoeda(balanco.total_activo, moeda)} contra capital próprio
              e passivo de {formataMoeda(balanco.total_cp_passivo, moeda)}.
              Verifique os lançamentos do período.
            </Alerta>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Cartao className="min-w-0">
              <TituloCartao extra={exercicio?.nome}>
                <TrendingUp size={17} className="text-acento" />
                Proveitos, custos e resultado
              </TituloCartao>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dadosGrafico}
                    margin={{ top: 8, right: 8, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-borda)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="nome"
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--color-borda)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formataCompacto(v, "")}
                      width={70}
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
                      // O Recharts tipa o valor como ValueType (pode ser
                      // string, array ou indefinido) — formataMoeda trata disso.
                      formatter={(v) => [
                        formataMoeda(v as string | number),
                        "",
                      ]}
                    />
                    <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={72}>
                      {dadosGrafico.map((d) => (
                        <Cell key={d.nome} fill={d.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>

            <div className="flex min-w-0 flex-col gap-4">
              <Cartao className="min-w-0">
                <TituloCartao>Contas correntes</TituloCartao>
                <div className="flex flex-col gap-3">
                  <LinhaSaldo
                    rotulo="A receber de clientes"
                    valor={clientes?.totais.saldo}
                    contas={clientes?.com_saldo}
                    moeda={moeda}
                    href="/contas-correntes/clientes"
                    cor="var(--grafico-3)"
                  />
                  <LinhaSaldo
                    rotulo="A pagar a fornecedores"
                    valor={fornecedores?.totais.saldo}
                    contas={fornecedores?.com_saldo}
                    moeda={moeda}
                    href="/contas-correntes/fornecedores"
                    cor="var(--grafico-1)"
                  />
                </div>
              </Cartao>

              <Cartao className="min-w-0">
                <TituloCartao
                  extra={
                    <Link
                      href="/assistente/diagnostico"
                      className="inline-flex items-center gap-1 font-semibold text-marca hover:underline"
                    >
                      Ver tudo <ArrowRight size={13} />
                    </Link>
                  }
                >
                  Diagnóstico
                </TituloCartao>
                <ResumoDiagnostico diagnostico={diagnostico} />
              </Cartao>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function LinhaSaldo({
  rotulo,
  valor,
  contas,
  moeda,
  href,
  cor,
}: {
  rotulo: string;
  valor?: string;
  contas?: number;
  moeda: string;
  href: string;
  cor: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-borda p-3 transition-colors hover:border-acento"
    >
      <span
        aria-hidden
        className="h-9 w-1 shrink-0 rounded"
        style={{ background: cor }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-texto-suave">{rotulo}</div>
        <div className="truncate text-lg font-extrabold tabular">
          {formataMoeda(valor, moeda)}
        </div>
      </div>
      {contas !== undefined && <Selo cor="#62657a">{contas} c/ saldo</Selo>}
    </Link>
  );
}

function ResumoDiagnostico({ diagnostico }: { diagnostico?: Diagnostico }) {
  if (!diagnostico)
    return <div className="py-4 text-sm text-texto-suave">A analisar…</div>;

  if (diagnostico.total === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-sucesso">
        <CheckCircle2 size={17} />
        Nenhuma incoerência detectada.
      </div>
    );
  }

  const { erro, aviso, sugestao } = diagnostico.resumo;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {erro > 0 && (
          <Selo cor="#e0284f">
            <AlertTriangle size={12} /> {erro} {erro === 1 ? "erro" : "erros"}
          </Selo>
        )}
        {aviso > 0 && (
          <Selo cor="#c98a10">
            <AlertTriangle size={12} /> {aviso}{" "}
            {aviso === 1 ? "aviso" : "avisos"}
          </Selo>
        )}
        {sugestao > 0 && (
          <Selo cor="#62657a">
            <Info size={12} /> {sugestao}{" "}
            {sugestao === 1 ? "sugestão" : "sugestões"}
          </Selo>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {diagnostico.achados.slice(0, 4).map((a) => (
          <li key={a.regra} className="min-w-0 text-[13px] text-texto-suave">
            <span
              aria-hidden
              className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
              style={{
                background:
                  a.gravidade === "erro"
                    ? "var(--color-perigo)"
                    : a.gravidade === "aviso"
                      ? "var(--color-aviso)"
                      : "var(--color-texto-suave)",
              }}
            />
            {a.titulo}
          </li>
        ))}
      </ul>
      <Botao
        comoFilho
        variante="contorno"
        tamanho="pequeno"
        className="self-start"
      >
        <Link href="/assistente/diagnostico">Ver diagnóstico completo</Link>
      </Botao>
    </div>
  );
}
