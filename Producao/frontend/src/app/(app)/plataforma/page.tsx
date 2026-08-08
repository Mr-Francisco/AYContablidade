"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  BarraFiltros,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Kpi,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import { formataCompacto, soma } from "@/lib/dinheiro";
import type {
  ConsumoEmpresa,
  EmpresaPlataforma,
  LicencaPlataforma,
} from "@/types";

export default function Empresas() {
  const [procura, setProcura] = useState("");

  const { data: empresas, isLoading } = useSWR<EmpresaPlataforma[]>(
    "/api/licencas/empresas",
    buscador,
  );
  const { data: licencas } = useSWR<LicencaPlataforma[]>(
    "/api/licencas",
    buscador,
  );
  const { data: consumo } = useSWR<ConsumoEmpresa[]>(
    "/api/licencas/consumo-ia",
    buscador,
  );

  // Cruzar as três vistas: a lista de empresas sozinha não diz nem o plano nem
  // o que cada uma está a custar, que é o que interessa a quem gere a
  // plataforma.
  const porEmpresa = useMemo(() => {
    const lic = new Map<string, LicencaPlataforma>();
    for (const l of licencas ?? []) {
      if (l.empresa_id && l.estado === "activa") lic.set(l.empresa_id, l);
    }
    const cons = new Map<string, ConsumoEmpresa>();
    for (const c of consumo ?? []) cons.set(c.empresa_id, c);
    return { lic, cons };
  }, [licencas, consumo]);

  const filtradas = useMemo(() => {
    const t = procura.trim().toLowerCase();
    if (!t) return empresas ?? [];
    return (empresas ?? []).filter(
      (e) =>
        e.nome.toLowerCase().includes(t) ||
        e.codigo.toLowerCase().includes(t) ||
        e.nif.includes(t),
    );
  }, [empresas, procura]);

  const custoTotal = soma(...(consumo ?? []).map((c) => c.custo));
  const activas = (empresas ?? []).filter((e) => e.estado === "activa").length;
  const noLimite = (consumo ?? []).filter((c) => c.excedido).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Empresas da plataforma"
        descricao="Todas as empresas, o plano de cada uma e o que estão a consumir."
      />

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Empresas"
            valor={String(empresas?.length ?? 0)}
            detalhe={`${activas} activas`}
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Licenças activas"
            valor={String(porEmpresa.lic.size)}
            detalhe="Com contrato em vigor"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Custo de IA no mês"
            valor={`${formataCompacto(custoTotal, "")} USD`}
            detalhe="Estimado, todas as empresas"
            cor="var(--grafico-4)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="No limite"
            valor={String(noLimite)}
            detalhe="Empresas com quota esgotada"
            cor={noLimite > 0 ? "var(--color-perigo)" : "var(--grafico-1)"}
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[260px] flex-1">
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
              placeholder="Nome, código ou NIF…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !filtradas.length ? (
          <Vazio>
            {procura.trim()
              ? "Nenhuma empresa corresponde à pesquisa."
              : "Ainda não há empresas. Gere uma licença para começar."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Empresa</Th>
                  <Th>NIF</Th>
                  <Th>Plano</Th>
                  <Th>Validade</Th>
                  <Th numerico>Tokens no mês</Th>
                  <Th numerico>Custo</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const l = porEmpresa.lic.get(e.id);
                  const c = porEmpresa.cons.get(e.id);
                  return (
                    <Tr key={e.id}>
                      <Td className="tabular font-bold">{e.codigo}</Td>
                      <Td className="max-w-[240px] truncate font-semibold">
                        {e.nome}
                      </Td>
                      <Td className="tabular">{e.nif}</Td>
                      <Td>
                        {l ? (
                          <Selo cor="#3d7fe0">{l.plano}</Selo>
                        ) : (
                          <span className="text-texto-suave">sem licença</span>
                        )}
                      </Td>
                      <Td className="tabular text-texto-suave">
                        {l?.validade
                          ? new Date(l.validade).toLocaleDateString("pt-PT")
                          : l
                            ? "sem termo"
                            : "—"}
                      </Td>
                      <Td numerico>
                        {c?.tokens ? c.tokens.toLocaleString("pt-PT") : "—"}
                        {c?.percentagem != null && (
                          <span
                            className={`ml-1 text-xs ${c.excedido ? "text-perigo" : "text-texto-suave"}`}
                          >
                            ({c.percentagem}%)
                          </span>
                        )}
                      </Td>
                      <Td numerico>{c?.custo ? `${c.custo} USD` : "—"}</Td>
                      <Td>
                        <Selo
                          cor={e.estado === "activa" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {e.estado}
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
