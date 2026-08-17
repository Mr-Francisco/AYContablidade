"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Layers,
  Lightbulb,
  PieChart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  Carrossel,
  Cartao,
  type CelulaKpi,
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

interface MesEvolucao {
  mes: string;
  nome: string;
  proveitos: string;
  custos: string;
  resultado: string;
}

interface ContasCorrentes {
  totais: { debito: string; credito: string; saldo: string };
  com_saldo: number;
}

/**
 * Painel inicial — dois painéis lado a lado, não empilhados.
 *
 * O `index.html` do Piloto é uma faixa de marca a 60vh e mais nada; a Produção
 * acrescentou-lhe números que o Piloto não tem. Empilhados, um dos dois ficava
 * sempre a perder: ou o primeiro ecrã do sistema era meia página de logótipo
 * com o trabalho escondido em baixo, ou a marca desaparecia.
 *
 * No carrossel cabem os dois inteiros. Abre no dos números — quem entra de
 * manhã quer saber como está a empresa — e a marca fica a uma seta de
 * distância. Nada foi retirado de nenhum dos dois.
 */
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
  const { data: meses } = useSWR<MesEvolucao[]>(
    `/api/relatorios/evolucao-mensal${q}`,
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

  const dadosGrafico = useMemo(
    () =>
      (meses ?? []).map((m) => ({
        nome: m.nome,
        Proveitos: paraGrafico(m.proveitos),
        Custos: paraGrafico(m.custos),
        Resultado: paraGrafico(m.resultado),
      })),
    [meses],
  );

  // Os dois últimos meses COM MOVIMENTO, e não os dois últimos do calendário:
  // em Agosto, comparar com Julho vazio dava sempre «-100%» e não informava
  // nada. Assim compara-se trabalho com trabalho, e diz-se quais.
  const comparacao = useMemo(() => {
    if (!meses) return undefined;
    const activos = meses.filter(
      (m) => !big(m.proveitos).eq(0) || !big(m.custos).eq(0),
    );
    if (activos.length === 0) return undefined;
    return { ultimo: activos.at(-1) as MesEvolucao, anterior: activos.at(-2) };
  }, [meses]);

  const primeiroNome = utilizador?.nome.split(" ")[0] ?? "";
  const contexto = empresa
    ? `${empresa.nome}${exercicio ? ` · ${exercicio.nome}` : ""}`
    : "Painel geral";

  /** Rodapé de um KPI: quanto foi no último mês e quanto variou. */
  const rodapeDe = (campo: keyof MesEvolucao): CelulaKpi[] | undefined => {
    if (!comparacao) return undefined;
    const { ultimo, anterior } = comparacao;
    const celulas: CelulaKpi[] = [];

    if (anterior) {
      const a = big(ultimo[campo] as string);
      const b = big(anterior[campo] as string);
      if (!b.eq(0)) {
        const pct = a.minus(b).div(b.abs()).times(100);
        const sobe = pct.gte(0);
        celulas.push({
          valor: `${sobe ? "↑" : "↓"} ${pct.abs().toFixed(1).replace(".", ",")}%`,
          rotulo: `vs ${anterior.nome}`,
          tendencia: sobe ? "sobe" : "desce",
        });
      }
    }
    celulas.push({
      valor: formataCompacto(ultimo[campo] as string, moeda),
      rotulo: `${ultimo.nome} (último mês)`,
    });
    return celulas;
  };

  /*
   * A ORDEM: identidade primeiro, informação a seguir.
   *
   * Quem abre o sistema vê primeiro a marca e só depois os números — foi
   * pedido assim. O painel de informação continua a ser o segundo do carrossel
   * e a um clique de distância; nada foi retirado de nenhum dos dois.
   */
  const paineis = [
    {
      id: "identidade",
      titulo: "Identidade SGD",
      conteudo: <PainelIdentidade nome={primeiroNome} contexto={contexto} />,
    },
    {
      id: "dashboard",
      titulo: "Informação",
      conteudo: (
        <PainelEnquadrado>
          <Saudacao nome={primeiroNome} contexto={contexto} comData />

          {isLoading ? (
            <ACarregar />
          ) : (
            <>
              <GrelhaRevelada className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 lg:grid-cols-4">
                <ItemRevelado className="min-w-0">
                  <Kpi
                    rotulo="Proveitos"
                    valor={formataCompacto(resumo?.proveitos, moeda)}
                    detalhe="Classe 6 do exercício"
                    cor="var(--grafico-6)"
                    icone={<TrendingUp size={18} />}
                    rodape={rodapeDe("proveitos")}
                  />
                </ItemRevelado>
                <ItemRevelado className="min-w-0">
                  <Kpi
                    rotulo="Custos"
                    valor={formataCompacto(resumo?.custos, moeda)}
                    detalhe="Classe 7 do exercício"
                    cor="var(--grafico-1)"
                    icone={<TrendingDown size={18} />}
                    rodape={rodapeDe("custos")}
                  />
                </ItemRevelado>
                <ItemRevelado className="min-w-0">
                  <Kpi
                    rotulo="Resultado"
                    valor={formataCompacto(resumo?.resultado, moeda)}
                    detalhe={
                      big(resumo?.resultado).gte(0) ? "Lucro" : "Prejuízo"
                    }
                    tendencia={big(resumo?.resultado).gte(0) ? "sobe" : "desce"}
                    cor={
                      big(resumo?.resultado).gte(0)
                        ? "var(--grafico-4)"
                        : "var(--grafico-1)"
                    }
                    icone={<PieChart size={18} />}
                    rodape={rodapeDe("resultado")}
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
                    icone={<Layers size={18} />}
                    rodape={
                      balanco && [
                        {
                          valor: formataCompacto(
                            balanco.total_cp_passivo,
                            moeda,
                          ),
                          rotulo: "Capital próprio e passivo",
                        },
                      ]
                    }
                  />
                </ItemRevelado>
              </GrelhaRevelada>

              {balanco && !balanco.equilibrado && (
                <Alerta tipo="erro">
                  O Balanço não equilibra: activo de{" "}
                  {formataMoeda(balanco.total_activo, moeda)} contra capital
                  próprio e passivo de{" "}
                  {formataMoeda(balanco.total_cp_passivo, moeda)}. Verifique os
                  lançamentos do período.
                </Alerta>
              )}

              <div className="grid gap-3.5 lg:grid-cols-[1.2fr_1fr]">
                <Cartao className="flex min-w-0 flex-col">
                  <TituloCartao extra={exercicio?.nome}>
                    <TrendingUp size={17} className="text-acento" />
                    Proveitos, custos e resultado
                  </TituloCartao>
                  {/* Altura em `clamp`: encolhe num portátil baixo e cresce
                      num ecrã grande, sem obrigar o painel a fazer scroll. */}
                  <LegendaSeries />
                  <div className="h-[clamp(165px,22vh,250px)] w-full">
                    <GraficoMensal dados={dadosGrafico} />
                  </div>
                </Cartao>

                <div className="flex min-w-0 flex-col gap-3.5">
                  <Cartao className="min-w-0">
                    <TituloCartao
                      extra={
                        <LigacaoVerTudo href="/contas-correntes/clientes" />
                      }
                    >
                      Contas correntes
                    </TituloCartao>
                    <div className="flex flex-col gap-2.5">
                      <LinhaSaldo
                        rotulo="A receber de clientes"
                        valor={clientes?.totais.saldo}
                        contas={clientes?.com_saldo}
                        moeda={moeda}
                        href="/contas-correntes/clientes"
                        cor="var(--grafico-3)"
                        icone={<Users size={17} />}
                      />
                      <LinhaSaldo
                        rotulo="A pagar a fornecedores"
                        valor={fornecedores?.totais.saldo}
                        contas={fornecedores?.com_saldo}
                        moeda={moeda}
                        href="/contas-correntes/fornecedores"
                        cor="var(--grafico-1)"
                        icone={<Wallet size={17} />}
                      />
                    </div>
                  </Cartao>

                  <Cartao className="min-w-0">
                    <TituloCartao
                      extra={<LigacaoVerTudo href="/assistente/diagnostico" />}
                    >
                      Alertas e pendências
                    </TituloCartao>
                    <ResumoDiagnostico diagnostico={diagnostico} />
                  </Cartao>
                </div>
              </div>
            </>
          )}
        </PainelEnquadrado>
      ),
    },
  ];

  return (
    <div className="mt-5">
      <Carrossel paineis={paineis} nota={<div></div>} />
    </div>
  );
}

/**
 * A moldura de um painel do carrossel.
 *
 * Sem ela, o painel dos números ficava solto no fundo da página enquanto o da
 * marca era um bloco fechado — dois painéis do mesmo carrossel a parecerem
 * coisas diferentes. O gradiente é o azul da marca muito diluído, para os
 * cartões brancos (ou escuros) continuarem a destacar-se por cima.
 */
function PainelEnquadrado({ children }: { children: React.ReactNode }) {
  return (
    // `[&>*]:shrink-0`: sem isto, o painel é uma coluna flex e os filhos
    // encolhem para caber em vez de deixarem a caixa fazer scroll — o gráfico
    // ficava esmagado a dois píxeis de altura em vez de se ver inteiro.
    <div className="gradiente-painel flex h-full min-h-[420px] flex-col gap-3.5 rounded-[18px] border border-borda p-4 shadow-suave [&>*]:shrink-0 min-[700px]:p-5">
      {children}
    </div>
  );
}

/** As três séries do gráfico, pela ordem em que se lêem. */
const SERIES = [
  { nome: "Proveitos", cor: "var(--grafico-6)" },
  { nome: "Custos", cor: "var(--grafico-1)" },
  { nome: "Resultado", cor: "var(--grafico-4)" },
] as const;

/**
 * Legenda em HTML e não a do Recharts.
 *
 * A da biblioteca (v3) não deixa fixar a ordem — saía «Custos, Proveitos,
 * Resultado» — e sobrepunha-se ao valor mais alto do eixo. Aqui a ordem é a da
 * leitura: ganhar, gastar, sobrar.
 */
function LegendaSeries() {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
      {SERIES.map((s) => (
        <span
          key={s.nome}
          className="flex items-center gap-1.5 text-[12px] text-texto-suave"
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: s.cor }}
          />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

function GraficoMensal({
  dados,
}: {
  dados: {
    nome: string;
    Proveitos: number;
    Custos: number;
    Resultado: number;
  }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-borda)"
          vertical={false}
        />
        <XAxis
          dataKey="nome"
          tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-borda)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-texto-suave)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formataCompacto(v, "")}
          width={64}
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
          // O Recharts tipa o valor como ValueType (pode ser string, array ou
          // indefinido) — formataMoeda trata disso.
          formatter={(v, nome) => [formataMoeda(v as string | number), nome]}
        />
        {SERIES.map((s) => (
          <Bar
            key={s.nome}
            dataKey={s.nome}
            fill={s.cor}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LigacaoVerTudo({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-semibold text-marca hover:underline"
    >
      Ver todas <ArrowRight size={13} />
    </Link>
  );
}

/**
 * «Bom dia, Ana», a empresa e o exercício.
 *
 * Aparece nos dois painéis de propósito: no carrossel, cada painel é um ecrã
 * inteiro, e um ecrã sem dizer de que empresa e de que exercício fala é um ecrã
 * onde se lêem números sem saber a que respeitam.
 */
function Saudacao({
  nome,
  contexto,
  comData = false,
  claro = false,
}: {
  nome: string;
  contexto: string;
  comData?: boolean;
  claro?: boolean;
}) {
  // A madrugada é noite e não manhã: às duas da manhã, «bom dia» soa a
  // relógio partido. Seis é a fronteira.
  const hora = new Date().getHours();
  const parte =
    hora < 6 || hora >= 20 ? "Boa noite" : hora < 13 ? "Bom dia" : "Boa tarde";

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1
          className={`text-[26px] font-black tracking-[-0.5px] ${claro ? "text-white" : ""}`}
        >
          {parte}
          {nome ? `, ${nome}` : ""}
        </h1>
        <p
          className={`mt-0.5 truncate text-[13.5px] ${claro ? "text-white/85" : "text-texto-suave"}`}
        >
          {contexto}
        </p>
      </div>
      {comData && <DataDeHoje />}
    </div>
  );
}

/**
 * A data de hoje, por extenso.
 *
 * Escrita depois de montar e não durante: o servidor renderiza noutro fuso e
 * noutro instante, e o React acusa a diferença como erro de hidratação.
 */
function DataDeHoje() {
  const [hoje, setHoje] = useState<{ data: string; dia: string }>();

  useEffect(() => {
    const agora = new Date();
    setHoje({
      data: agora.toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      dia: agora.toLocaleDateString("pt-PT", { weekday: "long" }),
    });
  }, []);

  if (!hoje) return null;
  return (
    <div className="flex items-center gap-2">
      <CalendarDays size={17} className="text-texto-suave" />
      <div>
        <div className="text-[13px] font-semibold">{hoje.data}</div>
        <div className="text-[12px] capitalize text-texto-suave">
          {hoje.dia}
        </div>
      </div>
    </div>
  );
}

/**
 * O painel de marca — o `index.html` do Piloto, inteiro.
 *
 * Ocupa a altura toda do carrossel em vez dos 60vh fixos que tinha: dentro do
 * carrossel, a altura é a do painel activo, e uma faixa de 60vh deixava uma
 * tira vazia por baixo.
 */
function PainelIdentidade({
  nome,
  contexto,
}: {
  nome: string;
  contexto: string;
}) {
  return (
    <div className="gradiente-marca flex h-full min-h-[420px] flex-col rounded-[18px] px-4 py-7 shadow-suave min-[700px]:px-8 min-[700px]:py-9">
      <Saudacao nome={nome} contexto={contexto} claro />

      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-6 text-center">
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
    </div>
  );
}

function LinhaSaldo({
  rotulo,
  valor,
  contas,
  moeda,
  href,
  cor,
  icone,
}: {
  rotulo: string;
  valor?: string;
  contas?: number;
  moeda: string;
  href: string;
  cor: string;
  icone: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-borda p-2.5 transition-colors hover:border-acento"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          color: cor,
          background: `color-mix(in srgb, ${cor} 16%, transparent)`,
        }}
      >
        {icone}
      </span>
      {/* `basis` para o selo poder passar para a linha de baixo em vez de
          espremer o valor: «937 650,00 Kz» cortado a meio não é um saldo. */}
      <div className="min-w-0 flex-1 basis-[150px]">
        <div className="truncate text-[12.5px] text-texto-suave">{rotulo}</div>
        <div className="truncate text-[17px] font-extrabold tabular">
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
      {/* Contagem por gravidade em cartões: à distância vê-se se há erros sem
          ter de ler a lista. Os números são os do diagnóstico e não outros. */}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <ContagemAchados
          n={erro}
          rotulo={erro === 1 ? "erro" : "erros"}
          detalhe="a resolver"
          cor="var(--color-perigo)"
          icone={<AlertTriangle size={15} />}
        />
        <ContagemAchados
          n={aviso}
          rotulo={aviso === 1 ? "aviso" : "avisos"}
          detalhe="a confirmar"
          cor="var(--color-aviso)"
          icone={<AlertTriangle size={15} />}
        />
        <ContagemAchados
          n={sugestao}
          rotulo={sugestao === 1 ? "sugestão" : "sugestões"}
          detalhe="de melhoria"
          cor="var(--color-texto-suave)"
          icone={<Lightbulb size={15} />}
        />
      </div>
      <ul className="flex flex-col gap-1.5">
        {diagnostico.achados.slice(0, 2).map((a) => (
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
    </div>
  );
}

function ContagemAchados({
  n,
  rotulo,
  detalhe,
  cor,
  icone,
}: {
  n: number;
  rotulo: string;
  detalhe: string;
  cor: string;
  icone: React.ReactNode;
}) {
  // A zero, o cartão apaga-se em vez de desaparecer: se saltasse fora, as três
  // colunas mudavam de largura conforme o dia.
  const vazio = n === 0;
  return (
    <div
      className="flex items-center gap-2 rounded-xl border p-2.5"
      style={{
        borderColor: vazio ? "var(--color-borda)" : cor,
        background: vazio
          ? undefined
          : `color-mix(in srgb, ${cor} 8%, transparent)`,
      }}
    >
      <span
        aria-hidden
        style={{ color: vazio ? "var(--color-texto-suave)" : cor }}
      >
        {icone}
      </span>
      <div className="min-w-0">
        <div className="text-[17px] font-black leading-none tabular">{n}</div>
        <div className="truncate text-[11px] text-texto-suave">
          {rotulo} {detalhe}
        </div>
      </div>
    </div>
  );
}
