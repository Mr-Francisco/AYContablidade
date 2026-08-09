"use client";

import {
  ChevronDown,
  Eye,
  Info,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";

import { mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import {
  Alerta,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
} from "@/components/ui";
import { Markdown } from "@/components/ui/Markdown";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type {
  AmbitoIa,
  ConsultaIa,
  EstadoIa,
  PreviaContexto,
  RespostaIa,
} from "@/types";

/** Uma troca na conversa. O `id` é o da consulta gravada; as que ainda estão a
 *  decorrer usam um id temporário. */
interface Troca {
  id: string;
  pergunta: string;
  resposta: string | null;
  erro: string | null;
  modelo: string | null;
  entidades: number;
  tokens: { entrada: number; saida: number; max_saida?: number } | null;
  duracao: number | null;
  ambitos: string[];
  quando: string;
  aPensar?: boolean;
}

const SUGESTOES = [
  "Qual é a situação financeira da empresa?",
  "Que contas de clientes têm saldo há mais tempo?",
  "Há algo fora do normal nos custos deste exercício?",
];

export default function Assistente() {
  const { exercicios, activo } = useExercicios();
  const { utilizador } = useAuth();

  const [pergunta, setPergunta] = useState("");
  const [ambitos, setAmbitos] = useState<string[]>([]);
  const [exercicioId, setExercicioId] = useState("");
  const [mes, setMes] = useState("");
  const [incluirDiagnostico, setIncluirDiagnostico] = useState(true);
  const [trocas, setTrocas] = useState<Troca[]>([]);
  const [previa, setPrevia] = useState<PreviaContexto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

  const fim = useRef<HTMLDivElement | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);

  const { data: estado } = useSWR<EstadoIa>("/api/ia/estado", buscador, {
    revalidateOnFocus: false,
  });
  // Uma conta sem empresa — o superadministrador da plataforma — não tem
  // dados de negócio para consultar, e estas rotas respondem 400. Sem esta
  // condição, a página pedia-as, ficava sem âmbitos e sem histórico, e depois
  // recusava a pergunta com «Escolha pelo menos um contexto» — uma mensagem
  // que manda corrigir o que não tem correcção possível.
  const temEmpresa = Boolean(utilizador?.empresa_id);

  const { data: disponiveis, error: erroAmbitos } = useSWR<AmbitoIa[]>(
    temEmpresa ? "/api/ia/ambitos" : null,
    buscador,
    { revalidateOnFocus: false },
  );
  const { data: historico } = useSWR<ConsultaIa[]>(
    temEmpresa ? "/api/ia/historico?so_minhas=true&limite=20" : null,
    buscador,
    { revalidateOnFocus: false },
  );

  const exId = exercicioId || activo?.id || "";

  // O histórico entra na conversa em vez de viver numa coluna à parte: quem
  // volta a esta página encontra o fio onde o deixou, e não um ecrã vazio.
  // Mais antigo em cima, como em qualquer conversa.
  const anteriores = useMemo<Troca[]>(
    () =>
      [...(historico ?? [])].reverse().map((c) => ({
        id: c.id,
        pergunta: c.pergunta,
        resposta: c.resposta,
        erro: c.erro,
        modelo: c.modelo,
        entidades: c.entidades_pseudonimizadas,
        tokens: null,
        duracao: c.duracao_ms,
        ambitos: c.contexto?.ambitos ?? [],
        quando: c.criado_em,
      })),
    [historico],
  );

  const fio = [...anteriores, ...trocas];

  // Escolhe todos os âmbitos na primeira carga: perguntar é o que a pessoa vem
  // cá fazer, e obrigá-la a escolher contextos antes disso é um degrau à porta.
  const jaEscolheu = useRef(false);
  useEffect(() => {
    if (!jaEscolheu.current && disponiveis?.length) {
      jaEscolheu.current = true;
      setAmbitos(disponiveis.map((a) => a.id));
    }
  }, [disponiveis]);

  // O fio cresce por baixo; sem isto a resposta nova nascia fora do ecrã.
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  function corpo(texto = pergunta) {
    return {
      pergunta: texto.trim(),
      ambitos,
      exercicio_id: exId || null,
      mes: mes || null,
      incluir_diagnostico: incluirDiagnostico,
    };
  }

  function falhou(e: unknown, alternativa: string) {
    return e instanceof ErroApi ? e.mensagemUtilizador : alternativa;
  }

  async function verContexto() {
    setErro(null);
    if (!ambitos.length) return setErro("Escolha pelo menos um contexto.");
    setOcupado(true);
    try {
      setPrevia(await api.post<PreviaContexto>("/api/ia/contexto", corpo()));
    } catch (e) {
      setErro(falhou(e, "Não foi possível preparar o contexto."));
    } finally {
      setOcupado(false);
    }
  }

  async function perguntar(texto: string) {
    const limpo = texto.trim();
    setErro(null);
    if (!limpo) return;
    if (!ambitos.length) {
      // A mensagem tem de dizer o que se passa, e o que se passa nem sempre é
      // «esqueceu-se de escolher»: pode não haver nada para escolher.
      setAjustesAbertos(true);
      if (erroAmbitos) {
        // A lista nem sequer carregou. Dizer «escolha um contexto» aqui
        // mandava corrigir o que não está ao alcance de quem pergunta.
        return setErro(
          falhou(erroAmbitos, "Não foi possível carregar os contextos."),
        );
      }
      return setErro(
        disponiveis?.length
          ? "Escolha pelo menos um contexto — abaixo, em Contexto."
          : "Não há nenhum contexto disponível para esta conta. Sem módulos consultáveis, não há dados sobre que perguntar.",
      );
    }

    const temporario = `a-decorrer-${Date.now()}`;
    setTrocas((v) => [
      ...v,
      {
        id: temporario,
        pergunta: limpo,
        resposta: null,
        erro: null,
        modelo: null,
        entidades: 0,
        tokens: null,
        duracao: null,
        ambitos,
        quando: new Date().toISOString(),
        aPensar: true,
      },
    ]);
    setPergunta("");
    setOcupado(true);
    // Depois de a troca entrar no fio, para o «a pensar» ficar à vista.
    requestAnimationFrame(() =>
      fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );

    try {
      const r = await api.post<RespostaIa>("/api/ia/perguntar", corpo(limpo));
      setTrocas((v) =>
        v.map((t) =>
          t.id === temporario
            ? {
                ...t,
                id: r.id,
                resposta: r.resposta,
                modelo: r.modelo,
                entidades: r.entidades_pseudonimizadas,
                tokens: r.tokens,
                duracao: r.duracao_ms,
                aPensar: false,
              }
            : t,
        ),
      );
    } catch (e) {
      // O erro fica NA TROCA e não numa faixa no topo: a pessoa vê o que
      // falhou ao lado da pergunta que o causou, e a pergunta não se perde.
      const mensagem = falhou(e, "Não foi possível obter resposta.");
      setTrocas((v) =>
        v.map((t) =>
          t.id === temporario ? { ...t, erro: mensagem, aPensar: false } : t,
        ),
      );
    } finally {
      setOcupado(false);
      requestAnimationFrame(() =>
        fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      );
    }
  }

  function submeter(e: FormEvent) {
    e.preventDefault();
    perguntar(pergunta);
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra a linha — o que se espera de um campo
    // de conversa. Sem isto, Enter dentro de um textarea só fazia parágrafo.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!ocupado) perguntar(pergunta);
    }
  }

  const indisponivel = estado && !estado.disponivel;

  // Uma conta de administração da plataforma não pertence a nenhuma empresa e
  // não tem contabilidade sobre que perguntar. Mostrar-lhe o formulário seria
  // oferecer uma porta que dá para uma parede.
  if (utilizador && !temEmpresa) {
    return (
      <>
        <CabecalhoPagina
          titulo="Assistente"
          descricao="Responde sobre os dados de uma empresa."
        />
        <Cartao className="max-w-[620px]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-marca/10 text-marca">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold leading-tight">
                Esta conta não está ligada a nenhuma empresa
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
                O assistente responde a partir da contabilidade de uma empresa —
                saldos, lançamentos, movimentos. As contas de administração da
                plataforma gerem licenças, empresas e acessos, e por isso não
                têm dados de negócio sobre que perguntar.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-texto-suave">
                Para acompanhar o que as empresas estão a consumir, use{" "}
                <b>Plataforma → Consumo de IA</b>. Para alterar o tamanho máximo
                das respostas, <b>Plataforma → Configurações</b>.
              </p>
            </div>
          </div>
        </Cartao>
      </>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-140px)] min-w-0 flex-col">
      {/* ---------------------------------------------------------------
          Cabeçalho compacto. A conversa é o que importa nesta página, por
          isso o título não ocupa o espaço habitual de uma página de gestão.
      ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-marca/10 text-marca">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight tracking-[-0.2px]">
              Assistente
            </h1>
            <p className="truncate text-xs text-texto-suave">
              Responde a partir dos dados a que tem acesso.
            </p>
          </div>
        </div>
        {estado && (
          <Selo cor={estado.disponivel ? "#1a9c5f" : "#c98a10"}>
            {estado.disponivel
              ? `Operacional — ${estado.modelo}`
              : estado.desligada_pela_plataforma
                ? "Desligado pela administração"
                : "Sem chave configurada"}
          </Selo>
        )}
      </div>

      {/* ---------------------------------------------------------------
          A CONVERSA. Cresce para baixo e ocupa o espaço todo — é o centro
          da página e não um cartão entre outros.
      ---------------------------------------------------------------- */}
      <div className="min-w-0 flex-1 overflow-y-auto py-5">
        {!fio.length ? (
          <Comeco
            indisponivel={Boolean(indisponivel)}
            aoEscolher={(s) => {
              setPergunta(s);
              campo.current?.focus();
            }}
          />
        ) : (
          <div className="mx-auto flex min-w-0 max-w-[760px] flex-col gap-6">
            {fio.map((t) => (
              <TrocaNaConversa key={t.id} troca={t} nome={utilizador?.nome} />
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>

      {/* ---------------------------------------------------------------
          O campo fica em baixo e sempre à vista, como em qualquer conversa.
      ---------------------------------------------------------------- */}
      <div className="sticky bottom-0 min-w-0 border-t border-borda bg-fundo pb-4 pt-3">
        <div className="mx-auto min-w-0 max-w-[760px]">
          {erro && (
            <Alerta tipo="erro" className="mb-2">
              {erro}
            </Alerta>
          )}

          {indisponivel && (
            <Alerta tipo="aviso" className="mb-2">
              {estado?.desligada_pela_plataforma
                ? "O assistente foi desligado pela administração da plataforma."
                : "Falta a chave da OpenAI nas variáveis de ambiente."}{" "}
              O <b>Diagnóstico</b> continua a funcionar — corre inteiramente no
              servidor, por regras, sem contactar nenhuma API externa.
            </Alerta>
          )}

          <form onSubmit={submeter}>
            <div className="rounded-2xl border border-borda bg-superficie p-2 shadow-suave focus-within:border-marca">
              <textarea
                ref={campo}
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={teclas}
                rows={2}
                maxLength={2000}
                disabled={ocupado}
                placeholder="Escreva a sua pergunta…"
                className="w-full resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-texto-suave disabled:opacity-60"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAjustesAbertos((a) => !a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-1 text-xs font-semibold text-texto-suave transition-colors hover:border-marca hover:text-marca"
                  >
                    <ChevronDown
                      size={13}
                      className={
                        ajustesAbertos
                          ? "rotate-180 transition-transform"
                          : "transition-transform"
                      }
                    />
                    {plural(ambitos.length, "contexto")}
                    {mes && ` · ${mesPorExtenso(`2000-${mes}`)}`}
                  </button>
                  <button
                    type="button"
                    onClick={verContexto}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-1 text-xs font-semibold text-texto-suave transition-colors hover:border-marca hover:text-marca disabled:opacity-50"
                  >
                    <Eye size={13} />
                    Ver o que é enviado
                  </button>
                </div>

                <Botao
                  type="submit"
                  variante="primario"
                  tamanho="pequeno"
                  disabled={
                    ocupado || !pergunta.trim() || Boolean(indisponivel)
                  }
                >
                  <Send size={14} />
                  {ocupado ? "A perguntar…" : "Perguntar"}
                </Botao>
              </div>
            </div>
          </form>

          {ajustesAbertos && (
            <Ajustes
              disponiveis={disponiveis}
              ambitos={ambitos}
              setAmbitos={setAmbitos}
              exercicios={exercicios}
              exId={exId}
              setExercicioId={setExercicioId}
              mes={mes}
              setMes={setMes}
              incluirDiagnostico={incluirDiagnostico}
              setIncluirDiagnostico={setIncluirDiagnostico}
            />
          )}

          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-texto-suave">
            <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Nenhum dado pessoal sai do sistema — nomes viram pseudónimos e
              NIF, IBAN, e-mail, telefone e morada são removidos antes de
              qualquer envio. Cada pergunta é respondida por si só: o assistente
              não recorda as anteriores.
            </span>
          </p>
        </div>
      </div>

      {previa && (
        <ModalPrevia previa={previa} aoFechar={() => setPrevia(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Comeco({
  indisponivel,
  aoEscolher,
}: {
  indisponivel: boolean;
  aoEscolher: (s: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-12 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-marca/10 text-marca">
        <Sparkles size={22} />
      </span>
      <h2 className="text-lg font-bold">Pergunte sobre os seus dados</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
        As respostas saem do que o sistema já sabe — saldos, lançamentos,
        movimentos — dentro das permissões da sua conta. Nada é inventado, e o
        que não estiver nos dados é dito como tal.
      </p>

      {!indisponivel && (
        <div className="mt-6 flex w-full flex-col gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => aoEscolher(s)}
              className="rounded-xl border border-borda px-4 py-2.5 text-left text-sm transition-colors hover:border-marca hover:text-marca"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TrocaNaConversa({
  troca,
  nome,
}: {
  troca: Troca;
  nome?: string | null;
}) {
  const iniciais = (nome ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Pergunta — alinhada à direita, como em qualquer conversa. */}
      <div className="flex justify-end gap-2.5">
        <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tr-md bg-marca px-4 py-2.5 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap break-words">{troca.pergunta}</p>
        </div>
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-[11px] font-bold text-texto-suave">
          {iniciais}
        </span>
      </div>

      {/* Resposta */}
      <div className="flex min-w-0 gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-marca/10 text-marca">
          <Sparkles size={13} />
        </span>

        <div className="min-w-0 flex-1">
          {troca.aPensar ? (
            <APensar />
          ) : troca.erro ? (
            <Alerta tipo="erro">{troca.erro}</Alerta>
          ) : (
            <>
              {/* O modelo responde em Markdown. Sem isto, o utilizador via os
                  asteriscos: `1. **IVA por Apurar**: há um aviso...`. */}
              <div className="break-words rounded-2xl rounded-tl-md border border-borda bg-superficie px-4 py-3">
                <Markdown>{troca.resposta ?? ""}</Markdown>
              </div>
              <Rodape troca={troca} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Três pontos a pulsar. Só `opacity`, e param com movimento reduzido. */
function APensar() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-borda bg-superficie px-4 py-3">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-texto-suave"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-texto-suave">A consultar os dados…</span>
    </div>
  );
}

function Rodape({ troca }: { troca: Troca }) {
  const cortada =
    troca.tokens?.max_saida != null &&
    troca.tokens.saida >= troca.tokens.max_saida;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-texto-suave">
      {troca.entidades > 0 && (
        <span className="inline-flex items-center gap-1 text-[var(--color-sucesso)]">
          <ShieldCheck size={11} aria-hidden />
          {plural(
            troca.entidades,
            "entidade pseudonimizada",
            "entidades pseudonimizadas",
          )}
        </span>
      )}
      {troca.modelo && <span>{troca.modelo}</span>}
      {troca.tokens && (
        <span className="tabular">
          {troca.tokens.entrada} + {troca.tokens.saida} tokens
        </span>
      )}
      {troca.duracao != null && (
        <span className="tabular">{(troca.duracao / 1000).toFixed(1)} s</span>
      )}
      {cortada && (
        // Sem isto, uma resposta que bate no tecto parecia um defeito.
        <span className="text-[var(--color-aviso)]">
          no limite de {troca.tokens?.max_saida} tokens definido para a
          plataforma
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Ajustes({
  disponiveis,
  ambitos,
  setAmbitos,
  exercicios,
  exId,
  setExercicioId,
  mes,
  setMes,
  incluirDiagnostico,
  setIncluirDiagnostico,
}: {
  disponiveis?: AmbitoIa[];
  ambitos: string[];
  setAmbitos: (f: (v: string[]) => string[]) => void;
  exercicios: { id: string; nome: string }[];
  exId: string;
  setExercicioId: (v: string) => void;
  mes: string;
  setMes: (v: string) => void;
  incluirDiagnostico: boolean;
  setIncluirDiagnostico: (v: boolean) => void;
}) {
  return (
    <Cartao className="mt-2">
      <p className="mb-2 text-xs font-semibold text-texto-suave">
        Contexto — só estes dados são preparados e enviados
      </p>
      {!disponiveis?.length ? (
        <p className="text-sm text-texto-suave">
          Não tem acesso a nenhum módulo consultável.
        </p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {disponiveis.map((a) => {
            const escolhido = ambitos.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                title={a.descricao}
                aria-pressed={escolhido}
                onClick={() =>
                  setAmbitos((v) =>
                    escolhido ? v.filter((x) => x !== a.id) : [...v, a.id],
                  )
                }
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  escolhido
                    ? "border-marca bg-marca text-white"
                    : "border-borda text-texto-suave hover:border-marca hover:text-marca"
                }`}
              >
                {a.nome}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="100%"
        />
        <Selector
          rotulo="Período"
          valor={mes}
          aoMudar={setMes}
          opcoes={[
            { valor: "", rotulo: "Todo o exercício" },
            ...ultimosMeses(12).map((m) => ({
              valor: m.slice(5),
              rotulo: mesPorExtenso(m),
            })),
          ]}
          larguraMinima="100%"
        />
        <Selector
          rotulo="Incluir diagnóstico"
          valor={incluirDiagnostico ? "sim" : "nao"}
          aoMudar={(v) => setIncluirDiagnostico(v === "sim")}
          opcoes={[
            { valor: "sim", rotulo: "Sim" },
            { valor: "nao", rotulo: "Não" },
          ]}
          larguraMinima="100%"
        />
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
function ModalPrevia({
  previa,
  aoFechar,
}: {
  previa: PreviaContexto;
  aoFechar: () => void;
}) {
  const limpo = previa.identificadores_detectados.length === 0;
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(900px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              O que seria enviado
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

          <div className="min-w-0 flex-1 overflow-auto p-5">
            <Alerta tipo={limpo ? "sucesso" : "erro"} className="mb-3">
              {limpo ? (
                <>
                  <b>Nenhum identificador pessoal detectado.</b> Este é o pacote
                  exacto que sairia, com{" "}
                  <b>{previa.entidades_pseudonimizadas}</b> entidades já
                  substituídas por pseudónimos. Esta verificação é feita uma
                  segunda vez no momento do envio — se falhar, o envio é
                  abortado.
                </>
              ) : (
                <>
                  <b>Identificadores detectados no pacote:</b>{" "}
                  {previa.identificadores_detectados.join(", ")}. O envio seria
                  abortado. Comunique isto — é um defeito da redacção, não do
                  seu pedido.
                </>
              )}
            </Alerta>

            <pre className="overflow-x-auto rounded-xl border border-borda bg-fundo p-4 text-xs leading-relaxed">
              {JSON.stringify(previa.pacote, null, 2)}
            </pre>
          </div>

          <div className="flex justify-end border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Fechar</Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
