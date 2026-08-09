"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import type { FormEvent, ReactNode } from "react";

import { Alerta, Botao } from "@/components/ui";

/**
 * Peças partilhadas pelas tabelas mestras (diários, documentos, centros,
 * plano de contas).
 *
 * Existem porque são quatro páginas com a mesma forma: uma tabela, dois botões
 * por linha, um formulário em diálogo e uma confirmação antes de apagar.
 * Escrever isso quatro vezes garantia que as quatro divergiam à primeira
 * correcção.
 *
 * NÃO SUBSTITUEM nada do que já existia — as páginas que já tinham o seu
 * próprio formulário ficam como estão.
 */

/** Os dois botões de fim de linha. */
export function AccoesDaLinha({
  nome,
  aoEditar,
  aoApagar,
  desactivado,
  motivoNaoApagar,
}: {
  /** Aparece nos rótulos de acessibilidade: «Alterar Diário de Caixa». */
  nome: string;
  aoEditar: () => void;
  aoApagar?: () => void;
  desactivado?: boolean;
  /** Quando presente, o botão de apagar fica inactivo e explica porquê. */
  motivoNaoApagar?: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        aria-label={`Alterar ${nome}`}
        title="Alterar"
        onClick={aoEditar}
        disabled={desactivado}
        className="flex size-8 items-center justify-center rounded-lg border border-borda transition-colors hover:border-marca hover:text-marca disabled:opacity-40"
      >
        <Pencil size={13} />
      </button>
      {aoApagar && (
        <button
          type="button"
          aria-label={`Eliminar ${nome}`}
          title={motivoNaoApagar ?? "Eliminar"}
          onClick={aoApagar}
          disabled={desactivado || Boolean(motivoNaoApagar)}
          className="flex size-8 items-center justify-center rounded-lg border border-borda transition-colors hover:border-perigo hover:text-perigo disabled:opacity-40"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * Confirmação antes de uma acção que custa a desfazer.
 *
 * A caixa é a mesma para todas — eliminar um mestre, fechar um período, fechar
 * um exercício. Só mudam as palavras dos botões: quem já reconheceu o diálogo
 * numa página reconhece-o na seguinte, e uma acção séria nunca acontece a um
 * clique só.
 */
export function Confirmar({
  aberto,
  aoMudar,
  titulo,
  children,
  aoConfirmar,
  ocupado,
  rotuloConfirmar,
  rotuloOcupado,
  rotuloCancelar = "Manter",
  variante = "perigo",
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  children: ReactNode;
  aoConfirmar: () => void;
  ocupado?: boolean;
  rotuloConfirmar: string;
  rotuloOcupado: string;
  rotuloCancelar?: string;
  variante?: "perigo" | "primario";
}) {
  return (
    <AlertDialog.Root open={aberto} onOpenChange={aoMudar}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
          <AlertDialog.Title className="text-lg font-semibold">
            {titulo}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-texto-suave">
              {children}
            </div>
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Botao variante="neutro">{rotuloCancelar}</Botao>
            </AlertDialog.Cancel>
            <Botao variante={variante} onClick={aoConfirmar} disabled={ocupado}>
              {ocupado ? rotuloOcupado : rotuloConfirmar}
            </Botao>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Confirmação antes de apagar. Nunca se apaga a um clique só. */
export function ConfirmarEliminar(
  props: Omit<
    Parameters<typeof Confirmar>[0],
    "rotuloConfirmar" | "rotuloOcupado" | "variante"
  >,
) {
  return (
    <Confirmar
      {...props}
      rotuloConfirmar="Eliminar"
      rotuloOcupado="A eliminar…"
      variante="perigo"
    />
  );
}

/** Formulário em diálogo, com o rodapé de acções já feito. */
export function DialogoMestre({
  titulo,
  aoFechar,
  aoSubmeter,
  aGravar,
  erro,
  aviso,
  children,
  rotuloGravar = "Gravar",
}: {
  titulo: string;
  aoFechar: () => void;
  aoSubmeter: (e: FormEvent) => void;
  aGravar?: boolean;
  erro?: string | null;
  aviso?: ReactNode;
  children: ReactNode;
  rotuloGravar?: string;
}) {
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="truncate text-[15px] font-bold">
              {titulo}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <form
            id="form-mestre"
            onSubmit={aoSubmeter}
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
            {aviso && <div className="mt-3">{aviso}</div>}
            {erro && (
              <div className="mt-3">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Dialog.Close asChild>
              <Botao variante="neutro">Cancelar</Botao>
            </Dialog.Close>
            <Botao
              type="submit"
              form="form-mestre"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? (
                "A gravar…"
              ) : (
                <>
                  <Check size={15} />
                  {rotuloGravar}
                </>
              )}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
