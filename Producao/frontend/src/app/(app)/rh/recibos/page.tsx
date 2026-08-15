"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import {
  ESTADOS_MES,
  mesActual,
  mesPorExtenso,
  ultimosMeses,
} from "@/components/rh/mes";
import {
  ACarregar,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import type { Colaborador, Folha, LinhaRecibo } from "@/types";

/**
 * Recibo de vencimento — o do Piloto (`rh-recibos.html`), linha a linha.
 *
 * O que aqui estava era outro documento: dois blocos («Remunerações» e
 * «Descontos»), um «Total de descontos» que o Piloto não tem e um aviso sobre
 * o INSS da empresa em caixa de informação. Um recibo é um papel que se
 * assina — a ordem das linhas e o que lá está escrito não são decoração.
 *
 * Os valores a subtrair aparecem entre parênteses, como no Piloto e como em
 * qualquer recibo: `(7 500,00)` lê-se como desconto sem precisar de cor.
 */
export default function Recibos() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [colaboradorId, setColaboradorId] = useState("");

  // TODOS os colaboradores, não só os activos: quem saiu em Março tem recibo
  // de Março, e é precisamente esse que se vai buscar mais tarde.
  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );
  const { data: folha, isLoading } = useSWR<Folha>(
    `/api/rh/folha?mes=${mes}&so_ativos=false`,
    buscador,
  );
  const { data: estado } = useSWR<{ estado: string }>(
    `/api/rh/estado?mes=${mes}`,
    buscador,
  );

  const linha = folha?.linhas.find((l) => l.colaborador_id === colaboradorId);
  const colaborador = colaboradores?.find((c) => c.id === colaboradorId);
  const info = ESTADOS_MES[estado?.estado ?? "por_processar"];

  return (
    <>
      <CabecalhoPagina
        titulo="Recibos de Vencimento"
        descricao="Recibo individual por colaborador e mês, pronto a imprimir."
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
            rotulo: `${c.numero} · ${c.nome}`,
          }))}
          placeholder="Escolher colaborador…"
          larguraMinima="18rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !colaboradores?.length ? (
        <Cartao>
          <Vazio>Sem colaboradores.</Vazio>
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
          estado={info}
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
  estado,
}: {
  linha: LinhaRecibo;
  colaborador?: Colaborador;
  mes: string;
  moeda: string;
  empresa: string;
  estado: { rotulo: string; cor: string };
}) {
  const temFaltas = Number(linha.faltas) > 0;
  const dias = Number(linha.faltas);

  return (
    <Cartao className="mx-auto max-w-[820px]">
      {/* O cabeçalho do mapa: quem emite, o que é, e em que moeda. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-borda pb-3">
        <div>
          <b className="text-[15px]">{empresa}</b>
          <p className="text-[12.5px] text-texto-suave">
            Recibo de Vencimento — {mesPorExtenso(mes)}
          </p>
        </div>
        <span className="text-[12.5px] text-texto-suave">
          Valores em {moeda}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="text-[12.5px] text-texto-suave">
          <p>
            <b className="text-texto">{linha.colaborador}</b> · Nº{" "}
            {linha.numero}
          </p>
          <p className="mt-0.5">
            Categoria: {colaborador?.categoria || "—"} · Admissão:{" "}
            {colaborador?.data_admissao
              ? new Date(colaborador.data_admissao).toLocaleDateString("pt-PT")
              : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-texto-suave">
          Estado do mês: <Selo cor={estado.cor}>{estado.rotulo}</Selo>
        </div>
      </div>

      <EnvolveTabela className="mt-3">
        <Tabela>
          <tbody>
            <Linha rotulo="Salário base" valor={linha.base} moeda={moeda} />
            {linha.subs !== "0.00" && (
              <Linha rotulo="Subsídios" valor={linha.subs} moeda={moeda} />
            )}
            {temFaltas && (
              <Linha
                rotulo={`Desconto por faltas (${dias} dia${dias === 1 ? "" : "s"})`}
                valor={linha.desc_faltas}
                moeda={moeda}
                negativo
              />
            )}
            {linha.abonos_extra !== "0.00" && (
              <Linha
                rotulo="Abonos do mês"
                valor={linha.abonos_extra}
                moeda={moeda}
              />
            )}
            <tr className="border-t-2 border-borda font-bold">
              <td className="px-4 py-2">Remuneração bruta</td>
              <td className="tabular px-4 py-2 text-right">
                {formataMoeda(linha.bruto, moeda)}
              </td>
            </tr>
            <Linha
              rotulo="INSS (3%)"
              valor={linha.inss}
              moeda={moeda}
              negativo
            />
            <Linha
              rotulo="Matéria colectável IRT"
              valor={linha.materia}
              moeda={moeda}
            />
            <Linha rotulo="IRT" valor={linha.irt} moeda={moeda} negativo />
            {linha.desc_extra !== "0.00" && (
              <Linha
                rotulo="Outros descontos"
                valor={linha.desc_extra}
                moeda={moeda}
                negativo
              />
            )}
            <tr className="border-t-2 border-borda bg-superficie-2 font-bold">
              <td className="px-4 py-2.5">Líquido a receber</td>
              <td className="tabular px-4 py-2.5 text-right text-[15px]">
                {formataMoeda(linha.liquido, moeda)}
              </td>
            </tr>
          </tbody>
        </Tabela>
      </EnvolveTabela>

      <p className="mt-3 text-[12.5px] text-texto-suave">
        INSS a cargo da empresa (8%):{" "}
        <b className="tabular text-texto">
          {formataMoeda(linha.inss_empresa, moeda)}
        </b>
        . Assinatura do colaborador: ___________________________
      </p>
    </Cartao>
  );
}

/** Uma linha do recibo. O que se subtrai vai entre parênteses. */
function Linha({
  rotulo,
  valor,
  moeda,
  negativo,
}: {
  rotulo: string;
  valor: string;
  moeda: string;
  negativo?: boolean;
}) {
  return (
    <tr className="border-b border-borda/60">
      <td className="px-4 py-2 text-sm">{rotulo}</td>
      <td className="tabular px-4 py-2 text-right text-sm">
        {negativo
          ? `(${formataMoeda(valor, moeda)})`
          : formataMoeda(valor, moeda)}
      </td>
    </tr>
  );
}
