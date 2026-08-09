"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Kpi,
  Selector,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { compara, formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { ContasCorrentes as Dados } from "@/types";

export interface ConfigContaCorrente {
  /** "31" para clientes, "32" para fornecedores. */
  prefixo: string;
  /** "D" — o saldo devedor é a favor da empresa (a receber).
   *  "C" — o saldo credor é dívida da empresa (a pagar). */
  natureza: "D" | "C";
  titulo: string;
  descricao: string;
  /** Como se lê um saldo positivo nesta vista. */
  rotuloSaldo: string;
  /** Onde o saldo positivo é bom e onde é mau, para a cor do KPI. */
  corSaldo: string;
}

/**
 * Contas correntes de terceiros — clientes ou fornecedores.
 *
 * As duas páginas são a mesma tabela lida de dois lados: nos clientes o saldo
 * é `débito − crédito` (o que ainda nos devem), nos fornecedores é
 * `crédito − débito` (o que ainda devemos). É o backend que faz essa inversão
 * conforme a `natureza`, para que ambas as páginas mostrem sempre um saldo
 * positivo quando há dívida — obrigar o utilizador a interpretar sinais
 * diferentes em cada página é uma fonte de erro que não vale a pena.
 */
export function PaginaContasCorrentes({
  config,
}: {
  config: ConfigContaCorrente;
}) {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();

  const [exercicioId, setExercicioId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [procura, setProcura] = useState("");
  const [soComSaldo, setSoComSaldo] = useState("nao");

  const exId = exercicioId || activo?.id || "";

  const params = new URLSearchParams({
    prefixo: config.prefixo,
    natureza: config.natureza,
  });
  if (exId) params.set("exercicio_id", exId);
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);

  const { data, isLoading } = useSWR<Dados>(
    `/api/contabilidade/contas-correntes?${params}`,
    buscador,
  );

  const linhas = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data?.linhas ?? [])
      .filter((l) => {
        // Meio cêntimo de tolerância, o mesmo critério do backend: uma conta
        // saldada que ficou com resíduo de arredondamento não é "com saldo".
        if (soComSaldo === "sim" && Math.abs(Number(l.saldo)) <= 0.005) {
          return false;
        }
        if (!t) return true;
        return (
          l.codigo.toLowerCase().includes(t) ||
          l.nome.toLowerCase().includes(t) ||
          l.entidade.toLowerCase().includes(t)
        );
      })
      .sort((a, b) => compara(b.saldo, a.saldo));
  }, [data, procura, soComSaldo]);

  return (
    <>
      <CabecalhoPagina
        titulo={config.titulo}
        descricao={config.descricao}
        accoes={<AccoesDoMapa />}
      />

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo={config.rotuloSaldo}
              valor={formataCompacto(data.totais.saldo, moeda)}
              detalhe={`${plural(data.com_saldo, "conta")} com saldo`}
              cor={config.corSaldo}
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Total a débito"
              valor={formataCompacto(data.totais.debito, moeda)}
              detalhe={
                config.natureza === "D"
                  ? "Facturado ao cliente"
                  : "Pago ao fornecedor"
              }
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Total a crédito"
              valor={formataCompacto(data.totais.credito, moeda)}
              detalhe={
                config.natureza === "D"
                  ? "Recebido do cliente"
                  : "Facturado pelo fornecedor"
              }
              cor="var(--grafico-2)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Contas"
              valor={String(data.linhas.length)}
              detalhe={`${linhas.length} a mostrar`}
              cor="var(--grafico-4)"
            />
          </div>
        </div>
      )}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos os exercícios" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="13rem"
        />
        <Campo rotulo="De">
          <Entrada
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Até">
          <Entrada
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Pesquisar" className="min-w-[220px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Conta, nome ou entidade…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Saldo"
          valor={soComSaldo}
          aoMudar={setSoComSaldo}
          opcoes={[
            { valor: "nao", rotulo: "Todas" },
            { valor: "sim", rotulo: "Só com saldo" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !linhas.length ? (
          <Vazio>
            {procura.trim() || soComSaldo === "sim"
              ? "Nenhuma conta corresponde aos filtros."
              : "Ainda não há movimentos nestas contas."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Conta</Th>
                  <Th>Designação</Th>
                  <Th>Entidade</Th>
                  <Th numerico>Movimentos</Th>
                  <Th numerico>Débito</Th>
                  <Th numerico>Crédito</Th>
                  <Th numerico>{config.rotuloSaldo}</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <Tr key={l.codigo}>
                    <Td className="tabular font-bold">
                      <a
                        href={`/contabilidade/extrato?conta=${l.codigo}`}
                        className="text-marca hover:underline"
                      >
                        {l.codigo}
                      </a>
                    </Td>
                    <Td className="max-w-[260px] truncate font-semibold">
                      {l.nome}
                    </Td>
                    <Td className="max-w-[200px] truncate text-texto-suave">
                      {l.entidade || "—"}
                    </Td>
                    <Td numerico className="text-texto-suave">
                      {l.mov}
                    </Td>
                    <Td numerico>{formataMoeda(l.debito, moeda)}</Td>
                    <Td numerico>{formataMoeda(l.credito, moeda)}</Td>
                    <Td
                      numerico
                      className={`font-bold ${Number(l.saldo) < 0 ? "text-perigo" : ""}`}
                    >
                      {formataMoeda(l.saldo, moeda)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-borda font-bold">
                  <Td colSpan={4}>Totais</Td>
                  <Td numerico>
                    {formataMoeda(data?.totais.debito ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data?.totais.credito ?? "0", moeda)}
                  </Td>
                  <Td numerico>
                    {formataMoeda(data?.totais.saldo ?? "0", moeda)}
                  </Td>
                </tr>
              </tfoot>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      <Alerta tipo="info" className="mt-4">
        Um saldo negativo nesta vista significa o contrário do habitual —{" "}
        {config.natureza === "D"
          ? "o cliente pagou mais do que lhe foi facturado, ou há uma nota de crédito por regularizar"
          : "pagou-se ao fornecedor mais do que ele facturou, ou falta lançar uma factura"}
        . Vale a pena olhar antes de fechar o período.
      </Alerta>
    </>
  );
}
