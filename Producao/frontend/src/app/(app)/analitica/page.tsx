"use client";

import useSWR from "swr";

import {
  Barras,
  CORES,
  Donut,
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
import { plural } from "@/lib/texto";
import type { CentroCusto, MapaAnalitico } from "@/types";

/**
 * Painel de Centros de Custo — o `dash.analitica` do Piloto.
 *
 * Faixa com o custo líquido, os centros activos e a percentagem por
 * classificar; quatro KPIs; os maiores centros ao lado do anel da distribuição;
 * e em baixo o mapa de custos por centro.
 *
 * O «—» é a linha do que ficou SEM CENTRO. Não é um centro: é o que ninguém
 * imputou, e é por isso que aparece como aviso e não como mais uma fatia.
 */
export default function PainelAnalitica() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string) => formataMoeda(v, moeda, 0);
  const q = activo?.id ? `?exercicio_id=${activo.id}` : "";

  const { data: mapa, isLoading } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${q}`,
    buscador,
  );
  const { data: centros } = useSWR<CentroCusto[]>(
    "/api/contabilidade/centros",
    buscador,
  );

  const t = mapa?.totais;
  const classificado = (mapa?.linhas ?? []).filter((l) => l.codigo !== "—");
  const semCentro = (mapa?.linhas ?? []).find((l) => l.codigo === "—");
  const activos = (centros ?? []).filter((c) => c.estado === "activo");

  const comCusto = classificado
    .filter((l) => big(l.saldo).gt(0))
    .sort((a, b) => big(b.saldo).cmp(big(a.saldo)));

  const topCusto = comCusto.slice(0, 6).map((l) => ({
    rotulo: l.nome,
    valor: l.saldo,
    cor: "var(--grafico-1)",
  }));

  const pctSemCentro =
    t && !big(t.debito).eq(0)
      ? Math.round(
          Number(
            big(semCentro?.debito ?? "0")
              .div(t.debito)
              .toString(),
          ) * 100,
        )
      : 0;

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Contabilidade Analítica"
        titulo="Painel de Centros de Custo"
        subtitulo="Custos e proveitos (classes 6/7) imputados por centro de responsabilidade."
        valores={[
          { rotulo: "Custo Líquido Total", valor: kz(t?.saldo ?? "0") },
          { rotulo: "Centros Activos", valor: String(activos.length) },
          { rotulo: "Sem Centro", valor: `${pctSemCentro}%` },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Custo Líquido Total"
          valor={kz(t?.saldo ?? "0")}
          detalhe={`débito ${kz(t?.debito ?? "0")} − crédito ${kz(t?.credito ?? "0")}`}
          cor="var(--color-rosa)"
        />
        <Kpi
          rotulo="Centros de Custo"
          valor={String(activos.length)}
          detalhe="activos"
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Maior Centro"
          valor={topCusto.length ? topCusto[0].rotulo : "—"}
          detalhe={topCusto.length ? kz(topCusto[0].valor) : ""}
          cor="var(--color-indigo)"
        />
        {/* Acima de 10% por classificar o KPI muda de cor: é o sinal de que a
            analítica está a contar uma história incompleta. */}
        <Kpi
          rotulo="Não Classificado"
          valor={kz(semCentro?.saldo ?? "0")}
          detalhe={`${pctSemCentro}% do débito total`}
          cor={pctSemCentro > 10 ? "var(--grafico-1)" : "var(--color-sucesso)"}
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Maiores Centros de Custo</TituloCartao>
          {topCusto.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem custos imputados.
            </p>
          ) : (
            <Barras itens={topCusto} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Distribuição por Centro</TituloCartao>
          <Donut
            segmentos={comCusto.map((l, k) => ({
              nome: l.nome,
              valor: l.saldo,
              cor: CORES[k % CORES.length],
            }))}
            centro={formataMoeda(t?.saldo ?? "0", "", 0).trim()}
            centroSub="Custo líquido"
            formatar={kz}
          />
        </Cartao>
      </GrelhaPainel>

      <Cartao>
        <TituloCartao extra="Mapa de Custos">Custo por Centro</TituloCartao>
        <ListaPainel
          vazio="Sem lançamentos classificados por centro."
          linhas={classificado.map((l) => ({
            titulo: l.nome,
            sub: plural(l.n, "linha"),
            valor: kz(l.saldo),
          }))}
        />
      </Cartao>
    </>
  );
}
