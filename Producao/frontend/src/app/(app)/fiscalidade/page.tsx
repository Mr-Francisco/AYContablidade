"use client";

import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { FaixaPainel } from "@/components/painel";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Campo,
  Cartao,
  Entrada,
  Selector,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import type { CatalogoFiscal, Imposto } from "@/types";

export default function Impostos() {
  const [procura, setProcura] = useState("");
  const [categoria, setCategoria] = useState("");

  const { data, isLoading } = useSWR<CatalogoFiscal>(
    "/api/fiscalidade/catalogo",
    buscador,
    { revalidateOnFocus: false },
  );

  const filtrados = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data?.impostos ?? []).filter((i) => {
      if (categoria && i.categoria !== categoria) return false;
      if (!t) return true;
      return (
        i.sigla.toLowerCase().includes(t) ||
        i.nome.toLowerCase().includes(t) ||
        i.incidencia.toLowerCase().includes(t) ||
        i.taxa.toLowerCase().includes(t)
      );
    });
  }, [data, procura, categoria]);

  return (
    <>
      <FaixaPainel
        sobrenome="Fiscalidade · Angola / AGT"
        titulo="Catálogo de Impostos"
        subtitulo="Impostos em vigor em Angola, com incidência, taxas, forma de cálculo e modelos obrigatórios. As taxas devem ser confirmadas com a legislação em vigor."
        valores={[]}
      />

      <Alerta tipo="aviso" className="mb-4">
        As taxas e prazos aqui listados são <b>referência</b> e têm de ser
        confirmados contra a legislação em vigor. O sistema não os usa para
        calcular nada por si — os cálculos ficam nos módulos próprios, com os
        valores parametrizados na configuração de cada empresa.
      </Alerta>

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
              placeholder="Sigla, nome, incidência ou taxa…"
              className="pl-9"
            />
          </div>
        </Campo>
        <Selector
          rotulo="Categoria"
          valor={categoria}
          aoMudar={setCategoria}
          opcoes={[
            { valor: "", rotulo: "Todas as categorias" },
            ...(data?.categorias ?? []).map((c) => ({ valor: c, rotulo: c })),
          ]}
          larguraMinima="16rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !filtrados.length ? (
        <Cartao>
          <Vazio>Nenhum imposto corresponde à pesquisa.</Vazio>
        </Cartao>
      ) : (
        <div className="revelar-grelha grid min-w-0 gap-4 lg:grid-cols-2">
          {filtrados.map((i) => (
            <CartaoImposto key={i.sigla} imposto={i} />
          ))}
        </div>
      )}

      {data?.fontes?.length ? (
        <Cartao className="mt-4">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
            Fontes
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.fontes.map((f) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-marca hover:underline"
              >
                {f.nome}
                <ExternalLink size={12} aria-hidden />
              </a>
            ))}
          </div>
        </Cartao>
      ) : null}
    </>
  );
}

function CartaoImposto({ imposto: i }: { imposto: Imposto }) {
  return (
    <Cartao className="min-w-0">
      <header className="mb-3 flex items-start gap-3 border-b border-borda pb-3">
        <span className="tabular flex h-11 min-w-11 items-center justify-center rounded-xl bg-marca px-2 text-sm font-bold text-white">
          {i.sigla}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight">{i.nome}</h2>
          <p className="mt-0.5 text-xs text-texto-suave">{i.categoria}</p>
        </div>
      </header>

      <dl className="flex flex-col gap-2 text-sm">
        <Linha rotulo="Incidência">{i.incidencia}</Linha>
        <Linha rotulo="Taxa">
          <b>{i.taxa}</b>
        </Linha>
        <Linha rotulo="Cálculo">{i.calculo}</Linha>
        {/* Lista e não selos: os nomes dos modelos são frases inteiras
            ("Anexos: fornecedores, clientes, existências, regularizações") e
            um selo não quebra linha — a 375px empurravam a página para fora. */}
        <Linha rotulo="Modelos">
          <ul className="flex flex-col gap-1">
            {i.modelos.map((m) => (
              <li key={m} className="flex gap-2">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-marca"
                />
                <span className="min-w-0">{m}</span>
              </li>
            ))}
          </ul>
        </Linha>
        <Linha rotulo="Prazo">{i.prazo}</Linha>
        {i.retencao && i.retencao !== "—" && (
          <Linha rotulo="Retenção">{i.retencao}</Linha>
        )}
      </dl>
    </Cartao>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-start gap-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.4px] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
