"use client";

import { Eye, History, Send, ShieldCheck, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import { mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import {
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Selector,
  Selo,
  TituloCartao,
  Vazio,
} from "@/components/ui";
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

export default function Assistente() {
  const { exercicios, activo } = useExercicios();

  const [pergunta, setPergunta] = useState("");
  const [ambitos, setAmbitos] = useState<string[]>([]);
  const [exercicioId, setExercicioId] = useState("");
  const [mes, setMes] = useState("");
  const [incluirDiagnostico, setIncluirDiagnostico] = useState(true);
  const [resposta, setResposta] = useState<RespostaIa | null>(null);
  const [previa, setPrevia] = useState<PreviaContexto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: estado } = useSWR<EstadoIa>("/api/ia/estado", buscador, {
    revalidateOnFocus: false,
  });
  const { data: disponiveis } = useSWR<AmbitoIa[]>(
    "/api/ia/ambitos",
    buscador,
    {
      revalidateOnFocus: false,
    },
  );
  const { data: historico, mutate: mutateHistorico } = useSWR<ConsultaIa[]>(
    "/api/ia/historico?so_minhas=true&limite=15",
    buscador,
  );

  const exId = exercicioId || activo?.id || "";

  function corpo() {
    return {
      pergunta: pergunta.trim(),
      ambitos,
      exercicio_id: exId || null,
      mes: mes || null,
      incluir_diagnostico: incluirDiagnostico,
    };
  }

  async function verContexto() {
    setErro(null);
    if (!ambitos.length) return setErro("Escolha pelo menos um contexto.");
    setOcupado(true);
    try {
      setPrevia(await api.post<PreviaContexto>("/api/ia/contexto", corpo()));
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível preparar o contexto.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setResposta(null);
    if (!pergunta.trim()) return setErro("Escreva a pergunta.");
    if (!ambitos.length) return setErro("Escolha pelo menos um contexto.");
    setOcupado(true);
    try {
      setResposta(await api.post<RespostaIa>("/api/ia/perguntar", corpo()));
      mutateHistorico();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível obter resposta.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Perguntas e Respostas"
        descricao="Pergunte sobre os dados da empresa. As respostas são geradas a partir do que o sistema já sabe."
        accoes={
          estado && (
            <Selo cor={estado.disponivel ? "#1a9c5f" : "#c98a10"}>
              {estado.disponivel
                ? `Operacional — ${estado.modelo}`
                : "Sem chave configurada"}
            </Selo>
          )
        }
      />

      <Alerta tipo="info" className="mb-4">
        <b>Nenhum dado pessoal sai do sistema.</b> Os nomes de pessoas e
        entidades são substituídos por pseudónimos ("Cliente 1"), e NIF, IBAN,
        e-mail, telefone, número de Segurança Social e morada são removidos
        antes de qualquer envio. Pode confirmar isso por si com{" "}
        <b>Ver o que é enviado</b> — mostra o pacote exacto, sem o enviar. A IA
        nunca acede à base de dados: recebe apenas o resumo que o backend
        preparou dentro das suas permissões.
      </Alerta>

      {estado && !estado.disponivel && (
        <Alerta tipo="aviso" className="mb-4">
          O módulo de perguntas precisa de uma chave da OpenAI configurada em
          variáveis de ambiente. O <b>Diagnóstico</b> continua a funcionar —
          corre inteiramente no servidor, por regras, e não contacta nenhuma API
          externa.
        </Alerta>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Cartao>
            <form onSubmit={submeter} className="flex flex-col gap-4">
              <Campo rotulo="Pergunta">
                <textarea
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Ex.: Que contas de clientes têm saldo há mais tempo?"
                  className="w-full resize-y rounded-lg border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-marca"
                />
              </Campo>

              <fieldset className="min-w-0">
                <legend className="mb-2 text-xs font-semibold text-texto-suave">
                  Contexto — só estes dados são preparados
                </legend>
                {!disponiveis?.length ? (
                  <p className="text-sm text-texto-suave">
                    Não tem acesso a nenhum módulo consultável.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {disponiveis.map((a) => {
                      const activo = ambitos.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          title={a.descricao}
                          aria-pressed={activo}
                          onClick={() =>
                            setAmbitos((v) =>
                              activo
                                ? v.filter((x) => x !== a.id)
                                : [...v, a.id],
                            )
                          }
                          className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                            activo
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
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-3">
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

              {erro && <Alerta tipo="erro">{erro}</Alerta>}

              <div className="flex flex-wrap justify-end gap-2">
                <Botao onClick={verContexto} disabled={ocupado}>
                  <Eye size={16} />
                  Ver o que é enviado
                </Botao>
                <Botao
                  type="submit"
                  variante="primario"
                  disabled={ocupado || !estado?.disponivel}
                >
                  <Send size={16} />
                  {ocupado ? "A perguntar…" : "Perguntar"}
                </Botao>
              </div>
            </form>
          </Cartao>

          {resposta && (
            <Cartao>
              <TituloCartao
                extra={
                  <span className="flex flex-wrap items-center gap-2">
                    <Selo cor="#1a9c5f">
                      <ShieldCheck size={11} aria-hidden />
                      {plural(
                        resposta.entidades_pseudonimizadas,
                        "entidade pseudonimizada",
                        "entidades pseudonimizadas",
                      )}
                    </Selo>
                    <Selo cor="#62657a">{resposta.modelo}</Selo>
                  </span>
                }
              >
                Resposta
              </TituloCartao>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {resposta.resposta}
              </div>
              <p className="mt-3 border-t border-borda pt-2 text-xs text-texto-suave">
                {resposta.tokens.entrada} tokens de entrada ·{" "}
                {resposta.tokens.saida} de saída · {resposta.duracao_ms} ms
              </p>
            </Cartao>
          )}
        </div>

        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5">
            <span className="inline-flex items-center gap-2">
              <History size={15} aria-hidden />
              Histórico
            </span>
          </TituloCartao>
          {!historico?.length ? (
            <Vazio>Ainda não fez perguntas.</Vazio>
          ) : (
            <ul className="flex flex-col divide-y divide-borda border-t border-borda">
              {historico.map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <p className="text-sm font-semibold">{c.pergunta}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-texto-suave">
                    {c.erro ? (
                      <span className="text-perigo">Falhou: {c.erro}</span>
                    ) : (
                      (c.resposta ?? "")
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-texto-suave">
                    <span>
                      {new Date(c.criado_em).toLocaleString("pt-PT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    {(c.contexto ?? []).map((a) => (
                      <Selo key={a} cor="#62657a">
                        {a}
                      </Selo>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {previa && (
        <ModalPrevia previa={previa} aoFechar={() => setPrevia(null)} />
      )}
    </>
  );
}

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
