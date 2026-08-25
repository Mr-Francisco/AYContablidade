"use client";

import { Ban, CircleCheckBig, PauseCircle, Users, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import { UtilizadoresDaEmpresa } from "@/components/plataforma/UtilizadoresDaEmpresa";
import { Alerta, Botao, Campo, Entrada, Selo } from "@/components/ui";
import {
  PerguntaDeSaida,
  useGuardaDeSaida,
} from "@/components/ui/GuardaDeSaida";
import { api, ErroApi } from "@/lib/api";
import type { EmpresaPlataforma } from "@/types";

type Estado = "activa" | "suspensa" | "cancelada";

const CORES: Record<string, string> = {
  activa: "#1a9c5f",
  suspensa: "#c77700",
  cancelada: "#c62828",
};

/** O que cada mudança faz, em português claro para quem vai carregar no botão. */
const ACCOES: Record<
  Estado,
  { rotulo: string; titulo: string; aviso: string; perigo: boolean }
> = {
  suspensa: {
    rotulo: "Suspender",
    titulo: "Suspender esta empresa",
    aviso:
      "Ninguém desta empresa consegue entrar, e quem estiver com o sistema aberto é desligado no pedido seguinte. Os dados ficam intactos e reactivar devolve tudo.",
    perigo: true,
  },
  cancelada: {
    rotulo: "Cancelar",
    titulo: "Cancelar esta empresa",
    aviso:
      "Marca o contrato como terminado e corta o acesso a todos. Os dados ficam intactos — usa-se quando a empresa deixa de ser cliente, e é reversível.",
    perigo: true,
  },
  activa: {
    rotulo: "Reactivar",
    titulo: "Reactivar esta empresa",
    aviso:
      "A empresa volta a poder entrar. Os utilizadores terão de iniciar sessão de novo, porque as sessões antigas foram terminadas ao suspender.",
    perigo: false,
  },
};

export function SeloEstado({ estado }: { estado: string }) {
  return <Selo cor={CORES[estado] ?? "#62657a"}>{estado}</Selo>;
}

export function AccoesEstado({
  empresa,
  aoMudar,
}: {
  empresa: EmpresaPlataforma;
  aoMudar: () => void;
}) {
  const [alvo, setAlvo] = useState<Estado | null>(null);
  const [verContas, setVerContas] = useState(false);

  // Só se oferece o que faz sentido a partir do estado actual. Mostrar
  // «Suspender» a uma empresa já suspensa levaria a um 409 do servidor.
  const disponiveis: Estado[] =
    empresa.estado === "activa"
      ? ["suspensa", "cancelada"]
      : empresa.estado === "suspensa"
        ? ["activa", "cancelada"]
        : ["activa"];

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setVerContas(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-1 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
      >
        <Users size={13} />
        Contas
      </button>

      {disponiveis.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => setAlvo(e)}
          className="inline-flex items-center gap-1 rounded-lg border border-borda px-2.5 py-1 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
        >
          {e === "suspensa" ? (
            <PauseCircle size={13} />
          ) : e === "cancelada" ? (
            <Ban size={13} />
          ) : (
            <CircleCheckBig size={13} />
          )}
          {ACCOES[e].rotulo}
        </button>
      ))}

      {alvo && (
        <DialogoEstado
          empresa={empresa}
          alvo={alvo}
          aoFechar={() => setAlvo(null)}
          aoMudar={() => {
            setAlvo(null);
            aoMudar();
          }}
        />
      )}

      {verContas && (
        <UtilizadoresDaEmpresa
          empresa={empresa}
          aoFechar={() => setVerContas(false)}
        />
      )}
    </div>
  );
}

function DialogoEstado({
  empresa,
  alvo,
  aoFechar,
  aoMudar,
}: {
  empresa: EmpresaPlataforma;
  alvo: Estado;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const accao = ACCOES[alvo];

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.patch(`/api/licencas/empresas/${empresa.id}/estado`, {
        estado: alvo,
        motivo: motivo.trim() || null,
      });
      aoMudar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível alterar o estado.",
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
              {accao.titulo}
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
            className="flex flex-col gap-3 p-5"
          >
            <p className="text-sm">
              <b className="tabular">{empresa.codigo}</b> — {empresa.nome}
            </p>

            <Alerta tipo={accao.perigo ? "aviso" : "info"}>
              {accao.aviso}
            </Alerta>

            <Campo
              rotulo="Motivo"
              dica="Fica na auditoria. Daqui a um ano é isto que explica a decisão."
            >
              <Entrada
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                maxLength={300}
                placeholder={
                  alvo === "activa"
                    ? "Pagamento regularizado"
                    : "Falta de pagamento de Julho"
                }
                autoFocus
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="mt-1 flex gap-2">
              <Botao
                type="submit"
                variante={accao.perigo ? "perigo" : "primario"}
                disabled={aGravar}
              >
                {aGravar ? "A aplicar…" : accao.rotulo}
              </Botao>
              <Botao
                type="button"
                variante="neutro"
                onClick={guarda.tentarFechar}
              >
                Cancelar
              </Botao>
            </div>
          </form>

          <PerguntaDeSaida guarda={guarda} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
