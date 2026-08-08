"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Alerta } from "@/components/ui";

/** Mostra um segredo que o servidor não volta a devolver.
 *
 * Palavras-passe temporárias e iniciais existem uma única vez: ficam em hash
 * assim que são geradas. Se quem está no ecrã não a copiar agora, o caminho é
 * gerar outra — e é isso que este aviso tem de deixar claro antes de a pessoa
 * fechar a janela.
 */
export function SegredoUmaVez({
  valor,
  titulo,
  nota,
}: {
  valor: string;
  titulo: string;
  nota?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência (http, ou o utilizador negou).
      // O valor está visível e copia-se à mão — não vale um erro.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Alerta tipo="aviso">
        <b>{titulo}</b> Esta é a única vez que aparece — fica guardada cifrada e
        nem nós a conseguimos mostrar outra vez. Se a perder, gere outra.
        {nota && <> {nota}</>}
      </Alerta>

      <button
        type="button"
        onClick={copiar}
        className="flex items-center justify-between gap-3 rounded-xl border border-borda bg-superficie-2 px-4 py-3 text-left transition-colors hover:border-marca"
      >
        <code className="tabular select-all text-[17px] font-bold tracking-wider">
          {valor}
        </code>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-texto-suave">
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          {copiado ? "Copiado" : "Copiar"}
        </span>
      </button>
    </div>
  );
}
