"use client";

import { Info, Plus, Search } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  DialogoFechos,
  useFechos,
} from "@/components/contabilidade/FechosDoDiario";
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
import { useDiarios, useDocumentos, useExercicios } from "@/lib/hooks";
import type { Diario } from "@/types";

const CATEGORIAS: Record<string, { rotulo: string; cor: string }> = {
  compras: { rotulo: "Compras", cor: "#d68910" },
  vendas: { rotulo: "Vendas", cor: "#2980b9" },
  caixa_bancos: { rotulo: "Tesouraria", cor: "#1a9c5f" },
  imobilizado: { rotulo: "Imobilizado", cor: "#7a3aab" },
  rh: { rotulo: "Recursos Humanos", cor: "#16a085" },
  outros: { rotulo: "Outros", cor: "#62657a" },
};

const ROTA = "/api/contabilidade/diarios";

export default function Diarios() {
  const { diarios, isLoading, mutate } = useDiarios();
  const { exercicios, activo } = useExercicios();
  const { pode } = useAuth();
  const [categoria, setCategoria] = useState("todas");
  const [procura, setProcura] = useState("");
  const [emEdicao, setEmEdicao] = useState<Diario | null>(null);
  const [aCriar, setACriar] = useState(false);
  const [aApagar, setAApagar] = useState<Diario | null>(null);
  const [aGerirFechos, setAGerirFechos] = useState<Diario | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("contab.plano");
  // A coluna «Documentos» existe no Piloto e faltava aqui. É o número que
  // responde à pergunta que se faz antes de mexer num diário: quantos tipos de
  // documento dependem dele.
  const { documentos } = useDocumentos();
  const podeFechar = pode("contab.fechar");

  // Exercício escolhido para a coluna de fechos. Começa no activo, porque é
  // esse em que se está a trabalhar; `""` só acontece se a empresa não tiver
  // exercício nenhum.
  const [exercicioId, setExercicioId] = useState("");
  const exercicio =
    exercicios.find((e) => e.id === exercicioId) ?? activo ?? null;

  // Um pedido só, para todos os diários: os fechos deste exercício vêm todos
  // juntos e contam-se por diário em memória. Um pedido por linha seriam
  // quinze pedidos para desenhar uma coluna.
  const { fechos } = useFechos(exercicio?.id);

  // A pesquisa é do cliente e aqui pode ser: a tabela de diários é um
  // CATÁLOGO — uma empresa tem uma dúzia deles e não cresce com o tempo. É a
  // excepção que a regra das listagens prevê (ver `CLAUDE.md`).
  const filtrados = useMemo(() => {
    const q = procura.trim().toLowerCase();
    return diarios.filter((d) => {
      if (categoria !== "todas" && d.categoria !== categoria) return false;
      if (!q) return true;
      return (
        d.codigo.toLowerCase().includes(q) || d.nome.toLowerCase().includes(q)
      );
    });
  }, [diarios, categoria, procura]);

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`${ROTA}/${aApagar.id}`);
      mutate();
      setAApagar(null);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
      setAApagar(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Diários"
        descricao="Diários contabilísticos. A categoria determina em que módulos o diário é oferecido."
        accoes={
          <div className="flex items-center gap-3">
            <Selo cor="#3d7fe0">{diarios.length} diários</Selo>
            {podeGerir && (
              <Botao variante="primario" onClick={() => setACriar(true)}>
                <Plus size={16} />
                Novo diário
              </Botao>
            )}
          </div>
        }
      />

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[15rem] flex-1">
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código ou designação…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Categoria"
          valor={categoria}
          aoMudar={setCategoria}
          opcoes={[
            { valor: "todas", rotulo: "Todas as categorias" },
            ...Object.entries(CATEGORIAS).map(([k, v]) => ({
              valor: k,
              rotulo: v.rotulo,
            })),
          ]}
          larguraMinima="15rem"
        />
        {exercicios.length > 0 && (
          <Selector
            rotulo="Exercício (fechos)"
            valor={exercicio?.id ?? ""}
            aoMudar={setExercicioId}
            opcoes={exercicios.map((e) => ({
              valor: e.id,
              rotulo: e.estado === "fechado" ? `${e.nome} (fechado)` : e.nome,
            }))}
            larguraMinima="15rem"
          />
        )}
      </BarraFiltros>

      {/* A frase do Piloto, palavra por palavra: é ela que explica o que a
          coluna «Fechos» faz. Sem ela, «Gerir fechos» é um botão que ninguém
          sabe se pode carregar. */}
      <div className="mb-4">
        <Alerta tipo="info">
          <Info size={16} />
          <span>
            Pode fechar um diário num <b>mês/período concreto</b> do exercício
            acima — deixa de aceitar novos lançamentos nesse diário e período
            até ser reaberto.
          </span>
        </Alerta>
      </div>

      {exercicio?.estado === "fechado" && (
        <div className="mb-4">
          <Alerta tipo="info">
            O <b>{exercicio.nome}</b> está fechado por inteiro — nenhum diário
            aceita lançamentos, independentemente destes fechos mensais.
            Reabre-se em Contabilidade → Exercícios.
          </Alerta>
        </div>
      )}

      {erro && (
        <div className="mb-4">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : filtrados.length === 0 ? (
          <Vazio>
            {procura.trim()
              ? "Nenhum diário corresponde à pesquisa."
              : "Nenhum diário nesta categoria."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Designação</Th>
                  <Th>Categoria</Th>
                  <Th>Estado</Th>
                  <Th numerico>Documentos</Th>
                  <Th>Fechos {exercicio ? `(${exercicio.nome})` : ""}</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => {
                  const c = CATEGORIAS[d.categoria] ?? {
                    rotulo: d.categoria,
                    cor: "#62657a",
                  };
                  const nFechos = fechos.filter(
                    (f) => f.diario_codigo === d.codigo,
                  ).length;
                  return (
                    <Tr key={d.id}>
                      <Td className="font-bold tabular">{d.codigo}</Td>
                      <Td>{d.nome}</Td>
                      <Td>
                        <Selo cor={c.cor}>{c.rotulo}</Selo>
                      </Td>
                      <Td>
                        <Selo cor={d.ativo ? "#1a9c5f" : "#8a8a8a"}>
                          {d.ativo ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                      <Td numerico className="text-texto-suave">
                        {
                          documentos.filter(
                            (doc) => doc.diario_codigo === d.codigo,
                          ).length
                        }
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Selo cor={nFechos ? "#8a8a8a" : "#1a9c5f"}>
                            {nFechos
                              ? `${nFechos} ${nFechos === 1 ? "período fechado" : "períodos fechados"}`
                              : "Tudo aberto"}
                          </Selo>
                          <Botao
                            variante="neutro"
                            tamanho="pequeno"
                            disabled={!exercicio}
                            title={
                              exercicio
                                ? undefined
                                : "Crie um exercício em Contabilidade → Exercícios"
                            }
                            onClick={() => setAGerirFechos(d)}
                          >
                            {podeFechar ? "Gerir fechos" : "Ver fechos"}
                          </Botao>
                        </div>
                      </Td>
                      {podeGerir && (
                        <Td>
                          <AccoesDaLinha
                            nome={`diário ${d.codigo}`}
                            aoEditar={() => setEmEdicao(d)}
                            aoApagar={() => setAApagar(d)}
                            desactivado={ocupado}
                          />
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {aGerirFechos && exercicio && (
        <DialogoFechos
          diario={aGerirFechos}
          exercicio={exercicio}
          podeFechar={podeFechar}
          aoFechar={() => setAGerirFechos(null)}
        />
      )}

      {(aCriar || emEdicao) && (
        <FormularioDiario
          diario={emEdicao}
          aoFechar={() => {
            setACriar(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            mutate();
            setACriar(false);
            setEmEdicao(null);
          }}
        />
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar o diário ${aApagar?.codigo ?? ""}?`}
        aoConfirmar={eliminar}
        ocupado={ocupado}
      >
        Um diário{" "}
        <b>
          com movimentos ou com documentos associados não pode ser eliminado
        </b>{" "}
        — nesse caso o servidor recusa e a alternativa é desactivá-lo, que o
        tira das escolhas sem tocar no histórico.
      </ConfirmarEliminar>
    </>
  );
}

// ---------------------------------------------------------------------------
function FormularioDiario({
  diario,
  aoFechar,
  aoGravar,
}: {
  diario: Diario | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = diario === null;
  const [campos, setCampos] = useState({
    codigo: diario?.codigo ?? "",
    nome: diario?.nome ?? "",
    categoria: diario?.categoria ?? "outros",
    ativo: diario?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      if (novo) {
        await api.post(ROTA, campos);
      } else {
        // O código fica de fora: os lançamentos e os fechos guardam-no, e
        // mudá-lo deixava-os a apontar para um diário que já não existe.
        await api.patch(`${ROTA}/${diario.id}`, {
          nome: campos.nome,
          categoria: campos.categoria,
          ativo: campos.ativo,
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
      titulo={novo ? "Novo diário" : `Alterar diário ${diario.codigo}`}
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
    >
      <Campo
        rotulo="Código"
        dica={
          novo
            ? "Curto e estável — é o que fica gravado em cada movimento."
            : "Não se altera: os movimentos e os fechos guardam-no."
        }
      >
        <Entrada
          value={campos.codigo}
          onChange={(e) => setCampos((c) => ({ ...c, codigo: e.target.value }))}
          disabled={!novo}
          required
          maxLength={10}
          className="tabular"
        />
      </Campo>

      <Campo rotulo="Designação">
        <Entrada
          value={campos.nome}
          onChange={(e) => setCampos((c) => ({ ...c, nome: e.target.value }))}
          required
          maxLength={120}
        />
      </Campo>

      <Campo
        rotulo="Categoria"
        dica="Determina em que módulos o diário é oferecido."
        className="sm:col-span-2"
      >
        <Selector
          valor={campos.categoria}
          aoMudar={(v) => setCampos((c) => ({ ...c, categoria: v }))}
          opcoes={Object.entries(CATEGORIAS).map(([k, v]) => ({
            valor: k,
            rotulo: v.rotulo,
          }))}
        />
      </Campo>

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={campos.ativo}
          onChange={(e) =>
            setCampos((c) => ({ ...c, ativo: e.target.checked }))
          }
          className="size-4 accent-[var(--color-marca)]"
        />
        Activo — um diário inactivo deixa de ser oferecido em movimentos novos,
        e o histórico continua a ler-se.
      </label>
    </DialogoMestre>
  );
}
