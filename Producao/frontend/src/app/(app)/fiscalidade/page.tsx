"use client";

import { ExternalLink, Info, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { FaixaPainel } from "@/components/painel";
import {
  ACarregar,
  BarraFiltros,
  Campo,
  Cartao,
  Entrada,
  Selector,
  Vazio,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import { plural } from "@/lib/texto";
import type { CatalogoFiscal, Imposto } from "@/types";

/**
 * Catálogo de impostos — agrupado por categoria, como no Piloto.
 *
 * Uma grelha corrida de dez cartões todos iguais obriga a ler os dez para
 * encontrar um. Agrupados por categoria — Rendimento, Despesa, Património —
 * a lista passa a ter mapa: quem procura o IVA sabe onde olhar antes de ler.
 *
 * O que cada cartão mostra é o do Piloto (incidência, taxa, cálculo, modelos,
 * prazo, retenção). O que muda é a hierarquia: a TAXA é o que se vem cá
 * buscar, e por isso está destacada e não perdida numa linha igual às outras.
 */
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

  /** Por categoria, na ordem em que as categorias aparecem no catálogo. */
  const grupos = useMemo(() => {
    const m = new Map<string, Imposto[]>();
    for (const i of filtrados) {
      const g = m.get(i.categoria) ?? [];
      g.push(i);
      m.set(i.categoria, g);
    }
    return [...m.entries()];
  }, [filtrados]);

  return (
    <>
      <FaixaPainel
        sobrenome="Fiscalidade · Angola / AGT"
        titulo="Catálogo de Impostos"
        subtitulo="Impostos em vigor em Angola, com incidência, taxas, forma de cálculo e modelos obrigatórios. As taxas devem ser confirmadas com a legislação em vigor."
        valores={[]}
      />

      <BarraFiltros className="mb-3">
        <Campo rotulo="Pesquisar" className="min-w-[16rem] flex-1">
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
          larguraMinima="15rem"
        />
        <div className="flex items-end pb-2.5">
          <span className="text-[12.5px] text-texto-suave">
            {plural(filtrados.length, "imposto")}
          </span>
        </div>
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
        <div className="revelar-grelha flex flex-col gap-5">
          {grupos.map(([cat, impostos]) => (
            <section key={cat} className="min-w-0">
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.6px] text-texto-suave">
                {cat}
                <span className="h-px flex-1 bg-borda" aria-hidden />
                <span className="font-semibold normal-case tracking-normal">
                  {plural(impostos.length, "imposto")}
                </span>
              </h2>
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                {impostos.map((i) => (
                  <CartaoImposto key={i.sigla} imposto={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-[10px] border border-borda bg-superficie px-4 py-3 text-[12.5px] leading-relaxed text-texto-suave">
        <Info size={15} className="mt-0.5 shrink-0 text-aviso" aria-hidden />
        <span>
          As taxas e prazos aqui listados são{" "}
          <b className="text-texto">referência</b> e têm de ser confirmados
          contra a legislação em vigor. O sistema não os usa para calcular nada
          por si — os cálculos ficam nos módulos próprios, com os valores
          parametrizados na configuração de cada empresa.
        </span>
      </p>

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
    <Cartao className="min-w-0 overflow-hidden p-0 transition-transform hover:-translate-y-0.5">
      {/* Faixa do cabeçalho, como no Piloto: a sigla no gradiente da marca. */}
      <header className="flex items-center gap-3 border-b border-borda bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-rosa)_7%,transparent),transparent)] px-4 py-3">
        <span className="tabular flex h-10 min-w-[52px] items-center justify-center rounded-[9px] bg-[image:var(--gradiente-marca)] px-2.5 text-sm font-extrabold text-white">
          {i.sigla}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight">{i.nome}</h3>
          <p className="mt-0.5 text-xs text-texto-suave">{i.categoria}</p>
        </div>
      </header>

      <dl className="px-4 py-1">
        <Linha rotulo="Incidência">{i.incidencia}</Linha>
        <Linha rotulo="Taxa">
          <b className="text-texto">{i.taxa}</b>
        </Linha>
        <Linha rotulo="Cálculo">{i.calculo}</Linha>
        <Linha rotulo="Modelos">
          {/* Etiquetas que quebram linha: os nomes são frases inteiras
              («Anexos: fornecedores, clientes, existências…») e um selo que
              não quebra empurrava a página para fora a 375px. */}
          <span className="flex flex-wrap gap-1.5">
            {i.modelos.map((m) => (
              <span
                key={m}
                className="rounded-md border border-borda bg-superficie-2 px-2 py-0.5 text-[11.5px] leading-relaxed"
              >
                {m}
              </span>
            ))}
          </span>
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
    <div className="grid grid-cols-[92px_1fr] items-start gap-3 border-b border-borda py-2 text-[13px] last:border-b-0">
      <dt className="pt-px text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
