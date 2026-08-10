"use client";

import { X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useRef } from "react";

import { CampoConta } from "@/components/contabilidade/CampoConta";
import { big, formataMoeda, soma, subtrai } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import type { Linha } from "./tipos";

/** As opções do Piloto, tal e qual. */
const TIPOS_ENTIDADE = ["", "Cliente", "Fornecedor", "Estado", "Outro"];
const MOEDAS = ["AKZ", "USD", "EUR"];

/**
 * A grelha do separador Geral — as onze colunas do Piloto.
 *
 * ASPECTO DE FOLHA DE CÁLCULO. Os campos não têm moldura própria: a célula é
 * que os delimita, com linhas ténues, e a célula focada acende. Onze molduras
 * por linha, vezes cinco linhas, era ruído a competir com os números — que são
 * a única coisa que interessa ler aqui. Só a validação da conta pinta.
 *
 * DUAS INTERACÇÕES que fazem a diferença a quem lança o dia inteiro, e que se
 * perdem facilmente numa migração:
 *
 *   **Enter avança de célula.** Não submete nada — passa ao campo seguinte, e
 *   ao chegar ao fim da última linha cria uma linha nova e põe o cursor na
 *   conta. Lança-se um movimento inteiro sem tocar no rato.
 *
 *   **Auto-equilíbrio.** Ao chegar com Enter a uma célula de valor VAZIA, numa
 *   linha que já tem conta, o que falta para o débito igualar o crédito é
 *   preenchido sozinho. É o que transforma «1.075.590 no débito, agora somar de
 *   cabeça para o crédito» em «Enter».
 *
 * Débito e crédito são exclusivos na mesma linha: preencher um limpa o outro.
 */

/** Traço entre células — presente, mas sem gritar. */
const CELULA = "border-b border-r border-borda/40 p-0 align-top";
const CAMPO =
  "w-full border-0 bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-marca/8 focus:outline-2 focus:-outline-offset-2 focus:outline-marca";

export function GrelhaGeral({
  linhas,
  aoAlterar,
  aoRemover,
  aoAdicionar,
  aoPedirCriacaoDeConta,
  soLeitura,
}: {
  linhas: Linha[];
  aoAlterar: (i: number, campo: keyof Linha, valor: string) => void;
  aoRemover: (i: number) => void;
  aoAdicionar: () => void;
  aoPedirCriacaoDeConta: (codigo: string) => void;
  soLeitura?: boolean;
}) {
  const corpo = useRef<HTMLTableSectionElement>(null);

  const totalDebito = soma(...linhas.map((l) => l.debito));
  const totalCredito = soma(...linhas.map((l) => l.credito));
  const diferenca = subtrai(totalDebito, totalCredito);

  /** Enter: célula seguinte, com auto-equilíbrio pelo caminho. */
  function aoTeclar(e: ReactKeyboardEvent<HTMLTableSectionElement>) {
    if (e.key !== "Enter") return;
    const alvo = e.target as HTMLElement;
    if (alvo.tagName !== "INPUT") return;
    e.preventDefault();

    const campos = Array.from(
      corpo.current?.querySelectorAll<HTMLInputElement>("input") ?? [],
    );
    const i = campos.indexOf(alvo as HTMLInputElement);
    if (i < 0) return;

    const proximo = campos[i + 1];
    if (!proximo) {
      // Fim da grelha: quem chega aqui quer continuar a lançar. A linha nova
      // recebe o foco no efeito que se segue à renderização.
      aoAdicionar();
      return;
    }
    autoEquilibrar(proximo);
    proximo.focus();
    proximo.select?.();
  }

  /**
   * Preenche a célula com o que falta para equilibrar — mas só se estiver
   * vazia, se for de valor, e se a linha já tiver conta. Sem estas três
   * condições estaria a escrever por cima do que a pessoa acabou de digitar.
   */
  function autoEquilibrar(celula: HTMLInputElement) {
    if (celula.value) return;
    const papel = celula.dataset.papel;
    if (papel !== "debito" && papel !== "credito") return;
    const i = Number(celula.dataset.linha);
    if (Number.isNaN(i) || !linhas[i]?.conta_codigo) return;

    if (papel === "credito" && diferenca.gt(0))
      aoAlterar(i, "credito", diferenca.toString());
    else if (papel === "debito" && diferenca.lt(0))
      aoAlterar(i, "debito", diferenca.times(-1).toString());
  }

  const cabecalhos: [string, boolean][] = [
    ["Conta", false],
    ["Débito", true],
    ["Crédito", true],
    ["IVA %", true],
    ["% n/Ded.", true],
    ["IVA Autoliq.", true],
    ["T. Entidade", false],
    ["Entidade", false],
    ["Moeda", false],
    ["Câmbio", true],
    ["Descrição", false],
  ];

  return (
    <div className="min-w-0 overflow-x-auto rounded-[10px] border border-borda">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-superficie-2">
            {cabecalhos.map(([h, num]) => (
              <th
                key={h}
                className={cn(
                  "whitespace-nowrap border-b border-r border-borda/40 px-2 py-2 text-left text-[11.5px] font-bold uppercase tracking-[0.4px] text-texto-suave",
                  num && "text-right",
                )}
              >
                {h}
              </th>
            ))}
            <th className="w-[36px] border-b border-borda/40" />
          </tr>
        </thead>

        {/* O ouvinte fica no corpo e não em cada campo: uma linha nova passa a
            ter o comportamento sem precisar de o voltar a ligar. */}
        <tbody ref={corpo} onKeyDown={aoTeclar}>
          {linhas.map((l, i) => (
            <tr key={l.id} className="hover:bg-superficie-2/40">
              <td className={cn(CELULA, "w-[13.5rem]")}>
                <CampoConta
                  valor={l.conta_codigo}
                  aoMudar={(v) => aoAlterar(i, "conta_codigo", v)}
                  aoPedirCriacao={aoPedirCriacaoDeConta}
                  disabled={soLeitura}
                  semBotao
                  emGrelha
                />
              </td>

              <CelulaValor
                valor={l.debito}
                papel="debito"
                linha={i}
                aoMudar={(v) => aoAlterar(i, "debito", v)}
                disabled={soLeitura}
                largura="7rem"
              />
              <CelulaValor
                valor={l.credito}
                papel="credito"
                linha={i}
                aoMudar={(v) => aoAlterar(i, "credito", v)}
                disabled={soLeitura}
                largura="7rem"
              />
              <CelulaValor
                valor={l.iva_perc}
                linha={i}
                passo="1"
                largura="4.5rem"
                aoMudar={(v) => aoAlterar(i, "iva_perc", v)}
                disabled={soLeitura}
              />
              <CelulaValor
                valor={l.perc_nao_ded}
                linha={i}
                passo="1"
                largura="4.5rem"
                titulo="% não dedutível"
                aoMudar={(v) => aoAlterar(i, "perc_nao_ded", v)}
                disabled={soLeitura}
              />
              <CelulaValor
                valor={l.iva_autoliq}
                linha={i}
                largura="6rem"
                titulo="IVA autoliquidação"
                aoMudar={(v) => aoAlterar(i, "iva_autoliq", v)}
                disabled={soLeitura}
              />

              <td className={cn(CELULA, "w-[7.5rem]")}>
                <select
                  value={l.tipo_entidade}
                  onChange={(e) =>
                    aoAlterar(i, "tipo_entidade", e.target.value)
                  }
                  disabled={soLeitura}
                  aria-label="Tipo de entidade"
                  className={CAMPO}
                >
                  {TIPOS_ENTIDADE.map((o) => (
                    <option key={o || "vazio"} value={o}>
                      {o || "—"}
                    </option>
                  ))}
                </select>
              </td>

              <td className={cn(CELULA, "w-[9rem]")}>
                <input
                  value={l.entidade}
                  onChange={(e) => aoAlterar(i, "entidade", e.target.value)}
                  placeholder="Entidade"
                  disabled={soLeitura}
                  className={CAMPO}
                />
              </td>

              <td className={cn(CELULA, "w-[5.5rem]")}>
                <select
                  value={l.moeda}
                  onChange={(e) => aoAlterar(i, "moeda", e.target.value)}
                  disabled={soLeitura}
                  aria-label="Moeda"
                  className={CAMPO}
                >
                  {MOEDAS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </td>

              <CelulaValor
                valor={l.cambio}
                linha={i}
                passo="0.0001"
                largura="5.5rem"
                titulo="Câmbio para AKZ"
                aoMudar={(v) => aoAlterar(i, "cambio", v)}
                disabled={soLeitura}
              />

              <td className={cn(CELULA, "min-w-[11rem]")}>
                <input
                  value={l.descricao}
                  onChange={(e) => aoAlterar(i, "descricao", e.target.value)}
                  placeholder="Descrição"
                  disabled={soLeitura}
                  className={CAMPO}
                />
              </td>

              <td className="border-b border-borda/40 p-1 text-center align-top">
                {!soLeitura && (
                  <button
                    type="button"
                    onClick={() => aoRemover(i)}
                    title="Remover linha"
                    aria-label={`Remover linha ${i + 1}`}
                    className="flex size-7 items-center justify-center rounded-md text-texto-suave hover:bg-perigo/10 hover:text-perigo"
                  >
                    <X size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="border-t border-borda bg-superficie-2">
            <td className="px-2 py-2 text-right text-[13px] font-bold">
              Totais
            </td>
            <td className="tabular px-2 py-2 text-right font-bold">
              {formataMoeda(totalDebito, "")}
            </td>
            <td className="tabular px-2 py-2 text-right font-bold">
              {formataMoeda(totalCredito, "")}
            </td>
            <td colSpan={9} />
          </tr>
          <tr className="bg-superficie-2">
            <td className="px-2 pb-2 text-right text-[13px]">Diferença</td>
            <td
              colSpan={2}
              className={cn(
                "tabular px-2 pb-2 text-right font-bold",
                diferenca.eq(0) ? "text-sucesso" : "text-perigo",
              )}
            >
              {formataMoeda(diferenca, "")}
            </td>
            <td colSpan={9} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CelulaValor({
  valor,
  papel,
  linha,
  aoMudar,
  passo = "0.01",
  largura = "7rem",
  titulo,
  disabled,
}: {
  valor: string;
  papel?: "debito" | "credito";
  linha: number;
  aoMudar: (v: string) => void;
  passo?: string;
  largura?: string;
  titulo?: string;
  disabled?: boolean;
}) {
  return (
    <td className={CELULA} style={{ width: largura }}>
      <input
        type="number"
        step={passo}
        min="0"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        title={titulo}
        disabled={disabled}
        // Lidos pelo auto-equilíbrio, que trabalha sobre o elemento focado e
        // precisa de saber a que linha e a que coluna pertence.
        data-papel={papel}
        data-linha={linha}
        className={cn(CAMPO, "tabular text-right")}
      />
    </td>
  );
}

/** Uma linha conta para o lançamento se tem conta e algum valor. */
export function linhaPreenchida(l: Linha): boolean {
  return (
    Boolean(l.conta_codigo) && (big(l.debito).gt(0) || big(l.credito).gt(0))
  );
}
