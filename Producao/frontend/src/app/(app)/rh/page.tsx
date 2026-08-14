"use client";

import useSWR from "swr";

import {
  Barras,
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
import { plural } from "@/lib/texto";
import type { Colaborador, Folha } from "@/types";

/**
 * Painel de RH — o `dash.rh` do Piloto.
 *
 * Faixa com colaboradores, massa salarial e custo total; quatro KPIs; a massa
 * salarial por categoria ao lado do anel do custo do pessoal; e em baixo os
 * maiores vencimentos, com a contagem de meses processados e pagos ao canto.
 */
export default function PainelRh() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string) => formataMoeda(v, moeda, 0);

  const { data: folha, isLoading } = useSWR<Folha>(
    "/api/rh/folha?so_ativos=true",
    buscador,
  );
  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );
  const { data: processamentos } = useSWR<unknown[]>(
    "/api/rh/processamentos",
    buscador,
  );
  const { data: pagamentos } = useSWR<unknown[]>(
    "/api/rh/pagamentos",
    buscador,
  );

  const t = folha?.totais;
  const bruto = t?.bruto ?? "0";
  const liquido = t?.liquido ?? "0";
  const irt = t?.irt ?? "0";
  const inss = t?.inss ?? "0";
  const inssEmpresa = t?.inss_empresa ?? "0";
  const custoTotal = big(bruto).plus(inssEmpresa).toString();
  const retencoes = big(irt).plus(inss).toString();

  const activos = (colaboradores ?? []).filter((c) => c.estado === "activo");

  // Massa salarial por categoria: base mais subsídios, como no Piloto.
  const porCategoria = new Map<string, ReturnType<typeof big>>();
  for (const c of activos) {
    const chave = c.categoria || "(sem categoria)";
    porCategoria.set(
      chave,
      (porCategoria.get(chave) ?? big("0"))
        .plus(c.salario_base ?? "0")
        .plus(c.subsidios ?? "0"),
    );
  }
  const barrasCategoria = [...porCategoria.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor: valor.toString() }))
    .sort((a, b) => big(b.valor).cmp(big(a.valor)));

  const maiores = (folha?.linhas ?? [])
    .slice()
    .sort((a, b) => big(b.bruto).cmp(big(a.bruto)))
    .slice(0, 6);

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Recursos Humanos · Salários"
        titulo="Painel de RH"
        subtitulo="Massa salarial, encargos e processamento do pessoal."
        valores={[
          { rotulo: "Colaboradores", valor: String(activos.length) },
          { rotulo: "Massa Salarial", valor: kz(bruto) },
          { rotulo: "Custo Total Empresa", valor: kz(custoTotal) },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Colaboradores Activos"
          valor={String(activos.length)}
          detalhe={`de ${colaboradores?.length ?? 0} registados`}
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Massa Salarial (bruto)"
          valor={kz(bruto)}
          detalhe={`líquido ${kz(liquido)}`}
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Retenções"
          valor={kz(retencoes)}
          detalhe="IRT + INSS trab."
          cor="var(--color-rosa)"
        />
        <Kpi
          rotulo="Custo p/ Empresa"
          valor={kz(custoTotal)}
          detalhe="c/ INSS empresa"
          cor="var(--color-roxo)"
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Massa Salarial por Categoria</TituloCartao>
          {barrasCategoria.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem colaboradores.
            </p>
          ) : (
            <Barras itens={barrasCategoria} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Custo do Pessoal</TituloCartao>
          <Donut
            segmentos={[
              { nome: "Líquido", valor: liquido, cor: "var(--grafico-6)" },
              { nome: "IRT", valor: irt, cor: "var(--grafico-1)" },
              { nome: "INSS trab.", valor: inss, cor: "var(--grafico-3)" },
              {
                nome: "INSS empresa",
                valor: inssEmpresa,
                cor: "var(--grafico-5)",
              },
            ]}
            centro={formataMoeda(custoTotal, "", 0).trim()}
            centroSub="Custo total"
            formatar={kz}
          />
        </Cartao>
      </GrelhaPainel>

      <Cartao>
        <TituloCartao
          extra={`${plural(processamentos?.length ?? 0, "mês", "meses")} processado(s) · ${pagamentos?.length ?? 0} pago(s)`}
        >
          Maiores Vencimentos
        </TituloCartao>
        <ListaPainel
          vazio="Sem colaboradores."
          linhas={maiores.map((l) => ({
            titulo: l.colaborador,
            // A linha da folha traz o nome mas não a categoria: vai-se buscá-la
            // à ficha, que é onde ela vive.
            sub:
              (colaboradores ?? []).find((c) => c.id === l.colaborador_id)
                ?.categoria || "—",
            valor: kz(l.liquido),
          }))}
        />
      </Cartao>
    </>
  );
}
