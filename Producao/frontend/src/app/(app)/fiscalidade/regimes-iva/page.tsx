"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { big, formataMoeda } from "@/lib/dinheiro";
import type { CatalogoFiscal, RegimeIva } from "@/types";

export default function RegimesIva() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data, isLoading } = useSWR<CatalogoFiscal>(
    "/api/fiscalidade/catalogo",
    buscador,
    { revalidateOnFocus: false },
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Regimes de IVA"
        descricao="O enquadramento em sede de IVA depende do volume de negócios anual. Cada regime tem taxa, direito à dedução e obrigações próprias."
      />

      {isLoading || !data ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid min-w-0 gap-4 lg:grid-cols-3">
            {data.regimes_iva.map((r) => (
              <CartaoRegime key={r.id} regime={r} />
            ))}
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <SimuladorSimplificado moeda={moeda} />
            <SimuladorGeral moeda={moeda} />
          </div>

          <Alerta tipo="info" className="mt-4">
            A mudança de regime não é opcional: ultrapassado o limite, é
            obrigatória até ao fim do mês seguinte. Os simuladores acima são de
            leitura — o IVA que o sistema apura vem do <b>Apuramento do IVA</b>,
            a partir dos lançamentos reais.
          </Alerta>
        </>
      )}
    </>
  );
}

function CartaoRegime({ regime: r }: { regime: RegimeIva }) {
  return (
    <Cartao
      className="min-w-0 border-t-[3px]"
      style={{ borderTopColor: r.cor }}
    >
      <h2 className="text-[15px] font-bold leading-tight">{r.nome}</h2>
      <p className="mt-1 text-xs text-texto-suave">{r.limite}</p>

      <dl className="mt-3 flex flex-col gap-2 border-t border-borda pt-3 text-sm">
        <Par rotulo="Taxa">
          <b>{r.taxa}</b>
        </Par>
        <Par rotulo="Dedução">{r.deducao}</Par>
        <Par rotulo="Declaração">{r.declaracao}</Par>
        <Par rotulo="Pagamento">{r.pagamento}</Par>
      </dl>

      <h3 className="mb-2 mt-3 border-t border-borda pt-3 text-[11px] font-bold uppercase tracking-[0.4px] text-texto-suave">
        Obrigações
      </h3>
      <ul className="flex flex-col gap-1.5">
        {r.obrigacoes.map((o) => (
          <li key={o} className="flex gap-2 text-sm">
            <Check
              size={14}
              className="mt-0.5 shrink-0"
              style={{ color: r.cor }}
              aria-hidden
            />
            <span>{o}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

function Par({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.4px] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function SimuladorSimplificado({ moeda }: { moeda: string }) {
  const [recebimentos, setRecebimentos] = useState("0");
  const [ivaSuportado, setIvaSuportado] = useState("0");

  // Calculado no cliente para responder a cada tecla. A mesma fórmula existe no
  // backend (`calc_iva_simplificado`) e é essa que vale — aqui é só uma
  // pré-visualização.
  const r = useMemo(() => {
    const liquidado = big(recebimentos || "0")
      .times("0.07")
      .round(2);
    const dedutivel = big(ivaSuportado || "0")
      .times("0.10")
      .round(2);
    return { liquidado, dedutivel, entregar: liquidado.minus(dedutivel) };
  }, [recebimentos, ivaSuportado]);

  return (
    <Cartao className="min-w-0">
      <TituloCartao extra="7% dos recebimentos">
        Simulador — Regime Simplificado
      </TituloCartao>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Recebimentos do período">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={recebimentos}
            onChange={(e) => setRecebimentos(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
        <Campo rotulo="IVA suportado nas aquisições">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={ivaSuportado}
            onChange={(e) => setIvaSuportado(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
      </div>
      <Resultado
        moeda={moeda}
        liquidado={r.liquidado}
        dedutivel={r.dedutivel}
        entregar={r.entregar}
        notaDedutivel="10% do IVA suportado — a dedução é limitada"
      />
    </Cartao>
  );
}

function SimuladorGeral({ moeda }: { moeda: string }) {
  const [base, setBase] = useState("0");
  const [taxa, setTaxa] = useState("14");
  const [dedutivel, setDedutivel] = useState("0");

  const r = useMemo(() => {
    const liquidado = big(base || "0")
      .times(big(taxa || "0"))
      .div(100)
      .round(2);
    const ded = big(dedutivel || "0");
    return { liquidado, dedutivel: ded, entregar: liquidado.minus(ded) };
  }, [base, taxa, dedutivel]);

  return (
    <Cartao className="min-w-0">
      <TituloCartao extra="Liquidado − dedutível">
        Simulador — Regime Geral
      </TituloCartao>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Base das vendas">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
        <Campo rotulo="Taxa (%)">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
        <Campo rotulo="IVA dedutível">
          <Entrada
            type="number"
            step="0.01"
            min="0"
            value={dedutivel}
            onChange={(e) => setDedutivel(e.target.value)}
            className="text-right tabular"
          />
        </Campo>
      </div>
      <Resultado
        moeda={moeda}
        liquidado={r.liquidado}
        dedutivel={r.dedutivel}
        entregar={r.entregar}
        notaDedutivel="Dedução integral do IVA suportado"
      />
    </Cartao>
  );
}

function Resultado({
  moeda,
  liquidado,
  dedutivel,
  entregar,
  notaDedutivel,
}: {
  moeda: string;
  liquidado: { toString(): string; lt(n: number): boolean };
  dedutivel: { toString(): string };
  entregar: { toString(): string; lt(n: number): boolean };
  notaDedutivel: string;
}) {
  const aRecuperar = entregar.lt(0);
  return (
    <dl className="mt-3 rounded-xl border border-borda bg-fundo p-3 text-sm">
      <div className="flex justify-between py-0.5">
        <dt className="text-texto-suave">IVA liquidado</dt>
        <dd className="tabular">{formataMoeda(liquidado.toString(), moeda)}</dd>
      </div>
      <div className="flex justify-between gap-3 py-0.5">
        <dt className="text-texto-suave">
          IVA dedutível
          <span className="ml-1 text-xs">({notaDedutivel})</span>
        </dt>
        <dd className="tabular whitespace-nowrap">
          {formataMoeda(dedutivel.toString(), moeda)}
        </dd>
      </div>
      <div className="mt-1 flex justify-between border-t border-borda pt-2 font-bold">
        <dt>{aRecuperar ? "A recuperar do Estado" : "A entregar ao Estado"}</dt>
        <dd className={`tabular ${aRecuperar ? "text-sucesso" : ""}`}>
          {formataMoeda(entregar.toString(), moeda)}
        </dd>
      </div>
    </dl>
  );
}
