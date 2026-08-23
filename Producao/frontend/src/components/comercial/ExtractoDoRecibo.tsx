"use client";

import useSWR from "swr";

import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";

/* ---------------------------------------------------------------------------
   Os três blocos de um recibo com retenção na fonte.

   PORQUE SÃO TRÊS, e não um total como nas outras facturas:

   - **A FACTURA** é fixa. O que foi facturado, o que a lei manda reter, e o
     que sobra para o cliente transferir. Não muda com os pagamentos, e é a
     referência contra a qual tudo o resto se lê.
   - **ESTE RECIBO** é o movimento de agora: o que entrou, a parte da retenção
     que este pagamento amortiza, e a soma dos dois.
   - **A SITUAÇÃO APÓS** é o saldo depois deste recibo.

   O QUE FALTA VEM SEPARADO EM DUAS PARCELAS, e é a parte que mais se
   confunde: o que falta em DINHEIRO e o que falta em RETENÇÃO são dívidas de
   naturezas diferentes. Uma o cliente ainda vai transferir; a outra ainda vai
   entregar ao Estado, e nunca passará pela conta bancária de ninguém. Somá-las
   num número só faria alguém ir cobrar dinheiro que não é para cobrar.

   AS CORES SÃO DO DOCUMENTO ORIGINAL — azul, verde e roxo — e servem para o
   olho saltar entre os três grupos da tabela sem ler os cabeçalhos.
--------------------------------------------------------------------------- */

interface LinhaExtracto {
  factura: string | null;
  iliquido: string;
  retencao_total: string;
  retencao_perc: string;
  liquido: string;
  pago: string;
  retido: string;
  regularizado: string;
  regularizado_acum: string;
  por_regularizar: string;
  dinheiro_pendente: string;
  retencao_por_amortizar: string;
}

interface Extracto {
  linhas: LinhaExtracto[];
  totais: Omit<LinhaExtracto, "factura" | "retencao_perc">;
}

const AZUL = "#1e4fa3";
const VERDE = "#0f6e5c";
const ROXO = "#7b2d8e";

/** «6,50%» e não «6.50%» — o ponto decimal inglês num documento português. */
function taxa(v: string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "";
  return `${n.toFixed(2).replace(".", ",")}%`;
}

export function ExtractoDoRecibo({
  vendaId,
  moeda,
}: {
  vendaId: string;
  moeda: string;
}) {
  const { data } = useSWR<Extracto>(
    `/api/comercial/vendas/${vendaId}/recibo`,
    buscador,
  );

  if (!data || data.linhas.length === 0) return null;

  const t = data.totais;
  const perc = taxa(data.linhas[0]?.retencao_perc);

  return (
    <div className="mt-4">
      {/* ---- A tabela, agrupada pelas três cores ---- */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className="w-[22%] border-b border-[#ddd] px-2 py-1.5 text-left" />
              <th
                colSpan={3}
                className="px-2 py-1 text-center text-[10.5px] font-bold uppercase tracking-[0.5px] text-white"
                style={{ background: AZUL }}
              >
                A factura (fixo)
              </th>
              <th
                colSpan={3}
                className="px-2 py-1 text-center text-[10.5px] font-bold uppercase tracking-[0.5px] text-white"
                style={{ background: VERDE }}
              >
                Este recibo
              </th>
              <th
                colSpan={2}
                className="px-2 py-1 text-center text-[10.5px] font-bold uppercase tracking-[0.5px] text-white"
                style={{ background: ROXO }}
              >
                Situação após
              </th>
            </tr>
            <tr className="text-[10px] uppercase tracking-[0.3px] text-[#666]">
              <th className="border-b border-[#ddd] px-2 py-1.5 text-left font-semibold">
                Factura
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Ilíquido
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Retenção total{perc && ` (${perc})`}
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Líquido
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Pago
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Retido
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Regularizado
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Regularizado acum.
              </th>
              <th className="border-b border-[#ddd] px-2 py-1.5 text-right font-semibold">
                Por regularizar
              </th>
            </tr>
          </thead>
          <tbody>
            {data.linhas.map((l) => (
              <tr key={l.factura ?? Math.random()}>
                <td className="tabular border-b border-[#eee] px-2 py-2 font-bold">
                  {l.factura}
                </td>
                <Valor v={l.iliquido} moeda={moeda} borda={AZUL} primeira />
                <Valor v={l.retencao_total} moeda={moeda} />
                <Valor v={l.liquido} moeda={moeda} />
                <Valor v={l.pago} moeda={moeda} borda={VERDE} primeira />
                <Valor v={l.retido} moeda={moeda} />
                <Valor v={l.regularizado} moeda={moeda} />
                <Valor
                  v={l.regularizado_acum}
                  moeda={moeda}
                  borda={ROXO}
                  primeira
                />
                <Valor v={l.por_regularizar} moeda={moeda} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Os três cartões ---- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Cartao cor={AZUL} titulo="A factura">
          <Item rotulo="Total Ilíquido" valor={t.iliquido} moeda={moeda} />
          <Item
            rotulo={`Retenção fonte${perc ? ` (${perc})` : ""}`}
            valor={t.retencao_total}
            moeda={moeda}
          />
          <Item
            rotulo="Total Líquido"
            valor={t.liquido}
            moeda={moeda}
            forte
            nota="Ilíquido − Retenção = Líquido"
          />
        </Cartao>

        <Cartao cor={VERDE} titulo="Este recibo">
          <Item rotulo="Valor pago" valor={t.pago} moeda={moeda} />
          <Item rotulo="Retido (proporcional)" valor={t.retido} moeda={moeda} />
          <Item
            rotulo="Regularizado"
            valor={t.regularizado}
            moeda={moeda}
            forte
            nota="Pago + Retido = Regularizado"
          />
        </Cartao>

        <Cartao cor={ROXO} titulo="Situação após">
          <Item
            rotulo="Regularizado acum."
            valor={t.regularizado_acum}
            moeda={moeda}
          />
          <Item
            rotulo="Por regularizar"
            valor={t.por_regularizar}
            moeda={moeda}
            forte
          />
          {/* AS DUAS PARCELAS DO QUE FALTA. Uma é dinheiro que ainda entra, a
              outra é imposto que o cliente entrega ao Estado — somá-las num
              número só mandava alguém cobrar o que não é para cobrar. */}
          <div className="mt-1 flex justify-between text-[10.5px] text-[#666]">
            <span>dinheiro pendente</span>
            <b className="tabular text-[#333]">
              {formataMoeda(t.dinheiro_pendente, "")}
            </b>
          </div>
          <div className="flex justify-between text-[10.5px] text-[#666]">
            <span>retenção por amortizar</span>
            <b className="tabular text-[#333]">
              {formataMoeda(t.retencao_por_amortizar, "")}
            </b>
          </div>
        </Cartao>
      </div>
    </div>
  );
}

function Valor({
  v,
  moeda,
  borda,
  primeira,
}: {
  v: string;
  moeda: string;
  borda?: string;
  primeira?: boolean;
}) {
  return (
    <td
      className="tabular border-b border-[#eee] px-2 py-2 text-right"
      style={
        primeira && borda ? { borderLeft: `2px solid ${borda}` } : undefined
      }
    >
      {formataMoeda(v, moeda === "Kz" ? "" : moeda)}
    </td>
  );
}

function Cartao({
  cor,
  titulo,
  children,
}: {
  cor: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[6px] border border-[#e2e2e2] px-3 py-2.5"
      style={{ borderTop: `3px solid ${cor}` }}
    >
      <div
        className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.5px]"
        style={{ color: cor }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Item({
  rotulo,
  valor,
  moeda,
  forte,
  nota,
}: {
  rotulo: string;
  valor: string;
  moeda: string;
  forte?: boolean;
  nota?: string;
}) {
  return (
    <>
      <div
        className={`flex items-baseline justify-between gap-2 py-[3px] text-[11.5px] ${
          forte ? "mt-1 border-t border-[#e2e2e2] pt-1.5 font-bold" : ""
        }`}
      >
        <span className={forte ? "" : "text-[#555]"}>{rotulo}</span>
        <span className="tabular">
          {formataMoeda(valor, moeda === "Kz" ? "" : moeda)}
        </span>
      </div>
      {nota && <div className="text-[10px] italic text-[#888]">{nota}</div>}
    </>
  );
}
