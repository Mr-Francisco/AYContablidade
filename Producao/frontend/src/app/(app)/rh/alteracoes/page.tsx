"use client";

import { Plus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import {
  ESTADOS_MES,
  mesActual,
  mesPorExtenso,
  ultimosMeses,
} from "@/components/rh/mes";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda, soma } from "@/lib/dinheiro";
import type { AlteracaoMensal, Colaborador, Folha, LinhaRecibo } from "@/types";

/**
 * Alterações mensais — as variáveis do mês, como no Piloto.
 *
 * O que aqui estava mostrava a lista ao lado de um formulário fixo, e por isso
 * a lista tinha metade da largura e perdera as duas colunas que dão sentido à
 * página: o BRUTO e o LÍQUIDO. Sem elas não se via o efeito do que se estava a
 * lançar — que é a única razão para se estar nesta página.
 *
 * Volta ao desenho do Piloto: tabela inteira com Faltas · Abonos · Descontos ·
 * Bruto · Líquido, e a edição numa janela com o líquido a acompanhar o que se
 * escreve. O cálculo do líquido vem do servidor (`/alteracoes/simular`), que é
 * quem processa a folha — no Piloto a fórmula estava escrita duas vezes.
 */

interface Rubrica {
  chave: string;
  desc: string;
  valor: string;
}

const nova = (): Rubrica => ({
  chave: crypto.randomUUID(),
  desc: "",
  valor: "",
});

const paraRubricas = (itens: { desc?: string; valor?: string }[]): Rubrica[] =>
  itens.map((x) => ({
    chave: crypto.randomUUID(),
    desc: x.desc ?? "",
    valor: x.valor ?? "",
  }));

/** Só as linhas preenchidas — uma linha em branco não é uma rubrica. */
const usaveis = (itens: Rubrica[]) =>
  itens
    .filter((x) => x.desc.trim() || Number(x.valor))
    .map((x) => ({ desc: x.desc.trim(), valor: x.valor || "0" }));

export default function Alteracoes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const podeGerir = pode("rh.gerir");

  const [mes, setMes] = useState(mesActual());
  const [emEdicao, setEmEdicao] = useState<Colaborador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores?so_ativos=true",
    buscador,
  );
  const {
    data: alteracoes,
    isLoading,
    error,
    mutate,
  } = useSWR<AlteracaoMensal[]>(`/api/rh/alteracoes?mes=${mes}`, buscador);
  // A folha do mês dá o bruto e o líquido de cada linha — os mesmos números
  // que o processamento vai usar.
  const { data: folha, mutate: recarregarFolha } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=true`,
    buscador,
  );
  const { data: estado } = useSWR<{ estado: string }>(
    `/api/rh/estado?mes=${mes}`,
    buscador,
  );

  const estadoMes = estado?.estado ?? "por_processar";
  const info = ESTADOS_MES[estadoMes] ?? ESTADOS_MES.por_processar;
  const pago = estadoMes === "pago";
  const processado = estadoMes === "processado";

  /**
   * PORQUE É QUE NÃO SE PODE EDITAR — a regra do projecto: um botão bloqueado
   * diz o motivo. Mês pago é mês fechado (e o servidor recusa). Mês processado
   * já foi lançado na contabilidade e a Produção não reprocessa, por isso
   * mexer nas variáveis não mudaria a folha lançada.
   */
  const motivoBloqueio = pago
    ? "A folha deste mês já foi paga. As variáveis não podem ser alteradas — corrige-se no mês seguinte."
    : processado
      ? "A folha deste mês já foi processada e lançada. Alterar as variáveis agora não muda o que foi lançado — a correcção faz-se por rectificação na contabilidade."
      : undefined;
  const trancado = Boolean(motivoBloqueio);

  const porColaborador = useMemo(() => {
    const m = new Map<string, AlteracaoMensal>();
    for (const a of alteracoes ?? []) m.set(a.colaborador_id, a);
    return m;
  }, [alteracoes]);

  const recibos = useMemo(() => {
    const m = new Map<string, LinhaRecibo>();
    for (const l of folha?.linhas ?? []) m.set(l.colaborador_id, l);
    return m;
  }, [folha]);

  return (
    <>
      <CabecalhoPagina
        titulo="Alterações Mensais"
        descricao="Variáveis do mês por colaborador — faltas, abonos e descontos pontuais. Alimentam o processamento e os recibos."
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

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

      {motivoBloqueio && (
        <Alerta tipo={pago ? "info" : "aviso"} className="mb-4">
          {motivoBloqueio}
        </Alerta>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : error ? (
          <div className="p-4">
            <FalhaAoCarregar erro={error} oQue="as alterações do mês" />
          </div>
        ) : !colaboradores?.length ? (
          <Vazio>Sem colaboradores activos.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Colaborador</Th>
                  <Th numerico>Faltas</Th>
                  <Th numerico>Abonos</Th>
                  <Th numerico>Descontos</Th>
                  <Th numerico>Bruto</Th>
                  <Th numerico>Líquido</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c) => {
                  const a = porColaborador.get(c.id);
                  const r = recibos.get(c.id);
                  const totalAbonos = soma(
                    ...(a?.abonos ?? []).map((x) => x.valor ?? "0"),
                  );
                  const totalDesc = soma(
                    ...(a?.descontos ?? []).map((x) => x.valor ?? "0"),
                  );
                  const temFaltas = Boolean(a?.faltas && Number(a.faltas) > 0);
                  return (
                    <Tr key={c.id}>
                      <Td className="tabular font-bold">{c.numero}</Td>
                      <Td className="max-w-[240px] truncate font-semibold">
                        {c.nome}
                      </Td>
                      <Td
                        numerico
                        className={temFaltas ? "font-semibold text-perigo" : ""}
                      >
                        {/* Dias, não dinheiro: «2,00 faltas» não se diz. */}
                        {temFaltas ? Number(a?.faltas) : "—"}
                      </Td>
                      <Td numerico>
                        {totalAbonos.eq(0)
                          ? "—"
                          : formataMoeda(totalAbonos, moeda)}
                      </Td>
                      <Td numerico>
                        {totalDesc.eq(0) ? "—" : formataMoeda(totalDesc, moeda)}
                      </Td>
                      <Td numerico>{r ? formataMoeda(r.bruto, moeda) : "—"}</Td>
                      <Td numerico className="font-bold">
                        {r ? formataMoeda(r.liquido, moeda) : "—"}
                      </Td>
                      {podeGerir && (
                        <Td numerico>
                          <Botao
                            tamanho="pequeno"
                            variante={trancado ? "neutro" : "contorno"}
                            disabled={trancado}
                            motivoBloqueio={motivoBloqueio}
                            onClick={() => {
                              setAviso(null);
                              setEmEdicao(c);
                            }}
                          >
                            Editar
                          </Botao>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {emEdicao && (
        <JanelaAlteracoes
          colaborador={emEdicao}
          mes={mes}
          moeda={moeda}
          actual={porColaborador.get(emEdicao.id)}
          aoFechar={() => setEmEdicao(null)}
          aoGravar={() => {
            setEmEdicao(null);
            setAviso("Alterações guardadas.");
            mutate();
            recarregarFolha();
          }}
        />
      )}
    </>
  );
}

function JanelaAlteracoes({
  colaborador,
  mes,
  moeda,
  actual,
  aoFechar,
  aoGravar,
}: {
  colaborador: Colaborador;
  mes: string;
  moeda: string;
  actual?: AlteracaoMensal;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [faltas, setFaltas] = useState(actual?.faltas ?? "0");
  const [abonos, setAbonos] = useState<Rubrica[]>(
    actual?.abonos?.length ? paraRubricas(actual.abonos) : [nova()],
  );
  const [descontos, setDescontos] = useState<Rubrica[]>(
    actual?.descontos?.length ? paraRubricas(actual.descontos) : [nova()],
  );
  const [previsto, setPrevisto] = useState<LinhaRecibo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const corpo = useCallback(
    () => ({
      colaborador_id: colaborador.id,
      faltas: faltas || "0",
      abonos: usaveis(abonos),
      descontos: usaveis(descontos),
    }),
    [colaborador.id, faltas, abonos, descontos],
  );

  // O líquido a acompanhar o que se escreve. Com atraso: são teclas, não
  // cliques — sem isto seria um pedido por cada dígito do valor.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      api
        .post<LinhaRecibo>("/api/rh/alteracoes/simular", corpo())
        .then((r) => vivo && setPrevisto(r))
        .catch(() => vivo && setPrevisto(null));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [corpo]);

  async function submeter() {
    setErro(null);
    setAGravar(true);
    try {
      await api.put(`/api/rh/alteracoes/${colaborador.id}`, {
        mes,
        ...corpo(),
      });
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(680px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda bg-superficie-2 px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Alterações — {colaborador.nome} · {mesPorExtenso(mes)}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="flex flex-wrap items-end gap-4">
              <Campo rotulo="Faltas (dias)" className="w-40">
                <Entrada
                  type="number"
                  step="1"
                  min="0"
                  value={faltas}
                  onChange={(e) => setFaltas(e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
              <p className="pb-2.5 text-[12.5px] text-texto-suave">
                Cada dia de falta desconta 1/30 do salário base.
              </p>
            </div>

            <QuadroRubricas
              titulo="Abonos"
              singular="abono"
              nota="acrescem ao bruto"
              itens={abonos}
              aoMudar={setAbonos}
            />
            <QuadroRubricas
              titulo="Descontos"
              singular="desconto"
              nota="deduzem ao líquido"
              itens={descontos}
              aoMudar={setDescontos}
            />

            {erro && (
              <div className="mt-4">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda bg-superficie-2 px-5 py-3.5">
            {/* O número que interessa a quem está a lançar: quanto é que a
                pessoa recebe depois disto. Vem do servidor, para ser o mesmo
                que o processamento vai calcular. */}
            <div className="flex items-baseline gap-2">
              <span className="text-[12.5px] font-semibold text-texto-suave">
                Líquido resultante
              </span>
              <b className="tabular text-[15px]">
                {previsto ? formataMoeda(previsto.liquido, moeda) : "—"}
              </b>
            </div>
            <div className="flex gap-2">
              <Botao onClick={aoFechar}>Cancelar</Botao>
              <Botao
                variante="primario"
                onClick={submeter}
                disabled={aGravar}
                motivoBloqueio={
                  aGravar ? "A gravar as alterações — aguarde." : undefined
                }
              >
                {aGravar ? "A gravar…" : "Guardar"}
              </Botao>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QuadroRubricas({
  titulo,
  singular,
  nota,
  itens,
  aoMudar,
}: {
  titulo: string;
  /** «abono», «desconto» — para os rótulos de leitura por voz e o botão. */
  singular: string;
  nota: string;
  itens: Rubrica[];
  aoMudar: (r: Rubrica[]) => void;
}) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[13px] font-bold">
        {titulo} <span className="font-normal text-texto-suave">({nota})</span>
      </h3>

      <div className="flex flex-col gap-2">
        {itens.map((r) => (
          <div key={r.chave} className="flex gap-2">
            <Entrada
              value={r.desc}
              placeholder="Descrição"
              aria-label={`Descrição do ${singular}`}
              onChange={(e) =>
                aoMudar(
                  itens.map((x) =>
                    x.chave === r.chave ? { ...x, desc: e.target.value } : x,
                  ),
                )
              }
            />
            <Entrada
              type="number"
              step="1000"
              min="0"
              value={r.valor}
              placeholder="0,00"
              aria-label={`Valor do ${singular}`}
              className="w-40 text-right tabular"
              onChange={(e) =>
                aoMudar(
                  itens.map((x) =>
                    x.chave === r.chave ? { ...x, valor: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Remover ${singular}`}
              onClick={() => aoMudar(itens.filter((x) => x.chave !== r.chave))}
              className="flex h-[38px] w-9 shrink-0 items-center justify-center rounded-lg border border-borda text-texto-suave transition-colors hover:border-perigo hover:text-perigo"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2">
        <Botao tamanho="pequeno" onClick={() => aoMudar([...itens, nova()])}>
          <Plus size={14} />
          {singular.charAt(0).toUpperCase() + singular.slice(1)}
        </Botao>
      </div>
    </div>
  );
}
