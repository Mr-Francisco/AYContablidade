"use client";

import { Ban, FileWarning, Info, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { api, buscador, ErroApi } from "@/lib/api";

/* ---------------------------------------------------------------------------
   Anular um documento emitido.

   A REGRA: no mesmo período anula-se e pronto; em período diferente é com nota
   de crédito, porque o IVA desse período pode já ter sido apurado e entregue.
   Está no servidor, em `services/comercial_anulacao.py` — este ecrã não a
   repete, PERGUNTA-LHE.

   É por isso que há uma rota `pode-anular`: quem abre este diálogo tem de
   saber o que vai acontecer ANTES de escrever o motivo e carregar no botão.
   Deixar a pessoa decidir e só depois mostrar «não pode» é fazê-la trabalhar
   para nada.

   O NÚMERO NÃO DESAPARECE, e o diálogo di-lo. Um documento emitido não se
   apaga: o número vem de uma série e a lei exige numeração sequencial sem
   falhas. Anular deixa o número onde está e põe o documento a valer zero.
--------------------------------------------------------------------------- */

interface PodeAnular {
  pode: boolean;
  motivo: string;
  exige_nota_credito: boolean;
}

export function AnularDocumento({
  id,
  numero,
  aoFechar,
  aoAnular,
}: {
  id: string;
  numero: string;
  aoFechar: () => void;
  aoAnular: () => void;
}) {
  const { data: veredicto, isLoading } = useSWR<PodeAnular>(
    `/api/comercial/vendas/${id}/pode-anular`,
    buscador,
    { revalidateOnFocus: false },
  );

  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aAnular, setAAnular] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAAnular(true);
    try {
      await api.post(`/api/comercial/vendas/${id}/anular`, {
        motivo: motivo.trim() || null,
      });
      aoAnular();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível anular o documento.",
      );
    } finally {
      setAAnular(false);
    }
  }

  // A JANELA NÃO SE FECHA POR ACIDENTE: carregar fora deixou de a fechar,
  // e o `Esc`, o X e o «Cancelar» perguntam quando já lá há dados por
  // gravar. Ver `components/ui/GuardaDeSaida.tsx`.
  const guarda = useGuardaDeSaida({ aoFechar });

  return (
    <Dialog.Root open onOpenChange={(a) => !a && guarda.tentarFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          {...guarda.propsDoConteudo}
          className="fixed left-1/2 top-1/2 z-50 w-[min(540px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-bold">
              <Ban size={17} className="text-perigo" aria-hidden />
              Anular {numero}
            </Dialog.Title>
            <button
              onClick={guarda.tentarFechar}
              type="button"
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
            >
              <X size={15} />
            </button>
          </div>

          <form
            {...guarda.propsDoFormulario}
            onSubmit={submeter}
            className="flex flex-col gap-4 px-5 py-4"
          >
            {isLoading || !veredicto ? (
              <p className="text-sm text-texto-suave">A verificar o período…</p>
            ) : veredicto.exige_nota_credito ? (
              <ExigeNotaDeCredito motivo={veredicto.motivo} />
            ) : (
              <>
                <Alerta tipo="aviso">
                  <span className="flex gap-2">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      O documento passa a valer <b>zero</b> e o movimento que
                      gerou na contabilidade é desfeito com um lançamento de
                      sentido contrário.
                      <br />
                      <b>O número {numero} não desaparece</b> — fica na
                      sequência entregue à AGT, marcado como anulado. É o que
                      prova que não foi usado para outra coisa.
                    </span>
                  </span>
                </Alerta>

                <Campo
                  rotulo="Motivo"
                  dica="Fica guardado no documento. Daqui a meses, é o que explica porque é que este número vale zero."
                >
                  <Entrada
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: valor errado, cliente trocado"
                    autoFocus
                  />
                </Campo>
              </>
            )}

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="flex justify-end gap-2 pt-1">
              <Botao
                type="button"
                variante="contorno"
                onClick={guarda.tentarFechar}
              >
                {veredicto?.exige_nota_credito ? "Fechar" : "Cancelar"}
              </Botao>
              {!veredicto?.exige_nota_credito && (
                <Botao
                  type="submit"
                  variante="perigo"
                  disabled={aAnular || isLoading || !veredicto?.pode}
                  motivoBloqueio={
                    aAnular
                      ? "A anular — aguarde."
                      : isLoading
                        ? "A verificar o período…"
                        : undefined
                  }
                >
                  {aAnular ? "A anular…" : "Anular documento"}
                </Botao>
              )}
            </div>
          </form>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** O caso em que não se anula: o servidor explica porquê, e nós dizemos o que
 *  fazer a seguir. A mensagem vem de lá — repeti-la aqui era arriscar que as
 *  duas divergissem. */
function ExigeNotaDeCredito({ motivo }: { motivo: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Alerta tipo="aviso">
        <span className="flex gap-2">
          <FileWarning size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{motivo}</span>
        </span>
      </Alerta>

      <div className="rounded-xl border border-borda bg-superficie-2/60 p-4">
        <h3 className="text-[13.5px] font-bold">O que fazer</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-texto-suave">
          Emita uma <b>nota de crédito</b> em Comercial → Vendas, com o tipo{" "}
          <b>NC</b> e a referência a este documento. A nota de crédito anula o
          efeito da factura no período em que for emitida, sem mexer no período
          que já foi declarado.
        </p>
      </div>
    </div>
  );
}
