"use client";

import { CheckCircle2, FilePlus2, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { CriarContaEmFalta } from "@/components/contabilidade/CriarContaEmFalta";
import { Botao, CabecalhoPagina, Selector } from "@/components/ui";
import { Confirmar } from "@/components/ui/CrudMestre";
import { type Pagina, usePaginacao } from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda, paraApi, soma, subtrai } from "@/lib/dinheiro";
import { useDiarios, useDocumentos, useExercicios } from "@/lib/hooks";
import type { Lancamento } from "@/types";
import {
  CONTA_MONETARIA,
  EditorLancamento,
  SeloEstado,
} from "./EditorLancamento";
import { linhaPreenchida } from "./GrelhaGeral";
import { ListaLancamentos } from "./ListaLancamentos";
import { type EstadoEditor, estadoDe, estadoNovo, linhaVazia } from "./tipos";

/**
 * Quantos movimentos se pedem de cada vez.
 *
 * Eram MIL, o que numa empresa com dois anos de actividade é meio megabyte de
 * JSON a cada abertura do ecrã mais usado do sistema. Passam a cinquenta, com
 * paginação — a regra de listagens do projecto (ver `CLAUDE.md`).
 */
/** Dez por página na lista lateral, como pedido: é o que cabe sem a coluna
 *  crescer para lá do editor ao lado. */
const LIMITE_PEDIDO = 10;

/**
 * Movimentos — o editor em página do Piloto (`movimentos.html`).
 *
 * Não é uma lista com um modal por cima: é uma barra de acções, a lista dos
 * movimentos à esquerda e o editor à direita. Carregar num movimento traz-lho
 * para o editor; `Novo` limpa mas **guarda o diário e o documento**, porque
 * quem lança vinte compras seguidas não quer voltar a escolhê-los vinte vezes.
 *
 * O SELO DE ESTADO à direita da barra é o que diz porque é que `Gravar` está
 * apagado, e segue a ordem do Piloto: primeiro o diário, depois o documento,
 * depois o fluxo de caixa das contas monetárias, e só então o equilíbrio.
 * Um botão desactivado sem explicação é uma parede; com o motivo à vista é uma
 * indicação.
 */
export default function Movimentos() {
  const { pode } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { diarios } = useDiarios();

  const podeLancar = pode("contab.lancar");

  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [filtroDiario, setFiltroDiario] = useState("");
  const [procura, setProcura] = useState("");
  const [soDiferidos, setSoDiferidos] = useState(false);

  const [estado, setEstado] = useState<EstadoEditor>(() => estadoNovo());
  const [erro, setErro] = useState<string | null>(null);
  /** «Já está equilibrado — quer gravar?», antes de abrir mais uma linha. */
  const [perguntaGravar, setPerguntaGravar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aCriarConta, setACriarConta] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState(false);

  const exId = exercicioId ?? activo?.id;
  const pag = usePaginacao(LIMITE_PEDIDO);
  const { documentos } = useDocumentos(estado.diario || undefined);

  // A lista traz sempre os diferidos: são precisamente os que é preciso
  // encontrar para integrar. Filtram-se aqui, não no pedido.
  // FILTROS NO SERVIDOR, e não sobre o que já veio. Com dez por página, uma
  // pesquisa filtrada no cliente procurava em dez linhas e dava «nada
  // encontrado» com o movimento a existir — o defeito é tanto maior quanto
  // menor for a página.
  const parametros = new URLSearchParams();
  if (exId) parametros.set("exercicio_id", exId);
  parametros.set("incluir_diferidos", "true");
  if (soDiferidos) parametros.set("apenas_diferidos", "true");
  if (filtroDiario) parametros.set("diario", filtroDiario);
  const termo = procura.trim();
  if (termo) parametros.set("procura", termo);
  parametros.set("limite", String(LIMITE_PEDIDO));
  parametros.set("offset", String(pag.offset));
  const chave = `/api/contabilidade/lancamentos?${parametros}`;
  const {
    data: pagina,
    isLoading,
    mutate,
  } = useSWR<Pagina<Lancamento>>(chave, buscador);
  const todos = pagina?.linhas;

  const lista = todos ?? [];

  // ---- Estado do movimento, pela ordem do Piloto ----
  const preenchidas = estado.linhas.filter(linhaPreenchida);
  const totalDebito = soma(...estado.linhas.map((l) => l.debito));
  const totalCredito = soma(...estado.linhas.map((l) => l.credito));
  const diferenca = subtrai(totalDebito, totalCredito);
  const equilibrado = diferenca.eq(0) && totalDebito.gt(0);

  const semFluxo = estado.linhas.find(
    (l) =>
      CONTA_MONETARIA.test(l.conta_codigo) &&
      (big(l.debito).gt(0) || big(l.credito).gt(0)) &&
      !l.fluxo_codigo,
  );

  const selo = (() => {
    if (!estado.diario) return { texto: "Indica o diário", tipo: "aviso" };
    if (!estado.documento)
      return { texto: "Indica o documento", tipo: "aviso" };
    if (semFluxo)
      return {
        texto: `Indica o fluxo de caixa da conta ${semFluxo.conta_codigo} (separador Fluxos Caixa)`,
        tipo: "aviso",
      };
    if (totalDebito.eq(0) && totalCredito.eq(0))
      return { texto: "vazio", tipo: "vazio" };
    if (equilibrado) return { texto: "equilibrado", tipo: "ok" };
    return {
      texto: `diferença ${formataMoeda(diferenca.abs(), "")} — débito ≠ crédito`,
      tipo: "erro",
    };
  })();

  const editavel = estado.origem === "manual";
  const completo =
    Boolean(estado.diario) &&
    Boolean(estado.documento) &&
    !semFluxo &&
    equilibrado;
  const podeGravar = podeLancar && completo && editavel;

  // ---- Acções ----

  /**
   * Abrir mais uma linha — mas não em cima de um documento já fechado.
   *
   * Quando o débito iguala o crédito e há contas preenchidas, o documento está
   * pronto a gravar. Abrir linha nesse momento é quase sempre um Enter a mais:
   * a pessoa acabou de equilibrar e o cursor saltou para uma linha que não
   * queria. Pergunta-se antes — gravar, ou continuar a editar.
   *
   * NADA DO QUE JÁ EXISTIA SE PERDE: as validações do documento continuam a
   * ser as mesmas, e quem responder «continuar» fica com a linha nova.
   */
  function novaLinha() {
    setEstado((e) => ({ ...e, linhas: [...e.linhas, linhaVazia()] }));
  }

  function pedirNovaLinha() {
    if (equilibrado && preenchidas.length >= 2) {
      setPerguntaGravar(true);
      return;
    }
    novaLinha();
  }

  function alterar(parcial: Partial<EstadoEditor>) {
    setErro(null);
    setAviso(null);
    setEstado((e) => {
      const novo = { ...e, ...parcial };
      // Escolher o documento traz as contas por omissão e a descrição — mas só
      // se a grelha ainda estiver limpa, para não apagar o que já se escreveu.
      if (parcial.documento && parcial.documento !== e.documento) {
        const doc = documentos.find((d) => d.codigo === parcial.documento);
        if (doc) {
          if (!novo.descricao) novo.descricao = doc.descricao;
          const vazia = !e.linhas.some(
            (l) => l.conta_codigo || l.debito || l.credito,
          );
          if (vazia) {
            const linhas = [];
            if (doc.conta_debito)
              linhas.push({
                ...linhaVazia(),
                conta_codigo: doc.conta_debito,
                descricao: doc.descricao,
              });
            if (doc.conta_credito)
              linhas.push({
                ...linhaVazia(),
                conta_codigo: doc.conta_credito,
                descricao: doc.descricao,
              });
            while (linhas.length < 2) linhas.push(linhaVazia());
            novo.linhas = linhas;
          }
        }
      }
      return novo;
    });
  }

  function novo() {
    // Diário e documento mantêm-se: não é produtivo voltar a escolhê-los.
    setEstado((e) => ({
      ...estadoNovo(),
      diario: e.diario,
      documento: e.documento,
    }));
    setErro(null);
    setAviso(null);
  }

  async function carregar(l: Lancamento) {
    setErro(null);
    setAviso(null);
    try {
      const completo = await api.get<Lancamento>(
        `/api/contabilidade/lancamentos/${l.id}`,
      );
      setEstado(estadoDe(completo));
    } catch {
      setErro("Não foi possível abrir o movimento.");
    }
  }

  async function gravar() {
    setErro(null);
    setAviso(null);

    setOcupado(true);
    try {
      const corpo = {
        data: estado.data,
        mes: estado.mes || undefined,
        diario_codigo: estado.diario,
        documento_codigo: estado.documento,
        descricao: estado.descricao || undefined,
        documento_ref: estado.documentoRef || undefined,
        exercicio_id: exId,
        diferido: estado.diferido,
        linhas: preenchidas.map((l) => ({
          conta_codigo: l.conta_codigo,
          debito: paraApi(l.debito),
          credito: paraApi(l.credito),
          descricao: l.descricao || undefined,
          entidade: l.entidade || undefined,
          tipo_entidade: l.tipo_entidade || undefined,
          iva_perc: paraApi(l.iva_perc),
          perc_nao_ded: paraApi(l.perc_nao_ded),
          iva_autoliq: paraApi(l.iva_autoliq),
          moeda: l.moeda,
          cambio: paraApi(l.cambio || "1"),
          centro_codigo: l.centro_codigo || undefined,
          fluxo_codigo: l.fluxo_codigo || undefined,
        })),
      };

      if (estado.editId) {
        await api.put(`/api/contabilidade/lancamentos/${estado.editId}`, corpo);
        setAviso("Movimento actualizado.");
      } else {
        const r = await api.post<{ numero: number }>(
          "/api/contabilidade/lancamentos",
          corpo,
        );
        setAviso(
          estado.diferido
            ? `Movimento nº ${r.numero} gravado — diferido, pendente de integração.`
            : `Movimento nº ${r.numero} gravado.`,
        );
      }
      await mutate();
      novo();
    } catch (e) {
      // O servidor devolve 422 com a regra violada em português.
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar() {
    if (!estado.editId) return;
    setOcupado(true);
    try {
      await api.delete(`/api/contabilidade/lancamentos/${estado.editId}`);
      await mutate();
      novo();
      setAviso("Movimento eliminado.");
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAEliminar(false);
    }
  }

  async function integrar() {
    if (!estado.editId) return;
    setOcupado(true);
    try {
      await api.post(
        `/api/contabilidade/lancamentos/${estado.editId}/integrar`,
        {},
      );
      await mutate();
      novo();
      setAviso("Movimento integrado — passa a contar nos mapas.");
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível integrar.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Movimentos"
        descricao="Lançamentos em partidas dobradas."
        accoes={
          exercicios.length > 0 && (
            <Selector
              rotulo=""
              valor={exId ?? ""}
              aoMudar={setExercicioId}
              opcoes={exercicios.map((e) => ({
                valor: e.id,
                rotulo: `${e.nome}${e.estado === "fechado" ? " · fechado" : ""}`,
              }))}
              larguraMinima="13rem"
            />
          )
        }
      />

      {/* Barra de acções — a `mov-toolbar` do Piloto */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-borda bg-superficie px-3 py-2.5 shadow-suave">
        {podeLancar && (
          <>
            <Botao
              variante="primario"
              tamanho="pequeno"
              onClick={gravar}
              disabled={!podeGravar || ocupado}
              motivoBloqueio={
                podeGravar
                  ? ocupado
                    ? "A gravar — aguarde."
                    : undefined
                  : !editavel
                    ? "Movimento gerado automaticamente — altera-se no documento que o originou."
                    : selo.texto
              }
            >
              <Save size={15} />
              {ocupado ? "A gravar…" : "Gravar"}
            </Botao>
            <Botao variante="neutro" tamanho="pequeno" onClick={novo}>
              <FilePlus2 size={15} />
              Novo
            </Botao>
            <Botao
              variante="neutro"
              tamanho="pequeno"
              onClick={() => setAEliminar(true)}
              disabled={!estado.editId || ocupado}
              title={
                estado.editId
                  ? undefined
                  : "Nada para eliminar (movimento novo)"
              }
            >
              <Trash2 size={15} />
              Eliminar
            </Botao>
            {estado.editId && estado.diferido && (
              <Botao
                variante="sucesso"
                tamanho="pequeno"
                onClick={integrar}
                disabled={ocupado}
                title="Integra o movimento: passa a contar no balancete, razão e apuramentos"
              >
                <CheckCircle2 size={15} />
                Integrar
              </Botao>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {aviso && (
            <span className="text-[13px] font-semibold text-sucesso">
              {aviso}
            </span>
          )}
          <SeloEstado texto={selo.texto} tipo={selo.tipo} />
        </div>
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
        <ListaLancamentos
          lancamentos={lista}
          diarios={diarios}
          seleccionado={estado.editId}
          aoEscolher={carregar}
          filtroDiario={filtroDiario}
          aoMudarFiltroDiario={(v) => {
            setFiltroDiario(v);
            pag.reiniciar();
          }}
          procura={procura}
          aoMudarProcura={(v) => {
            setProcura(v);
            pag.reiniciar();
          }}
          soDiferidos={soDiferidos}
          aoMudarSoDiferidos={(v) => {
            setSoDiferidos(v);
            pag.reiniciar();
          }}
          aCarregar={isLoading}
          pagina={pagina}
          controlos={pag.controlos}
        />

        <EditorLancamento
          estado={estado}
          aoMudar={alterar}
          aoPedirCriacaoDeConta={setACriarConta}
          aoPedirNovaLinha={pedirNovaLinha}
          erro={erro}
          soLeitura={!podeLancar || !editavel}
        />
      </div>

      {aCriarConta && (
        <CriarContaEmFalta
          codigo={aCriarConta}
          aoFechar={() => setACriarConta(null)}
          aoCriar={() => setACriarConta(null)}
        />
      )}

      <Confirmar
        aberto={perguntaGravar}
        aoMudar={(a) => !a && setPerguntaGravar(false)}
        titulo="O documento já está equilibrado. Gravar?"
        rotuloConfirmar="Gravar"
        rotuloOcupado="A gravar…"
        rotuloCancelar="Continuar a editar"
        variante="primario"
        aoConfirmar={() => {
          setPerguntaGravar(false);
          gravar();
        }}
        aoCancelar={() => {
          // Quem escolhe continuar fica com a linha que pediu — senão o botão
          // «Linha» não teria feito nada e pareceria avariado.
          setPerguntaGravar(false);
          novaLinha();
        }}
      >
        Débito e crédito somam {formataMoeda(totalDebito, "").trim()}. Pode
        gravar agora, ou continuar a editar e acrescentar mais uma linha.
      </Confirmar>

      <Confirmar
        aberto={aEliminar}
        aoMudar={(a) => !a && setAEliminar(false)}
        titulo={`Eliminar o movimento ${estado.numeroOp ?? ""}?`}
        rotuloConfirmar="Eliminar"
        rotuloOcupado="A eliminar…"
        ocupado={ocupado}
        aoConfirmar={eliminar}
      >
        O movimento sai do balancete, do razão e dos extractos. Não há como o
        recuperar.
      </Confirmar>
    </>
  );
}
