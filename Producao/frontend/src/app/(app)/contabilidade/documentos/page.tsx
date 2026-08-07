"use client";

import { Search } from "lucide-react";
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
import { useDiarios, useDocumentos } from "@/lib/hooks";

export default function Documentos() {
  const { diarios } = useDiarios();
  const { documentos, isLoading } = useDocumentos();
  const [diario, setDiario] = useState("todos");
  const [procura, setProcura] = useState("");
  const procuraAdiada = useDeferredValue(procura);

  const nomeDiario = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of diarios) m.set(d.codigo, d.nome);
    return m;
  }, [diarios]);

  const filtrados = useMemo(() => {
    const termo = procuraAdiada.trim().toLowerCase();
    return documentos.filter((d) => {
      if (diario !== "todos" && d.diario_codigo !== diario) return false;
      if (!termo) return true;
      return (
        d.codigo.toLowerCase().includes(termo) ||
        d.descricao.toLowerCase().includes(termo)
      );
    });
  }, [documentos, diario, procuraAdiada]);

  return (
    <>
      <CabecalhoPagina
        titulo="Documentos"
        descricao="Documentos afectos a cada diário, com as contas de débito e crédito por omissão."
        accoes={<Selo cor="#3d7fe0">{documentos.length} documentos</Selo>}
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Diário"
          valor={diario}
          aoMudar={setDiario}
          opcoes={[
            { valor: "todos", rotulo: "Todos os diários" },
            ...diarios.map((d) => ({
              valor: d.codigo,
              rotulo: `${d.codigo} — ${d.nome}`,
            })),
          ]}
          larguraMinima="16rem"
        />
        <Campo rotulo="Pesquisar" className="min-w-[220px] flex-1">
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
              placeholder="Código ou descrição…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : filtrados.length === 0 ? (
          <Vazio>Nenhum documento corresponde aos filtros.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Descrição</Th>
                  <Th>Diário</Th>
                  <Th>Conta débito</Th>
                  <Th>Conta crédito</Th>
                  <Th>Retenção</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-bold tabular">{d.codigo}</Td>
                    <Td className="max-w-[340px] truncate">
                      <span title={d.descricao}>{d.descricao}</span>
                    </Td>
                    <Td className="max-w-[200px] truncate text-texto-suave">
                      {d.diario_codigo}
                      {nomeDiario.get(d.diario_codigo)
                        ? ` — ${nomeDiario.get(d.diario_codigo)}`
                        : ""}
                    </Td>
                    <Td className="tabular">{d.conta_debito || "—"}</Td>
                    <Td className="tabular">{d.conta_credito || "—"}</Td>
                    <Td>
                      {d.retencao ? (
                        <Selo cor="#c98a10">Sujeito</Selo>
                      ) : (
                        <span className="text-texto-suave">—</span>
                      )}
                    </Td>
                    <Td>
                      <Selo cor={d.ativo ? "#1a9c5f" : "#8a8a8a"}>
                        {d.ativo ? "Activo" : "Inactivo"}
                      </Selo>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
