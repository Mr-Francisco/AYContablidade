"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import { CampoConta } from "@/components/contabilidade/CampoConta";
import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { Interruptor } from "@/components/ui/Interruptor";
import { api, buscador, ErroApi } from "@/lib/api";
import type { Ativo } from "@/types";

/* ---------------------------------------------------------------------------
   A ficha de um bem do imobilizado, e a barra que mostra quanto já amortizou.

   ESTAVAM DENTRO DA PÁGINA DOS ACTIVOS, e saíram de lá porque passaram a ser
   precisas em dois sítios: na Ficha de Ativos, que é o registo completo, e no
   separador dos Imobilizados em Curso, que é onde se acompanha uma obra até
   ela passar a bem. Copiá-las era garantir que as duas divergiam à primeira
   correcção — e uma ficha de imobilizado que difere consoante a porta por onde
   se entra é um erro que só se descobre a comparar dois ecrãs.
--------------------------------------------------------------------------- */

export function BarraProgresso({ valor }: { valor: number }) {
  const pc = Math.max(0, Math.min(100, valor));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-borda"
        role="img"
        aria-label={`${pc}% amortizado`}
      >
        <div
          className="h-full rounded-full bg-marca transition-[width]"
          style={{ width: `${pc}%` }}
        />
      </div>
      <span className="tabular text-xs text-texto-suave">{pc}%</span>
    </div>
  );
}

export function FichaAtivo({
  ativo,
  aoFechar,
  aoGravar,
  nasceEmCurso = false,
}: {
  ativo: Ativo | null;
  aoFechar: () => void;
  aoGravar: () => void;
  /** Abre já marcada como obra em curso. É o que o separador dos
   *  Imobilizados em Curso usa: quem entra por ali vai criar uma obra, e
   *  obrigá-lo a ligar o interruptor de cada vez era um passo a mais que
   *  ninguém quer. */
  nasceEmCurso?: boolean;
}) {
  const { data: metodos } = useSWR<{ cod: string; nome: string }[]>(
    "/api/imobilizados/metodos",
    buscador,
    { revalidateOnFocus: false },
  );

  const [campos, setCampos] = useState({
    codigo: ativo?.codigo ?? "",
    designacao: ativo?.designacao ?? "",
    fornecedor: ativo?.fornecedor ?? "",
    conta_imob: ativo?.conta_imob ?? "",
    conta_amort_acum: ativo?.conta_amort_acum ?? "",
    conta_custo_amort: ativo?.conta_custo_amort ?? "",
    data_aquisicao:
      ativo?.data_aquisicao ?? new Date().toISOString().slice(0, 10),
    valor_aquisicao: ativo?.valor_aquisicao ?? "0",
    taxa: ativo?.taxa ?? "20",
    metodo: ativo?.metodo ?? "quotas",
    amort_acumulada: ativo?.amort_acumulada ?? "0",
    estado: ativo?.estado ?? "activo",
    tipo_imobilizado: ativo?.tipo_imobilizado ?? "",
    condicoes_texto: ativo?.condicoes_texto ?? "",
    valor_sujeito_amortizacao: ativo?.valor_sujeito_amortizacao ?? "",
  });
  // Os três interruptores. Fora do `campos` porque são booleanos e aquele
  // guarda texto — misturá-los obrigava a converter em todos os sítios.
  const [naoAmortizavel, setNaoAmortizavel] = useState(
    ativo?.nao_amortizavel ?? false,
  );
  const [condicoesEspeciais, setCondicoesEspeciais] = useState(
    ativo?.condicoes_especiais ?? false,
  );
  const [emCurso, setEmCurso] = useState(ativo?.em_curso ?? nasceEmCurso);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  // Pré-visualização da quota. Nas quotas constantes incide sobre o valor de
  // aquisição; nas decrescentes sobre o que ainda falta amortizar, e por isso
  // desce todos os anos — mostrar isto evita a surpresa no primeiro mapa.
  const previsao = useMemo(() => {
    const bruto = Number(campos.valor_aquisicao) || 0;
    const taxa = Number(campos.taxa) || 0;
    const acum = Number(campos.amort_acumulada) || 0;
    if (!bruto || !taxa) return null;
    const liquido = bruto - acum;
    const anos = 100 / taxa;
    const coef = anos <= 5 ? 1.5 : anos <= 6 ? 2 : 2.5;
    const anual =
      campos.metodo === "degressivas"
        ? (liquido * taxa * coef) / 100
        : (bruto * taxa) / 100;
    return {
      anual,
      mensal: anual / 12,
      anos: anos.toFixed(1),
      coef: campos.metodo === "degressivas" ? coef : null,
    };
  }, [
    campos.valor_aquisicao,
    campos.taxa,
    campos.metodo,
    campos.amort_acumulada,
  ]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!campos.designacao.trim()) return setErro("Indique a designação.");
    // O TIPO DECIDE AS CONTAS — a de compra, a de acumulação em curso e a
    // classe de destino. Sem ele, um imobilizado em curso não tem onde
    // acumular, e isso só se descobria ao tentar fechar a obra.
    if (emCurso && !campos.tipo_imobilizado) {
      return setErro(
        "Escolha o tipo de imobilizado. É ele que determina em que conta a obra vai acumular.",
      );
    }
    setAGravar(true);
    const corpo = {
      ...campos,
      codigo: campos.codigo.trim() || null,
      designacao: campos.designacao.trim(),
      fornecedor: campos.fornecedor.trim() || null,
      conta_imob: campos.conta_imob || null,
      conta_amort_acum: campos.conta_amort_acum || null,
      conta_custo_amort: campos.conta_custo_amort || null,
      data_aquisicao: campos.data_aquisicao || null,
      tipo_imobilizado: campos.tipo_imobilizado || null,
      nao_amortizavel: naoAmortizavel,
      condicoes_especiais: condicoesEspeciais,
      // Desligar as condições especiais limpa o que lá estava: um valor
      // esquecido a mandar no cálculo sem aparecer em lado nenhum é a pior
      // espécie de campo escondido.
      condicoes_texto: condicoesEspeciais
        ? campos.condicoes_texto.trim() || null
        : null,
      valor_sujeito_amortizacao:
        condicoesEspeciais && campos.valor_sujeito_amortizacao !== ""
          ? campos.valor_sujeito_amortizacao
          : null,
      em_curso: emCurso,
    };
    try {
      if (ativo) await api.patch(`/api/imobilizados/ativos/${ativo.id}`, corpo);
      else await api.post("/api/imobilizados/ativos", corpo);
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
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(780px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            {/* O TÍTULO DIZ O QUE SE ESTÁ A CRIAR. Quem entra pelo separador
                dos Imobilizados em Curso vai criar uma obra, e uma janela a
                dizer «Novo activo» punha-o a duvidar se estava no sítio
                certo. */}
            <Dialog.Title className="text-[15px] font-bold">
              {ativo
                ? `Editar ${ativo.codigo}`
                : nasceEmCurso
                  ? "Nova obra em curso"
                  : "Novo activo"}
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

          <form
            {...guarda.propsDoFormulario}
            onSubmit={submeter}
            id="form-ativo"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Código" dica="Em branco atribui o próximo livre.">
                <Entrada
                  value={campos.codigo}
                  onChange={(e) => alterar("codigo", e.target.value)}
                  disabled={!!ativo}
                  className="tabular"
                />
              </Campo>
              <Selector
                rotulo="Estado"
                valor={campos.estado}
                aoMudar={(v) => alterar("estado", v)}
                opcoes={[
                  { valor: "activo", rotulo: "Activo" },
                  { valor: "abatido", rotulo: "Abatido" },
                ]}
              />
              <Campo rotulo="Designação" className="sm:col-span-2">
                <Entrada
                  value={campos.designacao}
                  onChange={(e) => alterar("designacao", e.target.value)}
                  required
                  autoFocus
                />
              </Campo>
              {/* O TIPO DECIDE AS CONTAS: a de compra dentro de `371`, a de
                  acumulação em curso (`141`/`142`/`143`) e a classe para onde
                  a obra é transferida (`11`/`12`/`13`). Fica ao lado da
                  designação porque é uma decisão do início, não um detalhe. */}
              <Selector
                rotulo="Tipo de imobilizado"
                valor={campos.tipo_imobilizado}
                aoMudar={(v) => alterar("tipo_imobilizado", v)}
                opcoes={[
                  { valor: "", rotulo: "Por indicar" },
                  { valor: "corporeo", rotulo: "Imobilizado Corpóreo" },
                  { valor: "incorporeo", rotulo: "Imobilizado Incorpóreo" },
                  { valor: "financeiro", rotulo: "Investimento Financeiro" },
                ]}
              />
              <Campo rotulo="Fornecedor">
                <Entrada
                  value={campos.fornecedor}
                  onChange={(e) => alterar("fornecedor", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Data de aquisição">
                <Entrada
                  type="date"
                  value={campos.data_aquisicao}
                  onChange={(e) => alterar("data_aquisicao", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Valor de aquisição">
                <Entrada
                  type="number"
                  step="0.01"
                  min="0"
                  value={campos.valor_aquisicao}
                  onChange={(e) => alterar("valor_aquisicao", e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
              <Campo
                rotulo="Amortização acumulada"
                dica="Só para bens que já vêm amortizados de outro sistema."
              >
                <Entrada
                  type="number"
                  step="0.01"
                  min="0"
                  value={campos.amort_acumulada}
                  onChange={(e) => alterar("amort_acumulada", e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
              <Campo rotulo="Taxa anual (%)">
                <Entrada
                  type="number"
                  step="0.01"
                  min="0"
                  value={campos.taxa}
                  onChange={(e) => alterar("taxa", e.target.value)}
                  className="text-right tabular"
                />
              </Campo>
              <Selector
                rotulo="Método"
                valor={campos.metodo}
                aoMudar={(v) => alterar("metodo", v)}
                opcoes={(metodos ?? []).map((m) => ({
                  valor: m.cod,
                  rotulo: m.nome,
                }))}
              />
            </div>

            {previsao && (
              <Alerta tipo="info" className="mt-3">
                Vida útil estimada de <b>{previsao.anos} anos</b>. Quota anual{" "}
                <b className="tabular">{previsao.anual.toFixed(2)}</b>, mensal{" "}
                <b className="tabular">{previsao.mensal.toFixed(2)}</b>.
                {previsao.coef
                  ? ` Nas quotas decrescentes a taxa é multiplicada pelo coeficiente ${previsao.coef} e incide sobre o valor ainda por amortizar, pelo que a quota desce todos os anos.`
                  : " Nas quotas constantes a quota incide sempre sobre o valor de aquisição."}
              </Alerta>
            )}

            {/* OS TRÊS INTERRUPTORES, e cada um muda o que o activo faz.
                Ficam juntos porque respondem à mesma pergunta — como é que
                este bem amortiza — e separá-los obrigava a procurar em três
                sítios a resposta a uma coisa só. */}
            <div className="mt-4 grid gap-2.5">
              <Interruptor
                ligado={emCurso}
                aoMudar={setEmCurso}
                titulo="Imobilizado em curso"
                notaLigado="O bem ainda está a ser construído ou adquirido. Acumula itens e NÃO amortiza até ser fechado e transferido para o património."
                notaDesligado="O bem já faz parte do património e amortiza pelas regras acima."
                desactivado={Boolean(ativo && !ativo.em_curso)}
              />

              <Interruptor
                ligado={naoAmortizavel}
                aoMudar={setNaoAmortizavel}
                titulo="Imobilizado não amortizável"
                notaLigado="Este bem NÃO amortiza, mesmo com taxa preenchida. É o caso dos terrenos."
                notaDesligado="O bem amortiza pela taxa e pelo método indicados."
              />

              <Interruptor
                ligado={condicoesEspeciais}
                aoMudar={setCondicoesEspeciais}
                titulo="Condições especiais de amortização"
                notaLigado="A amortização incide apenas sobre o valor indicado abaixo. A parte restante fica no activo e nunca amortiza."
                notaDesligado="A amortização incide sobre o valor de aquisição."
              />
            </div>

            {/* A ABA DAS CONDIÇÕES ESPECIAIS. Só aparece quando são ligadas —
                um campo de valor sujeito a amortização sempre à vista, quase
                sempre vazio, é ruído em todas as fichas normais. */}
            {condicoesEspeciais && (
              <div className="mt-3 rounded-xl border border-marca/40 bg-marca/[0.04] p-4">
                <div className="mb-3 text-[13.5px] font-bold">
                  Condições especiais
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Valor sujeito a amortização"
                    dica="Em branco, amortiza o valor de aquisição inteiro."
                    className="sm:col-span-1"
                  >
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.valor_sujeito_amortizacao}
                      onChange={(e) =>
                        alterar("valor_sujeito_amortizacao", e.target.value)
                      }
                      placeholder={campos.valor_aquisicao}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo
                    rotulo="Porquê"
                    dica="Fica na ficha, para quem a ler daqui a um ano."
                    className="sm:col-span-2"
                  >
                    <textarea
                      value={campos.condicoes_texto}
                      onChange={(e) =>
                        alterar("condicoes_texto", e.target.value)
                      }
                      rows={3}
                      placeholder="Ex.: o terreno onde o edifício assenta não é amortizável e representa 40% do valor de aquisição."
                      className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-acento"
                    />
                  </Campo>
                </div>
              </div>
            )}

            {/* TRÊS CAMPOS DE CONTA, e não três caixas de opções.
                Cada caixa desenhava o plano de contas inteiro — mil e
                seiscentas entradas, três vezes, quase cinco mil elementos numa
                janela só. Abria devagar e obrigava a rolar até encontrar.

                O `CampoConta` é o que a Produção já usa nos lançamentos e no
                extracto, e é o que o Piloto faz: escreve-se o código de cor, ou
                carrega-se em F4 e procura-se na árvore. Valida enquanto se
                escreve e diz o nome da conta por baixo. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Conta do imobilizado" dica="F4 procura">
                <CampoConta
                  valor={campos.conta_imob}
                  aoMudar={(v) => alterar("conta_imob", v)}
                />
              </Campo>
              <Campo rotulo="Amortizações acumuladas" dica="F4 procura">
                <CampoConta
                  valor={campos.conta_amort_acum}
                  aoMudar={(v) => alterar("conta_amort_acum", v)}
                />
              </Campo>
              <Campo rotulo="Custo da amortização" dica="F4 procura">
                <CampoConta
                  valor={campos.conta_custo_amort}
                  aoMudar={(v) => alterar("conta_custo_amort", v)}
                />
              </Campo>
            </div>
            <p className="mt-2 text-xs text-texto-suave">
              Sem a conta de custo e a de amortizações acumuladas, o activo
              amortiza na ficha mas não gera lançamento — a amortização fica de
              fora da contabilidade.
            </p>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={guarda.tentarFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-ativo"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar activo"}
            </Botao>
          </div>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
