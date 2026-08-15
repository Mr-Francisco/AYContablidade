"use client";

import { Check, Cpu, Pencil, Plus, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog, RadioGroup } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR, { mutate as revalidar } from "swr";

import {
  ACarregar,
  Alerta,
  Botao,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
} from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import type { ModeloIa } from "@/types";

const ROTA = "/api/licencas/modelos-ia";

/** `2.500000` -> `2.50`, `0.075000` -> `0.075`.
 *
 * A coluna guarda seis casas porque há modelos abaixo de um cêntimo por
 * milhão. Mostrá-las todas transforma uma tabela de preços num muro de zeros.
 * Corta-se só na apresentação — o valor que vai e vem é sempre o do servidor. */
function limpo(v: string | null): string {
  if (!v) return "";
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

/** Registo de modelos de IA da plataforma.
 *
 * É aqui que se decide o que a plataforma usa e quanto isso custa. Duas
 * decisões vivem juntas de propósito: um modelo sem preço não tem custo
 * estimado, e sem custo estimado os limites por empresa não travam nada.
 *
 * Mudar um preço não reescreve o passado — cada consulta guardou os preços que
 * lhe foram aplicados. É por isso que corrigir um preço errado é seguro.
 */
export function ModelosIa() {
  const { data, isLoading, mutate } = useSWR<ModeloIa[]>(ROTA, buscador, {
    revalidateOnFocus: false,
  });

  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<ModeloIa | null>(null);
  const [aCriar, setACriar] = useState(false);
  const [aApagar, setAApagar] = useState<ModeloIa | null>(null);

  async function accao(id: string, fn: () => Promise<unknown>) {
    setErro(null);
    setOcupado(id);
    try {
      await fn();
      mutate();
      // O cabeçalho da página diz com que modelo se está a responder, e vem de
      // outra chave. Sem isto, mudar o padrão deixava-o a mostrar o anterior
      // até alguém recarregar — a interface a contradizer-se a si própria.
      revalidar("/api/licencas/config-ia");
      revalidar("/api/licencas/precos-ia");
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setOcupado(null);
    }
  }

  const padrao = data?.find((m) => m.padrao);

  return (
    <Cartao className="min-w-0">
      <TituloCartao
        extra={
          <span className="inline-flex items-center gap-1.5 text-xs text-texto-suave">
            <Cpu size={13} />
            Modelos
          </span>
        }
      >
        Modelos de IA e preços
      </TituloCartao>

      <p className="mb-3 text-sm leading-relaxed text-texto-suave">
        O modelo marcado como <b>padrão</b> é o que responde a todas as
        perguntas, em todas as empresas. Nem o utilizador nem a aplicação
        escolhem — o servidor impõe este em cada pedido.
      </p>

      {isLoading || !data ? (
        <ACarregar />
      ) : (
        <>
          <EnvolveTabela>
            <RadioGroup.Root
              value={padrao?.id ?? ""}
              onValueChange={(id) =>
                accao(id, () => api.post(`${ROTA}/${id}/padrao`, {}))
              }
              asChild
            >
              <Tabela>
                <thead>
                  <tr>
                    <Th>Padrão</Th>
                    <Th>Modelo</Th>
                    <Th numerico>Entrada</Th>
                    <Th numerico>Em cache</Th>
                    <Th numerico>Saída</Th>
                    <Th>Estado</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m) => (
                    <Tr key={m.id}>
                      <Td>
                        <RadioGroup.Item
                          value={m.id}
                          disabled={!m.ativo || ocupado !== null}
                          aria-label={`Usar ${m.nome} como padrão`}
                          title={
                            m.ativo
                              ? "Usar este modelo"
                              : "Um modelo desactivado não pode ser o padrão"
                          }
                          className="flex size-4.5 items-center justify-center rounded-full border border-borda transition-colors data-[state=checked]:border-marca disabled:opacity-40"
                        >
                          <RadioGroup.Indicator className="size-2.5 rounded-full bg-marca" />
                        </RadioGroup.Item>
                      </Td>
                      <Td>
                        <span className="block font-semibold">{m.nome}</span>
                        <span className="block text-xs text-texto-suave">
                          {m.modelo_id}
                          {m.nota && ` · ${m.nota}`}
                        </span>
                      </Td>
                      <Td numerico className="tabular">
                        {limpo(m.preco_entrada)}
                      </Td>
                      <Td numerico className="tabular text-texto-suave">
                        {limpo(m.preco_entrada_cache) || "—"}
                      </Td>
                      <Td numerico className="tabular">
                        {limpo(m.preco_saida)}
                      </Td>
                      <Td>
                        {m.padrao ? (
                          <Selo cor="#1a9c5f">Em uso</Selo>
                        ) : m.ativo ? (
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() =>
                              accao(m.id, () =>
                                api.patch(`${ROTA}/${m.id}`, { ativo: false }),
                              )
                            }
                            className="text-xs font-semibold text-texto-suave hover:text-perigo"
                          >
                            Activo — desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() =>
                              accao(m.id, () =>
                                api.patch(`${ROTA}/${m.id}`, { ativo: true }),
                              )
                            }
                            className="text-xs font-semibold text-texto-suave hover:text-marca"
                          >
                            Inactivo — activar
                          </button>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Alterar ${m.nome}`}
                            onClick={() => setAEditar(m)}
                            className="flex size-8 items-center justify-center rounded-lg border border-borda hover:border-marca hover:text-marca"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Apagar ${m.nome}`}
                            disabled={m.padrao}
                            title={
                              m.padrao
                                ? "Escolha outro padrão antes de apagar este"
                                : "Apagar"
                            }
                            onClick={() => setAApagar(m)}
                            className="flex size-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </RadioGroup.Root>
          </EnvolveTabela>

          <p className="mt-2 text-xs text-texto-suave">
            Preços em dólares por <b>1 000 000 de tokens</b>. A entrada em cache
            é a parte do contexto que a API já tinha e cobra mais barato.
          </p>

          {erro && (
            <div className="mt-3">
              <Alerta tipo="erro">{erro}</Alerta>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Botao variante="contorno" onClick={() => setACriar(true)}>
              <Plus size={15} />
              Adicionar modelo
            </Botao>
            <span className="text-xs text-texto-suave">
              Corrigir um preço <b>não</b> reescreve o histórico: cada consulta
              guardou os preços que lhe foram aplicados.
            </span>
          </div>
        </>
      )}

      {(aCriar || aEditar) && (
        <DialogoModelo
          modelo={aEditar}
          aFechar={() => {
            setACriar(false);
            setAEditar(null);
          }}
          aoGravar={() => {
            mutate();
            revalidar("/api/licencas/precos-ia");
          }}
        />
      )}

      <AlertDialog.Root
        open={aApagar !== null}
        onOpenChange={(o) => !o && setAApagar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="text-lg font-semibold">
              Apagar {aApagar?.nome}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-texto-suave">
              Deixa de estar disponível para escolher. O histórico não se perde
              — as consultas antigas guardaram o modelo e os preços que lhes
              foram aplicados. Para o esconder sem o apagar, desactive-o.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao variante="neutro">Manter</Botao>
              </AlertDialog.Cancel>
              <Botao
                variante="perigo"
                disabled={ocupado !== null}
                motivoBloqueio={
                  ocupado !== null ? "A processar — aguarde." : undefined
                }
                onClick={() => {
                  const alvo = aApagar;
                  if (!alvo) return;
                  accao(alvo.id, () => api.delete(`${ROTA}/${alvo.id}`)).then(
                    () => setAApagar(null),
                  );
                }}
              >
                Apagar
              </Botao>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
/** Formulário de criação e de correcção.
 *
 * O identificador técnico só se escreve na criação: mudá-lo depois seria
 * outro modelo, com outro preço, e o histórico deixava de casar.
 */
function DialogoModelo({
  modelo,
  aFechar,
  aoGravar,
}: {
  modelo: ModeloIa | null;
  aFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = modelo === null;
  const [campos, setCampos] = useState({
    nome: modelo?.nome ?? "",
    modelo_id: modelo?.modelo_id ?? "",
    preco_entrada: limpo(modelo?.preco_entrada ?? ""),
    preco_entrada_cache: limpo(modelo?.preco_entrada_cache ?? ""),
    preco_saida: limpo(modelo?.preco_saida ?? ""),
    nota: modelo?.nota ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  // Identificadores que a chave configurada consegue mesmo usar. Serve para
  // não obrigar a decorá-los; a lista pode vir vazia — não poder consultá-la
  // não impede de configurar.
  const { data: disponiveis } = useSWR<{
    modelos: string[];
    erro: string | null;
  }>(novo ? `${ROTA}/disponiveis` : null, buscador, {
    revalidateOnFocus: false,
  });

  function alterar(campo: keyof typeof campos, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setAGravar(true);
    try {
      if (novo) {
        const r = await api.post<ModeloIa>(ROTA, {
          nome: campos.nome,
          modelo_id: campos.modelo_id,
          preco_entrada: campos.preco_entrada,
          preco_saida: campos.preco_saida,
          preco_entrada_cache: campos.preco_entrada_cache || null,
          nota: campos.nota || null,
        });
        aoGravar();
        if (r.aviso) {
          setAviso(r.aviso);
          setAGravar(false);
          return;
        }
      } else {
        await api.patch(`${ROTA}/${modelo.id}`, {
          nome: campos.nome,
          preco_entrada: campos.preco_entrada,
          preco_saida: campos.preco_saida,
          preco_entrada_cache: campos.preco_entrada_cache || null,
          nota: campos.nota || null,
        });
        aoGravar();
      }
      aFechar();
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
    <Dialog.Root open onOpenChange={(o) => !o && aFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo ? "Adicionar modelo" : `Alterar ${modelo.nome}`}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={submeter}
            id="form-modelo-ia"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome" dica="Como aparece no painel.">
                <Entrada
                  value={campos.nome}
                  onChange={(e) => alterar("nome", e.target.value)}
                  placeholder="Equilibrado"
                  required
                  maxLength={80}
                />
              </Campo>

              <Campo
                rotulo="Identificador técnico"
                dica={
                  novo
                    ? "O que vai no pedido à API. É confirmado junto da OpenAI."
                    : "Não se altera: seria outro modelo, com outro preço."
                }
              >
                <Entrada
                  value={campos.modelo_id}
                  onChange={(e) => alterar("modelo_id", e.target.value)}
                  placeholder="gpt-4.1-mini"
                  required
                  disabled={!novo}
                  maxLength={120}
                  list={novo ? "modelos-da-api" : undefined}
                />
              </Campo>

              {novo && (
                <datalist id="modelos-da-api">
                  {(disponiveis?.modelos ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              )}

              <Campo
                rotulo="Entrada (USD / 1 M)"
                dica="O contexto que se envia."
              >
                <Entrada
                  value={campos.preco_entrada}
                  onChange={(e) => alterar("preco_entrada", e.target.value)}
                  placeholder="0.40"
                  inputMode="decimal"
                  required
                  className="tabular"
                />
              </Campo>

              <Campo
                rotulo="Entrada em cache (USD / 1 M)"
                dica="Opcional. Deixe vazio se o modelo não distinguir."
              >
                <Entrada
                  value={campos.preco_entrada_cache}
                  onChange={(e) =>
                    alterar("preco_entrada_cache", e.target.value)
                  }
                  placeholder="0.10"
                  inputMode="decimal"
                  className="tabular"
                />
              </Campo>

              <Campo
                rotulo="Saída (USD / 1 M)"
                dica="A resposta. É a parte cara."
              >
                <Entrada
                  value={campos.preco_saida}
                  onChange={(e) => alterar("preco_saida", e.target.value)}
                  placeholder="1.60"
                  inputMode="decimal"
                  required
                  className="tabular"
                />
              </Campo>

              <Campo
                rotulo="Para que serve"
                dica="Opcional. Ajuda a escolher."
                className="sm:col-span-2"
              >
                <Entrada
                  value={campos.nota}
                  onChange={(e) => alterar("nota", e.target.value)}
                  placeholder="Bom compromisso entre custo e capacidade"
                  maxLength={160}
                />
              </Campo>
            </div>

            {erro && (
              <div className="mt-3">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
            {aviso && (
              <div className="mt-3">
                <Alerta tipo="aviso">{aviso}</Alerta>
              </div>
            )}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Dialog.Close asChild>
              <Botao variante="neutro">Cancelar</Botao>
            </Dialog.Close>
            <Botao
              type="submit"
              form="form-modelo-ia"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? (
                "A gravar…"
              ) : (
                <>
                  {novo ? <Plus size={15} /> : <Check size={15} />}
                  {novo ? "Adicionar" : "Gravar"}
                </>
              )}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
