"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import {
  ACarregar,
  BarraFiltros,
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
import { useContas } from "@/lib/hooks";

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
  const { contas, isLoading } = useContas();
  const [procura, setProcura] = useState("");
  const [classe, setClasse] = useState("todas");
  const [tipo, setTipo] = useState("todos");

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
          <Selo cor="#3d7fe0">
            {contas.length.toLocaleString("pt-PT")} contas
          </Selo>
        }
      />

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
                          {c.tipo === "M" && (
                            <Link
                              href={`/contabilidade/razao?conta=${c.codigo}`}
                              className="text-[12.5px] font-semibold text-marca hover:underline"
                            >
                              Ver razão
                            </Link>
                          )}
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
    </>
  );
}
