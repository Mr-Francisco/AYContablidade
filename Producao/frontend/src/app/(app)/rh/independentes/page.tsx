"use client";

import { Plus, Receipt, X } from "lucide-react";
import Link from "next/link";
import { Dialog, Tabs } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
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
import { CampoNif } from "@/components/ui/CampoNif";
import { AccoesDaLinha, ConfirmarEliminar } from "@/components/ui/CrudMestre";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { BarraPaginacao, usePaginacao } from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { numeroLimpo, plural } from "@/lib/texto";
import type { Honorario, Independente } from "@/types";

/** A resposta paginada dos honorários, com os totais do conjunto filtrado. */
interface PaginaHonorarios {
  linhas: Honorario[];
  total: number;
  offset: number;
  limite: number;
  totais: { bruto: string; retencao: string; liquido: string };
}

/**
 * Independentes e honorários — os dois quadros do Piloto, em separadores.
 *
 * Estavam lado a lado, cada um com metade da largura: a tabela dos honorários
 * tem sete colunas e não cabia, e a dos independentes não tinha como editar
 * nem desactivar ninguém. Passam a separador cada um, com a página inteira.
 */
export default function Independentes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const podeGerir = pode("rh.gerir");

  const [aba, setAba] = useState("independentes");
  const [mes, setMes] = useState(mesActual());
  const [emEdicao, setEmEdicao] = useState<Independente | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [honorarioAberto, setHonorarioAberto] = useState(false);
  const [aApagar, setAApagar] = useState<Independente | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { data: independentes, mutate } = useSWR<Independente[]>(
    "/api/rh/independentes",
    buscador,
  );
  const pag = usePaginacao();
  const {
    data: pagina,
    isLoading,
    mutate: mutateHon,
  } = useSWR<PaginaHonorarios>(
    `/api/rh/honorarios?mes=${mes}&${pag.query}`,
    buscador,
  );

  const honorarios = pagina?.linhas ?? [];
  const totais = pagina?.totais ?? { bruto: "0", retencao: "0", liquido: "0" };

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    try {
      await api.delete(`/api/rh/independentes/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setAApagar(null);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Honorários — Trabalhadores Independentes"
        descricao="Prestadores de serviços independentes com retenção de IRT na fonte. Processar lança o custo, o líquido a pagar e o IRT retido."
        accoes={
          podeGerir && (
            <div className="flex gap-2">
              <Botao onClick={() => setNovoAberto(true)}>
                <Plus size={16} />
                Novo independente
              </Botao>
              <Botao
                variante="acento"
                onClick={() => setHonorarioAberto(true)}
                disabled={!independentes?.length}
                motivoBloqueio="Ainda não há independentes registados. Crie um primeiro, para lhe poder processar honorários."
              >
                <Receipt size={16} />
                Processar honorário
              </Botao>
            </div>
          )
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Honorários do mês"
            valor={formataCompacto(totais.bruto, moeda)}
            detalhe={plural(pagina?.total ?? 0, "registo")}
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Retenção na fonte"
            valor={formataCompacto(totais.retencao, moeda)}
            detalhe="IRT a entregar ao Estado"
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Líquido pago"
            valor={formataCompacto(totais.liquido, moeda)}
            detalhe="Depois da retenção"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Independentes"
            valor={String(independentes?.length ?? 0)}
            detalhe={plural(
              (independentes ?? []).filter((i) => i.estado === "activo").length,
              "activo",
            )}
            cor="var(--grafico-4)"
          />
        </div>
      </div>

      <Tabs.Root value={aba} onValueChange={setAba}>
        <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
          {[
            { v: "independentes", r: "Independentes" },
            { v: "honorarios", r: "Honorários processados" },
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

      {aba === "independentes" ? (
        <Cartao className="p-0">
          {!independentes?.length ? (
            <Vazio>Sem independentes.</Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>NIF</Th>
                    <Th>Actividade</Th>
                    <Th numerico>Retenção</Th>
                    <Th>Estado</Th>
                    {podeGerir && <Th> </Th>}
                  </tr>
                </thead>
                <tbody>
                  {independentes.map((i) => (
                    <Tr key={i.id}>
                      <Td className="max-w-[240px] truncate font-semibold">
                        {i.nome}
                      </Td>
                      <Td className="tabular">{i.nif || "—"}</Td>
                      <Td className="text-texto-suave">{i.atividade || "—"}</Td>
                      <Td numerico>{numeroLimpo(i.taxa_ret)} %</Td>
                      <Td>
                        <Selo
                          cor={i.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {i.estado === "activo" ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                      {podeGerir && (
                        <Td numerico>
                          <AccoesDaLinha
                            nome={i.nome}
                            aoEditar={() => setEmEdicao(i)}
                            aoApagar={() => setAApagar(i)}
                          />
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          )}
        </Cartao>
      ) : (
        <>
          <BarraFiltros className="mb-4">
            <Selector
              rotulo="Mês"
              valor={mes}
              aoMudar={(m) => {
                setMes(m);
                pag.reiniciar();
              }}
              opcoes={ultimosMeses().map((m) => ({
                valor: m,
                rotulo: mesPorExtenso(m),
              }))}
              larguraMinima="14rem"
            />
          </BarraFiltros>

          <Cartao className="p-0">
            <TituloCartao className="px-5 pt-5" extra={mesPorExtenso(mes)}>
              Honorários processados
            </TituloCartao>
            {isLoading ? (
              <ACarregar />
            ) : !honorarios.length ? (
              <Vazio>Sem honorários processados.</Vazio>
            ) : (
              <>
                <EnvolveTabela className="rounded-none border-0 border-t">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Data</Th>
                        <Th>Independente</Th>
                        <Th>Descrição</Th>
                        <Th numerico>Bruto</Th>
                        <Th numerico>Retenção</Th>
                        <Th numerico>Líquido</Th>
                        <Th>Lançamento</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {honorarios.map((h) => (
                        <Tr key={h.id}>
                          <Td className="tabular">
                            {new Date(h.data).toLocaleDateString("pt-PT")}
                          </Td>
                          <Td className="max-w-[200px] truncate font-semibold">
                            {h.nome}
                          </Td>
                          <Td className="max-w-[240px] truncate text-texto-suave">
                            {h.descricao || "—"}
                          </Td>
                          <Td numerico>{formataMoeda(h.bruto, moeda)}</Td>
                          <Td numerico>
                            {formataMoeda(h.retencao, moeda)}
                            <span className="ml-1 text-xs text-texto-suave">
                              ({numeroLimpo(h.taxa)} %)
                            </span>
                          </Td>
                          <Td numerico className="font-bold">
                            {formataMoeda(h.liquido, moeda)}
                          </Td>
                          <Td className="tabular text-texto-suave">
                            {h.lancamento_id ? (
                              <Link
                                href={`/contabilidade/movimentos?id=${h.lancamento_id}`}
                                className="font-semibold text-marca"
                              >
                                {h.numero_op || "Ver"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {/* Os totais são do mês filtrado, não da página. */}
                      <tr className="border-t-2 border-borda font-bold">
                        <Td>Totais</Td>
                        <Td />
                        <Td />
                        <Td numerico>{formataMoeda(totais.bruto, moeda)}</Td>
                        <Td numerico>{formataMoeda(totais.retencao, moeda)}</Td>
                        <Td numerico>{formataMoeda(totais.liquido, moeda)}</Td>
                        <Td />
                      </tr>
                    </tfoot>
                  </Tabela>
                </EnvolveTabela>
                <BarraPaginacao
                  pagina={pagina}
                  {...pag.controlos}
                  nome="honorários"
                />
              </>
            )}
          </Cartao>
        </>
      )}

      {(novoAberto || emEdicao) && (
        <FormularioIndependente
          registo={emEdicao}
          aoFechar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
            mutate();
          }}
        />
      )}

      {honorarioAberto && (
        <FormularioHonorario
          independentes={(independentes ?? []).filter(
            (i) => i.estado !== "inactivo",
          )}
          mes={mes}
          moeda={moeda}
          aoFechar={() => setHonorarioAberto(false)}
          aoGravar={(msg) => {
            setHonorarioAberto(false);
            setAviso(msg);
            setAba("honorarios");
            mutateHon();
          }}
        />
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar ${aApagar?.nome ?? ""}?`}
        aoConfirmar={eliminar}
      >
        A ficha desaparece. Quem já tem honorários processados não pode ser
        eliminado — o IRT retido foi entregue ao Estado em nome dele; nesse
        caso, ponha o estado a inactivo.
      </ConfirmarEliminar>
    </>
  );
}

function FormularioIndependente({
  registo,
  aoFechar,
  aoGravar,
}: {
  registo: Independente | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = registo === null;
  const [campos, setCampos] = useState({
    nome: registo?.nome ?? "",
    nif: registo?.nif ?? "",
    atividade: registo?.atividade ?? "",
    taxa_ret: registo?.taxa_ret ?? "6.5",
    estado: registo?.estado ?? "activo",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    const corpo = {
      ...campos,
      nome: campos.nome.trim(),
      nif: campos.nif.trim() || null,
      atividade: campos.atividade.trim() || null,
    };
    try {
      if (novo) await api.post("/api/rh/independentes", corpo);
      else await api.patch(`/api/rh/independentes/${registo.id}`, corpo);
      aoGravar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal
      titulo={novo ? "Novo independente" : `Editar ${registo.nome}`}
      aoFechar={aoFechar}
    >
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Campo rotulo="Nome">
          <Entrada
            value={campos.nome}
            onChange={(e) => setCampos((c) => ({ ...c, nome: e.target.value }))}
            required
            autoFocus
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNif
            rotulo="NIF"
            valor={campos.nif}
            aoMudar={(v) => setCampos((c) => ({ ...c, nif: v }))}
            aoConfirmar={(r) =>
              setCampos((c) => ({
                ...c,
                nif: r.nif || c.nif,
                nome: r.nome && !c.nome.trim() ? r.nome : c.nome,
              }))
            }
          />
          <Campo
            rotulo="Retenção IRT (%)"
            dica="6,5% é a taxa corrente para prestação de serviços."
          >
            <Entrada
              type="number"
              step="0.5"
              min="0"
              value={campos.taxa_ret}
              onChange={(e) =>
                setCampos((c) => ({ ...c, taxa_ret: e.target.value }))
              }
              className="text-right tabular"
            />
          </Campo>
        </div>
        <Campo rotulo="Actividade">
          <Entrada
            value={campos.atividade}
            onChange={(e) =>
              setCampos((c) => ({ ...c, atividade: e.target.value }))
            }
          />
        </Campo>
        <Selector
          rotulo="Estado"
          valor={campos.estado}
          aoMudar={(v) => setCampos((c) => ({ ...c, estado: v }))}
          opcoes={[
            { valor: "activo", rotulo: "Activo" },
            { valor: "inactivo", rotulo: "Inactivo" },
          ]}
          larguraMinima="100%"
        />

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            type="submit"
            variante="primario"
            disabled={aGravar}
            motivoBloqueio={aGravar ? "A gravar — aguarde." : undefined}
          >
            {aGravar ? "A gravar…" : "Guardar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormularioHonorario({
  independentes,
  mes,
  moeda,
  aoFechar,
  aoGravar,
}: {
  independentes: Independente[];
  mes: string;
  moeda: string;
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const { activo } = useExercicios();
  const [independenteId, setIndependenteId] = useState(
    independentes[0]?.id ?? "",
  );
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const escolhido = independentes.find((i) => i.id === independenteId);
  // Pré-visualização com a taxa da ficha — o valor definitivo é o que o
  // backend calcular, mas mostrar antes evita a surpresa no líquido.
  const previsao = useMemo(() => {
    if (!escolhido) return null;
    const bruto = big(valor || "0");
    const retencao = bruto.times(big(escolhido.taxa_ret)).div(100).round(2);
    return { bruto, retencao, liquido: bruto.minus(retencao) };
  }, [escolhido, valor]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!independenteId) return setErro("Escolha o independente.");
    if (!Number(valor)) return setErro("Indique um valor válido.");
    setAGravar(true);
    try {
      const r = await api.post<{ liquido: string; numero_op?: string }>(
        "/api/rh/honorarios",
        {
          independente_id: independenteId,
          valor,
          data,
          mes,
          descricao: descricao.trim() || null,
          exercicio_id: activo?.id,
        },
      );
      aoGravar(
        `Honorário processado — líquido de ${formataMoeda(r.liquido, moeda)}${r.numero_op ? ` · lançamento ${r.numero_op}` : ""}.`,
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível processar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal titulo="Processar honorário" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Selector
          rotulo="Independente"
          valor={independenteId}
          aoMudar={setIndependenteId}
          opcoes={independentes.map((i) => ({
            valor: i.id,
            rotulo: `${i.nome} (${numeroLimpo(i.taxa_ret)} %)`,
          }))}
          placeholder="Escolher independente…"
          larguraMinima="100%"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor bruto">
            <Entrada
              type="number"
              step="1000"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="text-right tabular"
              required
            />
          </Campo>
          <Campo rotulo="Data">
            <Entrada
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <Entrada
            value={descricao}
            placeholder="Ex.: Serviços de consultoria — Julho"
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>

        {/* Retenção e líquido ao fundo, como no Piloto. */}
        <div className="flex flex-wrap justify-end gap-5 rounded-xl border border-borda bg-fundo px-4 py-2.5 text-sm">
          <span className="text-texto-suave">
            Retenção{escolhido ? ` (${numeroLimpo(escolhido.taxa_ret)} %)` : ""}{" "}
            <b className="tabular text-texto">
              {formataMoeda(previsao?.retencao ?? "0", moeda)}
            </b>
          </span>
          <span className="text-texto-suave">
            Líquido{" "}
            <b className="tabular text-texto">
              {formataMoeda(previsao?.liquido ?? "0", moeda)}
            </b>
          </span>
        </div>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            type="submit"
            variante="primario"
            disabled={aGravar}
            motivoBloqueio={aGravar ? "A processar — aguarde." : undefined}
          >
            {aGravar ? "A processar…" : "Processar e lançar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  // A JANELA NÃO SE FECHA POR ACIDENTE: carregar fora deixou de a fechar,
  // e o `Esc`, o X e o «Cancelar» perguntam quando já lá há dados por
  // gravar. Ver `components/ui/GuardaDeSaida.tsx`.
  const guarda = useGuardaDeSaida({ aoFechar });

  return (
    <Dialog.Root open onOpenChange={(a) => !a && guarda.tentarFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          {...guarda.propsDoConteudo}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
            </Dialog.Title>
            <button
              onClick={guarda.tentarFechar}
              type="button"
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
            >
              <X size={15} />
            </button>
          </div>
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
