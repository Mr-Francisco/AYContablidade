"use client";

import { Check, KeyRound, Plus, Search, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { plural } from "@/lib/texto";
import type { MetadadosAcesso, Perfil, PerfilMeta, Utilizador } from "@/types";

export default function Utilizadores() {
  const { utilizador: eu } = useAuth();

  const [procura, setProcura] = useState("");
  const [estado, setEstado] = useState("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [aEditar, setAEditar] = useState<Utilizador | null>(null);
  const [aPassword, setAPassword] = useState<Utilizador | null>(null);
  const [aEliminar, setAEliminar] = useState<Utilizador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, mutate } = useSWR<Utilizador[]>(
    "/api/users",
    buscador,
  );
  const { data: meta } = useSWR<MetadadosAcesso>(
    "/api/users/metadados",
    buscador,
    { revalidateOnFocus: false },
  );

  const porPerfil = useMemo(() => {
    const m = new Map<string, PerfilMeta>();
    for (const p of meta?.perfis ?? []) m.set(p.id, p);
    return m;
  }, [meta]);

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data ?? []).filter((u) => {
      if (estado === "pendentes" && u.aprovado) return false;
      if (estado === "activos" && (!u.ativo || !u.aprovado)) return false;
      if (estado === "inactivos" && u.ativo) return false;
      if (!t) return true;
      return (
        u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)
      );
    });
  }, [data, procura, estado]);

  const pendentes = (data ?? []).filter((u) => !u.aprovado).length;
  const activos = (data ?? []).filter((u) => u.ativo && u.aprovado).length;

  async function accao(fn: () => Promise<unknown>, mensagem: string) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await fn();
      setAviso(mensagem);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Utilizadores"
        descricao="Contas desta empresa, perfis de acesso e aprovações pendentes."
        accoes={
          <Botao variante="primario" onClick={() => setNovoAberto(true)}>
            <Plus size={16} />
            Novo utilizador
          </Botao>
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Contas"
            valor={String(data?.length ?? 0)}
            detalhe={`${filtrados.length} a mostrar`}
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Activas"
            valor={String(activos)}
            detalhe="Contam para o limite do plano"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Por aprovar"
            valor={String(pendentes)}
            detalhe="Não conseguem entrar"
            cor={pendentes > 0 ? "var(--color-aviso)" : "var(--grafico-4)"}
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Perfis em uso"
            valor={String(new Set((data ?? []).map((u) => u.perfil)).size)}
            detalhe={`de ${meta?.perfis.length ?? 0} disponíveis`}
            cor="var(--grafico-1)"
          />
        </div>
      </div>

      {pendentes > 0 && (
        <Alerta tipo="aviso" className="mb-4">
          Há <b>{plural(pendentes, "conta", "contas")}</b> por aprovar. Uma
          conta registada mas não aprovada existe e tem palavra-passe, mas não
          entra — é essa a barreira que impede que qualquer pessoa que descubra
          o endereço se junte à empresa.
        </Alerta>
      )}

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[240px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Nome ou e-mail…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Estado"
          valor={estado}
          aoMudar={setEstado}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "pendentes", rotulo: "Por aprovar" },
            { valor: "activos", rotulo: "Activos" },
            { valor: "inactivos", rotulo: "Inactivos" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !filtrados.length ? (
          <Vazio>
            {procura.trim() || estado !== "todos"
              ? "Nenhuma conta corresponde aos filtros."
              : "Ainda não há utilizadores."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>E-mail</Th>
                  <Th>Perfil</Th>
                  <Th>Módulos</Th>
                  <Th>Último acesso</Th>
                  <Th>Estado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => {
                  const p = porPerfil.get(u.perfil);
                  const souEu = u.id === eu?.id;
                  return (
                    <Tr key={u.id}>
                      <Td className="max-w-[200px] truncate font-semibold">
                        {u.nome}
                        {souEu && (
                          <span className="ml-2 text-xs font-normal text-texto-suave">
                            (você)
                          </span>
                        )}
                      </Td>
                      <Td className="max-w-[220px] truncate text-texto-suave">
                        {u.email}
                      </Td>
                      <Td>
                        <Selo cor={p?.cor ?? "#62657a"}>
                          {p?.nome ?? u.perfil}
                        </Selo>
                      </Td>
                      <Td className="text-texto-suave">
                        {u.modulos_permitidos === null ? (
                          "Todos os do perfil"
                        ) : u.modulos_permitidos.length === 0 ? (
                          <span className="text-perigo">Nenhum</span>
                        ) : (
                          plural(u.modulos_permitidos.length, "módulo")
                        )}
                      </Td>
                      <Td className="tabular">
                        {u.ultimo_login
                          ? new Date(u.ultimo_login).toLocaleDateString("pt-PT")
                          : "—"}
                      </Td>
                      <Td>
                        {!u.aprovado ? (
                          <Selo cor="#c98a10">Por aprovar</Selo>
                        ) : u.ativo ? (
                          <Selo cor="#1a9c5f">Activo</Selo>
                        ) : (
                          <Selo cor="#8a8a8a">Inactivo</Selo>
                        )}
                      </Td>
                      <Td numerico>
                        <div className="flex justify-end gap-1.5">
                          {!u.aprovado && (
                            <Botao
                              tamanho="pequeno"
                              variante="primario"
                              disabled={ocupado}
                              onClick={() =>
                                accao(
                                  () =>
                                    api.post(`/api/users/${u.id}/aprovar`, {}),
                                  `${u.nome} passou a poder entrar.`,
                                )
                              }
                            >
                              <Check size={13} />
                              Aprovar
                            </Botao>
                          )}
                          <Botao
                            tamanho="pequeno"
                            onClick={() => setAEditar(u)}
                            aria-label={`Editar ${u.nome}`}
                          >
                            Editar
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            onClick={() => setAPassword(u)}
                            aria-label={`Definir palavra-passe de ${u.nome}`}
                          >
                            <KeyRound size={13} />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            variante="perigo"
                            disabled={souEu}
                            title={
                              souEu
                                ? "Não pode eliminar a sua própria conta"
                                : undefined
                            }
                            onClick={() => setAEliminar(u)}
                            aria-label={`Eliminar ${u.nome}`}
                          >
                            <Trash2 size={13} />
                          </Botao>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {(novoAberto || aEditar) && meta && (
        <FormularioUtilizador
          utilizador={aEditar}
          meta={meta}
          aoFechar={() => {
            setNovoAberto(false);
            setAEditar(null);
          }}
          aoGravar={(msg) => {
            setNovoAberto(false);
            setAEditar(null);
            setAviso(msg);
            mutate();
          }}
        />
      )}

      {aPassword && (
        <FormularioPassword
          utilizador={aPassword}
          aoFechar={() => setAPassword(null)}
          aoGravar={(msg) => {
            setAPassword(null);
            setAviso(msg);
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aEliminar}
        onOpenChange={(a) => !a && setAEliminar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Eliminar a conta de {aEliminar?.nome}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              A conta desaparece e a pessoa deixa de poder entrar. Os
              lançamentos que fez ficam — são documentos contabilísticos. Se o
              objectivo é apenas impedir o acesso, <b>desactivar</b> é melhor:
              liberta o lugar no plano e mantém o histórico legível.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => {
                    const u = aEliminar;
                    setAEliminar(null);
                    if (u) {
                      accao(
                        () => api.delete(`/api/users/${u.id}`),
                        `Conta de ${u.nome} eliminada.`,
                      );
                    }
                  }}
                >
                  Eliminar
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function FormularioUtilizador({
  utilizador,
  meta,
  aoFechar,
  aoGravar,
}: {
  utilizador: Utilizador | null;
  meta: MetadadosAcesso;
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const atribuiveis = meta.perfis.filter((p) => p.atribuivel);

  const [campos, setCampos] = useState({
    nome: utilizador?.nome ?? "",
    email: utilizador?.email ?? "",
    password: "",
    perfil: (utilizador?.perfil ?? "consulta") as Perfil,
    telefone: utilizador?.telefone ?? "",
    ativo: utilizador ? utilizador.ativo : true,
  });
  // `null` = sem restrição pessoal (herda do perfil). Lista vazia = nenhum
  // módulo. São coisas diferentes, e é por isso que há um interruptor à parte.
  const [restringir, setRestringir] = useState(
    utilizador?.modulos_permitidos !== null &&
      utilizador?.modulos_permitidos !== undefined,
  );
  const [modulos, setModulos] = useState<string[]>(
    utilizador?.modulos_permitidos ?? [],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const perfilEscolhido = meta.perfis.find((p) => p.id === campos.perfil);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    const comum = {
      nome: campos.nome.trim(),
      perfil: campos.perfil,
      telefone: campos.telefone.trim() || null,
      modulos_permitidos: restringir ? modulos : null,
    };
    try {
      if (utilizador) {
        await api.patch(`/api/users/${utilizador.id}`, {
          ...comum,
          ativo: campos.ativo,
        });
        aoGravar(`${comum.nome} actualizado.`);
      } else {
        await api.post("/api/users", {
          ...comum,
          email: campos.email.trim().toLowerCase(),
          password: campos.password,
          permissoes_extra: [],
          permissoes_accao: {},
          aprovado: true,
        });
        aoGravar(`${comum.nome} criado e já pode entrar.`);
      }
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
      titulo={utilizador ? `Editar ${utilizador.nome}` : "Novo utilizador"}
      aoFechar={aoFechar}
    >
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <Entrada
              value={campos.nome}
              onChange={(e) =>
                setCampos((c) => ({ ...c, nome: e.target.value }))
              }
              required
              autoFocus
            />
          </Campo>
          <Campo
            rotulo="E-mail"
            dica={utilizador ? "Não é alterável depois de criado." : undefined}
          >
            <Entrada
              type="email"
              value={campos.email}
              onChange={(e) =>
                setCampos((c) => ({ ...c, email: e.target.value }))
              }
              required
              disabled={!!utilizador}
            />
          </Campo>
          {!utilizador && (
            <Campo rotulo="Palavra-passe" dica="Mínimo 8 caracteres.">
              <Entrada
                type="password"
                value={campos.password}
                onChange={(e) =>
                  setCampos((c) => ({ ...c, password: e.target.value }))
                }
                required
                minLength={8}
              />
            </Campo>
          )}
          <Campo rotulo="Telefone">
            <Entrada
              value={campos.telefone}
              onChange={(e) =>
                setCampos((c) => ({ ...c, telefone: e.target.value }))
              }
              className="tabular"
            />
          </Campo>
          <Selector
            rotulo="Perfil"
            valor={campos.perfil}
            aoMudar={(v) => setCampos((c) => ({ ...c, perfil: v as Perfil }))}
            opcoes={atribuiveis.map((p) => ({ valor: p.id, rotulo: p.nome }))}
            larguraMinima="100%"
          />
          {utilizador && (
            <Selector
              rotulo="Estado"
              valor={campos.ativo ? "activo" : "inactivo"}
              aoMudar={(v) =>
                setCampos((c) => ({ ...c, ativo: v === "activo" }))
              }
              opcoes={[
                { valor: "activo", rotulo: "Activo" },
                { valor: "inactivo", rotulo: "Inactivo" },
              ]}
              larguraMinima="100%"
            />
          )}
        </div>

        {perfilEscolhido && (
          <Alerta tipo="info">
            O perfil <b>{perfilEscolhido.nome}</b> dá{" "}
            {perfilEscolhido.capacidades.includes("*")
              ? "acesso total ao sistema"
              : plural(perfilEscolhido.capacidades.length, "capacidade")}
            . As restrições abaixo só podem <b>tirar</b> acesso, nunca dar mais
            do que o perfil permite.
          </Alerta>
        )}

        <fieldset className="rounded-xl border border-borda p-3">
          <legend className="px-1 text-xs font-semibold text-texto-suave">
            Módulos
          </legend>
          <Selector
            rotulo=""
            valor={restringir ? "sim" : "nao"}
            aoMudar={(v) => setRestringir(v === "sim")}
            opcoes={[
              { valor: "nao", rotulo: "Todos os módulos do perfil" },
              { valor: "sim", rotulo: "Restringir a alguns módulos" },
            ]}
            larguraMinima="100%"
          />
          {restringir && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {meta.modulos.map((m) => {
                  const on = modulos.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setModulos((v) =>
                          on ? v.filter((x) => x !== m.id) : [...v, m.id],
                        )
                      }
                      className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                        on
                          ? "border-marca bg-marca text-white"
                          : "border-borda text-texto-suave hover:border-marca hover:text-marca"
                      }`}
                    >
                      {m.nome}
                    </button>
                  );
                })}
              </div>
              {modulos.length === 0 && (
                <p className="mt-2 text-xs text-perigo">
                  Sem nenhum módulo escolhido, esta conta entra mas não vê nada.
                </p>
              )}
            </>
          )}
        </fieldset>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A gravar…" : "Gravar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormularioPassword({
  utilizador,
  aoFechar,
  aoGravar,
}: {
  utilizador: Utilizador;
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.post(`/api/users/${utilizador.id}/password`, {
        password_nova: password,
      });
      aoGravar(
        `Palavra-passe de ${utilizador.nome} definida. As sessões abertas foram terminadas.`,
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível definir a palavra-passe.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal titulo={`Palavra-passe de ${utilizador.nome}`} aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="aviso">
          Definir uma palavra-passe nova <b>termina as sessões abertas</b> desta
          pessoa em todos os dispositivos. É o comportamento pretendido: uma
          palavra-passe mudada por suspeita de acesso indevido não serve de nada
          se a sessão antiga continuar válida.
        </Alerta>
        <Campo rotulo="Nova palavra-passe" dica="Mínimo 8 caracteres.">
          <Entrada
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </Campo>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A definir…" : "Definir palavra-passe"}
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
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(680px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
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
