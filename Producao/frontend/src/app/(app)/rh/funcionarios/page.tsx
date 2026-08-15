"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { GrelhaKpis } from "@/components/painel";
import { FichaColaborador } from "@/components/rh/FichaColaborador";
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
import { AccoesDaLinha, ConfirmarEliminar } from "@/components/ui/CrudMestre";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda, soma } from "@/lib/dinheiro";
import type { Colaborador, Folha } from "@/types";

const _SEPARADOR =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-texto-suave data-[state=active]:bg-superficie data-[state=active]:text-texto data-[state=active]:shadow-suave";

export default function Funcionarios() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [estado, setEstado] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [novoAberto, setNovoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Colaborador | null>(null);
  const [aApagar, setAApagar] = useState<Colaborador | null>(null);
  const [erroAccao, setErroAccao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("rh.gerir");

  async function eliminarColaborador() {
    if (!aApagar) return;
    setErroAccao(null);
    setOcupado(true);
    try {
      await api.delete(`/api/rh/colaboradores/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErroAccao(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAApagar(null);
    }
  }

  const { data, isLoading, error, mutate } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );

  // As carreiras que existem mesmo, tiradas das fichas — uma lista fixa
  // ficaria desactualizada no dia em que o RH criasse uma categoria nova.
  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    for (const c of data ?? []) if (c.categoria) vistas.add(c.categoria);
    return [...vistas].sort((a, b) => a.localeCompare(b, "pt"));
  }, [data]);

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (estado !== "todos" && c.estado !== estado) return false;
      if (categoria !== "todas" && (c.categoria ?? "") !== categoria)
        return false;
      if (!t) return true;
      return (
        c.nome.toLowerCase().includes(t) ||
        c.numero.toLowerCase().includes(t) ||
        (c.nif ?? "").toLowerCase().includes(t) ||
        (c.num_ss ?? "").toLowerCase().includes(t) ||
        (c.categoria ?? "").toLowerCase().includes(t)
      );
    });
  }, [data, procura, estado, categoria]);

  const _totalBase = useMemo(
    () => soma(...filtrados.map((c) => c.salario_base)),
    [filtrados],
  );
  const activos = (data ?? []).filter((c) => c.estado === "activo").length;

  const kz = (v: string) => formataMoeda(v, moeda, 0);
  // A folha do mês corrente, só para os KPIs — é uma simulação, não grava nada.
  const { data: folha } = useSWR<Folha>(
    "/api/rh/folha?so_ativos=true",
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Funcionários"
        descricao="Ficha de pessoal: remuneração, dados fiscais e da Segurança Social."
      />

      {/* Os quatro do Piloto: colaboradores, massa salarial, líquido a pagar
          e encargos. A folha é simulada — não grava nem lança nada. */}
      <GrelhaKpis>
        <Kpi
          rotulo="Colaboradores"
          valor={String(data?.length ?? 0)}
          detalhe={`${activos} activos`}
          cor="var(--color-azul)"
        />
        <Kpi
          rotulo="Massa salarial (bruto)"
          valor={kz(folha?.totais.bruto ?? "0")}
          detalhe="mensal"
          cor="var(--color-roxo)"
        />
        <Kpi
          rotulo="Líquido a pagar"
          valor={kz(folha?.totais.liquido ?? "0")}
          detalhe="mensal"
          cor="#16a085"
        />
        <Kpi
          rotulo="Encargos (IRT+INSS)"
          valor={kz(
            soma(
              folha?.totais.irt ?? "0",
              folha?.totais.inss ?? "0",
              folha?.totais.inss_empresa ?? "0",
            ).toString(),
          )}
          cor="var(--grafico-1)"
        />
      </GrelhaKpis>

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
              placeholder="Nome, número, NIF, Nº SS ou categoria…"
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
        {/* Categoria/carreira: o filtro que faltava. Quem processa a folha
            trabalha por carreira, não por lista inteira. */}
        <Selector
          rotulo="Categoria"
          valor={categoria}
          aoMudar={setCategoria}
          opcoes={[
            { valor: "todas", rotulo: "Todas" },
            ...categorias.map((c) => ({ valor: c, rotulo: c })),
          ]}
        />
        <span className="flex-1" />
        {pode("rh.gerir") && (
          <Botao variante="acento" onClick={() => setNovoAberto(true)}>
            <Plus size={16} />
            Novo funcionário
          </Botao>
        )}
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : error ? (
          // Um 403 pintado de «ainda não há funcionários» manda o utilizador
          // procurar fichas que existem e ele não pode ver. O servidor já
          // tinha dito qual era o problema.
          <div className="p-4">
            <FalhaAoCarregar erro={error} oQue="os funcionários" />
          </div>
        ) : !filtrados.length ? (
          <Vazio>
            {procura.trim() || estado !== "todos" || categoria !== "todas"
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
                  <Th>NIF</Th>
                  <Th>Categoria</Th>
                  <Th numerico>Salário base</Th>
                  <Th numerico>Subsídios</Th>
                  <Th>Admissão</Th>
                  <Th>Nº Seg. Social</Th>
                  <Th>Estado</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <Tr key={c.id}>
                    <Td className="tabular font-bold">{c.numero}</Td>
                    <Td className="max-w-[240px] truncate font-semibold">
                      {c.nome}
                    </Td>
                    {/* O NIF em falta. É o que identifica o trabalhador
                        perante a AGT, e sem ele não há Mapa de Remunerações —
                        ver a lista sem esta coluna era não ver quem falta
                        completar. */}
                    <Td className="tabular">
                      {c.nif || (
                        <span
                          className="text-aviso"
                          title="Sem NIF nem documento no Mapa de Remunerações"
                        >
                          em falta
                        </span>
                      )}
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
                    {podeGerir && (
                      <Td>
                        <AccoesDaLinha
                          nome={`funcionário ${c.nome}`}
                          aoEditar={() => setEmEdicao(c)}
                          aoApagar={() => setAApagar(c)}
                          desactivado={ocupado}
                        />
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {(novoAberto || emEdicao) && (
        <FichaColaborador
          registo={emEdicao}
          aoFechar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            setNovoAberto(false);
            setEmEdicao(null);
            mutate();
          }}
        />
      )}

      {erroAccao && (
        <div className="mt-4">
          <Alerta tipo="erro">{erroAccao}</Alerta>
        </div>
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar ${aApagar?.nome ?? ""}?`}
        aoConfirmar={eliminarColaborador}
        ocupado={ocupado}
      >
        A ficha desaparece. Os recibos e as folhas já processadas guardam os
        valores calculados e não se perdem, mas deixam de poder ser ligados à
        ficha. Para o tirar do processamento sem apagar, ponha-o inactivo.
      </ConfirmarEliminar>
    </>
  );
}
