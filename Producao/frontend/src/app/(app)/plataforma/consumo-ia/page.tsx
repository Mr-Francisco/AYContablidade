"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSWR from "swr";
import { PrecosIa } from "@/components/plataforma/PrecosIa";
import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import { formataCompacto, paraGrafico, soma } from "@/lib/dinheiro";
import type { ConsumoEmpresa } from "@/types";

export default function ConsumoIa() {
  const { data, isLoading } = useSWR<ConsumoEmpresa[]>(
    "/api/licencas/consumo-ia",
    buscador,
  );

  const linhas = data ?? [];
  const comConsumo = linhas.filter((l) => l.tokens > 0);
  const custoTotal = soma(...linhas.map((l) => l.custo));
  const tokensTotal = linhas.reduce((s, l) => s + l.tokens, 0);
  const excedidas = linhas.filter((l) => l.excedido);
  const perto = linhas.filter(
    (l) => !l.excedido && l.percentagem != null && l.percentagem >= 80,
  );

  const grafico = useMemo(
    () =>
      comConsumo
        .slice(0, 10)
        .map((l) => ({ nome: l.codigo, custo: paraGrafico(l.custo) })),
    [comConsumo],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Consumo de IA"
        descricao="O que cada empresa consumiu este mês, e quanto está a custar à plataforma."
      />

      <PrecosIa />

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Custo estimado no mês"
                valor={`${formataCompacto(custoTotal, "")} USD`}
                detalhe="Todas as empresas"
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Tokens consumidos"
                valor={formataCompacto(String(tokensTotal), "")}
                detalhe="Entrada e saída"
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Empresas activas na IA"
                valor={String(comConsumo.length)}
                detalhe={`de ${linhas.length} no total`}
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="No limite"
                valor={String(excedidas.length)}
                detalhe={`${perto.length} acima de 80%`}
                cor={
                  excedidas.length > 0
                    ? "var(--color-perigo)"
                    : "var(--grafico-6)"
                }
              />
            </div>
          </div>

          {excedidas.length > 0 && (
            <Alerta tipo="erro" className="mb-4">
              <b>
                {excedidas.length === 1
                  ? "1 empresa esgotou"
                  : `${excedidas.length} empresas esgotaram`}
              </b>{" "}
              a quota deste mês e já não consegue usar o assistente:{" "}
              {excedidas.map((e) => e.codigo).join(", ")}. O contador reinicia
              no início do mês; para desbloquear antes disso, aumente o limite
              na licença.
            </Alerta>
          )}

          <Cartao className="mb-4">
            <TituloCartao extra="As dez que mais custam">
              Custo por empresa
            </TituloCartao>
            {!grafico.length ? (
              <Vazio>Nenhuma empresa usou o assistente este mês.</Vazio>
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={grafico}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-texto-suave)"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-texto-suave)"
                      width={60}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-superficie-2)" }}
                      formatter={(v) => [`${v} USD`, "Custo estimado"]}
                      contentStyle={{
                        background: "var(--color-superficie)",
                        border: "1px solid var(--color-borda)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="custo" radius={[5, 5, 0, 0]} maxBarSize={44}>
                      {grafico.map((g) => (
                        <Cell key={g.nome} fill="var(--grafico-4)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Cartao>

          <Cartao className="p-0">
            <TituloCartao className="px-5 pt-5">
              Detalhe por empresa
            </TituloCartao>
            {!linhas.length ? (
              <Vazio>Não há empresas registadas.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Empresa</Th>
                      <Th>Plano</Th>
                      <Th numerico>Consultas</Th>
                      <Th numerico>Tokens</Th>
                      <Th numerico>Limite</Th>
                      <Th numerico>Custo</Th>
                      <Th>Utilização</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <Tr key={l.empresa_id}>
                        <Td className="tabular font-bold">{l.codigo}</Td>
                        <Td className="max-w-[220px] truncate font-semibold">
                          {l.empresa}
                        </Td>
                        <Td className="text-texto-suave">{l.plano ?? "—"}</Td>
                        <Td numerico>{l.consultas || "—"}</Td>
                        <Td numerico>
                          {l.tokens ? l.tokens.toLocaleString("pt-PT") : "—"}
                        </Td>
                        <Td numerico className="text-texto-suave">
                          {l.limite_tokens
                            ? l.limite_tokens.toLocaleString("pt-PT")
                            : "sem limite"}
                        </Td>
                        <Td numerico className="font-semibold">
                          {l.custo} USD
                        </Td>
                        <Td>
                          {l.percentagem == null ? (
                            <span className="text-texto-suave">—</span>
                          ) : (
                            <Utilizacao pc={l.percentagem} />
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}

function Utilizacao({ pc }: { pc: number }) {
  const limitado = Math.min(100, pc);
  const cor =
    pc >= 100
      ? "var(--color-perigo)"
      : pc >= 80
        ? "var(--color-aviso)"
        : "var(--color-marca)";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-borda"
        role="img"
        aria-label={`${pc}% do limite`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${limitado}%`, background: cor }}
        />
      </div>
      <span className="tabular text-xs" style={{ color: cor }}>
        {pc}%
      </span>
      {pc >= 100 && <Selo cor="#c62828">esgotado</Selo>}
    </div>
  );
}
