"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda, soma, type Valor } from "@/lib/dinheiro";
import type { Colaborador, Folha, LinhaRecibo } from "@/types";

export default function Recibos() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [colaboradorId, setColaboradorId] = useState("");

  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores?so_ativos=true",
    buscador,
  );
  const { data: folha, isLoading } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=true`,
    buscador,
  );

  const linha = folha?.linhas.find((l) => l.colaborador_id === colaboradorId);
  const colaborador = colaboradores?.find((c) => c.id === colaboradorId);

  return (
    <>
      <CabecalhoPagina
        titulo="Recibos"
        descricao="Recibo de vencimento de um colaborador, com o cálculo passo a passo."
        accoes={
          linha && (
            <Botao onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir
            </Botao>
          )
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          opcoes={ultimosMeses().map((m) => ({
            valor: m,
            rotulo: mesPorExtenso(m),
          }))}
          larguraMinima="14rem"
        />
        <Selector
          rotulo="Colaborador"
          valor={colaboradorId}
          aoMudar={setColaboradorId}
          opcoes={(colaboradores ?? []).map((c) => ({
            valor: c.id,
            rotulo: `${c.numero} — ${c.nome}`,
          }))}
          placeholder="Escolher colaborador…"
          larguraMinima="18rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !colaboradorId ? (
        <Cartao>
          <Vazio>Escolha um colaborador para ver o recibo.</Vazio>
        </Cartao>
      ) : !linha ? (
        <Cartao>
          <Vazio>
            Este colaborador não tem recibo em {mesPorExtenso(mes)}.
          </Vazio>
        </Cartao>
      ) : (
        <Recibo
          linha={linha}
          colaborador={colaborador}
          mes={mes}
          moeda={moeda}
          empresa={empresa?.nome ?? ""}
        />
      )}
    </>
  );
}

function Recibo({
  linha,
  colaborador,
  mes,
  moeda,
  empresa,
}: {
  linha: LinhaRecibo;
  colaborador?: Colaborador;
  mes: string;
  moeda: string;
  empresa: string;
}) {
  const totalDescontos = soma(linha.inss, linha.irt, linha.desc_extra);

  return (
    <Cartao className="mx-auto max-w-[820px]">
      <header className="mb-5 border-b border-borda pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
          {empresa}
        </p>
        <h2 className="mt-1 text-xl font-bold">
          Recibo de vencimento — {mesPorExtenso(mes)}
        </h2>
      </header>

      <dl className="mb-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Par rotulo="Colaborador" valor={linha.colaborador} />
        <Par rotulo="Número" valor={colaborador?.numero ?? "—"} />
        <Par rotulo="Categoria" valor={colaborador?.categoria || "—"} />
        <Par rotulo="Nº Segurança Social" valor={colaborador?.num_ss || "—"} />
      </dl>

      <Bloco titulo="Remunerações">
        <Movimento rotulo="Salário base" valor={linha.base} moeda={moeda} />
        {linha.desc_faltas !== "0.00" && (
          <Movimento
            rotulo={`Desconto por faltas (${linha.faltas} dias, base 30)`}
            valor={`-${linha.desc_faltas}`}
            moeda={moeda}
            negativo
          />
        )}
        <Movimento
          rotulo="Subsídios e abonos"
          valor={linha.subs}
          moeda={moeda}
        />
        <Movimento
          rotulo="Total bruto"
          valor={linha.bruto}
          moeda={moeda}
          forte
        />
      </Bloco>

      <Bloco titulo="Descontos">
        <Movimento
          rotulo="INSS 3% (sobre o salário base)"
          valor={linha.inss}
          moeda={moeda}
          negativo
        />
        <Movimento
          rotulo="Matéria colectável do IRT (bruto − INSS)"
          valor={linha.materia}
          moeda={moeda}
          nota
        />
        <Movimento rotulo="IRT" valor={linha.irt} moeda={moeda} negativo />
        {linha.desc_extra !== "0.00" && (
          <Movimento
            rotulo="Outros descontos"
            valor={linha.desc_extra}
            moeda={moeda}
            negativo
          />
        )}
        <Movimento
          rotulo="Total de descontos"
          valor={totalDescontos}
          moeda={moeda}
          forte
          negativo
        />
      </Bloco>

      <div className="mt-5 flex items-baseline justify-between border-t-2 border-borda pt-4">
        <span className="text-base font-bold">Líquido a receber</span>
        <span className="tabular text-2xl font-bold">
          {formataMoeda(linha.liquido, moeda)}
        </span>
      </div>

      <Alerta tipo="info" className="mt-4">
        O INSS de {formataMoeda(linha.inss_empresa, moeda)} suportado pela
        empresa (8%) não desconta ao colaborador — é custo da entidade patronal
        e não aparece no líquido.
      </Alerta>
    </Cartao>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borda/60 pb-1">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}

function Bloco({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
        {titulo}
      </h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Movimento({
  rotulo,
  valor,
  moeda,
  forte,
  negativo,
  nota,
}: {
  rotulo: string;
  valor: Valor;
  moeda: string;
  forte?: boolean;
  negativo?: boolean;
  nota?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-3 py-1.5",
        forte ? "border-t border-borda font-bold" : "",
        nota ? "text-texto-suave" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={forte ? "" : "text-sm"}>{rotulo}</span>
      <span
        className={[
          "tabular",
          negativo && !forte ? "text-perigo" : "",
          forte ? "" : "text-sm",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formataMoeda(valor, moeda)}
      </span>
    </div>
  );
}
