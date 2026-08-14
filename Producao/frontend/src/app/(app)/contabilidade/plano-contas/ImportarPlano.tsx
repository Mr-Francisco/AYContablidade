"use client";

import { type ChangeEvent, useState } from "react";

import { Selector, Selo } from "@/components/ui";
import { DialogoMestre } from "@/components/ui/CrudMestre";
import { api, ErroApi } from "@/lib/api";

/**
 * Importar o plano exportado do Primavera — o `modalImp` do Piloto.
 *
 * O ficheiro é lido NO BROWSER e só as linhas seguem para o servidor: um CSV
 * do plano de contas é um documento da empresa, e não há razão para o carregar
 * inteiro para depois o descartar.
 *
 * Só CSV/TXT. O Piloto aceitava `.xlsx` porque trazia um leitor próprio
 * (`xlsx-lite.js`); aqui isso exigiria uma biblioteca nova só para isto, e o
 * Primavera exporta CSV no mesmo sítio. A mensagem diz-lho.
 */
export function ImportarPlano({
  aoFechar,
  aoImportar,
}: {
  aoFechar: () => void;
  aoImportar: (mensagem: string) => void;
}) {
  const [nomeFicheiro, setNomeFicheiro] = useState("");
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [colCodigo, setColCodigo] = useState("0");
  const [colNome, setColNome] = useState("1");
  const [temCabecalho, setTemCabecalho] = useState("1");
  const [substituir, setSubstituir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aImportar, setAImportar] = useState(false);

  function aoEscolherFicheiro(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro(null);
    setNomeFicheiro(f.name);

    if (/\.xlsx$/i.test(f.name)) {
      setLinhas([]);
      setErro(
        "Ficheiros .xlsx não são lidos aqui. No Primavera, exporte em CSV — " +
          "é a mesma opção, no mesmo sítio.",
      );
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      const texto = String(leitor.result ?? "");
      const separador = detectarSeparador(texto);
      const lidas = texto
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => partir(l, separador));
      if (lidas.length === 0) {
        setErro("O ficheiro está vazio.");
        setLinhas([]);
        return;
      }
      setLinhas(lidas);
    };
    leitor.onerror = () => setErro("Não foi possível ler o ficheiro.");
    // UTF-8 com BOM é o que o Primavera produz; o `readAsText` trata do BOM.
    leitor.readAsText(f, "utf-8");
  }

  const corpo = temCabecalho === "1" ? linhas.slice(1) : linhas;
  const cabecalho = linhas[0] ?? [];
  const nColunas = Math.max(...linhas.map((l) => l.length), 0);

  const paraImportar = corpo
    .map((l) => ({
      codigo: (l[Number(colCodigo)] ?? "").trim(),
      nome: (l[Number(colNome)] ?? "").trim(),
    }))
    .filter((l) => l.codigo);

  async function importar() {
    setErro(null);
    setAImportar(true);
    try {
      const r = await api.post<{ criadas?: number; total?: number }>(
        "/api/contabilidade/plano/importar",
        { linhas: paraImportar, substituir },
      );
      aoImportar(
        `Plano importado: ${r.criadas ?? paraImportar.length} conta(s)` +
          (substituir ? " — o plano anterior foi substituído." : "."),
      );
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível importar.",
      );
    } finally {
      setAImportar(false);
    }
  }

  const opcoesColuna = Array.from({ length: nColunas }, (_, i) => ({
    valor: String(i),
    rotulo: cabecalho[i]?.trim()
      ? `${i + 1} · ${cabecalho[i].trim()}`
      : `Coluna ${i + 1}`,
  }));

  return (
    <DialogoMestre
      titulo="Importar Plano de Contas do Primavera"
      aoFechar={aoFechar}
      aoSubmeter={(e) => {
        e.preventDefault();
        importar();
      }}
      aGravar={aImportar}
      erro={erro}
      rotuloGravar="Importar"
    >
      <p className="text-[13px] leading-relaxed text-texto-suave sm:col-span-2">
        No Primavera:{" "}
        <b>Contabilidade → Tabelas → Plano de Contas → Exportar</b>. Escolha
        aqui o ficheiro CSV.
      </p>

      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border-2 border-dashed border-borda px-4 py-6 text-center text-sm hover:border-acento sm:col-span-2">
        <input
          type="file"
          accept=".csv,.txt"
          onChange={aoEscolherFicheiro}
          className="hidden"
        />
        <span className="font-semibold">
          {nomeFicheiro || "Clique para escolher o ficheiro (.csv)…"}
        </span>
        {linhas.length > 0 && (
          <span className="text-[12.5px] text-texto-suave">
            {linhas.length} linha(s) lidas
          </span>
        )}
      </label>

      {linhas.length > 0 && (
        <>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            <Selector
              rotulo="Coluna do Código"
              valor={colCodigo}
              aoMudar={setColCodigo}
              opcoes={opcoesColuna}
            />
            <Selector
              rotulo="Coluna da Descrição"
              valor={colNome}
              aoMudar={setColNome}
              opcoes={opcoesColuna}
            />
            <Selector
              rotulo="1.ª linha é cabeçalho?"
              valor={temCabecalho}
              aoMudar={setTemCabecalho}
              opcoes={[
                { valor: "1", rotulo: "Sim" },
                { valor: "0", rotulo: "Não" },
              ]}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-marca)]"
            />
            <span>
              Substituir todo o plano actual (senão, funde e actualiza).
              {substituir && (
                <b className="block text-perigo">
                  As contas que não vierem no ficheiro são removidas — as que
                  tiverem movimentos são recusadas pelo servidor.
                </b>
              )}
            </span>
          </label>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <b className="text-[13px]">Pré-visualização</b>
              <Selo cor="#3d7fe0">{paraImportar.length} conta(s)</Selo>
            </div>
            <div className="max-h-[14rem] overflow-auto rounded-[10px] border border-borda">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-superficie-2">
                  <tr>
                    <th className="border-b border-borda px-3 py-1.5 text-left text-[11.5px] font-bold uppercase text-texto-suave">
                      Código
                    </th>
                    <th className="border-b border-borda px-3 py-1.5 text-left text-[11.5px] font-bold uppercase text-texto-suave">
                      Designação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paraImportar.slice(0, 100).map((l, i) => (
                    <tr
                      // O código pode repetir-se num ficheiro mal exportado; a
                      // posição é o que distingue as linhas aqui.
                      key={`${l.codigo}-${i}`}
                      className="border-b border-borda last:border-b-0"
                    >
                      <td className="tabular px-3 py-1">{l.codigo}</td>
                      <td className="px-3 py-1">{l.nome || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paraImportar.length > 100 && (
              <p className="mt-1 text-[12px] text-texto-suave">
                A mostrar as primeiras 100 de {paraImportar.length}.
              </p>
            )}
          </div>
        </>
      )}
    </DialogoMestre>
  );
}

/** O Primavera exporta com `;` em português e `,` em inglês. */
function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? "";
  const pontoEVirgula = (primeira.match(/;/g) ?? []).length;
  const virgula = (primeira.match(/,/g) ?? []).length;
  const tab = (primeira.match(/\t/g) ?? []).length;
  if (tab > pontoEVirgula && tab > virgula) return "\t";
  return pontoEVirgula >= virgula ? ";" : ",";
}

/** Partir uma linha respeitando aspas — um nome de conta pode ter o separador. */
function partir(linha: string, separador: string): string[] {
  const saida: string[] = [];
  let actual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreAspas = !entreAspas;
    } else if (c === separador && !entreAspas) {
      saida.push(actual);
      actual = "";
    } else actual += c;
  }
  saida.push(actual);
  return saida;
}
