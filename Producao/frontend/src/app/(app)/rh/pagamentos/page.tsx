"use client";

import { Banknote } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";
import { GrelhaKpis } from "@/components/painel";
import {
  ESTADOS_MES,
  mesActual,
  mesPorExtenso,
  ultimosMeses,
} from "@/components/rh/mes";
import {
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useContas, useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { Folha, PagamentoSalarial } from "@/types";

/** Os quatro números do topo, calculados sobre TUDO e não sobre a página. */
interface ResumoPagamentos {
  total_pago: string;
  n_pagamentos: number;
  meses_processados: number;
  por_pagar: string;
}

export default function Pagamentos() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const { contas } = useContas({ soMovimento: true });
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [conta, setConta] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: estado, mutate: mutateEstado } = useSWR<{ estado: string }>(
    `/api/rh/estado?mes=${mes}`,
    buscador,
  );
  const { data: folha } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=true`,
    buscador,
  );
  const pag = usePaginacao();
  const { data: paginaPag, mutate } = useSWR<Pagina<PagamentoSalarial>>(
    `/api/rh/pagamentos?${pag.query}`,
    buscador,
  );

  const estadoMes = estado?.estado ?? "por_processar";
  const info = ESTADOS_MES[estadoMes] ?? ESTADOS_MES.por_processar;
  // Só se paga o que já foi processado — pagar antes deixaria a saída de
  // dinheiro sem o custo com pessoal que a justifica.
  const podePagar = estadoMes === "processado";

  async function pagar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.post<{
        mes: string;
        valor: string;
        numero_op?: string;
      }>("/api/rh/pagamentos", {
        mes,
        conta: conta || undefined,
        exercicio_id: activo?.id,
      });
      setAviso(
        `Pagamento de ${mesPorExtenso(r.mes)} registado: ${formataMoeda(r.valor, moeda)}${r.numero_op ? ` — operação ${r.numero_op}` : ""}.`,
      );
      mutate();
      mutateEstado();
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.mensagemUtilizador : "Não foi possível pagar.",
      );
    } finally {
      setOcupado(false);
      setConfirmar(false);
    }
  }

  const pagamentos = paginaPag?.linhas;

  const kz = (v: string) => formataMoeda(v, moeda, 0);
  // Os quatro números do topo vêm do servidor e não desta página.
  //
  // Somados aqui, passariam a ser os da PÁGINA — um total de salários que muda
  // ao carregar em «seguinte» não é um total. E «Por pagar» estava sempre a
  // zero por outra razão: lia `p.total` de uma resposta que traz `totais`, um
  // dicionário. O campo nunca existiu, e o KPI nunca mostrou outra coisa.
  const { data: resumo } = useSWR<ResumoPagamentos>(
    "/api/rh/resumo-pagamentos",
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Pagamentos"
        descricao="Pagamento dos líquidos do mês, lançado contra a conta bancária escolhida."
        accoes={
          pode("rh.gerir") && (
            <Botao
              variante="primario"
              disabled={!podePagar}
              motivoBloqueio="Só se pagam meses já processados. Processe a folha em Processamento e volte aqui."
              onClick={() => setConfirmar(true)}
            >
              <Banknote size={16} />
              Pagar {mesPorExtenso(mes)}
            </Botao>
          )
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Os quatro do Piloto: quanto já se pagou, quanto falta, quantos meses
          foram processados, e o saldo da conta de pessoal. */}
      <GrelhaKpis>
        <Kpi
          rotulo="Total pago"
          valor={kz(resumo?.total_pago ?? "0")}
          detalhe={plural(resumo?.n_pagamentos ?? 0, "pagamento")}
          cor="#16a085"
        />
        <Kpi
          rotulo="Por pagar"
          valor={kz(resumo?.por_pagar ?? "0")}
          detalhe={plural(
            resumo?.meses_processados ?? 0,
            "mês processado",
            "meses processados",
          )}
          cor="var(--grafico-1)"
        />
        <Kpi
          rotulo="Meses processados"
          valor={String(resumo?.meses_processados ?? 0)}
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Líquido do mês"
          valor={kz(folha?.totais.liquido ?? "0")}
          detalhe={mesPorExtenso(mes)}
          cor="var(--color-roxo)"
        />
      </GrelhaKpis>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          opcoes={ultimosMeses().map((m) => ({
            valor: m,
            rotulo: mesPorExtenso(m),
          }))}
          larguraMinima="14rem"
        />
        <Selector
          rotulo="Conta de pagamento"
          valor={conta}
          aoMudar={setConta}
          opcoes={[
            { valor: "", rotulo: "A da configuração de RH" },
            ...contas.map((c) => ({
              valor: c.codigo,
              rotulo: `${c.codigo} — ${c.nome}`,
            })),
          ]}
          larguraMinima="18rem"
        />
        <div className="flex items-end pb-0.5">
          <Selo cor={info.cor}>{info.rotulo}</Selo>
        </div>
      </BarraFiltros>

      {estadoMes === "por_processar" && (
        <Alerta tipo="aviso" className="mb-4">
          {mesPorExtenso(mes)} ainda não foi processado. O pagamento só pode ser
          registado depois do processamento — sem ele, a saída de dinheiro
          ficaria sem o custo com pessoal que a justifica.
        </Alerta>
      )}
      {estadoMes === "pago" && (
        <Alerta tipo="info" className="mb-4">
          {mesPorExtenso(mes)} já está pago. O mês não volta a ser pago.
        </Alerta>
      )}

      <Cartao className="p-0">
        <TituloCartao className="px-5 pt-5">Pagamentos registados</TituloCartao>
        {!pagamentos?.length ? (
          <Vazio>Ainda não há pagamentos registados.</Vazio>
        ) : (
          <>
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Mês</Th>
                    <Th numerico>Valor</Th>
                    <Th>Conta</Th>
                    <Th>Lançado</Th>
                    <Th>Nº Operação</Th>
                  </tr>
                </thead>
                <tbody>
                  {(pagamentos ?? []).map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-semibold">{mesPorExtenso(p.mes)}</Td>
                      <Td numerico className="font-semibold">
                        {formataMoeda(p.valor, moeda)}
                      </Td>
                      <Td className="tabular">{p.conta || "—"}</Td>
                      <Td>
                        <Selo cor={p.lancado ? "#1a9c5f" : "#c98a10"}>
                          {p.lancado ? "Sim" : "Não"}
                        </Selo>
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {p.numero_op || "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <BarraPaginacao
              pagina={paginaPag}
              {...pag.controlos}
              nome="pagamentos"
            />
          </>
        )}
      </Cartao>

      <AlertDialog.Root open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Registar o pagamento de {mesPorExtenso(mes)}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              Saem{" "}
              <b className="tabular">
                {formataMoeda(folha?.totais.liquido ?? "0", moeda)}
              </b>{" "}
              da conta {conta || "definida na configuração de RH"} e a dívida
              aos colaboradores é saldada. O mês fica pago e não volta a ser
              pago.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao variante="primario" disabled={ocupado} onClick={pagar}>
                  {ocupado ? "A registar…" : "Registar pagamento"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
