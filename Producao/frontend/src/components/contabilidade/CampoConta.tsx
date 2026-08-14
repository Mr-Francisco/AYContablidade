"use client";

import { Check, X } from "lucide-react";

import { useId, useMemo } from "react";

import { useContas } from "@/lib/hooks";
import { ehMovimento } from "@/lib/plano";
import { cn } from "@/lib/utils";

import { useSelectorDeConta } from "./SelectorDeConta";

/**
 * Campo de conta — escreve-se o código, ou procura-se com F4.
 *
 * Substitui a lista de opções que aqui estava. Uma caixa com mil e seiscentas
 * entradas obriga a rolar para chegar ao que se sabe de cor, e quem lança todos
 * os dias sabe de cor: escreve `4311` e segue. Quem não sabe carrega em F4 e
 * percorre a árvore. É o que o Piloto faz, e é a interacção mais repetida da
 * aplicação.
 *
 * A VALIDAÇÃO É IMEDIATA e fica à vista por baixo do campo: o nome da conta a
 * verde quando existe e é de movimento, um aviso quando é integradora, e
 * «conta inexistente» a vermelho quando não há. Sem isto, um código mal
 * escrito só se descobria ao gravar, com o formulário todo preenchido.
 */
export function CampoConta({
  valor,
  aoMudar,
  aoPedirCriacao,
  placeholder = "Conta (F4)",
  className,
  disabled,
  semBotao,
  emGrelha,
}: {
  valor: string;
  aoMudar: (codigo: string) => void;
  /** Chamado quando o código escrito não existe e há como o criar. */
  aoPedirCriacao?: (codigo: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Esconde o botão «F4». Na grelha do lançamento não há espaço para ele e o
   *  Piloto também não o mostra ali — a tecla e o duplo clique bastam. */
  semBotao?: boolean;
  /** Aspecto de célula de folha de cálculo: sem moldura, a preencher a célula.
   *  Só a validação muda de cor — a moldura permanente é ruído numa grelha com
   *  onze colunas. */
  emGrelha?: boolean;
}) {
  const { contas } = useContas();
  const idLista = useId();
  const { props, dialogo, abrir } = useSelectorDeConta(aoMudar);

  const estado = useMemo(() => {
    const codigo = valor.trim();
    if (!codigo) return null;
    const conta = contas.find((c) => c.codigo === codigo);
    if (!conta) return { tipo: "inexistente" as const };
    if (!ehMovimento(conta, contas))
      return { tipo: "integradora" as const, nome: conta.nome };
    return { tipo: "ok" as const, nome: conta.nome };
  }, [valor, contas]);

  // Só as de movimento no datalist: são as únicas que o servidor aceita, e
  // sugerir uma integradora seria sugerir um erro.
  const sugestoes = useMemo(
    () => contas.filter((c) => c.ativa && ehMovimento(c, contas)),
    [contas],
  );

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1">
        <input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          list={idLista}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "tabular min-w-0 flex-1 text-sm outline-none",
            emGrelha
              ? "border-0 bg-transparent px-2 py-1.5 focus:bg-marca/8 focus:outline-2 focus:-outline-offset-2 focus:outline-marca"
              : cn(
                  "rounded-lg border bg-fundo px-2.5 py-2 focus:border-marca",
                  estado?.tipo === "inexistente"
                    ? "border-perigo"
                    : estado?.tipo === "integradora"
                      ? "border-[var(--color-aviso)]"
                      : "border-borda",
                ),
          )}
          {...props}
        />
        {!semBotao && (
          <button
            type="button"
            onClick={abrir}
            disabled={disabled}
            title="Procurar no plano de contas (F4)"
            className="shrink-0 rounded-lg border border-borda px-2 py-2 text-[11px] font-bold text-texto-suave hover:border-marca hover:text-marca"
          >
            F4
          </button>
        )}
      </div>

      {estado && (
        <p
          className={cn(
            "truncate text-[11.5px] leading-tight",
            emGrelha ? "px-2 pb-0.5" : "mt-1",
          )}
        >
          {estado.tipo === "ok" && (
            <span className="text-sucesso">
              <Check size={12} className="inline" /> {estado.nome}
            </span>
          )}
          {estado.tipo === "integradora" && (
            <span className="text-[var(--color-aviso)]">
              {estado.nome} — integradora, não recebe lançamentos
            </span>
          )}
          {estado.tipo === "inexistente" && (
            <span className="text-perigo">
              <X size={12} className="inline" /> conta inexistente
              {aoPedirCriacao && (
                <button
                  type="button"
                  onClick={() => aoPedirCriacao(valor.trim())}
                  className="ml-2 font-semibold text-marca hover:underline"
                >
                  criar
                </button>
              )}
            </span>
          )}
        </p>
      )}

      <datalist id={idLista}>
        {sugestoes.map((c) => (
          <option key={c.id} value={c.codigo}>
            {c.nome}
          </option>
        ))}
      </datalist>

      {dialogo}
    </div>
  );
}
