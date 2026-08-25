"use client";

import { BadgeCheck, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";

import { Alerta, Botao, Campo, Entrada, Selo } from "@/components/ui";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { api, ErroApi } from "@/lib/api";
import type { EmpresaPlataforma } from "@/types";

/* ---------------------------------------------------------------------------
   Número de certificação da AGT — atribuído aqui, e só aqui.

   Esteve nas parametrizações de cada empresa, onde qualquer administrador lhe
   podia mexer. Quem certifica é a AGT, e o que ela certifica é o programa: uma
   empresa a escrever ali o número que lhe apetecesse podia declarar uma
   certificação que não tem, ou a de outra empresa — e o ficheiro sairia
   validado à mesma, porque o esquema do SAF-T verifica o formato do número e
   nunca a quem pertence.

   O servidor recusa a alteração venha ela de onde vier. Este ecrã é o único
   caminho, e não é o que impede o resto.
--------------------------------------------------------------------------- */

const FORMATO = /^\d+\/AGT\/\d{4}$/;

export function SeloCertificacao({ numero }: { numero: string | null }) {
  if (!numero) {
    return <span className="text-texto-suave">—</span>;
  }
  return (
    <Selo cor="#1a9c5f">
      <span className="tabular">{numero}</span>
    </Selo>
  );
}

export function BotaoCertificacao({
  empresa,
  aoMudar,
}: {
  empresa: EmpresaPlataforma;
  aoMudar: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-1 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
      >
        <BadgeCheck size={13} />
        Certificação
      </button>

      {aberto && (
        <DialogoCertificacao
          empresa={empresa}
          aoFechar={() => setAberto(false)}
          aoMudar={() => {
            setAberto(false);
            aoMudar();
          }}
        />
      )}
    </>
  );
}

function DialogoCertificacao({
  empresa,
  aoFechar,
  aoMudar,
}: {
  empresa: EmpresaPlataforma;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const actual = empresa.certificacao_agt ?? "";
  const [numero, setNumero] = useState(actual);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const limpo = numero.trim();
  const aRemover = limpo === "";
  const formatoErrado = !aRemover && !FORMATO.test(limpo);
  const semAlteracao = limpo === actual;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.patch(`/api/licencas/empresas/${empresa.id}/certificacao`, {
        numero: limpo,
        motivo: motivo.trim() || null,
      });
      aoMudar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível guardar o número de certificação. Tente de novo.",
      );
    } finally {
      setAGravar(false);
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
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(520px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Certificação da AGT
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
            <p className="text-sm leading-relaxed text-texto-suave">
              Este número identifica a certificação atribuída pela AGT e é
              impresso em cada documento fiscal de{" "}
              <b className="text-texto">{empresa.nome}</b>, além de seguir no
              cabeçalho dos ficheiros SAF-T entregues. A empresa vê o número,
              mas não o pode alterar.
            </p>

            <Campo
              rotulo="Número de certificação"
              dica="No formato 141/AGT/2026. Deixe em branco se esta empresa ainda não tem certificação."
            >
              <Entrada
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="141/AGT/2026"
                className="tabular"
                autoFocus
              />
            </Campo>

            {formatoErrado && (
              <Alerta tipo="aviso">
                O número deve ter o formato 141/AGT/2026. Confirme o número no
                certificado emitido pela AGT.
              </Alerta>
            )}

            {aRemover && actual && (
              <Alerta tipo="aviso">
                Ao remover o número, os ficheiros entregues à AGT passam a
                indicar que o software não está certificado. Faça isto apenas se
                a certificação tiver deixado de ser válida.
              </Alerta>
            )}

            <Campo
              rotulo="Motivo"
              dica="Fica no registo de auditoria. Ajuda a saber mais tarde porque é que o número mudou."
            >
              <Entrada
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: certificado emitido pela AGT em Março"
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="flex justify-end gap-2 pt-1">
              <Botao
                type="button"
                variante="contorno"
                onClick={guarda.tentarFechar}
              >
                Cancelar
              </Botao>
              <Botao
                type="submit"
                variante={aRemover && actual ? "perigo" : "primario"}
                disabled={aGravar || formatoErrado || semAlteracao}
                motivoBloqueio={
                  formatoErrado
                    ? "O número deve ter o formato 141/AGT/2026."
                    : semAlteracao
                      ? "O número é o mesmo que já está guardado."
                      : aGravar
                        ? "A guardar — aguarde."
                        : undefined
                }
              >
                {aGravar
                  ? "A guardar…"
                  : aRemover && actual
                    ? "Remover certificação"
                    : "Guardar"}
              </Botao>
            </div>
          </form>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
