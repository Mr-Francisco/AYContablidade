"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Alerta, EnvolveTabela, Tabela, Td, Th, Tr } from "@/components/ui";
import { buscador } from "@/lib/api";
import type { PrecosIa as Precos } from "@/types";

/** Preços em vigor, dobrados por omissão.
 *
 * Está aqui porque a pergunta que se faz ao olhar para uma coluna de custos é
 * «de onde veio este número?». Os preços são os do registo de modelos, que o
 * superadministrador mantém em Configurações.
 */
export function PrecosIa() {
  const { data } = useSWR<Precos>("/api/licencas/precos-ia", buscador, {
    revalidateOnFocus: false,
  });
  const [aberto, setAberto] = useState(false);

  if (!data) return null;

  return (
    <div className="mb-4">
      <Alerta tipo={data.de_configuracao ? "aviso" : "erro"}>
        Os <b>tokens</b> são medidos ao certo — vêm na resposta da API. O{" "}
        <b>custo é uma estimativa</b>, calculada dos tokens pela tabela de
        preços abaixo, que tem de ser confirmada contra a facturação real da
        OpenAI. Serve para dar previsibilidade, não para fechar contas.
        {!data.de_configuracao && (
          <>
            {" "}
            <b>
              O registo de modelos não pôde ser lido e está a usar-se a tabela
              embutida
            </b>{" "}
            — os valores podem estar desactualizados.
          </>
        )}
        <br />
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          <ChevronDown
            size={13}
            className={
              aberto
                ? "rotate-180 transition-transform"
                : "transition-transform"
            }
          />
          {aberto ? "Esconder os preços" : "Ver os preços aplicados"}
        </button>
      </Alerta>

      {aberto && (
        <div className="mt-2">
          <EnvolveTabela>
            <Tabela>
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  <Th numerico>Entrada</Th>
                  <Th numerico>Em cache</Th>
                  <Th numerico>Saída</Th>
                </tr>
              </thead>
              <tbody>
                {data.modelos.map((m) => (
                  <Tr key={m.modelo}>
                    <Td className="font-semibold">{m.modelo}</Td>
                    <Td numerico className="tabular">
                      {m.entrada} USD
                    </Td>
                    <Td numerico className="tabular">
                      {m.entrada_cache ? `${m.entrada_cache} USD` : "—"}
                    </Td>
                    <Td numerico className="tabular">
                      {m.saida} USD
                    </Td>
                  </Tr>
                ))}
                <Tr>
                  <Td className="text-texto-suave">
                    Outro modelo
                    <span className="ml-1.5 text-xs">
                      (o mais caro, para nunca subestimar)
                    </span>
                  </Td>
                  <Td numerico className="tabular text-texto-suave">
                    {data.por_omissao.entrada} USD
                  </Td>
                  <Td numerico className="tabular text-texto-suave">
                    —
                  </Td>
                  <Td numerico className="tabular text-texto-suave">
                    {data.por_omissao.saida} USD
                  </Td>
                </Tr>
              </tbody>
            </Tabela>
          </EnvolveTabela>

          <p className="mt-2 text-xs text-texto-suave">
            Por 1 000 000 de tokens. Origem: <b>{data.origem}</b>. Cada consulta
            guarda os preços que lhe foram aplicados, por isso corrigir um preço
            nunca reescreve o histórico.
          </p>
        </div>
      )}
    </div>
  );
}
