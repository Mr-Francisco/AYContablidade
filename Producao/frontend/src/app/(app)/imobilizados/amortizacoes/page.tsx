"use client";

import { PlayCircle, RotateCcw, Settings } from "lucide-react";
import { AlertDialog, Tabs } from "radix-ui";
import { type FormEvent, useEffect, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
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
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { DialogoMestre } from "@/components/ui/CrudMestre";
import { CaixaHistorico } from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import {
  useDiarios,
  useDocumentos,
  useExercicios,
  usePeriodos,
} from "@/lib/hooks";
import { numeroLimpo } from "@/lib/texto";
import type { MapaImob, MapaPeriodoImob, ProcessoAmortizacao } from "@/types";

const SEPARADOR =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-texto-suave data-[state=active]:bg-superficie data-[state=active]:text-texto data-[state=active]:shadow-suave";

export default function Amortizacoes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();

  const [exercicioId, setExercicioId] = useState("");
  const [mes, setMes] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [confirmar, setConfirmar] = useState(false);
  const [reabrir, setReabrir] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const exId = exercicioId || activo?.id || "";

  const { data: mapaAnual, isLoading } = useSWR<MapaImob>(
    "/api/imobilizados/mapa",
    buscador,
  );
  const {
    data: mapaPeriodo,
    isLoading: aCarregarPeriodo,
    mutate: mutatePeriodo,
  } = useSWR<MapaPeriodoImob>(
    exId
      ? `/api/imobilizados/mapa-periodo?exercicio_id=${exId}&mes=${mes}`
      : null,
    buscador,
  );
  const { data: processos, mutate: mutateProcessos } = useSWR<
    ProcessoAmortizacao[]
  >(exId ? `/api/imobilizados/processos?exercicio_id=${exId}` : null, buscador);

  const nomePeriodo =
    periodos.find((p) => p.codigo === mes)?.nome ?? `Período ${mes}`;
  const exercicioNome = exercicios.find((e) => e.id === exId)?.nome ?? "";

  /** Valor sem a moeda: o cabeçalho do mapa já diz em que moeda está, e
   *  repeti-la em cada célula rouba largura a uma tabela de oito colunas. */
  const valor = (v: string) => formataMoeda(v, "");
  const jaProcessado = mapaPeriodo?.processado ?? false;
  // «Processado em 31/08/2026» e não só «Processado»: num mapa que se reabre e
  // reprocessa, é a data que diz se o que está no ecrã é o trabalho de ontem
  // ou o de hoje.
  const estadoDoPeriodo = jaProcessado
    ? mapaPeriodo?.processado_em
      ? `Processado em ${new Date(mapaPeriodo.processado_em).toLocaleDateString("pt-PT")}`
      : "Processado"
    : "Por processar";
  // O período 00 é a Abertura, não é um mês: não tem amortização nenhuma.
  const ehAbertura = mes === "00";

  async function processar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api.post<{
        total_amort: string;
        processados: number;
        lancados: number;
        erros?: string[];
      }>("/api/imobilizados/processos", {
        exercicio_id: exId,
        mes,
        data,
      });
      setAviso(
        `${nomePeriodo} processado: ${formataMoeda(r.total_amort, moeda)} em ${r.processados} ${r.processados === 1 ? "activo" : "activos"}, ${r.lancados} com lançamento.` +
          (r.erros?.length ? ` Com avisos: ${r.erros.join(" · ")}` : ""),
      );
      mutatePeriodo();
      mutateProcessos();
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

  async function desfazer() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await api.delete(
        `/api/imobilizados/processos?exercicio_id=${exId}&mes=${mes}`,
      );
      setAviso(
        `${nomePeriodo} reaberto: as amortizações acumuladas foram repostas e os lançamentos removidos.`,
      );
      mutatePeriodo();
      mutateProcessos();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível reabrir.",
      );
    } finally {
      setOcupado(false);
      setReabrir(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Amortizações"
        descricao="Processamento das quotas do período e mapa anual do imobilizado."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {pode("imob.gerir") && exId && (
              <div className="flex gap-2">
                {jaProcessado && (
                  <Botao onClick={() => setReabrir(true)}>
                    <RotateCcw size={16} />
                    Reabrir
                  </Botao>
                )}
                <Botao onClick={() => setConfigAberta(true)}>
                  <Settings size={16} />
                  Configurações
                </Botao>
                <Botao
                  variante="primario"
                  disabled={jaProcessado || ehAbertura}
                  onClick={() => setConfirmar(true)}
                >
                  <PlayCircle size={16} />
                  Processar {nomePeriodo}
                </Botao>
              </div>
            )}
            <AccoesDoMapa />
          </div>
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({ valor: e.id, rotulo: e.nome }))}
          placeholder="Escolher exercício…"
          larguraMinima="14rem"
        />
        <Selector
          rotulo="Período"
          valor={mes}
          aoMudar={setMes}
          opcoes={periodos.map((p) => ({
            valor: p.codigo,
            rotulo: `${p.codigo} — ${p.nome}`,
          }))}
          larguraMinima="14rem"
        />
        <div className="flex items-end pb-0.5">
          <Selo cor={jaProcessado ? "#1a9c5f" : "#c98a10"}>
            {estadoDoPeriodo}
          </Selo>
        </div>
      </BarraFiltros>

      {ehAbertura && (
        <Alerta tipo="info" className="mb-4">
          O período 00 é a Abertura e não é um mês — não tem amortização.
          Escolha um período de 01 a 12.
        </Alerta>
      )}

      {jaProcessado && (
        <Alerta tipo="info" className="mb-4">
          {nomePeriodo} já foi processado. Reprocessar em cima duplicaria a
          amortização acumulada de cada activo, por isso é preciso{" "}
          <b>reabrir</b> primeiro — o que repõe as acumuladas e remove os
          lançamentos gerados.
        </Alerta>
      )}

      <Tabs.Root defaultValue="periodo">
        <Tabs.List className="mb-4 inline-flex gap-1 rounded-xl bg-fundo p-1">
          <Tabs.Trigger value="periodo" className={SEPARADOR}>
            Período
          </Tabs.Trigger>
          <Tabs.Trigger value="anual" className={SEPARADOR}>
            Mapa anual
          </Tabs.Trigger>
          <Tabs.Trigger value="historico" className={SEPARADOR}>
            Histórico
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="periodo">
          {mapaPeriodo && (
            <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className="min-w-0">
                <Kpi
                  rotulo={
                    jaProcessado ? "Amortizado no período" : "A amortizar"
                  }
                  valor={formataCompacto(mapaPeriodo.total_periodo, moeda)}
                  detalhe={nomePeriodo}
                  cor="var(--grafico-4)"
                />
              </div>
              <div className="min-w-0">
                <Kpi
                  rotulo="Activos com quota"
                  valor={String(
                    mapaPeriodo.linhas.filter(
                      (l) => Number(l.valor_periodo) > 0,
                    ).length,
                  )}
                  detalhe={`de ${mapaPeriodo.linhas.length} no total`}
                  cor="var(--grafico-2)"
                />
              </div>
              <div className="min-w-0">
                <Kpi
                  rotulo="Estado"
                  valor={estadoDoPeriodo}
                  detalhe={
                    jaProcessado ? "Reabra para refazer" : "Ainda editável"
                  }
                  cor={jaProcessado ? "var(--grafico-6)" : "var(--grafico-1)"}
                />
              </div>
            </div>
          )}

          <Cartao className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-borda px-5 py-3.5">
              <div>
                <b>{empresa?.nome}</b>
                <br />
                <span className="text-[12.5px] text-texto-suave">
                  Mapa de Amortizações — {exercicioNome}
                  {nomePeriodo ? ` · ${nomePeriodo}` : ""}
                </span>
              </div>
              <Selo cor={jaProcessado ? "#1a9c5f" : "#c98a10"}>
                {estadoDoPeriodo}
              </Selo>
            </div>
            {aCarregarPeriodo ? (
              <ACarregar />
            ) : !mapaPeriodo?.linhas.length ? (
              <Vazio>
                {exId
                  ? "Não há activos para amortizar."
                  : "Escolha um exercício."}
              </Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Designação</Th>
                      <Th>Conta</Th>
                      <Th>Método</Th>
                      <Th numerico>Taxa</Th>
                      <Th numerico>Amort. acumulada</Th>
                      <Th numerico>Amort. do período</Th>
                      <Th numerico>Valor líquido</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapaPeriodo.linhas.map((l) => (
                      <Tr key={l.id}>
                        <Td className="tabular font-bold">{l.codigo}</Td>
                        <Td className="max-w-[240px] truncate font-semibold">
                          {l.designacao}
                        </Td>
                        <Td className="tabular text-texto-suave">
                          {l.conta || "—"}
                        </Td>
                        <Td className="text-texto-suave">
                          {l.metodo === "decrescente"
                            ? "Quotas Decrescentes"
                            : "Quotas Constantes"}
                        </Td>
                        <Td numerico className="text-texto-suave">
                          {numeroLimpo(l.taxa)}%
                        </Td>
                        <Td numerico>{valor(l.amort_acumulada_atual)}</Td>
                        <Td numerico className="font-semibold">
                          {valor(l.valor_periodo)}
                        </Td>
                        <Td numerico>{valor(l.valor_liquido_atual)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-borda font-bold">
                      <Td colSpan={6}>TOTAL DO PERÍODO</Td>
                      <Td numerico>{valor(mapaPeriodo.total_periodo)}</Td>
                      <Td />
                    </tr>
                  </tfoot>
                </Tabela>
              </EnvolveTabela>
            )}
            {/* A nota do Piloto, por baixo do mapa: diz como sai a quota e
                porque é que processar duas vezes não duplica nada. Sem ela, o
                número da coluna «Amort. do período» é um número sem origem. */}
            <p className="border-t border-borda px-5 py-3 text-[12.5px] leading-relaxed text-texto-suave">
              A quota mensal (Quotas Constantes: valor de aquisição × taxa ÷ 12;
              Quotas Decrescentes: valor líquido × taxa × coeficiente ÷ 12) é
              lançada na contabilidade ao processar o período (débito custo ·
              crédito amort. acumulada). Processamento idempotente — cada
              exercício/período só pode ser processado uma vez; reabra para
              corrigir e processar de novo.
            </p>
          </Cartao>
        </Tabs.Content>

        <Tabs.Content value="anual">
          <Cartao className="p-0">
            <TituloCartao
              className="px-5 pt-5"
              extra="Quota anual completa, independente do que já foi processado"
            >
              Mapa anual de amortizações
            </TituloCartao>
            {isLoading ? (
              <ACarregar />
            ) : !mapaAnual?.linhas.length ? (
              <Vazio>Não há activos registados.</Vazio>
            ) : (
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Código</Th>
                      <Th>Designação</Th>
                      <Th>Aquisição</Th>
                      <Th numerico>Valor bruto</Th>
                      <Th numerico>Taxa</Th>
                      <Th numerico>Acum. anterior</Th>
                      <Th numerico>Do exercício</Th>
                      <Th numerico>Acum. final</Th>
                      <Th numerico>Valor líquido</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapaAnual.linhas.map((l) => (
                      <Tr key={l.id}>
                        <Td className="tabular font-bold">{l.codigo}</Td>
                        <Td className="max-w-[220px] truncate font-semibold">
                          {l.designacao}
                        </Td>
                        <Td className="tabular">
                          {l.data_aquisicao
                            ? new Date(l.data_aquisicao).toLocaleDateString(
                                "pt-PT",
                              )
                            : "—"}
                        </Td>
                        <Td numerico>{formataMoeda(l.valor_bruto, moeda)}</Td>
                        <Td numerico>{numeroLimpo(l.taxa)} %</Td>
                        <Td numerico>
                          {formataMoeda(l.amort_acumulada_ant, moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(l.amort_exercicio, moeda)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(l.amort_acumulada, moeda)}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(l.valor_liquido, moeda)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-borda font-bold">
                      <Td colSpan={3}>Totais</Td>
                      <Td numerico>
                        {formataMoeda(mapaAnual.totais.valor_bruto, moeda)}
                      </Td>
                      <Td />
                      <Td numerico>
                        {formataMoeda(
                          mapaAnual.totais.amort_acumulada_ant,
                          moeda,
                        )}
                      </Td>
                      <Td numerico>
                        {formataMoeda(mapaAnual.totais.amort_exercicio, moeda)}
                      </Td>
                      <Td numerico>
                        {formataMoeda(mapaAnual.totais.amort_acumulada, moeda)}
                      </Td>
                      <Td numerico>
                        {formataMoeda(mapaAnual.totais.valor_liquido, moeda)}
                      </Td>
                    </tr>
                  </tfoot>
                </Tabela>
              </EnvolveTabela>
            )}
          </Cartao>
        </Tabs.Content>

        <Tabs.Content value="historico">
          <Cartao className="p-0">
            <TituloCartao className="px-5 pt-5">
              Períodos processados
            </TituloCartao>
            {!processos?.length ? (
              <Vazio>Ainda não foi processado nenhum período.</Vazio>
            ) : (
              // Caixa com scroll próprio: um exercício tem dezasseis períodos
              // no máximo, mas a página não é dona do scroll de lista nenhuma.
              // No papel a caixa abre-se — ver `@media print`.
              <CaixaHistorico altura={420}>
                <EnvolveTabela className="rounded-none border-0 border-t">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Período</Th>
                        <Th>Data</Th>
                        <Th numerico>Activos</Th>
                        <Th numerico>Total amortizado</Th>
                        <Th>Processado por</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(processos ?? []).map((p) => (
                        <Tr key={p.id}>
                          <Td className="font-semibold">
                            {p.mes} —{" "}
                            {periodos.find((x) => x.codigo === p.mes)?.nome ??
                              ""}
                          </Td>
                          <Td className="tabular">
                            {new Date(p.data).toLocaleDateString("pt-PT")}
                          </Td>
                          <Td numerico>{p.itens}</Td>
                          <Td numerico className="font-semibold">
                            {formataMoeda(p.total_amort, moeda)}
                          </Td>
                          <Td className="text-texto-suave">{p.por || "—"}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tabela>
                </EnvolveTabela>
              </CaixaHistorico>
            )}
          </Cartao>
        </Tabs.Content>
      </Tabs.Root>

      {configAberta && (
        <ConfiguracoesAmortizacoes aoFechar={() => setConfigAberta(false)} />
      )}

      <AlertDialog.Root open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Processar {nomePeriodo}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-4 text-sm text-texto-suave">
              São amortizados{" "}
              <b className="tabular">
                {formataMoeda(mapaPeriodo?.total_periodo ?? "0", moeda)}
              </b>
              . A amortização acumulada de cada activo sobe e, nos que têm
              contas definidas, é lançada na contabilidade. Fica reversível pelo
              botão Reabrir.
            </AlertDialog.Description>
            <div className="mb-5">
              <label
                htmlFor="data-lancamento"
                className="mb-1 block text-xs font-semibold text-texto-suave"
              >
                Data do lançamento
              </label>
              <input
                id="data-lancamento"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
              />
            </div>
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
                  {ocupado ? "A processar…" : "Processar"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root open={reabrir} onOpenChange={setReabrir}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Reabrir {nomePeriodo}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              As amortizações acumuladas voltam ao valor que tinham antes e os
              lançamentos gerados são removidos. É o passo obrigatório para
              corrigir um período — sem ele, reprocessar somava a quota outra
              vez por cima.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao variante="perigo" disabled={ocupado} onClick={desfazer}>
                  {ocupado ? "A reabrir…" : "Reabrir período"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

/**
 * Diário e documento usados ao lançar as amortizações — o «Configurações» do
 * Piloto, ao lado do botão que processa.
 *
 * Estavam no `parametrizacoes.imob` da empresa e só se mudavam nas
 * Configurações gerais, que são do administrador. Quem processa amortizações
 * precisa de os ver aqui: é aqui que descobre que o lançamento saiu no diário
 * errado.
 */
function ConfiguracoesAmortizacoes({ aoFechar }: { aoFechar: () => void }) {
  const { diarios } = useDiarios();
  const { data, mutate } = useSWR<{ diario: string; documento: string }>(
    "/api/imobilizados/config",
    buscador,
  );
  const [diario, setDiario] = useState("");
  const [documento, setDocumento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  // O estado local só se preenche quando a configuração chega — antes disso
  // não há nada para escolher.
  useEffect(() => {
    if (!data) return;
    setDiario(data.diario);
    setDocumento(data.documento);
  }, [data]);

  const { documentos } = useDocumentos(diario || undefined);

  // O documento gravado entra na lista mesmo que ainda não tenha chegado do
  // servidor. Sem isto, o campo aparecia VAZIO ao abrir a janela: o valor
  // chegava da configuração antes de os documentos do diário serem
  // carregados, e o selector não casa um valor que não tem opção. Quem
  // abrisse e gravasse sem reparar apagava a configuração.
  const opcoesDocumento = documentos.map((d) => ({
    valor: d.codigo,
    rotulo: `${d.codigo} · ${d.descricao}`,
  }));
  if (documento && !opcoesDocumento.some((o) => o.valor === documento)) {
    opcoesDocumento.unshift({ valor: documento, rotulo: documento });
  }

  async function gravar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.put("/api/imobilizados/config", { diario, documento });
      await mutate();
      aoFechar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar a configuração.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <DialogoMestre
      titulo="Configurações de Amortizações"
      subtitulo="Diário e documento usados ao processar amortizações — o lançamento (débito custo · crédito amort. acumulada) usa sempre esta configuração."
      icone={<Settings size={18} />}
      aoFechar={aoFechar}
      aoSubmeter={gravar}
      aGravar={aGravar}
      erro={erro}
      rotuloGravar="Guardar configurações"
    >
      <Selector
        rotulo="Diário de Imobilizado"
        valor={diario}
        aoMudar={(v) => {
          // O documento só se limpa quando o diário TROCA MESMO. A caixa
          // também chama isto quando o valor lhe chega da configuração, com o
          // diário ainda vazio — e nessa altura limpar o documento apagava o
          // que se acabara de carregar, deixando o campo vazio com a
          // configuração gravada por baixo.
          const trocaDoUtilizador = diario !== "" && v !== diario;
          setDiario(v);
          if (trocaDoUtilizador) setDocumento("");
        }}
        opcoes={diarios.map((d) => ({
          valor: d.codigo,
          rotulo: `${d.codigo} · ${d.nome}`,
        }))}
        larguraMinima="100%"
      />
      <Selector
        rotulo="Documento"
        valor={documento}
        aoMudar={setDocumento}
        opcoes={opcoesDocumento}
        larguraMinima="100%"
      />
    </DialogoMestre>
  );
}
