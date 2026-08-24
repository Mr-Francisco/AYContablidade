"use client";

import { PlayCircle } from "lucide-react";
import { AlertDialog, Tabs } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import {
  ESTADOS_MES,
  mesActual,
  mesPorExtenso,
  ultimosMeses,
} from "@/components/rh/mes";
import { TabelaFolha } from "@/components/rh/TabelaFolha";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoDoMapa,
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
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Folha, Processamento } from "@/types";

export default function ProcessamentoPagina() {
  const { empresa, pode } = useAuth();
  const { activo } = useExercicios();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  // O histórico era um segundo cartão por baixo da folha: para o ver, rolava-se
  // a folha toda. Passa a separador ao mesmo nível, como o resto da aplicação.
  const [aba, setAba] = useState("folha");
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: folha, isLoading } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=true`,
    buscador,
  );
  const { data: estado, mutate: mutateEstado } = useSWR<{ estado: string }>(
    `/api/rh/estado?mes=${mes}`,
    buscador,
  );
  const { data: cfg } = useSWR<{
    conta_custo: string;
    conta_pagar: string;
    conta_irt: string;
    conta_inss: string;
    inss_empr: number;
  }>("/api/rh/config", buscador, { revalidateOnFocus: false });
  const pag = usePaginacao();
  const { data: paginaProc, mutate } = useSWR<Pagina<Processamento>>(
    `/api/rh/processamentos?${pag.query}`,
    buscador,
  );

  const estadoMes = estado?.estado ?? "por_processar";
  const info = ESTADOS_MES[estadoMes] ?? ESTADOS_MES.por_processar;
  const jaProcessado = estadoMes !== "por_processar";

  async function processar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.post<{ mes: string; numero_op?: string }>(
        "/api/rh/processamentos",
        { mes, exercicio_id: activo?.id },
      );
      setAviso(
        `Folha de ${mesPorExtenso(r.mes)} processada e lançada${r.numero_op ? ` — operação ${r.numero_op}` : ""}.`,
      );
      mutate();
      mutateEstado();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível processar.",
      );
    } finally {
      setOcupado(false);
      setConfirmar(false);
    }
  }

  const processamentos = paginaProc?.linhas;

  return (
    <>
      <CabecalhoPagina
        titulo="Processamento"
        descricao="Processa a folha do mês e lança-a na contabilidade."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {pode("rh.gerir") && (
              <Botao
                variante="primario"
                disabled={jaProcessado || !folha?.linhas.length}
                motivoBloqueio={
                  jaProcessado
                    ? "Este mês já foi processado. Para corrigir, reabra o mês e processe de novo."
                    : "Não há colaboradores com salário para processar neste mês."
                }
                onClick={() => setConfirmar(true)}
              >
                <PlayCircle size={16} />
                Processar {mesPorExtenso(mes)}
              </Botao>
            )}
            <AccoesDoMapa />
          </div>
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Tabs.Root value={aba} onValueChange={setAba}>
        <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
          {[
            { v: "folha", r: "Folha a processar" },
            { v: "historico", r: "Histórico" },
          ].map((x) => (
            <Tabs.Trigger
              key={x.v}
              value={x.v}
              className="-mb-0.5 rounded-t-lg border-b-2 border-transparent px-4 py-2 text-[13.5px] font-semibold text-texto-suave hover:text-texto data-[state=active]:border-acento data-[state=active]:text-texto"
            >
              {x.r}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {aba === "folha" ? (
        <>
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
            <div className="flex items-end pb-0.5">
              <Selo cor={info.cor}>{info.rotulo}</Selo>
            </div>
          </BarraFiltros>

          <CabecalhoDoMapa
            titulo="Folha de Salários"
            periodo={mesPorExtenso(mes)}
          />

          {jaProcessado && (
            <Alerta tipo="info" className="mb-4">
              {mesPorExtenso(mes)} já foi processado
              {estadoMes === "pago" ? " e pago" : ""}. O mês não volta a ser
              processado — a folha lançada é um documento contabilístico e
              reprocessá-la duplicaria os movimentos. Para corrigir, lança-se a
              rectificação na contabilidade.
            </Alerta>
          )}

          {folha && (
            <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="min-w-0">
                <Kpi
                  rotulo="Bruto"
                  valor={formataCompacto(folha.totais.bruto, moeda)}
                  detalhe={`${folha.linhas.length} colaboradores`}
                  cor="var(--grafico-1)"
                />
              </div>
              <div className="min-w-0">
                <Kpi
                  rotulo="Retenções"
                  valor={formataCompacto(
                    soma(folha.totais.inss, folha.totais.irt),
                    moeda,
                  )}
                  detalhe="INSS do trabalhador + IRT"
                  cor="var(--grafico-2)"
                />
              </div>
              <div className="min-w-0">
                <Kpi
                  rotulo="Líquido"
                  valor={formataCompacto(folha.totais.liquido, moeda)}
                  detalhe="A pagar aos colaboradores"
                  cor="var(--grafico-6)"
                />
              </div>
              <div className="min-w-0">
                <Kpi
                  rotulo="Custo da empresa"
                  valor={formataCompacto(
                    soma(folha.totais.bruto, folha.totais.inss_empresa),
                    moeda,
                  )}
                  detalhe="Bruto + INSS da entidade"
                  cor="var(--grafico-4)"
                />
              </div>
            </div>
          )}

          <Cartao className="mb-4 p-0">
            {/* O cabeçalho do mapa do Piloto: quem, o quê e em que moeda. É o
                que sai no papel — sem ele, a folha impressa não diz de que
                empresa nem de que mês é. */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
              <div>
                <b className="text-[15px]">{empresa?.nome}</b>
                <p className="text-[12.5px] text-texto-suave">
                  Folha de Salários — {mesPorExtenso(mes)}
                  {activo ? ` · ${activo.nome}` : ""}
                </p>
              </div>
              <span className="text-[12.5px] text-texto-suave">
                Valores em {moeda}
              </span>
            </div>
            {isLoading || !folha ? (
              <ACarregar />
            ) : (
              <>
                <TabelaFolha folha={folha} moeda={moeda} />
                {/* O que o processamento vai lançar, como no Piloto — quem
                aprova a folha quer saber em que contas ela cai. */}
                <p className="px-5 py-4 text-[12.5px] leading-relaxed text-texto-suave">
                  INSS a cargo da empresa ({cfg?.inss_empr ?? 8}%):{" "}
                  <b className="tabular text-texto">
                    {formataMoeda(folha.totais.inss_empresa, moeda)}
                  </b>
                  {cfg && (
                    <>
                      . Ao processar: débito das remunerações ({cfg.conta_custo}
                      ) · crédito do líquido ({cfg.conta_pagar}), IRT (
                      {cfg.conta_irt}) e INSS ({cfg.conta_inss}).
                    </>
                  )}
                </p>
              </>
            )}
          </Cartao>
        </>
      ) : (
        <Cartao className="p-0">
          <TituloCartao className="px-5 pt-5">Meses processados</TituloCartao>
          {!processamentos?.length ? (
            <Vazio>Ainda não foi processado nenhum mês.</Vazio>
          ) : (
            <>
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Mês</Th>
                      <Th numerico>Bruto</Th>
                      <Th numerico>INSS</Th>
                      <Th numerico>IRT</Th>
                      <Th numerico>Líquido</Th>
                      <Th>Lançado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(processamentos ?? []).map((p) => (
                      <Tr key={p.id}>
                        <Td className="font-semibold">
                          {mesPorExtenso(p.mes)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(p.totais?.bruto ?? "0", moeda)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(p.totais?.inss ?? "0", moeda)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(p.totais?.irt ?? "0", moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(p.totais?.liquido ?? "0", moeda)}
                        </Td>
                        <Td>
                          <Selo cor={p.lancado ? "#1a9c5f" : "#c98a10"}>
                            {p.lancado ? "Sim" : "Não"}
                          </Selo>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
              <BarraPaginacao
                pagina={paginaProc}
                {...pag.controlos}
                nome="meses processados"
              />
            </>
          )}
        </Cartao>
      )}

      <AlertDialog.Root open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Processar a folha de {mesPorExtenso(mes)}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              São lançados{" "}
              <b className="tabular">
                {formataMoeda(folha?.totais.bruto ?? "0", moeda)}
              </b>{" "}
              de custo com pessoal, com{" "}
              <b className="tabular">
                {formataMoeda(folha?.totais.liquido ?? "0", moeda)}
              </b>{" "}
              a pagar e as retenções de INSS e IRT ao Estado. O mês fica
              processado e não pode ser processado outra vez.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="primario"
                  disabled={ocupado}
                  onClick={processar}
                >
                  {ocupado ? "A processar…" : "Processar e lançar"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
