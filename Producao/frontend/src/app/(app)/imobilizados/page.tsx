"use client";

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
import type { MapaImob } from "@/types";

/**
 * Painel de Imobilizados — o `dash.imobilizados` do Piloto.
 *
 * Faixa com bruto, amortizado e líquido; quatro KPIs; os seis activos de maior
 * valor líquido ao lado do anel bruto-versus-amortizado; e em baixo a lista
 * completa dos activos.
 */
export default function PainelImobilizados() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string) => formataMoeda(v, moeda, 0);

  const { data: mapa, isLoading } = useSWR<MapaImob>(
    "/api/imobilizados/mapa",
    buscador,
  );

  const t = mapa?.totais;
  const bruto = t?.valor_bruto ?? "0";
  const acumulada = t?.amort_acumulada ?? "0";
  const liquido = t?.valor_liquido ?? "0";
  const pctAmortizado = big(bruto).eq(0)
    ? 0
    : Math.round(Number(big(acumulada).div(bruto).toString()) * 100);

  const topLiquido = (mapa?.linhas ?? [])
    .slice()
    .sort((a, b) => big(b.valor_liquido).cmp(big(a.valor_liquido)))
    .slice(0, 6)
    .map((l) => ({
      rotulo: l.designacao,
      valor: l.valor_liquido,
      cor: "var(--grafico-2)",
    }));

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Imobilizado · Ativos"
        titulo="Painel de Imobilizados"
        subtitulo="Valor patrimonial, amortizações e valor líquido dos ativos."
        valores={[
          { rotulo: "Valor Bruto", valor: kz(bruto) },
          { rotulo: "Amort. Acumulada", valor: kz(acumulada) },
          { rotulo: "Valor Líquido", valor: kz(liquido) },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Nº de Ativos"
          valor={String(mapa?.linhas.length ?? 0)}
          detalhe="em ficha"
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Valor Bruto"
          valor={kz(bruto)}
          detalhe="custo de aquisição"
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Amort. Acumulada"
          valor={kz(acumulada)}
          detalhe={`${pctAmortizado}% amortizado`}
          cor="var(--color-rosa)"
        />
        <Kpi
          rotulo="Valor Líquido"
          valor={kz(liquido)}
          detalhe="valor contabilístico"
          cor="var(--color-sucesso)"
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Valor Líquido por Ativo</TituloCartao>
          {topLiquido.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem ativos.
            </p>
          ) : (
            <Barras itens={topLiquido} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Bruto vs Amortizado</TituloCartao>
          <Donut
            segmentos={[
              {
                nome: "Valor Líquido",
                valor: liquido,
                cor: "var(--grafico-6)",
              },
              {
                nome: "Amort. Acumulada",
                valor: acumulada,
                cor: "var(--grafico-1)",
              },
            ]}
            centro={formataMoeda(bruto, "", 0).trim()}
            centroSub="Bruto"
            formatar={kz}
          />
        </Cartao>
      </GrelhaPainel>

      <Cartao>
        <TituloCartao>Ativos</TituloCartao>
        <ListaPainel
          vazio="Sem ativos registados."
          linhas={(mapa?.linhas ?? []).map((l) => ({
            titulo: l.designacao,
            sub: `Taxa ${semZeros(l.taxa)}% · ${dataCurta(l.data_aquisicao)}`,
            valor: kz(l.valor_liquido),
          }))}
        />
      </Cartao>
    </>
  );
}

/** `25.00` → `25`: a taxa é uma percentagem, não um valor monetário. */
function semZeros(v: string): string {
  return String(Number(v)).replace(".", ",");
}
