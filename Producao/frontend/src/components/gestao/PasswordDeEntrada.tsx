"use client";

import { Check, Copy, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";

import { Alerta, Botao } from "@/components/ui";

/* ---------------------------------------------------------------------------
   A palavra-passe de entrada, mostrada uma única vez.

   Quem pede acesso pelo ecrã público não escolhe palavra-passe: não faria
   sentido escolher uma credencial para uma conta que a empresa ainda não
   aceitou. Ela nasce no momento em que o pedido é aceite, e este é o único
   sítio onde aparece.

   Vem em grupos e sem caracteres que se confundam — sem `0/O`, sem `1/I/l` —
   porque vai ser transmitida a alguém, muitas vezes lida em voz alta.
--------------------------------------------------------------------------- */

export function PasswordDeEntrada({
  nome,
  password,
  aoFechar,
}: {
  nome: string;
  password: string;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-bold">
              <Check size={17} className="text-sucesso" aria-hidden />
              Pedido aceite
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="text-sm leading-relaxed text-texto-suave">
              <b className="text-texto">{nome}</b> já pode entrar. Entregue-lhe
              esta palavra-passe — é com ela que faz o primeiro acesso.
            </p>

            <div className="rounded-xl border-2 border-dashed border-marca bg-fundo p-5 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
                Palavra-passe de entrada
              </p>
              <p className="tabular mt-1.5 select-all text-[26px] font-black leading-none tracking-[2px] text-marca">
                {password}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(password);
                  setCopiado(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-borda px-3 py-1.5 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
              >
                <Copy size={13} />
                {copiado ? "Copiada" : "Copiar"}
              </button>
            </div>

            <Alerta tipo="aviso">
              <b>Só aparece agora.</b> Se fechar sem a copiar, defina outra pelo
              botão da chave na linha desta pessoa. Ela é avisada para a trocar
              no primeiro acesso.
            </Alerta>

            <Botao variante="primario" bloco onClick={aoFechar}>
              Já entreguei
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
