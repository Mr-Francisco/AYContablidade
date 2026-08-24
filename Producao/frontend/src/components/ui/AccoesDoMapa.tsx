"use client";

import { Download, Printer } from "lucide-react";

import { Botao } from "@/components/ui";
import { imprimirPagina } from "@/lib/impressao";

/**
 * Imprimir e exportar, para os mapas contabilísticos.
 *
 * Um balancete que não sai do ecrã é um balancete que alguém vai reconstruir
 * noutro lado. O Piloto imprimia dezasseis páginas; aqui só três tinham botão.
 *
 * A impressão usa as regras `@media print` de `globals.css`, que já escondem a
 * moldura da aplicação e forçam preto sobre branco. Este componente é marcado
 * `sem-imprimir` para não sair no papel — imprimir o botão de imprimir seria
 * exactamente o género de pormenor que denuncia uma impressão feita à pressa.
 *
 * GUARDAR EM PDF é a mesma janela: escolhe-se «Guardar como PDF» em vez de uma
 * impressora. O que este componente acrescenta é o NOME do ficheiro — sem ele,
 * o browser grava tudo com o nome da aplicação, e uma pasta com o balancete, o
 * balanço e a demonstração de resultados fica com três ficheiros iguais.
 */
export function AccoesDoMapa({
  aoExportar,
  nomeDoFicheiro,
  desactivado,
  nome,
  deitado,
}: {
  /** Devolve as linhas a exportar. Chamado só quando se carrega no botão —
   *  não vale a pena construir o CSV de um mapa que ninguém vai exportar. */
  aoExportar?: () => { cabecalho: string[]; linhas: (string | number)[][] };
  nomeDoFicheiro?: string;
  desactivado?: boolean;
  /** O nome com que o PDF é gravado. Sem isto, é o TÍTULO DO ECRÃ — e não o
   *  `nomeDoFicheiro`, que é o do CSV e costuma ser mais curto («Balancete»
   *  num mapa que se chama «Balancete Geral»). Passar só quando o título não
   *  chegar: um extracto de uma conta, um mapa de um mês em particular. */
  nome?: string;
  /** Vira a folha. Os mapas largos — balancete, razão, extracto, custos por
   *  centro — não cabem em pé, e é o que o Piloto faz nesses cinco. */
  deitado?: boolean;
}) {
  function exportar() {
    if (!aoExportar) return;
    const { cabecalho, linhas } = aoExportar();
    descarregarCsv(cabecalho, linhas, nomeDoFicheiro ?? "mapa");
  }

  return (
    <div className="sem-imprimir flex items-center gap-2">
      {aoExportar && (
        <Botao
          variante="neutro"
          tamanho="pequeno"
          onClick={exportar}
          disabled={desactivado}
          motivoBloqueio="Não há nada para exportar — o mapa está vazio."
          title="Descarregar em CSV, para abrir numa folha de cálculo"
        >
          <Download size={14} />
          Exportar
        </Botao>
      )}
      <Botao
        variante="neutro"
        tamanho="pequeno"
        onClick={() => imprimirPagina(nome, { deitado })}
        disabled={desactivado}
        motivoBloqueio="Não há nada para imprimir — o mapa está vazio."
        title="Abre a janela de impressão. Escolha «Guardar como PDF» para gravar o ficheiro."
      >
        <Printer size={14} />
        Imprimir / PDF
      </Botao>
    </div>
  );
}

/**
 * Escreve um CSV e descarrega-o.
 *
 * PONTO E VÍRGULA e não vírgula: em português os decimais levam vírgula, e um
 * CSV separado por vírgulas abre no Excel com tudo numa coluna só. O BOM à
 * cabeça é o que faz o Excel reconhecer o UTF-8 — sem ele, «Imobilizações»
 * aparece como «ImobilizaÃ§Ãµes».
 */
export function descarregarCsv(
  cabecalho: string[],
  linhas: (string | number)[][],
  nome: string,
) {
  const escapar = (v: string | number) => {
    const t = String(v ?? "");
    // Aspas duplicadas dentro de um campo entre aspas — a regra do formato.
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  const conteudo = [cabecalho, ...linhas]
    .map((l) => l.map(escapar).join(";"))
    .join("\r\n");

  const ficheiro = new Blob([`﻿${conteudo}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(ficheiro);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
