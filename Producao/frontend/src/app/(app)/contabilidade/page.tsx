"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  Barras,
  Donut,
  dataCurta,
  FaixaPainel,
  GrelhaKpis,
  GrelhaPainel,
  ListaPainel,
} from "@/components/painel";
import { ACarregar, Cartao, Kpi, TituloCartao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Balanco, Lancamento, Resumo } from "@/types";

/**
 * Painel Contabilístico — o `dash.contabilidade` do Piloto.
 *
 * A mesma estrutura, pela mesma ordem: faixa com três valores, quatro KPIs, a
 * composição do activo com o total ao centro ao lado dos últimos lançamentos,
 * e em baixo as duas leituras que fecham o exercício — o resultado (proveitos
 * menos custos) e a estrutura financeira (activo igual a capital próprio mais
 * passivo).
 *
 * TUDO SEM CASAS DECIMAIS. O painel do Piloto usa `formatKz`, que arredonda ao
 * inteiro: aqui lê-se a ordem de grandeza, e os cêntimos só fazem barulho. Os
 * mapas onde os cêntimos contam — balancete, extracto, razão — continuam com
 * as duas casas.
 *
 * O Piloto não tem selector de exercício aqui: usa o activo. Mantém-se assim.
 */

/** Soma as rubricas do balanço pelo nome, como o `valOf` do Piloto. */
function valorDe(
  linhas: { designacao: string; valor: string | null }[] | undefined,
  ...nomes: string[]
) {
  let total = big("0");
  for (const nome of nomes) {
    const l = linhas?.find((x) => x.designacao === nome);
    if (l?.valor) total = total.plus(big(l.valor));
  }
  return total;
}

export default function PainelContabilistico() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";
  const q = activo?.id ? `?exercicio_id=${activo.id}` : "";
  const kz = (v: Parameters<typeof big>[0]) => formataMoeda(v, moeda, 0);

  const { data: balanco, isLoading } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );
  const { data: resumo } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: lancamentos } = useSWR<Lancamento[]>(
    `/api/contabilidade/lancamentos?limite=6${activo?.id ? `&exercicio_id=${activo.id}` : ""}`,
    buscador,
  );

  const imobilizado = valorDe(
    balanco?.activo,
    "Imobilizações Corpóreas",
    "Imobilizações Incorpóreas",
    "Investimentos Financeiros",
    "Outros Activos Não Correntes",
  );
  const existencias = valorDe(balanco?.activo, "Existências");
  const receber = valorDe(balanco?.activo, "Contas a Receber");
  const disponibilidades = valorDe(balanco?.activo, "Disponibilidades");
  const capitalProprio = valorDe(balanco?.passivo, "Total do Capital Próprio");
  const passivo = valorDe(balanco?.passivo, "Total do Passivo");

  const resultado = big(resumo?.resultado ?? "0");
  const lucro = resultado.gte(0);

  const composicao = useMemo(
    () =>
      [
        { nome: "Imobilizado", valor: imobilizado, cor: "var(--grafico-1)" },
        { nome: "Existências", valor: existencias, cor: "var(--grafico-2)" },
        { nome: "Contas a Receber", valor: receber, cor: "var(--grafico-3)" },
        {
          nome: "Disponibilidades",
          valor: disponibilidades,
          cor: "var(--grafico-4)",
        },
      ].filter((x) => x.valor.gt(0)),
    [imobilizado, existencias, receber, disponibilidades],
  );

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Contabilidade · PGC-Angola"
        titulo="Painel Contabilístico"
        subtitulo="Posição financeira e resultado do exercício em tempo real."
        valores={[
          {
            rotulo: "Total do Activo",
            valor: kz(balanco?.total_activo ?? "0"),
          },
          { rotulo: "Capital Próprio", valor: kz(capitalProprio) },
          {
            rotulo: "Resultado do Exercício",
            valor: `${lucro ? "" : "−"}${kz(resultado.abs())}`,
          },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Total do Activo"
          valor={kz(balanco?.total_activo ?? "0")}
          detalhe={
            balanco?.equilibrado
              ? "Balanço equilibrado"
              : "Balanço por verificar"
          }
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Capital Próprio"
          valor={kz(capitalProprio)}
          detalhe={`Passivo ${kz(passivo)}`}
          cor="var(--color-roxo)"
        />
        {/* Sem `tendencia`: no Piloto «Lucro» sai na cor de legenda como
            qualquer outro detalhe, não a verde. */}
        <Kpi
          rotulo="Resultado Líquido"
          valor={`${lucro ? "" : "−"}${kz(resultado.abs())}`}
          detalhe={lucro ? "Lucro" : "Prejuízo"}
          cor={lucro ? "var(--color-sucesso)" : "var(--color-rosa)"}
        />
        <Kpi
          rotulo="Lançamentos"
          valor={String(resumo?.lancamentos ?? 0)}
          detalhe={`Movimentado ${kz(resumo?.movimentado ?? "0")}`}
          cor="var(--color-azul)"
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Composição do Activo</TituloCartao>
          {composicao.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem activo registado.
            </p>
          ) : (
            <Donut
              segmentos={composicao.map((c) => ({
                ...c,
                valor: c.valor.toString(),
              }))}
              centro={formataMoeda(balanco?.total_activo ?? "0", "", 0).trim()}
              centroSub="Activo"
              formatar={kz}
            />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Últimos Lançamentos</TituloCartao>
          <ListaPainel
            vazio="Sem lançamentos."
            linhas={(lancamentos ?? []).map((l) => ({
              titulo: `${l.numero_op ? `${l.numero_op} · ` : ""}${l.descricao || "Lançamento"}`,
              sub: `${dataCurta(l.data)} · Diário ${l.diario_codigo}`,
              valor: kz(l.total ?? "0"),
            }))}
          />
        </Cartao>
      </GrelhaPainel>

      <GrelhaPainel>
        <Cartao>
          <TituloCartao extra="Proveitos − Custos">
            Resultado do Exercício
          </TituloCartao>
          <Barras
            formatar={kz}
            itens={[
              {
                rotulo: "Proveitos",
                valor: resumo?.proveitos ?? "0",
                cor: "var(--grafico-6)",
              },
              {
                rotulo: "Custos",
                valor: resumo?.custos ?? "0",
                cor: "var(--grafico-1)",
              },
              {
                rotulo: "Resultado",
                valor: resultado.abs().toString(),
                texto: `${lucro ? "" : "−"}${kz(resultado.abs())}`,
                cor: "var(--grafico-2)",
              },
            ]}
          />
        </Cartao>

        <Cartao>
          <TituloCartao extra="Activo = CP + Passivo">
            Estrutura Financeira
          </TituloCartao>
          <Barras
            formatar={kz}
            itens={[
              {
                rotulo: "Activo",
                valor: balanco?.total_activo ?? "0",
                cor: "var(--grafico-2)",
              },
              {
                rotulo: "Capital Próprio",
                valor: capitalProprio.toString(),
                cor: "var(--grafico-3)",
              },
              {
                rotulo: "Passivo",
                valor: passivo.toString(),
                cor: "var(--grafico-5)",
              },
            ]}
          />
        </Cartao>
      </GrelhaPainel>
    </>
  );
}
