"use client";

import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import { CampoConta } from "@/components/contabilidade/CampoConta";
import {
  ACarregar,
  Alerta,
  Botao,
  Campo,
  Entrada,
  Selo,
  Vazio,
} from "@/components/ui";
import { type Coluna, Grelha } from "@/components/ui/Grelha";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import type { Ativo, ItemImobilizado } from "@/types";

/* ---------------------------------------------------------------------------
   A obra em curso: o que já custou, e o fecho.

   UMA OBRA NÃO SE COMPRA DE UMA VEZ. Compra-se o terreno, paga-se a licença,
   contrata-se a empreitada, acrescenta-se a instalação eléctrica. Cada uma
   dessas é um item, com a sua data e o seu documento — e o que a obra custou é
   a soma deles.

   Guardar só o total dava um número sem história: quem abrisse a ficha seis
   meses depois não sabia de onde vinham os oito milhões, nem podia corrigir
   uma parcela sem refazer a conta toda.

   O FECHO É O MOMENTO EM QUE O ACTIVO PASSA A EXISTIR. Até lá não amortiza,
   porque não há património nenhum a desgastar-se — há uma obra a decorrer.
--------------------------------------------------------------------------- */

interface Resposta {
  linhas: ItemImobilizado[];
  total: string;
  em_curso: boolean;
}

const CLASSE_DO_TIPO: Record<string, { classe: string; nome: string }> = {
  corporeo: { classe: "11", nome: "Imobilizações Corpóreas" },
  incorporeo: { classe: "12", nome: "Imobilizações Incorpóreas" },
  financeiro: { classe: "13", nome: "Investimentos Financeiros" },
};

export function ObraEmCurso({
  ativo,
  moeda,
  podeGerir,
  aoFechar,
  aoMudar,
}: {
  ativo: Ativo;
  moeda: string;
  podeGerir: boolean;
  aoFechar: () => void;
  /** Chamado quando a obra fecha — a listagem por trás tem de recarregar. */
  aoMudar: () => void;
}) {
  const chave = `/api/imobilizados/ativos/${ativo.id}/itens`;
  const { data, isLoading, mutate } = useSWR<Resposta>(chave, buscador);

  const [aFechar, setAFechar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const destino = CLASSE_DO_TIPO[ativo.tipo_imobilizado ?? ""];
  const total = data?.total ?? "0";
  const semItens = !data?.linhas.length;

  async function apagarItem(id: string) {
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`/api/imobilizados/ativos/${ativo.id}/itens/${id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível apagar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  const colunas: Coluna<ItemImobilizado>[] = [
    {
      chave: "data",
      titulo: "Data",
      // Filtra-se por `10/03`, que é o que está à vista; ordena-se pela data
      // verdadeira, senão Março vinha antes de Janeiro.
      valor: (i) => new Date(i.data).toLocaleDateString("pt-PT"),
      ordem: (i) => i.data,
      largura: "115px",
      celula: (i) => (
        <span className="tabular">
          {new Date(i.data).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      chave: "descricao",
      titulo: "Descrição",
      valor: (i) => i.descricao,
      celula: (i) => <span className="font-semibold">{i.descricao}</span>,
    },
    {
      chave: "fornecedor",
      titulo: "Fornecedor",
      valor: (i) => i.fornecedor ?? "",
      celula: (i) => i.fornecedor || "—",
    },
    {
      chave: "documento",
      titulo: "Documento",
      valor: (i) => i.documento ?? "",
      largura: "140px",
      celula: (i) => (
        <span className="tabular text-texto-suave">{i.documento || "—"}</span>
      ),
    },
    {
      chave: "valor",
      titulo: "Valor",
      tipo: "numero",
      valor: (i) => Number(i.valor),
      celula: (i) => (
        <span className="font-semibold">{formataMoeda(i.valor, moeda)}</span>
      ),
    },
  ];

  if (podeGerir && ativo.em_curso) {
    colunas.push({
      chave: "accoes",
      titulo: " ",
      largura: "60px",
      celula: (i) => (
        <button
          type="button"
          onClick={() => apagarItem(i.id)}
          disabled={ocupado}
          aria-label={`Apagar ${i.descricao}`}
          title="Apagar este item"
          className="rounded-md border border-borda px-2 py-1 text-texto-suave hover:border-perigo hover:text-perigo"
        >
          <Trash2 size={13} />
        </button>
      ),
    });
  }

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
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(920px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-start justify-between gap-4 border-b border-borda px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
                <span className="tabular">{ativo.codigo}</span>
                <span className="truncate">{ativo.designacao}</span>
                {ativo.em_curso ? (
                  <Selo cor="#c98a10">Em curso</Selo>
                ) : (
                  <Selo cor="#1a9c5f">Transferido</Selo>
                )}
              </Dialog.Title>
              <p className="mt-0.5 text-[12.5px] text-texto-suave">
                {ativo.conta_imob ? (
                  <>
                    Acumula na conta{" "}
                    <b className="tabular text-texto">{ativo.conta_imob}</b>
                  </>
                ) : (
                  "Sem conta própria — grave a ficha para lha atribuir."
                )}
              </p>
            </div>
            <button
              onClick={guarda.tentarFechar}
              type="button"
              aria-label="Fechar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
            >
              <X size={15} />
            </button>
          </div>

          <div className="min-w-0 flex-1 overflow-auto p-5">
            {erro && (
              <Alerta tipo="erro" className="mb-3">
                {erro}
              </Alerta>
            )}

            {isLoading ? (
              <ACarregar />
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-borda bg-superficie-2 px-4 py-3">
                  <span className="text-[12.5px] font-bold uppercase tracking-[0.4px] text-texto-suave">
                    Já custou
                  </span>
                  <b className="tabular text-[22px]">
                    {formataMoeda(total, moeda)}
                  </b>
                </div>

                {semItens ? (
                  <Vazio>
                    Ainda não há custos registados. Acrescente o primeiro abaixo
                    — o terreno, o adiantamento, a primeira factura da
                    empreitada.
                  </Vazio>
                ) : (
                  <Grelha
                    linhas={data?.linhas ?? []}
                    colunas={colunas}
                    chaveDaLinha={(i) => i.id}
                    altura={300}
                    vazio="Sem itens."
                  />
                )}

                {podeGerir && ativo.em_curso && (
                  <FormularioItem
                    ativoId={ativo.id}
                    aoJuntar={() => mutate()}
                  />
                )}
              </>
            )}
          </div>

          {podeGerir && ativo.em_curso && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-5 py-3.5">
              <p className="max-w-[38rem] text-[12.5px] leading-relaxed text-texto-suave">
                Ao fechar, o valor acumulado é transferido para a conta de
                imobilizado que indicar
                {destino && (
                  <>
                    {" "}
                    — dentro de{" "}
                    <b className="tabular text-texto">{destino.classe}</b>{" "}
                    {destino.nome}
                  </>
                )}
                . O lançamento fica <b>à espera da contabilidade</b>: só conta
                no balancete depois de integrado.
              </p>
              <Botao
                variante="primario"
                onClick={() => setAFechar(true)}
                disabled={semItens || !ativo.tipo_imobilizado}
                motivoBloqueio={
                  !ativo.tipo_imobilizado
                    ? "Indique o tipo de imobilizado na ficha — é ele que determina para que classe de contas a obra é transferida."
                    : semItens
                      ? "A obra ainda não tem custos registados. Não há valor nenhum a transferir."
                      : undefined
                }
              >
                <CheckCircle2 size={16} />
                Fechar e transferir
              </Botao>
            </div>
          )}

          {aFechar && (
            <DialogoFecho
              ativo={ativo}
              total={total}
              moeda={moeda}
              aoCancelar={() => setAFechar(false)}
              aoConcluir={() => {
                setAFechar(false);
                mutate();
                aoMudar();
              }}
            />
          )}

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Acrescentar um custo à obra. */
function FormularioItem({
  ativoId,
  aoJuntar,
}: {
  ativoId: string;
  aoJuntar: () => void;
}) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aJuntar, setAJuntar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!descricao.trim()) return setErro("Descreva o custo.");
    if (!(Number(valor) > 0))
      return setErro("O valor tem de ser maior do que zero.");

    setAJuntar(true);
    try {
      await api.post(`/api/imobilizados/ativos/${ativoId}/itens`, {
        data,
        descricao: descricao.trim(),
        valor,
        fornecedor: fornecedor.trim() || null,
        documento: documento.trim() || null,
      });
      // Limpa o que muda de item para item; a data fica, porque quem lança
      // três facturas do mesmo mês não a quer escrever três vezes.
      setDescricao("");
      setValor("");
      setFornecedor("");
      setDocumento("");
      aoJuntar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível acrescentar o item.",
      );
    } finally {
      setAJuntar(false);
    }
  }

  return (
    <form
      onSubmit={submeter}
      className="mt-4 rounded-xl border border-borda p-4"
    >
      <div className="mb-3 text-[13.5px] font-bold">Acrescentar um custo</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Data">
          <Entrada
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </Campo>
        <Campo rotulo="Descrição" className="lg:col-span-2">
          <Entrada
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Terreno, licença, empreitada…"
            required
          />
        </Campo>
        <Campo rotulo="Valor">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="text-right tabular"
            required
          />
        </Campo>
        <Campo rotulo="Fornecedor" dica="Opcional.">
          <Entrada
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Documento" dica="A factura, o auto de medição.">
          <Entrada
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            className="tabular"
          />
        </Campo>
      </div>

      {erro && (
        <Alerta tipo="erro" className="mt-3">
          {erro}
        </Alerta>
      )}

      <div className="mt-3 flex justify-end">
        <Botao type="submit" variante="neutro" disabled={aJuntar}>
          <Plus size={15} />
          {aJuntar ? "A juntar…" : "Juntar à obra"}
        </Botao>
      </div>
    </form>
  );
}

/** A confirmação do fecho, onde se escolhe a conta de destino. */
function DialogoFecho({
  ativo,
  total,
  moeda,
  aoCancelar,
  aoConcluir,
}: {
  ativo: Ativo;
  total: string;
  moeda: string;
  aoCancelar: () => void;
  aoConcluir: () => void;
}) {
  const destino = CLASSE_DO_TIPO[ativo.tipo_imobilizado ?? ""];
  const [conta, setConta] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setErro(null);
    if (!conta) return setErro("Escolha a conta de imobilizado de destino.");
    setOcupado(true);
    try {
      await api.post(`/api/imobilizados/ativos/${ativo.id}/fechar`, {
        conta_destino: conta,
        data,
      });
      aoConcluir();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível fechar a obra.",
      );
    } finally {
      setOcupado(false);
    }
  }

  // A JANELA NÃO SE FECHA POR ACIDENTE: carregar fora deixou de a fechar,
  // e o `Esc`, o X e o «Cancelar» perguntam quando já lá há dados por
  // gravar. Ver `components/ui/GuardaDeSaida.tsx`.
  const guarda = useGuardaDeSaida({ aoFechar: aoCancelar });

  return (
    <Dialog.Root open onOpenChange={(a) => !a && guarda.tentarFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          {...guarda.propsDoConteudo}
          className="fixed left-1/2 top-1/2 z-[60] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Fechar e transferir para o património
            </Dialog.Title>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="text-[13px] leading-relaxed text-texto-suave">
              Vai transferir{" "}
              <b className="tabular text-texto">{formataMoeda(total, moeda)}</b>{" "}
              da conta <b className="tabular text-texto">{ativo.conta_imob}</b>{" "}
              para a conta de imobilizado que indicar. A partir daí o bem passa
              a amortizar.
            </p>

            <Campo
              rotulo="Conta de imobilizado"
              dica={
                destino
                  ? `Tem de ser da classe ${destino.classe} — ${destino.nome}.`
                  : "F4 para procurar no plano de contas."
              }
            >
              <CampoConta valor={conta} aoMudar={setConta} />
            </Campo>

            <Campo rotulo="Data da transferência">
              <Entrada
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </Campo>

            <Alerta tipo="info">
              O lançamento fica <b>à espera da contabilidade</b>: existe e
              vê-se, mas só conta no balancete e nos mapas depois de ser
              integrado.
            </Alerta>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </div>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao variante="contorno" onClick={aoCancelar} disabled={ocupado}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={confirmar} disabled={ocupado}>
              {ocupado ? "A transferir…" : "Confirmar transferência"}
            </Botao>
          </div>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
