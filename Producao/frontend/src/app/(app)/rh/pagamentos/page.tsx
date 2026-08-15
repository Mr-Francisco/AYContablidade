"use client";

import { Banknote } from "lucide-react";
import Link from "next/link";
import { AlertDialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";
import { GrelhaKpis } from "@/components/painel";
import {
  ESTADOS_MES,
  mesActual,
  mesDoExercicio,
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
import type { Folha, MesAPagar } from "@/types";

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
  // Os MESES PROCESSADOS, e não só os pagamentos já feitos: quem entra aqui
  // quer saber o que falta pagar. A lista de pagamentos mostrava o contrário —
  // o que já estava resolvido.
  const { data: paginaMeses, mutate } = useSWR<Pagina<MesAPagar>>(
    `/api/rh/meses-a-pagar?${pag.query}`,
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

  const meses = paginaMeses?.linhas;

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
        <TituloCartao className="px-5 pt-5">Meses processados</TituloCartao>
        {!meses?.length ? (
          <Vazio>
            Nenhum mês processado. A folha processa-se em{" "}
            <Link href="/rh/processamento" className="font-semibold text-marca">
              Processamento
            </Link>
            .
          </Vazio>
        ) : (
          <>
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Mês</Th>
                    <Th numerico>Líquido</Th>
                    <Th>Estado</Th>
                    <Th>Conta</Th>
                    <Th>Lançamento</Th>
                    {pode("rh.gerir") && <Th> </Th>}
                  </tr>
                </thead>
                <tbody>
                  {(meses ?? []).map((m) => {
                    const chave = mesDoExercicio(m.mes, m.exercicio);
                    const pago = m.estado === "pago";
                    return (
                      <Tr key={`${m.exercicio}-${m.mes}`}>
                        <Td className="font-semibold">
                          {mesPorExtenso(chave)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(m.valor_pago ?? m.liquido, moeda)}
                        </Td>
                        <Td>
                          <Selo cor={pago ? "#1a9c5f" : "#3d7fe0"}>
                            {pago ? "Pago" : "Processado"}
                          </Selo>
                        </Td>
                        <Td className="tabular">{m.conta || "—"}</Td>
                        <Td className="tabular text-texto-suave">
                          {m.lancamento_id ? (
                            <Link
                              href={`/contabilidade/movimentos?id=${m.lancamento_id}`}
                              className="font-semibold text-marca"
                            >
                              {m.numero_op || "Ver"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </Td>
                        {pode("rh.gerir") && (
                          <Td numerico>
                            {pago ? (
                              <span className="text-[12.5px] text-texto-suave">
                                Pago
                              </span>
                            ) : (
                              <Botao
                                tamanho="pequeno"
                                variante="primario"
                                onClick={() => {
                                  setMes(chave);
                                  setConfirmar(true);
                                }}
                              >
                                Pagar
                              </Botao>
                            )}
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <BarraPaginacao
              pagina={paginaMeses}
              {...pag.controlos}
              nome="meses processados"
            />
          </>
        )}
        <p className="px-5 pb-4 pt-3 text-[12.5px] text-texto-suave">
          Só é possível pagar meses já processados. Um mês pago fica bloqueado
          para reprocessamento.
        </p>
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
