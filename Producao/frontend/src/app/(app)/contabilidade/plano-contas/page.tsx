"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

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
import {
  AccoesDaLinha,
  ConfirmarEliminar,
  DialogoMestre,
} from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { useContas } from "@/lib/hooks";
import type { Conta } from "@/types";

const ROTA = "/api/contabilidade/contas";

const CLASSES: Record<string, string> = {
  "1": "Meios Fixos e Investimentos",
  "2": "Existências",
  "3": "Terceiros",
  "4": "Disponibilidades",
  "5": "Capital e Reservas",
  "6": "Proveitos e Ganhos",
  "7": "Custos e Perdas",
  "8": "Resultados",
  "9": "Contabilidade Analítica",
};

const TIPOS: Record<string, { rotulo: string; cor: string }> = {
  M: { rotulo: "Movimento", cor: "#1a9c5f" },
  I: { rotulo: "Integradora", cor: "#3d7fe0" },
  R: { rotulo: "Raiz", cor: "#7a3aab" },
};

const NATUREZAS: Record<string, string> = {
  D: "Devedora",
  C: "Credora",
  M: "Mista",
};

export default function PlanoDeContas() {
  const { contas, isLoading, mutate } = useContas();
  const { pode } = useAuth();
  const [procura, setProcura] = useState("");
  const [classe, setClasse] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [emEdicao, setEmEdicao] = useState<Conta | null>(null);
  const [aCriar, setACriar] = useState<{ mae?: Conta } | null>(null);
  const [aApagar, setAApagar] = useState<Conta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("contab.plano");

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`${ROTA}/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAApagar(null);
    }
  }

  // O plano tem 1619 contas: filtrar a cada tecla bloquearia a escrita. O
  // useDeferredValue deixa o campo responder já e a lista actualizar a seguir.
  const procuraAdiada = useDeferredValue(procura);

  const filtradas = useMemo(() => {
    const termo = procuraAdiada.trim().toLowerCase();
    return contas.filter((c) => {
      if (classe !== "todas" && c.codigo[0] !== classe) return false;
      if (tipo !== "todos" && (c.tipo ?? "") !== tipo) return false;
      if (!termo) return true;
      return (
        c.codigo.toLowerCase().includes(termo) ||
        c.nome.toLowerCase().includes(termo)
      );
    });
  }, [contas, procuraAdiada, classe, tipo]);

  // Mostrar 1619 linhas de uma vez trava o browser — limita-se e diz-se quantas
  // ficaram de fora, em vez de truncar em silêncio.
  const LIMITE = 300;
  const visiveis = filtradas.slice(0, LIMITE);
  const ocultas = filtradas.length - visiveis.length;

  return (
    <>
      <CabecalhoPagina
        titulo="Plano de Contas"
        descricao="Plano Geral de Contabilidade de Angola (PGC-AR)."
        accoes={
          <div className="flex items-center gap-3">
            <Selo cor="#3d7fe0">
              {contas.length.toLocaleString("pt-PT")} contas
            </Selo>
            {podeGerir && (
              <Botao variante="primario" onClick={() => setACriar({})}>
                <Plus size={16} />
                Nova conta
              </Botao>
            )}
          </div>
        }
      />

      {erro && (
        <div className="mb-4">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
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
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código ou designação…"
              className="pl-9"
              type="search"
            />
          </div>
        </Campo>

        <Selector
          rotulo="Classe"
          valor={classe}
          aoMudar={setClasse}
          opcoes={[
            { valor: "todas", rotulo: "Todas as classes" },
            ...Object.entries(CLASSES).map(([k, v]) => ({
              valor: k,
              rotulo: `${k} — ${v}`,
            })),
          ]}
          larguraMinima="15rem"
        />

        <Selector
          rotulo="Tipo"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "M", rotulo: "Movimento" },
            { valor: "I", rotulo: "Integradora" },
            { valor: "R", rotulo: "Raiz" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar texto="A carregar o plano de contas…" />
        ) : filtradas.length === 0 ? (
          <Vazio>Nenhuma conta corresponde aos filtros.</Vazio>
        ) : (
          <>
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Código</Th>
                    <Th>Designação</Th>
                    <Th>Classe</Th>
                    <Th>Tipo</Th>
                    <Th>Natureza</Th>
                    <Th>Classe de IVA</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const t = TIPOS[c.tipo ?? ""];
                    return (
                      <Tr key={c.id}>
                        <Td className="font-bold tabular">{c.codigo}</Td>
                        {/* Designações longas: largura máxima e truncate, senão
                            a coluna empurra a tabela toda. */}
                        <Td className="max-w-[380px] truncate">
                          <span title={c.nome}>{c.nome}</span>
                        </Td>
                        <Td className="text-texto-suave">
                          {CLASSES[c.codigo[0]] ?? "—"}
                        </Td>
                        <Td>{t ? <Selo cor={t.cor}>{t.rotulo}</Selo> : "—"}</Td>
                        <Td className="text-texto-suave">
                          {NATUREZAS[c.natureza] ?? c.natureza}
                        </Td>
                        <Td className="max-w-[200px] truncate text-texto-suave">
                          {c.classe_iva || "—"}
                        </Td>
                        <Td numerico>
                          <div className="flex items-center justify-end gap-3">
                            {c.tipo === "M" && (
                              <Link
                                href={`/contabilidade/razao?conta=${c.codigo}`}
                                className="text-[12.5px] font-semibold text-marca hover:underline"
                              >
                                Ver razão
                              </Link>
                            )}
                            {podeGerir && (
                              <>
                                {c.tipo === "M" && (
                                  <button
                                    type="button"
                                    onClick={() => setACriar({ mae: c })}
                                    title="Criar uma subconta desta"
                                    className="text-[12.5px] font-semibold text-texto-suave hover:text-marca"
                                  >
                                    + Subconta
                                  </button>
                                )}
                                <AccoesDaLinha
                                  nome={`conta ${c.codigo}`}
                                  aoEditar={() => setEmEdicao(c)}
                                  aoApagar={() => setAApagar(c)}
                                  desactivado={ocupado}
                                />
                              </>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Tabela>
            </EnvolveTabela>
            {ocultas > 0 && (
              <div className="border-t border-borda px-4 py-3 text-center text-[13px] text-texto-suave">
                A mostrar {visiveis.length} de{" "}
                {filtradas.length.toLocaleString("pt-PT")} contas. Refine a
                pesquisa para ver as restantes {ocultas.toLocaleString("pt-PT")}
                .
              </div>
            )}
          </>
        )}
      </Cartao>

      {(aCriar || emEdicao) && (
        <FormularioConta
          conta={emEdicao}
          mae={aCriar?.mae}
          aoFechar={() => {
            setACriar(null);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            mutate();
            setACriar(null);
            setEmEdicao(null);
          }}
        />
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar a conta ${aApagar?.codigo ?? ""}?`}
        aoConfirmar={eliminar}
        ocupado={ocupado}
      >
        Uma conta <b>com movimentos não pode ser eliminada</b> — o balancete
        ficaria com linhas sem designação. Nesse caso o servidor recusa, e a
        alternativa é desactivá-la: sai das escolhas e o histórico continua a
        ler-se.
      </ConfirmarEliminar>
    </>
  );
}

// ---------------------------------------------------------------------------
/** Criar, criar subconta, ou alterar.
 *
 * A SUBCONTA é o caso do Piloto (`criarSubconta`): parte-se de uma conta de
 * movimento e cria-se outra por baixo. O código sugerido vem do servidor, que
 * sabe qual é o próximo livre. */
function FormularioConta({
  conta,
  mae,
  aoFechar,
  aoGravar,
}: {
  conta: Conta | null;
  mae?: Conta;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = conta === null;
  const [campos, setCampos] = useState({
    codigo: conta?.codigo ?? "",
    nome: conta?.nome ?? "",
    natureza: conta?.natureza ?? "D",
    classe_iva: conta?.classe_iva ?? "",
    ativa: conta?.ativa ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  // O próximo código livre por baixo da conta-mãe, perguntado ao servidor —
  // é ele que conhece o plano inteiro. Num efeito e não no corpo do
  // componente: um pedido lançado durante a renderização corre duas vezes em
  // modo estrito e não tem como ser cancelado.
  useEffect(() => {
    if (!mae || !novo) return;
    let vivo = true;
    api
      .get<{ codigo: string }>(`${ROTA}/${mae.codigo}/proxima-subconta`)
      .then((r) => {
        if (vivo) setCampos((c) => ({ ...c, codigo: r.codigo }));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [mae, novo]);

  function alterar(campo: string, valor: string | boolean) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      if (novo) {
        await api.post(ROTA, {
          codigo: campos.codigo,
          nome: campos.nome,
          natureza: campos.natureza,
          classe_iva: campos.classe_iva || null,
        });
      } else {
        await api.patch(`${ROTA}/${conta.id}`, {
          nome: campos.nome,
          natureza: campos.natureza,
          classe_iva: campos.classe_iva || null,
          ativa: campos.ativa,
        });
      }
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
    <DialogoMestre
      titulo={
        novo
          ? mae
            ? `Nova subconta de ${mae.codigo}`
            : "Nova conta"
          : `Alterar conta ${conta.codigo}`
      }
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
      aviso={
        mae && novo ? (
          <Alerta tipo="info">
            A conta <b>{mae.codigo}</b> passa a integradora quando ganhar
            subcontas: deixa de aceitar movimentos directos, e passam a ser as
            subcontas a recebê-los.
          </Alerta>
        ) : undefined
      }
    >
      <Campo
        rotulo="Código"
        dica={
          novo
            ? "É o que fica gravado em cada linha de lançamento."
            : "Não se altera: os movimentos guardam-no."
        }
      >
        <Entrada
          value={campos.codigo}
          onChange={(e) => alterar("codigo", e.target.value)}
          disabled={!novo}
          required
          maxLength={20}
          className="tabular"
        />
      </Campo>

      <Campo rotulo="Designação">
        <Entrada
          value={campos.nome}
          onChange={(e) => alterar("nome", e.target.value)}
          required
          maxLength={200}
        />
      </Campo>

      <Campo
        rotulo="Natureza"
        dica="Vazia, o servidor deduz da classe do código."
      >
        <Selector
          valor={campos.natureza}
          aoMudar={(v) => alterar("natureza", v)}
          opcoes={[
            { valor: "D", rotulo: "Devedora" },
            { valor: "C", rotulo: "Credora" },
            { valor: "M", rotulo: "Mista" },
          ]}
        />
      </Campo>

      <Campo rotulo="Classe de IVA" dica="Opcional.">
        <Entrada
          value={campos.classe_iva}
          onChange={(e) => alterar("classe_iva", e.target.value)}
          maxLength={60}
        />
      </Campo>

      {!novo && (
        <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={campos.ativa}
            onChange={(e) => alterar("ativa", e.target.checked)}
            className="size-4 accent-[var(--color-marca)]"
          />
          Activa — uma conta inactiva deixa de ser oferecida em movimentos
          novos, e o histórico continua a ler-se.
        </label>
      )}
    </DialogoMestre>
  );
}
