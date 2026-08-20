"use client";

import { Download, FileSpreadsheet, Pencil, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { RubricasDoMapa } from "@/components/fiscalidade/RubricasDoMapa";
import { mesActual } from "@/components/rh/mes";
import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Selector,
} from "@/components/ui";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { type Coluna, Grelha } from "@/components/ui/Grelha";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { plural } from "@/lib/texto";
import { descarregar, preencherXlsx } from "@/lib/xlsx";
import type { LinhaMapaIrt, MapaIrt } from "@/types";

/**
 * Mapa de Remunerações — Modelo IRT A2.1 (AGT).
 *
 * A tabela é a do Piloto, coluna a coluna e grupo a grupo. Os grupos não são
 * decoração: há DUAS colunas chamadas «Base Tributável», uma da Segurança
 * Social e outra do IRT, e é o cabeçalho colorido por cima que diz qual é
 * qual. Catorze colunas não cabem em nenhum ecrã — o scroll é da tabela, com
 * largura mínima própria, e nunca da página.
 */

//: Código de província de duas letras exigido pelo modelo oficial (folha
//: «Auxiliar» do template da AGT). Sem ele o ficheiro é recusado no upload.
const PROVINCIA_COD: Record<string, string> = {
  Bengo: "BO",
  Benguela: "BA",
  Bié: "BE",
  Cabinda: "CA",
  "Cuando Cubango": "CC",
  "Cuanza Norte": "CN",
  "Cuanza Sul": "CS",
  Cunene: "CE",
  Huambo: "HO",
  Huíla: "HA",
  Luanda: "LA",
  "Lunda Norte": "LN",
  "Lunda Sul": "LS",
  Malanje: "ME",
  Moxico: "MO",
  Namibe: "NE",
  Uíge: "UE",
  Zaire: "ZE",
};

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** O modelo oficial aceita 1001 trabalhadores por período. */
const LIMITE_MODELO = 1001;

export default function MapaRemuneracoes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const podeGerir = pode("rh.gerir");

  const [periodo, setPeriodo] = useState(mesActual().slice(5)); // "08"
  const [ano, setAno] = useState(mesActual().slice(0, 4));
  const [nif, setNif] = useState("");
  const [emRubricas, setEmRubricas] = useState<LinhaMapaIrt | null>(null);
  const [aGerar, setAGerar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O NIF do contribuinte é o da empresa, e fica editável: quem entrega o mapa
  // por conta de outra entidade escreve outro sem lhe mexer na ficha.
  useEffect(() => {
    if (empresa?.nif) setNif(empresa.nif);
  }, [empresa?.nif]);

  const mes = `${ano}-${periodo}`;
  const { data, isLoading, error, mutate } = useSWR<MapaIrt>(
    `/api/rh/mapa-irt?mes=${mes}&so_ativos=true`,
    buscador,
  );

  const linhas = data?.linhas ?? [];
  const t = data?.totais ?? {};

  function exportarCsv() {
    const cab = [
      "NIF Trabalhador",
      "Nome",
      "Nº Segurança Social",
      "Província",
      "Município",
      "Salário Base",
      "Descontos por Falta",
      "Subsídios Não Sujeitos a IRT",
      "Subsídios Sujeitos a IRT",
      "Salário Ilíquido",
      "Base Tributável Segurança Social",
      "Contribuição Segurança Social",
      "Base Tributável IRT",
      "IRT Apurado",
    ];
    const corpo = linhas.map((l) => [
      l.nif,
      l.nome,
      l.num_ss,
      l.provincia,
      l.municipio,
      l.salario_base,
      l.descontos_falta,
      l.sub_nao_suj,
      l.sub_suj,
      l.salario_iliquido,
      l.base_ss,
      l.contrib_ss,
      l.base_irt,
      l.irt,
    ]);
    corpo.push([
      "",
      "TOTAIS",
      "",
      "",
      "",
      t.salario_base ?? "0",
      t.descontos_falta ?? "0",
      t.sub_nao_suj ?? "0",
      t.sub_suj ?? "0",
      t.salario_iliquido ?? "0",
      t.base_ss ?? "0",
      t.contrib_ss ?? "0",
      t.base_irt ?? "0",
      t.irt ?? "0",
    ]);
    const linhasCsv = [
      ["NIF do Contribuinte", nif],
      ["Período (AAAA-MM)", mes],
      [],
      cab,
      ...corpo,
    ];
    // Ponto e vírgula: o Excel em português usa-o como separador. O BOM é o
    // que faz os acentos aparecerem.
    const texto = linhasCsv
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\r\n");
    descarregar(
      new Blob([`﻿${texto}`], { type: "text/csv;charset=utf-8" }),
      `Mapa_Remuneracoes_${mes}_interno.csv`,
    );
  }

  /** O ficheiro oficial: o modelo da AGT com as células preenchidas. */
  async function gerarXlsx() {
    setErro(null);
    if (linhas.length > LIMITE_MODELO) {
      setErro(
        `O modelo suporta até ${LIMITE_MODELO} trabalhadores por período — este mês tem ${linhas.length}.`,
      );
      return;
    }
    setAGerar(true);
    try {
      const celulas: Record<string, string | number> = {
        C1: nif.trim(),
        C2: mes,
      };
      const n = (v: unknown) => Number(v ?? 0);
      linhas.forEach((l, i) => {
        const r = 5 + i; // as linhas de dados do modelo começam na 5
        Object.assign(celulas, {
          [`A${r}`]: l.nif || "",
          [`B${r}`]: l.nome || "",
          [`C${r}`]: l.num_ss || "",
          [`D${r}`]: PROVINCIA_COD[l.provincia] || "",
          [`E${r}`]: l.municipio || "",
          [`F${r}`]: n(l.salario_base),
          [`G${r}`]: n(l.descontos_falta),
          [`H${r}`]: n(l.sub_alimentacao),
          [`I${r}`]: n(l.sub_transporte),
          [`J${r}`]: n(l.abono_familia),
          [`K${r}`]: n(l.reembolso_despesas),
          [`L${r}`]: n(l.outros_nao_sujeitos),
          [`M${r}`]: l.calc_manual_excesso ? "S" : "N",
          [`N${r}`]: n(l.excesso_subsidios_nao_sujeitos),
          [`O${r}`]: n(l.abono_falhas),
          [`P${r}`]: n(l.sub_renda_casa),
          [`Q${r}`]: n(l.compensacao_rescisao),
          [`R${r}`]: n(l.sub_ferias),
          [`S${r}`]: n(l.horas_extras),
          [`T${r}`]: n(l.sub_atavio),
          [`U${r}`]: n(l.sub_representacao),
          [`V${r}`]: n(l.premios),
          [`W${r}`]: n(l.sub_natal),
          [`X${r}`]: n(l.outros_sujeitos),
          [`Y${r}`]: n(l.salario_iliquido),
          [`Z${r}`]: l.registo_manual_ss ? "S" : "N",
          [`AA${r}`]: n(l.base_ss),
          [`AB${r}`]: l.nao_sujeito_ss ? "S" : "N",
          [`AC${r}`]: n(l.contrib_ss),
          [`AD${r}`]: n(l.base_irt),
          [`AE${r}`]: l.isento_irt ? "S" : "N",
          [`AF${r}`]: n(l.irt),
        });
      });
      const blob = await preencherXlsx("/modelos/mapa-irt-a2.1.xlsx", {
        folha: "sheet1",
        celulas,
      });
      descarregar(blob, `Mapa_Remuneracoes_IRT_A2.1_${mes}.xlsx`);
    } catch (e) {
      setErro(
        `Não foi possível gerar o ficheiro: ${e instanceof Error ? e.message : "erro desconhecido"}`,
      );
    } finally {
      setAGerar(false);
    }
  }

  function imprimir() {
    // Catorze colunas não cabem em retrato — o Piloto vira a folha.
    document.body.classList.add("imprimir-deitado");
    window.print();
    setTimeout(() => document.body.classList.remove("imprimir-deitado"), 500);
  }

  const semLinhas = !linhas.length;

  // O conteúdo de uma célula de valor — um traço quando é zero, para o mapa
  // não ficar um muro de zeros. Era o que o `Numero` fazia enquanto a tabela
  // era escrita à mão.
  const valorNaCelula = (valor: string, forte?: boolean) =>
    !Number(valor) && !forte ? (
      <span className="text-texto-suave">—</span>
    ) : (
      formataMoeda(valor, moeda === "Kz" ? "" : moeda)
    );

  // As nove colunas de dinheiro são a mesma coluna com outro campo. Escritas
  // uma a uma, mudavam nove sítios de cada vez que a formatação mudasse.
  const dinheiro = (
    chave: keyof LinhaMapaIrt,
    titulo: string,
    forte?: boolean,
  ): Coluna<LinhaMapaIrt> => ({
    chave,
    titulo,
    tipo: "numero",
    valor: (l) => Number(l[chave]),
    celula: (l) => valorNaCelula(String(l[chave]), forte),
  });

  const colunas: Coluna<LinhaMapaIrt>[] = [
    {
      chave: "nif",
      titulo: "NIF",
      valor: (l) => l.nif,
      celula: (l) => <span className="tabular">{l.nif || "—"}</span>,
    },
    {
      chave: "nome",
      titulo: "Nome",
      valor: (l) => l.nome,
      celula: (l) => <span className="font-semibold">{l.nome}</span>,
    },
    {
      chave: "num_ss",
      titulo: "Nº Seg. Social",
      valor: (l) => l.num_ss,
      celula: (l) => <span className="tabular">{l.num_ss || "—"}</span>,
    },
    {
      chave: "provincia",
      titulo: "Província",
      valor: (l) => l.provincia,
      celula: (l) => l.provincia || "—",
    },
    {
      chave: "municipio",
      titulo: "Município",
      valor: (l) => l.municipio,
      celula: (l) => l.municipio || "—",
    },
    dinheiro("salario_base", "Salário Base"),
    dinheiro("descontos_falta", "Descontos p/ Falta"),
    dinheiro("sub_nao_suj", "Subsídios Não Sujeitos"),
    dinheiro("sub_suj", "Subsídios Sujeitos"),
    dinheiro("salario_iliquido", "Salário Ilíquido", true),
    // Duas colunas chamam-se «Base Tributável» — é assim no modelo da AGT,
    // uma para a Segurança Social e outra para o IRT. Distinguem-se pela
    // banda por cima, e cada uma tem a sua chave, por isso os filtros não se
    // confundem.
    dinheiro("base_ss", "Base Tributável"),
    dinheiro("contrib_ss", "Contribuição (3%)"),
    dinheiro("base_irt", "Base Tributável"),
    dinheiro("irt", "IRT Apurado", true),
  ];

  if (podeGerir) {
    colunas.push({
      chave: "accoes",
      titulo: " ",
      // Sem `valor`: não filtra nem ordena. E `sem-imprimir` porque um botão
      // não vai no mapa que se entrega.
      className: "sem-imprimir text-right",
      celula: (l) => (
        <Botao tamanho="pequeno" onClick={() => setEmRubricas(l)}>
          <Pencil size={12} />
          Rubricas
        </Botao>
      ),
    });
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa de Remunerações"
        descricao="Modelo IRT A2.1 (AGT) — gera o ficheiro .xlsx exatamente no modelo oficial, pronto a anexar."
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Cartao className="sem-imprimir mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="NIF do Contribuinte" className="w-[11rem]">
            <Entrada
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="tabular"
            />
          </Campo>
          <Selector
            rotulo="Período"
            valor={periodo}
            aoMudar={setPeriodo}
            opcoes={MESES.map((nome, i) => ({
              valor: String(i + 1).padStart(2, "0"),
              rotulo: `${String(i + 1).padStart(2, "0")} · ${nome}`,
            }))}
            larguraMinima="13rem"
          />
          <Campo rotulo="Ano" className="w-[7rem]">
            <Entrada
              type="number"
              min="2000"
              max="2100"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              className="tabular"
            />
          </Campo>
          <p className="pb-2.5 text-[12.5px] text-texto-suave">
            {plural(linhas.length, "trabalhador", "trabalhadores")} · valores em{" "}
            {moeda}
          </p>

          <span className="flex-1" />

          <div className="flex flex-wrap gap-2 pb-0.5">
            <Botao
              tamanho="pequeno"
              onClick={exportarCsv}
              disabled={semLinhas}
              motivoBloqueio={
                semLinhas ? "Não há trabalhadores neste período." : undefined
              }
            >
              <Download size={14} />
              CSV (interno)
            </Botao>
            <Botao
              tamanho="pequeno"
              onClick={imprimir}
              disabled={semLinhas}
              motivoBloqueio={
                semLinhas ? "Não há trabalhadores neste período." : undefined
              }
            >
              <Printer size={14} />
              Imprimir
            </Botao>
            <Botao
              variante="primario"
              tamanho="pequeno"
              onClick={gerarXlsx}
              disabled={semLinhas || aGerar}
              motivoBloqueio={
                aGerar
                  ? "A preencher o modelo oficial — aguarde."
                  : semLinhas
                    ? "Não há trabalhadores neste período."
                    : undefined
              }
            >
              <FileSpreadsheet size={14} />
              {aGerar ? "A gerar…" : "Gerar .xlsx (modelo AGT)"}
            </Botao>
          </div>
        </div>
      </Cartao>

      <Cartao>
        {/* Cabeçalho do mapa — é o que sai no papel. */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <b className="text-[15px]">{empresa?.nome}</b>
            <p className="text-[12.5px] text-texto-suave">
              Mapa de Remunerações — Modelo IRT A2.1
            </p>
          </div>
          <div className="text-right text-[12.5px] text-texto-suave">
            <p>
              NIF do Contribuinte: <b className="text-texto">{nif || "—"}</b>
            </p>
            <p>
              Período: <b className="text-texto">{mes}</b>
            </p>
          </div>
        </div>

        {isLoading ? (
          <ACarregar />
        ) : error ? (
          <FalhaAoCarregar erro={error} oQue="o mapa de remunerações" />
        ) : (
          <Grelha
            linhas={linhas}
            colunas={colunas}
            chaveDaLinha={(l) => l.colaborador_id}
            altura={560}
            classeTabela="mapa-remun text-left"
            vazio="Sem colaboradores activos. Registe em RH → Funcionários."
            // O MAPA IMPRIME-SE E ENTREGA-SE. Filtrar para encontrar um
            // trabalhador é útil; imprimir nesse estado entregava um mapa com
            // menos linhas do que os totais dizem. Daí o aviso.
            avisoAoFiltrar={
              <span className="font-semibold text-aviso">
                Está a ver parte do mapa. Os totais são de todos os
                trabalhadores — limpe os filtros antes de imprimir ou exportar.
              </span>
            }
            grupos={
              <tr className="grupos">
                <th colSpan={5} className="g-id">
                  Identificação do Trabalhador
                </th>
                <th colSpan={2}> </th>
                <th className="g-nao">Não Sujeito a IRT</th>
                <th className="g-sim">Sujeito a IRT</th>
                <th> </th>
                <th colSpan={2} className="g-ss">
                  Segurança Social
                </th>
                <th colSpan={2} className="g-irt">
                  IRT
                </th>
                {podeGerir && <th className="sem-imprimir"> </th>}
              </tr>
            }
            rodapeTabela={
              <tr className="font-bold">
                <td colSpan={5}>TOTAIS</td>
                <td className="tabular text-right">
                  {formataMoeda(t.salario_base ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.descontos_falta ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.sub_nao_suj ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.sub_suj ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.salario_iliquido ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.base_ss ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.contrib_ss ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.base_irt ?? "0", "")}
                </td>
                <td className="tabular text-right">
                  {formataMoeda(t.irt ?? "0", "")}
                </td>
                {podeGerir && <td className="sem-imprimir"> </td>}
              </tr>
            }
          />
        )}

        {/* Sem mapa não há totais: mostrá-los por baixo de «a sessão
            expirou» era o ecrã a contradizer-se. */}
        {!error && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-texto-suave">
            Total de IRT a entregar:{" "}
            <b className="tabular text-texto">
              {formataMoeda(t.irt ?? "0", moeda)}
            </b>{" "}
            · Contribuição para a Segurança Social (trabalhador):{" "}
            <b className="tabular text-texto">
              {formataMoeda(t.contrib_ss ?? "0", moeda)}
            </b>
            . Use <b>Rubricas</b> por trabalhador para classificar os subsídios
            nas categorias exactas do modelo da AGT.
          </p>
        )}
      </Cartao>

      {emRubricas && (
        <RubricasDoMapa
          linha={emRubricas}
          mes={mes}
          rotuloMes={`${periodo} · ${MESES[Number(periodo) - 1] ?? ""}`}
          moeda={moeda}
          aoFechar={() => setEmRubricas(null)}
          aoGravar={() => {
            setEmRubricas(null);
            mutate();
          }}
        />
      )}
    </>
  );
}

/** Célula numérica: zero mostra-se como «—», como no Piloto. */
// A célula de valor deixou de ser um componente: a grelha já monta o `<td>`,
// e o que resta — o traço no zero — vive em `valorNaCelula`, dentro do
// componente, onde tem a moeda à mão.
