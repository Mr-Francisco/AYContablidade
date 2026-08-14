"use client";

import Link from "next/link";
import useSWR from "swr";

import {
  Barras,
  dataCurta,
  FaixaPainel,
  GrelhaKpis,
  ListaPainel,
} from "@/components/painel";
import {
  ACarregar,
  Alerta,
  Cartao,
  Kpi,
  Selo,
  TituloCartao,
} from "@/components/ui";
import type { Pagina } from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type {
  Balanco,
  Colaborador,
  ContasCorrentes,
  Folha,
  MapaImob,
  Resumo,
  ResumoComercial,
} from "@/types";

/**
 * Progresso Equipa — o ecrã do administrador da empresa.
 *
 * Junta num só sítio o que cada bloco tem para dizer, para que quem responde
 * pela empresa não tenha de entrar em sete módulos para saber em que pé estão.
 *
 * DUAS DECISÕES QUE MOLDAM O ECRÃ:
 *
 * «Progresso» é o ESTADO DAS ÁREAS, não a produtividade de quem lá trabalha.
 * Um painel que ordenasse pessoas por número de lançamentos mediria quem
 * escreve mais, não quem faz melhor — e o trabalho de contabilidade não se
 * conta assim. O que aparece por pessoa é o registo de quem mexeu em quê, que
 * é uma pergunta de auditoria e não de desempenho.
 *
 * TRÊS A QUATRO NÚMEROS POR BLOCO, e não todos os que existem. Um painel com
 * quarenta números não se lê, e o pedido foi «de forma resumida». Cada bloco
 * leva ao módulo, que é onde estão os outros.
 *
 * Os blocos que a empresa não tem não aparecem — um bloco de RH a mostrar
 * zeros numa empresa sem RH não é informação, é ruído.
 */
export default function ProgressoEquipa() {
  const { empresa, moduloAtivo } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";
  const kz = (v: string | undefined) => formataMoeda(v ?? "0", moeda, 0);
  const q = activo?.id ? `?exercicio_id=${activo.id}` : "";
  const q2 = activo?.id ? `&exercicio_id=${activo.id}` : "";

  const { data: resumo, isLoading } = useSWR<Resumo>(
    `/api/relatorios/resumo${q}`,
    buscador,
  );
  const { data: balanco } = useSWR<Balanco>(
    `/api/relatorios/balanco${q}`,
    buscador,
  );
  const { data: clientes } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=31&natureza=D${q2}`,
    buscador,
  );
  const { data: fornecedores } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=32&natureza=C${q2}`,
    buscador,
  );
  const { data: comercial, error: erro_comercial } = useSWR<ResumoComercial>(
    moduloAtivo("comercial") ? "/api/comercial/resumo" : null,
    buscador,
  );
  const { data: existencias, error: erro_existencias } = useSWR<{
    valor_total: string;
    em_rutura: number;
    linhas: unknown[];
  }>(moduloAtivo("logistica") ? "/api/logistica/existencias" : null, buscador);
  const { data: imob, error: erro_imob } = useSWR<MapaImob>(
    moduloAtivo("imobilizados") ? "/api/imobilizados/mapa" : null,
    buscador,
  );
  const { data: folha, error: erro_folha } = useSWR<Folha>(
    moduloAtivo("rh") ? "/api/rh/folha?so_ativos=true" : null,
    buscador,
  );
  const { data: colaboradores, error: erro_colaboradores } = useSWR<
    Colaborador[]
  >(moduloAtivo("rh") ? "/api/rh/colaboradores" : null, buscador);
  // O registo de auditoria é do administrador. Sem acesso, o pedido devolve
  // 403 e é preciso dizê-lo — senão o cartão fica a rodar para sempre, que foi
  // exactamente o defeito que este ecrã tinha nas Configurações.
  const { data: auditoria, error: erroAuditoria } = useSWR<
    Pagina<RegistoAuditoria>
  >("/api/empresa/auditoria?limite=10", buscador, {
    shouldRetryOnError: false,
  });

  if (isLoading) return <ACarregar />;

  const activos = (colaboradores ?? []).filter((c) => c.estado === "activo");
  const lucro = big(resumo?.resultado ?? "0").gte(0);
  const posicao = big(clientes?.totais.saldo ?? "0").minus(
    fornecedores?.totais.saldo ?? "0",
  );

  // O que está por fazer. É a única coluna do ecrã que pede acção — o resto
  // são números que já aconteceram.
  const pendencias: { texto: string; onde: string }[] = [];
  if (balanco && !balanco.equilibrado)
    pendencias.push({
      texto:
        "O balanço não equilibra — activo diferente de capital próprio mais passivo",
      onde: "/contabilidade/balanco",
    });
  if (activo && !activo.apuramento)
    pendencias.push({
      texto: `Resultados de ${activo.nome} por apurar`,
      onde: "/contabilidade/resultados",
    });
  if (comercial && (comercial.n_vendas ?? 0) > (comercial.n_faturadas ?? 0))
    pendencias.push({
      texto: plural(
        comercial.n_vendas - comercial.n_faturadas,
        "documento por emitir",
        "documentos por emitir",
      ),
      onde: "/comercial/vendas",
    });
  if (existencias && existencias.em_rutura > 0)
    pendencias.push({
      texto: plural(
        existencias.em_rutura,
        "artigo em rutura",
        "artigos em rutura",
      ),
      onde: "/logistica/existencias",
    });

  return (
    <>
      <FaixaPainel
        sobrenome="Gestão · Empresa"
        titulo="Progresso Equipa"
        subtitulo="O estado de cada área da empresa num só ecrã, e quem lhe mexeu."
        valores={[
          { rotulo: "Exercício", valor: activo?.nome ?? "—" },
          {
            rotulo: "Resultado",
            valor: `${lucro ? "" : "−"}${kz(
              big(resumo?.resultado ?? "0")
                .abs()
                .toString(),
            )}`,
          },
          {
            rotulo: "Pessoas activas",
            valor: erro_colaboradores ? "—" : String(activos.length),
          },
        ]}
      />

      <GrelhaKpis>
        <Kpi
          rotulo="Total do Activo"
          valor={kz(balanco?.total_activo)}
          detalhe={
            balanco?.equilibrado
              ? "Balanço equilibrado"
              : "Balanço por verificar"
          }
          cor="var(--color-indigo)"
        />
        <Kpi
          rotulo="Resultado do Exercício"
          valor={`${lucro ? "" : "−"}${kz(
            big(resumo?.resultado ?? "0")
              .abs()
              .toString(),
          )}`}
          detalhe={lucro ? "Lucro" : "Prejuízo"}
          cor={lucro ? "var(--color-sucesso)" : "var(--color-rosa)"}
        />
        <Kpi
          rotulo="Posição Líquida"
          valor={kz(posicao.toString())}
          detalhe="A receber − a pagar"
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Por resolver"
          valor={String(pendencias.length)}
          detalhe={pendencias.length === 0 ? "Nada em aberto" : "Ver a lista"}
          cor={
            pendencias.length > 0
              ? "var(--color-aviso)"
              : "var(--color-sucesso)"
          }
        />
      </GrelhaKpis>

      {pendencias.length > 0 && (
        <Cartao className="mb-3.5">
          <TituloCartao extra={plural(pendencias.length, "item", "itens")}>
            Por resolver
          </TituloCartao>
          <div className="flex flex-col divide-y divide-borda">
            {pendencias.map((p) => (
              <Link
                key={p.onde}
                href={p.onde}
                className="flex items-center justify-between gap-3 py-2.5 text-[13.5px] first:pt-0 last:pb-0 hover:text-marca"
              >
                <span>{p.texto}</span>
                <Selo cor="#c98a10">Resolver</Selo>
              </Link>
            ))}
          </div>
        </Cartao>
      )}

      <div className="mb-3.5 grid items-start gap-3.5 min-[900px]:grid-cols-2">
        <Bloco
          titulo="Contabilidade"
          href="/contabilidade"
          linhas={[
            { rotulo: "Lançamentos", valor: String(resumo?.lancamentos ?? 0) },
            { rotulo: "Movimentado", valor: kz(resumo?.movimentado) },
            { rotulo: "Proveitos", valor: kz(resumo?.proveitos) },
            { rotulo: "Custos", valor: kz(resumo?.custos) },
          ]}
        />

        <Bloco
          titulo="Contas Correntes"
          href="/contas-correntes"
          linhas={[
            { rotulo: "A receber", valor: kz(clientes?.totais.saldo) },
            {
              rotulo: "Clientes com saldo",
              valor: String(clientes?.com_saldo ?? 0),
            },
            { rotulo: "A pagar", valor: kz(fornecedores?.totais.saldo) },
            {
              rotulo: "Fornecedores com saldo",
              valor: String(fornecedores?.com_saldo ?? 0),
            },
          ]}
        />

        {moduloAtivo("comercial") && (
          <Bloco
            semAcesso={!!erro_comercial}
            titulo="Comercial"
            href="/comercial"
            linhas={[
              { rotulo: "Facturado", valor: kz(comercial?.total_faturado) },
              { rotulo: "Por emitir", valor: kz(comercial?.por_faturar) },
              {
                rotulo: "Documentos",
                valor: String(comercial?.n_vendas ?? 0),
              },
            ]}
          />
        )}

        {moduloAtivo("logistica") && (
          <Bloco
            semAcesso={!!erro_existencias}
            titulo="Logística"
            href="/logistica/existencias"
            linhas={[
              { rotulo: "Valor de stock", valor: kz(existencias?.valor_total) },
              {
                rotulo: "Artigos com existência",
                valor: String(existencias?.linhas.length ?? 0),
              },
              {
                rotulo: "Em rutura",
                valor: String(existencias?.em_rutura ?? 0),
                aviso: (existencias?.em_rutura ?? 0) > 0,
              },
            ]}
          />
        )}

        {moduloAtivo("imobilizados") && (
          <Bloco
            semAcesso={!!erro_imob}
            titulo="Imobilizados"
            href="/imobilizados"
            linhas={[
              { rotulo: "Valor bruto", valor: kz(imob?.totais.valor_bruto) },
              {
                rotulo: "Amortizado",
                valor: kz(imob?.totais.amort_acumulada),
              },
              {
                rotulo: "Valor líquido",
                valor: kz(imob?.totais.valor_liquido),
              },
              { rotulo: "Activos", valor: String(imob?.linhas.length ?? 0) },
            ]}
          />
        )}

        {moduloAtivo("rh") && (
          <Bloco
            semAcesso={!!erro_folha}
            titulo="Recursos Humanos"
            href="/rh"
            linhas={[
              {
                rotulo: "Colaboradores activos",
                valor: String(activos.length),
              },
              { rotulo: "Massa salarial", valor: kz(folha?.totais.bruto) },
              { rotulo: "Líquido a pagar", valor: kz(folha?.totais.liquido) },
              {
                rotulo: "Custo com INSS empresa",
                valor: kz(
                  big(folha?.totais.bruto ?? "0")
                    .plus(folha?.totais.inss_empresa ?? "0")
                    .toString(),
                ),
              },
            ]}
          />
        )}
      </div>

      <div className="grid items-start gap-3.5 min-[900px]:grid-cols-2">
        <Cartao>
          <TituloCartao extra="Proveitos − Custos">
            Resultado do Exercício
          </TituloCartao>
          <Barras
            formatar={(v) => kz(v)}
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
                valor: big(resumo?.resultado ?? "0")
                  .abs()
                  .toString(),
                texto: `${lucro ? "" : "−"}${kz(
                  big(resumo?.resultado ?? "0")
                    .abs()
                    .toString(),
                )}`,
                cor: "var(--grafico-2)",
              },
            ]}
          />
        </Cartao>

        <Cartao>
          <TituloCartao
            extra={
              <Link
                href="/gestao/auditoria"
                className="font-semibold text-marca hover:underline"
              >
                Ver o registo todo
              </Link>
            }
          >
            Actividade da equipa
          </TituloCartao>
          {erroAuditoria ? (
            <Alerta tipo="info">
              O registo de quem mexeu em quê é do administrador da empresa. A
              sua conta vê os números das áreas, mas não este registo.
            </Alerta>
          ) : auditoria === undefined ? (
            <ACarregar />
          ) : auditoria.linhas.length === 0 ? (
            <Alerta tipo="info">
              Ainda não há registo de acções nesta empresa. O registo guarda
              alterações de configuração, contas e utilizadores — não os
              lançamentos do dia-a-dia, que ficam na Contabilidade.
            </Alerta>
          ) : (
            <ListaPainel
              linhas={auditoria.linhas.map((r) => ({
                id: r.id,
                titulo: `${r.actor_nome ?? "—"} · ${legivel(r.accao)}`,
                sub: `${dataCurta(r.criado_em?.slice(0, 10))} · ${r.alvo_desc ?? ""}`,
              }))}
            />
          )}
        </Cartao>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
interface RegistoAuditoria {
  id: string;
  criado_em: string;
  accao: string;
  actor_nome: string | null;
  alvo_desc: string | null;
}

function Bloco({
  titulo,
  href,
  linhas,
  semAcesso,
}: {
  titulo: string;
  href: string;
  linhas: { rotulo: string; valor: string; aviso?: boolean }[];
  /** O pedido falhou por falta de acesso — mostrar zeros seria mentir. */
  semAcesso?: boolean;
}) {
  return (
    <Cartao>
      <TituloCartao
        extra={
          <Link
            href={href}
            className="font-semibold text-marca hover:underline"
          >
            Abrir
          </Link>
        }
      >
        {titulo}
      </TituloCartao>
      {semAcesso ? (
        <p className="py-2 text-[13px] text-texto-suave">
          A sua conta não tem acesso a este módulo. Os números existem — só não
          são visíveis daqui.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-borda">
          {linhas.map((l) => (
            <div
              key={l.rotulo}
              className="flex items-baseline justify-between gap-3 py-[7px] text-[13px] first:pt-0 last:pb-0"
            >
              <span className="text-texto-suave">{l.rotulo}</span>
              <b className={`tabular ${l.aviso ? "text-aviso" : ""}`}>
                {l.valor}
              </b>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}

/** `empresa.actualizar` → `empresa · actualizar`. */
function legivel(accao: string): string {
  return accao.replaceAll(".", " · ");
}
