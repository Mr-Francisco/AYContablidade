"use client";

import { EnvolveTabela, Tabela, Td, Th, Tr, Vazio } from "@/components/ui";
import { formataMoeda } from "@/lib/dinheiro";
import type { Folha } from "@/types";

/**
 * A folha do mês, coluna a coluna.
 *
 * A ordem das colunas não é decorativa: segue o cálculo do recibo, para que se
 * possa ler a linha da esquerda para a direita e chegar ao líquido. As duas
 * regras que mais se perdem numa migração estão nas colunas `INSS` e
 * `Matéria`: o INSS incide só sobre o salário base, e a matéria colectável do
 * IRT é o bruto MENOS o INSS, porque a contribuição é dedutível.
 */
export function TabelaFolha({
  folha,
  moeda,
  aoEscolher,
}: {
  folha: Folha;
  moeda: string;
  aoEscolher?: (colaboradorId: string) => void;
}) {
  if (!folha.linhas.length) {
    return <Vazio>Sem colaboradores activos para processar.</Vazio>;
  }

  return (
    <EnvolveTabela className="rounded-none border-0">
      <Tabela>
        <thead>
          <tr>
            <Th>Colaborador</Th>
            <Th numerico>Base</Th>
            <Th numerico>Faltas</Th>
            <Th numerico>Subsídios</Th>
            <Th numerico>Bruto</Th>
            <Th numerico>INSS 3%</Th>
            <Th numerico>Matéria</Th>
            <Th numerico>IRT</Th>
            <Th numerico>Outros desc.</Th>
            <Th numerico>Líquido</Th>
            <Th numerico>INSS empresa</Th>
          </tr>
        </thead>
        <tbody>
          {folha.linhas.map((l) => (
            <Tr
              key={l.colaborador_id}
              className={aoEscolher ? "cursor-pointer" : undefined}
              onClick={
                aoEscolher ? () => aoEscolher(l.colaborador_id) : undefined
              }
            >
              <Td className="max-w-[220px] truncate font-semibold">
                {l.colaborador}
              </Td>
              <Td numerico>{formataMoeda(l.base, moeda)}</Td>
              <Td numerico className={l.faltas !== "0" ? "text-perigo" : ""}>
                {l.faltas === "0" ? "—" : l.faltas}
              </Td>
              <Td numerico>{formataMoeda(l.subs, moeda)}</Td>
              <Td numerico className="font-semibold">
                {formataMoeda(l.bruto, moeda)}
              </Td>
              <Td numerico>{formataMoeda(l.inss, moeda)}</Td>
              <Td numerico className="text-texto-suave">
                {formataMoeda(l.materia, moeda)}
              </Td>
              <Td numerico>{formataMoeda(l.irt, moeda)}</Td>
              <Td numerico>
                {l.desc_extra === "0.00"
                  ? "—"
                  : formataMoeda(l.desc_extra, moeda)}
              </Td>
              <Td numerico className="font-bold">
                {formataMoeda(l.liquido, moeda)}
              </Td>
              <Td numerico className="text-texto-suave">
                {formataMoeda(l.inss_empresa, moeda)}
              </Td>
            </Tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-borda font-bold">
            <Td>Totais</Td>
            <Td />
            <Td />
            <Td />
            <Td numerico>{formataMoeda(folha.totais.bruto, moeda)}</Td>
            <Td numerico>{formataMoeda(folha.totais.inss, moeda)}</Td>
            <Td />
            <Td numerico>{formataMoeda(folha.totais.irt, moeda)}</Td>
            <Td />
            <Td numerico>{formataMoeda(folha.totais.liquido, moeda)}</Td>
            <Td numerico>{formataMoeda(folha.totais.inss_empresa, moeda)}</Td>
          </tr>
        </tfoot>
      </Tabela>
    </EnvolveTabela>
  );
}
