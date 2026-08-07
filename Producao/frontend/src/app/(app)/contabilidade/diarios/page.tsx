"use client";

import { useMemo, useState } from "react";

import {
  ACarregar,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useDiarios } from "@/lib/hooks";

const CATEGORIAS: Record<string, { rotulo: string; cor: string }> = {
  compras: { rotulo: "Compras", cor: "#d68910" },
  vendas: { rotulo: "Vendas", cor: "#2980b9" },
  caixa_bancos: { rotulo: "Tesouraria", cor: "#1a9c5f" },
  imobilizado: { rotulo: "Imobilizado", cor: "#7a3aab" },
  rh: { rotulo: "Recursos Humanos", cor: "#16a085" },
  outros: { rotulo: "Outros", cor: "#62657a" },
};

export default function Diarios() {
  const { diarios, isLoading } = useDiarios();
  const [categoria, setCategoria] = useState("todas");

  const filtrados = useMemo(
    () =>
      categoria === "todas"
        ? diarios
        : diarios.filter((d) => d.categoria === categoria),
    [diarios, categoria],
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Diários"
        descricao="Diários contabilísticos. A categoria determina em que módulos o diário é oferecido."
        accoes={<Selo cor="#3d7fe0">{diarios.length} diários</Selo>}
      />

      <BarraFiltros className="mb-4">
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
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : filtrados.length === 0 ? (
          <Vazio>Nenhum diário nesta categoria.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Designação</Th>
                  <Th>Categoria</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => {
                  const c = CATEGORIAS[d.categoria] ?? {
                    rotulo: d.categoria,
                    cor: "#62657a",
                  };
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
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
