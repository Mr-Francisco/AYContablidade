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
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { Balanco, ContasCorrentes } from "@/types";

/**
 * Painel Financeiro — o `dash.financeiro` do Piloto.
 *
 * A mesma estrutura, pela mesma ordem: faixa com a receber, a pagar e
 * disponibilidades; quatro KPIs; os maiores clientes ao lado do anel
 * receber-versus-pagar; e em baixo os maiores fornecedores ao lado do resumo.
 *
 * O Piloto não tem selector de exercício aqui: usa o activo. Mantém-se assim.
 */
export default function PainelFinanceiro() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string) => formataMoeda(v, moeda, 0);
  const sufixo = activo?.id ? `&exercicio_id=${activo.id}` : "";

  const { data: clientes, isLoading } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=31&natureza=D${sufixo}`,
    buscador,
  );
  const { data: fornecedores } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=32&natureza=C${sufixo}`,
    buscador,
  );
  const { data: balanco } = useSWR<Balanco>(
    `/api/relatorios/balanco${activo?.id ? `?exercicio_id=${activo.id}` : ""}`,
    buscador,
  );

  const aReceber = clientes?.totais.saldo ?? "0";
  const aPagar = fornecedores?.totais.saldo ?? "0";
  // A posição líquida não é tesouraria: é o que sobra se tudo o que está em
  // dívida for recebido e pago. Diz o sentido, não o dinheiro disponível.
  const posicao = big(aReceber).minus(aPagar);
  const disponibilidades =
    balanco?.activo.find((l) => l.designacao === "Disponibilidades")?.valor ??
    "0";

  const maiores = (
    dados: ContasCorrentes | undefined,
    cor: string,
  ): { rotulo: string; valor: string; cor: string }[] =>
    (dados?.linhas ?? [])
      .filter((l) => big(l.saldo).gt("0.005"))
      .sort((a, b) => big(b.saldo).cmp(big(a.saldo)))
      .slice(0, 6)
      .map((l) => ({ rotulo: l.entidade || l.codigo, valor: l.saldo, cor }));

  const topClientes = maiores(clientes, "var(--grafico-2)");
  const topFornecedores = maiores(fornecedores, "var(--grafico-5)");

  if (isLoading) return <ACarregar />;

  return (
    <>
      <FaixaPainel
        sobrenome="Tesouraria · Contas Correntes"
        titulo="Painel Financeiro"
        subtitulo="Posição de clientes, fornecedores e disponibilidades."
        valores={[
          { rotulo: "A Receber", valor: kz(aReceber) },
          { rotulo: "A Pagar", valor: kz(aPagar) },
          { rotulo: "Disponibilidades", valor: kz(disponibilidades) },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="A Receber (Clientes)"
          valor={kz(aReceber)}
          detalhe={`${plural(clientes?.com_saldo ?? 0, "conta")} c/ saldo`}
          cor="var(--color-sucesso)"
        />
        <Kpi
          rotulo="A Pagar (Fornecedores)"
          valor={kz(aPagar)}
          detalhe={`${plural(fornecedores?.com_saldo ?? 0, "conta")} c/ saldo`}
          cor="var(--color-rosa)"
        />
        <Kpi
          rotulo="Posição Líquida"
          valor={kz(posicao.toString())}
          detalhe="Receber − Pagar"
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Disponibilidades"
          valor={kz(disponibilidades)}
          detalhe="Bancos e Caixa"
          cor="var(--color-azul)"
        />
      </GrelhaKpis>

      <GrelhaPainel larga>
        <Cartao>
          <TituloCartao>Clientes a Receber</TituloCartao>
          {topClientes.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem saldos a receber.
            </p>
          ) : (
            <Barras itens={topClientes} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Receber vs Pagar</TituloCartao>
          <Donut
            segmentos={[
              {
                nome: "A Receber",
                valor: aReceber,
                cor: "var(--grafico-6)",
              },
              { nome: "A Pagar", valor: aPagar, cor: "var(--grafico-1)" },
            ]}
            centro={formataMoeda(posicao.toString(), "", 0).trim()}
            centroSub="Posição"
            formatar={kz}
          />
        </Cartao>
      </GrelhaPainel>

      <GrelhaPainel>
        <Cartao>
          <TituloCartao>Fornecedores a Pagar</TituloCartao>
          {topFornecedores.length === 0 ? (
            <p className="py-10 text-center text-sm text-texto-suave">
              Sem saldos a pagar.
            </p>
          ) : (
            <Barras itens={topFornecedores} formatar={kz} />
          )}
        </Cartao>

        <Cartao>
          <TituloCartao>Contas Correntes</TituloCartao>
          <ListaPainel
            linhas={[
              {
                titulo: "Clientes",
                sub: `${plural(clientes?.com_saldo ?? 0, "conta")} com saldo`,
                valor: kz(aReceber),
              },
              {
                titulo: "Fornecedores",
                sub: `${plural(fornecedores?.com_saldo ?? 0, "conta")} com saldo`,
                valor: kz(aPagar),
              },
            ]}
          />
        </Cartao>
      </GrelhaPainel>
    </>
  );
}
