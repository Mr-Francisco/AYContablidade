"use client";

import { Ban, Copy, KeyRound, Pencil, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

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
  Tr,
  Vazio,
} from "@/components/ui";
import { CampoNif } from "@/components/ui/CampoNif";
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataInteiro } from "@/lib/dinheiro";
import { plural } from "@/lib/texto";
import type { LicencaGerada, LicencaPlataforma } from "@/types";

/** A resposta da listagem: uma página, e a contagem por estado de todas. */
interface PaginaLicencas extends Pagina<LicencaPlataforma> {
  por_estado: Record<string, number>;
}

const CORES: Record<string, string> = {
  pendente: "#c98a10",
  activa: "#1a9c5f",
  expirada: "#8a8a8a",
  suspensa: "#c98a10",
  cancelada: "#c62828",
};

export default function Licencas() {
  const [estado, setEstado] = useState("todos");
  const [novaAberta, setNovaAberta] = useState(false);
  const [aEditar, setAEditar] = useState<LicencaPlataforma | null>(null);
  const [aRevogar, setARevogar] = useState<LicencaPlataforma | null>(null);
  const [gerada, setGerada] = useState<LicencaGerada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = usePaginacao();
  const { data, isLoading, mutate } = useSWR<PaginaLicencas>(
    `/api/licencas?${p.query}${estado !== "todos" ? `&estado=${estado}` : ""}`,
    buscador,
  );

  const todas = data?.linhas ?? [];
  // Do servidor e sobre TODAS as licenças: com o filtro em «activas», contar
  // as pendentes da página dava sempre zero — uma afirmação falsa sobre a
  // plataforma, e não só um número em falta.
  const porEstado = (e: string) => data?.por_estado[e] ?? 0;

  async function revogar(l: LicencaPlataforma) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/licencas/${l.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível revogar.",
      );
    } finally {
      setOcupado(false);
      setARevogar(null);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Licenças"
        descricao="Licenças da plataforma. A chave é mostrada uma única vez, no momento em que é gerada."
        accoes={
          <Botao variante="primario" onClick={() => setNovaAberta(true)}>
            <KeyRound size={16} />
            Gerar licença
          </Botao>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Activas"
            valor={String(porEstado("activa"))}
            detalhe="Empresas a usar o sistema"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Por activar"
            valor={String(porEstado("pendente"))}
            detalhe="Dentro do prazo de 7 dias"
            cor="var(--color-aviso)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Expiradas"
            valor={String(porEstado("expirada"))}
            detalhe="Prazo de activação ultrapassado"
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Total"
            valor={String(todas.length)}
            detalhe="Emitidas desde sempre"
            cor="var(--grafico-1)"
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Estado"
          valor={estado}
          aoMudar={(v) => {
            setEstado(v);
            p.reiniciar();
          }}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "pendente", rotulo: "Por activar" },
            { valor: "activa", rotulo: "Activas" },
            { valor: "expirada", rotulo: "Expiradas" },
            { valor: "cancelada", rotulo: "Canceladas" },
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !todas.length ? (
          <Vazio>Ainda não foi gerada nenhuma licença.</Vazio>
        ) : (
          <>
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Chave</Th>
                    <Th>Empresa</Th>
                    <Th>NIF</Th>
                    <Th>Plano</Th>
                    <Th>Estado</Th>
                    <Th>Prazo / Validade</Th>
                    <Th numerico>Utilizadores</Th>
                    <Th numerico>Tokens/mês</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {todas.map((l) => (
                    <Tr key={l.id}>
                      <Td className="tabular font-bold">{l.chave_prefixo}…</Td>
                      <Td className="max-w-[220px] truncate font-semibold">
                        {l.nome_previsto}
                      </Td>
                      <Td className="tabular">{l.nif_previsto}</Td>
                      <Td>{l.plano}</Td>
                      <Td>
                        <Selo cor={CORES[l.estado] ?? "#62657a"}>
                          {l.estado}
                        </Selo>
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {l.activada_em
                          ? l.validade
                            ? `até ${new Date(l.validade).toLocaleDateString("pt-PT")}`
                            : "sem termo"
                          : `activar até ${new Date(l.expira_activacao).toLocaleDateString("pt-PT")}`}
                      </Td>
                      <Td numerico>{l.limite_utilizadores ?? "—"}</Td>
                      <Td numerico>
                        {l.limite_tokens_mes
                          ? formataInteiro(l.limite_tokens_mes)
                          : "—"}
                      </Td>
                      <Td numerico>
                        <div className="flex justify-end gap-1.5">
                          <Botao
                            tamanho="pequeno"
                            onClick={() => setAEditar(l)}
                            aria-label={`Editar licença de ${l.nome_previsto}`}
                          >
                            <Pencil size={13} />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            variante="perigo"
                            onClick={() => setARevogar(l)}
                            aria-label={`Revogar licença de ${l.nome_previsto}`}
                          >
                            <Ban size={13} />
                          </Botao>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            <BarraPaginacao pagina={data} {...p.controlos} nome="licenças" />
          </>
        )}
      </Cartao>

      {novaAberta && (
        <FormularioLicenca
          aoFechar={() => setNovaAberta(false)}
          aoGerar={(g) => {
            setNovaAberta(false);
            setGerada(g);
            mutate();
          }}
        />
      )}

      {gerada && (
        <ModalChave licenca={gerada} aoFechar={() => setGerada(null)} />
      )}

      {aEditar && (
        <FormularioAlteracao
          licenca={aEditar}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => {
            setAEditar(null);
            mutate();
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aRevogar}
        onOpenChange={(a) => !a && setARevogar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Revogar a licença de {aRevogar?.nome_previsto}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              {aRevogar?.empresa_id ? (
                <>
                  Esta licença <b>já foi activada</b>, por isso passa a
                  cancelada e fica no registo — apagá-la deixaria a empresa sem
                  vestígio do contrato que a criou. A empresa deixa de conseguir
                  entrar.
                </>
              ) : (
                <>
                  Esta licença <b>ainda não foi activada</b> e é apagada. A
                  chave deixa de servir. Se foi enviada a alguém, avise — vai
                  receber «chave inválida».
                </>
              )}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => aRevogar && revogar(aRevogar)}
                >
                  Revogar
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function ModalChave({
  licenca,
  aoFechar,
}: {
  licenca: LicencaGerada;
  aoFechar: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  return (
    <Modal titulo="Licença gerada" aoFechar={aoFechar} largura="560px">
      <div className="flex flex-col gap-4 p-5">
        <Alerta tipo="aviso">
          <b>Esta chave não volta a ser mostrada.</b> Por segurança, não fica
          guardada de forma legível. Copie-a agora e entregue-a ao cliente. Se a
          perder, gere uma licença nova.
        </Alerta>

        <div className="rounded-xl border-2 border-dashed border-marca bg-fundo p-5 text-center">
          <p className="tabular text-2xl font-black tracking-[2px] text-marca">
            {licenca.chave}
          </p>
        </div>

        <Botao
          variante={copiada ? "primario" : undefined}
          bloco
          onClick={() => {
            navigator.clipboard?.writeText(licenca.chave);
            setCopiada(true);
          }}
        >
          <Copy size={16} />
          {copiada ? "Copiada" : "Copiar chave"}
        </Botao>

        <dl className="rounded-xl border border-borda bg-fundo p-3 text-sm">
          <Par rotulo="Empresa" valor={licenca.nome_previsto} />
          <Par rotulo="NIF" valor={licenca.nif_previsto} />
          <Par rotulo="Plano" valor={licenca.plano} />
          <Par
            rotulo="Activar até"
            valor={`${new Date(licenca.expira_activacao).toLocaleDateString("pt-PT")} (${plural(licenca.dias_para_activar, "dia")})`}
          />
        </dl>

        <div className="flex justify-end">
          <Botao onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>
    </Modal>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borda/60 py-1 last:border-0">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}

function FormularioLicenca({
  aoFechar,
  aoGerar,
}: {
  aoFechar: () => void;
  aoGerar: (g: LicencaGerada) => void;
}) {
  const [campos, setCampos] = useState({
    nif: "",
    nome_empresa: "",
    titular: "",
    plano: "Base",
    duracao_meses: "12",
    limite_utilizadores: "",
    limite_tokens_mes: "",
    limite_custo_mes: "",
    notas: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGerar(true);
    try {
      aoGerar(
        await api.post<LicencaGerada>("/api/licencas", {
          nif: campos.nif.trim(),
          nome_empresa: campos.nome_empresa.trim(),
          titular: campos.titular.trim() || null,
          plano: campos.plano,
          duracao_meses: Number(campos.duracao_meses) || null,
          limite_utilizadores: campos.limite_utilizadores
            ? Number(campos.limite_utilizadores)
            : null,
          limite_tokens_mes: campos.limite_tokens_mes
            ? Number(campos.limite_tokens_mes)
            : null,
          limite_custo_mes: campos.limite_custo_mes || null,
          notas: campos.notas.trim() || null,
        }),
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gerar a licença.",
      );
    } finally {
      setAGerar(false);
    }
  }

  return (
    <Modal titulo="Gerar licença" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="info">
          O NIF e o nome ficam <b>gravados na licença</b> e são confirmados na
          activação: é o que impede que uma chave interceptada sirva para
          registar outra empresa.
        </Alerta>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Confirmar aqui é o sítio que mais rende: o NIF e o nome ficam
              GRAVADOS na licença e são conferidos na activação. Um nome
              escrito à mão com um erro obriga a emitir a licença outra vez. */}
          <CampoNif
            rotulo="NIF da empresa"
            valor={campos.nif}
            autoFocus
            aoMudar={(v) => alterar("nif", v)}
            aoConfirmar={(r) => {
              if (r.nome && !campos.nome_empresa.trim())
                alterar("nome_empresa", r.nome);
              alterar("nif", r.nif);
            }}
            className="sm:col-span-2"
            dica="Confirme na AGT — traz o nome com que a empresa está registada."
          />
          <Campo rotulo="Nome da empresa">
            <Entrada
              value={campos.nome_empresa}
              onChange={(e) => alterar("nome_empresa", e.target.value)}
              required
            />
          </Campo>
          <Campo rotulo="Titular do contrato" dica="Em branco usa o nome.">
            <Entrada
              value={campos.titular}
              onChange={(e) => alterar("titular", e.target.value)}
            />
          </Campo>
          <Selector
            rotulo="Plano"
            valor={campos.plano}
            aoMudar={(v) => alterar("plano", v)}
            opcoes={[
              { valor: "Base", rotulo: "Base" },
              { valor: "Profissional", rotulo: "Profissional" },
              { valor: "Enterprise", rotulo: "Enterprise" },
            ]}
            larguraMinima="100%"
          />
          <Campo
            rotulo="Duração (meses)"
            dica="Contada a partir da activação, não da emissão."
          >
            <Entrada
              type="number"
              min="1"
              max="120"
              value={campos.duracao_meses}
              onChange={(e) => alterar("duracao_meses", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Limite de utilizadores" dica="Em branco = sem limite.">
            <Entrada
              type="number"
              min="1"
              value={campos.limite_utilizadores}
              onChange={(e) => alterar("limite_utilizadores", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Tokens de IA por mês" dica="Em branco = sem limite.">
            <Entrada
              type="number"
              min="0"
              step="100000"
              value={campos.limite_tokens_mes}
              onChange={(e) => alterar("limite_tokens_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo
            rotulo="Custo de IA por mês (USD)"
            dica="Em branco = sem limite."
          >
            <Entrada
              type="number"
              min="0"
              step="0.01"
              value={campos.limite_custo_mes}
              onChange={(e) => alterar("limite_custo_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Notas" className="sm:col-span-2">
            <Entrada
              value={campos.notas}
              onChange={(e) => alterar("notas", e.target.value)}
            />
          </Campo>
        </div>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGerar}>
            {aGerar ? "A gerar…" : "Gerar licença"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormularioAlteracao({
  licenca,
  aoFechar,
  aoGravar,
}: {
  licenca: LicencaPlataforma;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [campos, setCampos] = useState({
    plano: licenca.plano,
    estado: licenca.estado,
    validade: licenca.validade ?? "",
    limite_utilizadores: licenca.limite_utilizadores?.toString() ?? "",
    limite_tokens_mes: licenca.limite_tokens_mes?.toString() ?? "",
    limite_custo_mes: licenca.limite_custo_mes ?? "",
    notas: licenca.notas ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.patch(`/api/licencas/${licenca.id}`, {
        plano: campos.plano,
        estado: campos.estado,
        validade: campos.validade || null,
        limite_utilizadores: campos.limite_utilizadores
          ? Number(campos.limite_utilizadores)
          : null,
        limite_tokens_mes: campos.limite_tokens_mes
          ? Number(campos.limite_tokens_mes)
          : null,
        limite_custo_mes: campos.limite_custo_mes || null,
        notas: campos.notas.trim() || null,
      });
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
    <Modal titulo={`Contrato de ${licenca.nome_previsto}`} aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="info">
          A chave não se altera. Para emitir uma chave nova, gera-se outra
          licença — trocar a chave de uma licença já activada não faria sentido,
          porque a empresa existe e já entra pelo login.
        </Alerta>

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            rotulo="Plano"
            valor={campos.plano}
            aoMudar={(v) => alterar("plano", v)}
            opcoes={[
              { valor: "Base", rotulo: "Base" },
              { valor: "Profissional", rotulo: "Profissional" },
              { valor: "Enterprise", rotulo: "Enterprise" },
            ]}
            larguraMinima="100%"
          />
          <Selector
            rotulo="Estado"
            valor={campos.estado}
            aoMudar={(v) => alterar("estado", v)}
            opcoes={[
              { valor: "activa", rotulo: "Activa" },
              { valor: "suspensa", rotulo: "Suspensa" },
              { valor: "cancelada", rotulo: "Cancelada" },
              { valor: "expirada", rotulo: "Expirada" },
            ]}
            larguraMinima="100%"
          />
          <Campo rotulo="Validade" dica="Em branco = perpétua.">
            <Entrada
              type="date"
              value={campos.validade}
              onChange={(e) => alterar("validade", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Limite de utilizadores">
            <Entrada
              type="number"
              min="1"
              value={campos.limite_utilizadores}
              onChange={(e) => alterar("limite_utilizadores", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Tokens de IA por mês">
            <Entrada
              type="number"
              min="0"
              step="100000"
              value={campos.limite_tokens_mes}
              onChange={(e) => alterar("limite_tokens_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Custo de IA por mês (USD)">
            <Entrada
              type="number"
              min="0"
              step="0.01"
              value={campos.limite_custo_mes}
              onChange={(e) => alterar("limite_custo_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Notas" className="sm:col-span-2">
            <Entrada
              value={campos.notas}
              onChange={(e) => alterar("notas", e.target.value)}
            />
          </Campo>
        </div>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A gravar…" : "Gravar contrato"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  titulo,
  aoFechar,
  largura = "700px",
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  largura?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
          style={{ width: `min(${largura}, 94vw)` }}
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
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
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
