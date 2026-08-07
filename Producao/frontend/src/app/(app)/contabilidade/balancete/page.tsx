"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda, subtrai } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";
import type { Balancete } from "@/types";

export default function PaginaBalancete() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();

  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [ateMes, setAteMes] = useState("");
  const [excluirApuramento, setExcluirApuramento] = useState(false);
  const [procura, setProcura] = useState("");
  const procuraAdiada = useDeferredValue(procura);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (ateMes) p.set("ate_mes", ateMes);
  if (excluirApuramento) p.set("excluir_apuramento", "true");

  const { data, isLoading } = useSWR<Balancete>(
    `/api/relatorios/balancete?${p}`,
    buscador,
  );

  const linhas = useMemo(() => {
    const termo = procuraAdiada.trim().toLowerCase();
    if (!termo) return data?.linhas ?? [];
    return (data?.linhas ?? []).filter(
      (l) =>
        l.codigo.toLowerCase().includes(termo) ||
        (l.nome ?? "").toLowerCase().includes(termo),
    );
  }, [data, procuraAdiada]);

  const fecha = data
    ? subtrai(data.totais.debito, data.totais.credito).eq(0)
    : true;

  return (
    <>
      <CabecalhoPagina
        titulo="Balancete Geral"
        descricao="Débito, crédito e saldo por conta de movimento."
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Selector
          rotulo="Até ao período"
          valor={ateMes}
          aoMudar={setAteMes}
          opcoes={[
            { valor: "", rotulo: "Todo o exercício" },
            ...periodos.map((x) => ({
              valor: x.codigo,
              rotulo: `${x.codigo} — ${x.nome}`,
            })),
          ]}
          larguraMinima="14rem"
        />
        <Campo rotulo="Pesquisar conta" className="min-w-[220px] flex-1">
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
              placeholder="Código ou designação…"
              className="pl-9"
            />
          </div>
        </Campo>
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-[13px] text-texto-suave">
          <input
            type="checkbox"
            checked={excluirApuramento}
            onChange={(e) => setExcluirApuramento(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-marca)]"
          />
          Excluir apuramento
        </label>
      </BarraFiltros>

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">Não foi possível carregar o balancete.</Alerta>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="Total débito"
                valor={formataCompacto(data.totais.debito, moeda)}
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Total crédito"
                valor={formataCompacto(data.totais.credito, moeda)}
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Saldos devedores"
                valor={formataCompacto(data.totais.saldo_devedor, moeda)}
                cor="var(--grafico-2)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Saldos credores"
                valor={formataCompacto(data.totais.saldo_credor, moeda)}
                cor="var(--grafico-3)"
              />
            </div>
          </div>

          {!fecha && (
            <Alerta tipo="erro" className="mb-4">
              O balancete não fecha: débito de{" "}
              {formataMoeda(data.totais.debito, moeda)} contra crédito de{" "}
              {formataMoeda(data.totais.credito, moeda)}.
            </Alerta>
          )}

          <Cartao className="p-0">
            {linhas.length === 0 ? (
              <Vazio>Sem contas movimentadas no período.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Conta</Th>
                      <Th>Designação</Th>
                      <Th>Cl.</Th>
                      <Th numerico>Débito</Th>
                      <Th numerico>Crédito</Th>
                      <Th numerico>Saldo devedor</Th>
                      <Th numerico>Saldo credor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <Tr key={l.codigo}>
                        <Td className="font-bold tabular">{l.codigo}</Td>
                        <Td className="max-w-[320px] truncate">
                          <span title={l.nome}>{l.nome || "—"}</span>
                        </Td>
                        <Td className="text-texto-suave">{l.classe}</Td>
                        <Td numerico>{formataMoeda(l.debito, moeda)}</Td>
                        <Td numerico>{formataMoeda(l.credito, moeda)}</Td>
                        <Td numerico className="font-semibold">
                          {l.saldo_devedor === "0.00"
                            ? ""
                            : formataMoeda(l.saldo_devedor, moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {l.saldo_credor === "0.00"
                            ? ""
                            : formataMoeda(l.saldo_credor, moeda)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-superficie-2 font-extrabold">
                      <Td colSpan={3}>TOTAIS</Td>
                      <Td numerico>
                        {formataMoeda(data.totais.debito, moeda)}
                      </Td>
                      <Td numerico>
                        {formataMoeda(data.totais.credito, moeda)}
                      </Td>
                      <Td numerico>
                        {formataMoeda(data.totais.saldo_devedor, moeda)}
                      </Td>
                      <Td numerico>
                        {formataMoeda(data.totais.saldo_credor, moeda)}
                      </Td>
                    </tr>
                  </tfoot>
                </Tabela>
              </EnvolveTabela>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
