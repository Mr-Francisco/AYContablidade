"use client";

import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selector,
  Tabela,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";

interface ParDC {
  d: string;
  c: string;
}

interface ContaRazao {
  codigo: string;
  nome: string;
  classe: string;
  ant: ParDC;
  per: ParDC;
  acu: ParDC;
}

interface ClasseRazao {
  classe: string;
  nome: string;
  contas: ContaRazao[];
  soma: { ant: ParDC; per: ParDC; acu: ParDC };
}

interface BalanceteRazao {
  classes: ClasseRazao[];
  total: { ant: ParDC; per: ParDC; acu: ParDC };
}

export default function BalanceteRazao() {
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();

  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [mes, setMes] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (mes) p.set("mes", mes);

  const { data, isLoading } = useSWR<BalanceteRazao>(
    `/api/relatorios/balancete-razao?${p}`,
    buscador,
  );

  const valor = (v: string) => (v === "0.00" ? "" : formataMoeda(v, moeda));

  return (
    <>
      <CabecalhoPagina
        titulo="Balancete do Razão"
        descricao="Contas do razão (2 dígitos) agrupadas por classe, com saldo anterior, do período e acumulado."
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Campo rotulo="Período começa em">
          <Entrada
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </Campo>
        <Selector
          rotulo="Até ao período"
          valor={mes}
          aoMudar={setMes}
          opcoes={[
            { valor: "", rotulo: "Todo o exercício" },
            ...periodos.map((x) => ({
              valor: x.codigo,
              rotulo: `${x.codigo} — ${x.nome}`,
            })),
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {!de && (
        <Alerta tipo="info" className="mb-4">
          Sem data de início, tudo cai na coluna «Período» e a coluna «Anterior»
          fica a zero. Indique uma data para separar o acumulado anterior.
        </Alerta>
      )}

      {isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">
          Não foi possível carregar o balancete do razão.
        </Alerta>
      ) : (
        <Cartao className="p-0">
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th rowSpan={2} className="align-bottom">
                    Conta
                  </Th>
                  <Th rowSpan={2} className="align-bottom">
                    Designação
                  </Th>
                  <Th colSpan={2} numerico className="text-center">
                    Anterior
                  </Th>
                  <Th colSpan={2} numerico className="text-center">
                    Período
                  </Th>
                  <Th colSpan={2} numerico className="text-center">
                    Acumulado
                  </Th>
                </tr>
                <tr>
                  <Th numerico>Débito</Th>
                  <Th numerico>Crédito</Th>
                  <Th numerico>Débito</Th>
                  <Th numerico>Crédito</Th>
                  <Th numerico>Débito</Th>
                  <Th numerico>Crédito</Th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((cl) => (
                  <FragmentoClasse key={cl.classe} classe={cl} valor={valor} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-superficie-2 font-extrabold">
                  <Td colSpan={2}>TOTAL GERAL</Td>
                  <Td numerico>{valor(data.total.ant.d)}</Td>
                  <Td numerico>{valor(data.total.ant.c)}</Td>
                  <Td numerico>{valor(data.total.per.d)}</Td>
                  <Td numerico>{valor(data.total.per.c)}</Td>
                  <Td numerico>{valor(data.total.acu.d)}</Td>
                  <Td numerico>{valor(data.total.acu.c)}</Td>
                </tr>
              </tfoot>
            </Tabela>
          </EnvolveTabela>
        </Cartao>
      )}
    </>
  );
}

function FragmentoClasse({
  classe,
  valor,
}: {
  classe: ClasseRazao;
  valor: (v: string) => string;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={8}
          className="border-b border-borda bg-superficie-2 px-3.5 py-2 text-[12.5px] font-bold uppercase tracking-[0.4px] text-marca"
        >
          Classe {classe.classe} — {classe.nome}
        </td>
      </tr>
      {classe.contas.map((c) => (
        <Tr key={c.codigo}>
          <Td className="tabular font-bold">{c.codigo}</Td>
          <Td className="max-w-[300px] truncate">
            <span title={c.nome}>{c.nome}</span>
          </Td>
          <Td numerico>{valor(c.ant.d)}</Td>
          <Td numerico>{valor(c.ant.c)}</Td>
          <Td numerico>{valor(c.per.d)}</Td>
          <Td numerico>{valor(c.per.c)}</Td>
          <Td numerico>{valor(c.acu.d)}</Td>
          <Td numerico>{valor(c.acu.c)}</Td>
        </Tr>
      ))}
      <Tr className="font-bold">
        <Td colSpan={2}>Subtotal da classe {classe.classe}</Td>
        <Td numerico>{valor(classe.soma.ant.d)}</Td>
        <Td numerico>{valor(classe.soma.ant.c)}</Td>
        <Td numerico>{valor(classe.soma.per.d)}</Td>
        <Td numerico>{valor(classe.soma.per.c)}</Td>
        <Td numerico>{valor(classe.soma.acu.d)}</Td>
        <Td numerico>{valor(classe.soma.acu.c)}</Td>
      </Tr>
    </>
  );
}
