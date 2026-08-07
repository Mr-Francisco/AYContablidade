"use client";

import { Plus, Search, X } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
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
import { formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import type { Colaborador } from "@/types";

const SEPARADOR =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-texto-suave data-[state=active]:bg-superficie data-[state=active]:text-texto data-[state=active]:shadow-suave";

export default function Funcionarios() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [estado, setEstado] = useState("todos");
  const [novoAberto, setNovoAberto] = useState(false);

  const { data, isLoading, mutate } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (estado !== "todos" && c.estado !== estado) return false;
      if (!t) return true;
      return (
        c.nome.toLowerCase().includes(t) ||
        c.numero.toLowerCase().includes(t) ||
        (c.categoria ?? "").toLowerCase().includes(t)
      );
    });
  }, [data, procura, estado]);

  const totalBase = useMemo(
    () => soma(...filtrados.map((c) => c.salario_base)),
    [filtrados],
  );
  const activos = (data ?? []).filter((c) => c.estado === "activo").length;

  return (
    <>
      <CabecalhoPagina
        titulo="Funcionários"
        descricao="Ficha de pessoal: remuneração, dados fiscais e da Segurança Social."
        accoes={
          pode("rh.gerir") && (
            <Botao variante="primario" onClick={() => setNovoAberto(true)}>
              <Plus size={16} />
              Novo funcionário
            </Botao>
          )
        }
      />

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="min-w-0">
          <Kpi
            rotulo="Colaboradores"
            valor={String(data?.length ?? 0)}
            detalhe={`${activos} activos`}
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Massa salarial base"
            valor={formataCompacto(totalBase, moeda)}
            detalhe="Soma dos salários base listados"
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="A mostrar"
            valor={String(filtrados.length)}
            detalhe="Depois dos filtros"
            cor="var(--grafico-4)"
          />
        </div>
      </div>

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
              placeholder="Nome, número ou categoria…"
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
            { valor: "activo", rotulo: "Activos" },
            { valor: "inactivo", rotulo: "Inactivos" },
          ]}
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !filtrados.length ? (
          <Vazio>
            {procura.trim() || estado !== "todos"
              ? "Nenhum funcionário corresponde aos filtros."
              : "Ainda não há funcionários registados."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Nome</Th>
                  <Th>Categoria</Th>
                  <Th numerico>Salário base</Th>
                  <Th numerico>Subsídios</Th>
                  <Th>Admissão</Th>
                  <Th>Nº Seg. Social</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <Tr key={c.id}>
                    <Td className="tabular font-bold">{c.numero}</Td>
                    <Td className="max-w-[240px] truncate font-semibold">
                      {c.nome}
                    </Td>
                    <Td className="text-texto-suave">{c.categoria || "—"}</Td>
                    <Td numerico>{formataMoeda(c.salario_base, moeda)}</Td>
                    <Td numerico>{formataMoeda(c.subsidios, moeda)}</Td>
                    <Td className="tabular">
                      {c.data_admissao
                        ? new Date(c.data_admissao).toLocaleDateString("pt-PT")
                        : "—"}
                    </Td>
                    <Td className="tabular">{c.num_ss || "—"}</Td>
                    <Td>
                      <Selo cor={c.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}>
                        {c.estado === "activo" ? "Activo" : "Inactivo"}
                      </Selo>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {novoAberto && (
        <FormularioColaborador
          aoFechar={() => setNovoAberto(false)}
          aoGravar={() => {
            setNovoAberto(false);
            mutate();
          }}
        />
      )}
    </>
  );
}

function FormularioColaborador({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { data: provincias } = useSWR<string[]>(
    "/api/comercial/provincias",
    buscador,
    { revalidateOnFocus: false },
  );

  const [campos, setCampos] = useState({
    numero: "",
    nome: "",
    categoria: "",
    salario_base: "0",
    subsidios: "0",
    subsidio_ferias: "0",
    subsidio_natal: "0",
    subs_nao_sujeitos: "0",
    data_admissao: new Date().toISOString().slice(0, 10),
    nif: "",
    num_ss: "",
    iban: "",
    provincia: "Luanda",
    municipio: "",
    estado: "activo",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!campos.nome.trim()) return setErro("Indique o nome.");
    setAGravar(true);
    try {
      await api.post("/api/rh/colaboradores", {
        ...campos,
        numero: campos.numero.trim() || null,
        nome: campos.nome.trim(),
        categoria: campos.categoria.trim() || null,
        nif: campos.nif.trim() || null,
        num_ss: campos.num_ss.trim() || null,
        iban: campos.iban.trim() || null,
        municipio: campos.municipio.trim() || null,
        data_admissao: campos.data_admissao || null,
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
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Novo funcionário
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

          <form
            onSubmit={submeter}
            id="form-colaborador"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <Tabs.Root defaultValue="geral">
              <Tabs.List className="mb-4 inline-flex gap-1 rounded-xl bg-fundo p-1">
                <Tabs.Trigger value="geral" className={SEPARADOR}>
                  Geral
                </Tabs.Trigger>
                <Tabs.Trigger value="remuneracao" className={SEPARADOR}>
                  Remuneração
                </Tabs.Trigger>
                <Tabs.Trigger value="fiscal" className={SEPARADOR}>
                  Fiscal e bancário
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="geral">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Número"
                    dica="Em branco atribui o próximo livre."
                  >
                    <Entrada
                      value={campos.numero}
                      onChange={(e) => alterar("numero", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                  <Campo rotulo="Categoria">
                    <Entrada
                      value={campos.categoria}
                      onChange={(e) => alterar("categoria", e.target.value)}
                    />
                  </Campo>
                  <Campo rotulo="Nome completo" className="sm:col-span-2">
                    <Entrada
                      value={campos.nome}
                      onChange={(e) => alterar("nome", e.target.value)}
                      required
                      autoFocus
                    />
                  </Campo>
                  <Campo rotulo="Data de admissão">
                    <Entrada
                      type="date"
                      value={campos.data_admissao}
                      onChange={(e) => alterar("data_admissao", e.target.value)}
                    />
                  </Campo>
                  <Selector
                    rotulo="Estado"
                    valor={campos.estado}
                    aoMudar={(v) => alterar("estado", v)}
                    opcoes={[
                      { valor: "activo", rotulo: "Activo" },
                      { valor: "inactivo", rotulo: "Inactivo" },
                    ]}
                  />
                  <Selector
                    rotulo="Província"
                    valor={campos.provincia}
                    aoMudar={(v) => alterar("provincia", v)}
                    opcoes={(provincias ?? []).map((p) => ({
                      valor: p,
                      rotulo: p,
                    }))}
                  />
                  <Campo rotulo="Município">
                    <Entrada
                      value={campos.municipio}
                      onChange={(e) => alterar("municipio", e.target.value)}
                    />
                  </Campo>
                </div>
              </Tabs.Content>

              <Tabs.Content value="remuneracao">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Salário base"
                    dica="É só sobre este valor que incide o INSS."
                  >
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.salario_base}
                      onChange={(e) => alterar("salario_base", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo
                    rotulo="Subsídios mensais"
                    dica="Entram no bruto e no IRT, mas não na base do INSS."
                  >
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.subsidios}
                      onChange={(e) => alterar("subsidios", e.target.value)}
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo rotulo="Subsídio de férias">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.subsidio_ferias}
                      onChange={(e) =>
                        alterar("subsidio_ferias", e.target.value)
                      }
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo rotulo="Subsídio de Natal">
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.subsidio_natal}
                      onChange={(e) =>
                        alterar("subsidio_natal", e.target.value)
                      }
                      className="text-right tabular"
                    />
                  </Campo>
                  <Campo
                    rotulo="Subsídios não sujeitos"
                    className="sm:col-span-2"
                    dica="Alimentação, transporte, abono de família e reembolsos — fora da matéria colectável."
                  >
                    <Entrada
                      type="number"
                      step="0.01"
                      min="0"
                      value={campos.subs_nao_sujeitos}
                      onChange={(e) =>
                        alterar("subs_nao_sujeitos", e.target.value)
                      }
                      className="text-right tabular"
                    />
                  </Campo>
                </div>
                <Alerta tipo="info" className="mt-3">
                  O INSS incide apenas sobre o salário base; a matéria
                  colectável do IRT é o bruto menos o INSS do trabalhador,
                  porque a contribuição é dedutível.
                </Alerta>
              </Tabs.Content>

              <Tabs.Content value="fiscal">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="NIF">
                    <Entrada
                      value={campos.nif}
                      onChange={(e) => alterar("nif", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                  <Campo rotulo="Nº de Segurança Social">
                    <Entrada
                      value={campos.num_ss}
                      onChange={(e) => alterar("num_ss", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                  <Campo rotulo="IBAN" className="sm:col-span-2">
                    <Entrada
                      value={campos.iban}
                      onChange={(e) => alterar("iban", e.target.value)}
                      className="tabular"
                    />
                  </Campo>
                </div>
              </Tabs.Content>
            </Tabs.Root>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-colaborador"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar funcionário"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
