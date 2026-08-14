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
import { plural } from "@/lib/texto";
import type { Comissao, ResumoComercial, Terceiro, Venda } from "@/types";

/**
 * Painel Comercial — o `dash.comercial` do Piloto.
 *
 * Faixa com facturado, por facturar e clientes; quatro KPIs; os seis maiores
 * clientes ao lado do anel produtos-versus-serviços; e em baixo as comissões
 * por vendedor ao lado das vendas recentes.
 */
export default function PainelComercial() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string) => formataMoeda(v, moeda, 0);

  const { data: resumo, isLoading } = useSWR<ResumoComercial>(
    "/api/comercial/resumo",
    buscador,
  );
  const { data: vendas } = useSWR<Venda[]>("/api/comercial/vendas", buscador);
  const { data: clientes } = useSWR<Terceiro[]>(
    "/api/comercial/clientes",
    buscador,
  );
  const { data: comissoes } = useSWR<Comissao[]>(
    "/api/comercial/comissoes?so_faturadas=true",
    buscador,
  );

  // Facturação por cliente e por tipo, das próprias vendas — o Piloto faz o
  // mesmo, e evita duas rotas novas só para o painel.
  const porCliente = new Map<string, ReturnType<typeof big>>();
  let produtos = big("0");
  let servicos = big("0");
  for (const v of vendas ?? []) {
    const nome = v.cliente_nome || "—";
    porCliente.set(nome, (porCliente.get(nome) ?? big("0")).plus(v.total));
    if (v.tipo === "servicos") servicos = servicos.plus(v.total);
    else produtos = produtos.plus(v.total);
  }

  const topClientes = [...porCliente.entries()]
    .map(([nome, valor]) => ({ rotulo: nome, valor: valor.toString() }))
    .sort((a, b) => big(b.valor).cmp(big(a.valor)))
    .slice(0, 6);

  const barrasComissoes = (comissoes ?? []).map((c) => ({
    rotulo: c.vendedor,
    valor: c.comissao,
    cor: "var(--grafico-5)",
  }));

  const recentes = (vendas ?? [])
    .slice()
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .slice(0, 6);

  const activos = (clientes ?? []).filter(
    (c) => c.estado !== "inactivo",
  ).length;

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Comercial · Vendas"
        titulo="Painel Comercial"
        subtitulo="Faturação, carteira de clientes e desempenho de vendas."
        valores={[
          {
            rotulo: "Total Faturado",
            valor: kz(resumo?.total_faturado ?? "0"),
          },
          { rotulo: "Por Faturar", valor: kz(resumo?.por_faturar ?? "0") },
          { rotulo: "Clientes", valor: String(clientes?.length ?? 0) },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Total Faturado"
          valor={kz(resumo?.total_faturado ?? "0")}
          detalhe={plural(resumo?.n_faturadas ?? 0, "fatura")}
          cor="var(--color-sucesso)"
        />
        <Kpi
          rotulo="Por Faturar"
          valor={kz(resumo?.por_faturar ?? "0")}
          detalhe={plural(
            (resumo?.n_vendas ?? 0) - (resumo?.n_faturadas ?? 0),
            "rascunho",
          )}
          cor="var(--color-rosa)"
        />
        <Kpi
          rotulo="Total de Vendas"
          valor={kz(resumo?.total_vendas ?? "0")}
          detalhe={plural(resumo?.n_vendas ?? 0, "documento")}
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Clientes Activos"
          valor={String(activos)}
          detalhe={`de ${clientes?.length ?? 0} registados`}
          cor="var(--color-azul)"
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Top Clientes por Faturação</TituloCartao>
          {topClientes.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem vendas.
            </p>
          ) : (
            <Barras itens={topClientes} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Vendas por Tipo</TituloCartao>
          <Donut
            segmentos={[
              {
                nome: "Produtos",
                valor: produtos.toString(),
                cor: "var(--grafico-2)",
              },
              {
                nome: "Serviços",
                valor: servicos.toString(),
                cor: "var(--grafico-3)",
              },
            ]}
            centro={formataMoeda(resumo?.total_vendas ?? "0", "", 0).trim()}
            centroSub="Vendas"
            formatar={kz}
          />
        </Cartao>
      </GrelhaPainel>

      <GrelhaPainel>
        <Cartao>
          <TituloCartao>Comissões por Vendedor</TituloCartao>
          {barrasComissoes.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem comissões apuradas.
            </p>
          ) : (
            <Barras itens={barrasComissoes} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Vendas Recentes</TituloCartao>
          <ListaPainel
            vazio="Sem vendas registadas."
            linhas={recentes.map((v) => ({
              titulo: `${v.numero ?? "—"} · ${v.cliente_nome || "—"}`,
              // O serviço trata «emitida» e «faturada» como o mesmo estado —
              // ver `_emitida` em `services/comercial.py`. Ler só «faturada»
              // punha três facturas emitidas a dizer «Rascunho».
              sub: `${dataCurta(v.data)} · ${v.estado === "faturada" || v.estado === "emitida" ? "Faturada" : "Rascunho"}`,
              valor: kz(v.total),
            }))}
          />
        </Cartao>
      </GrelhaPainel>
    </>
  );
}
