"use client";

import {
  type Categoria,
  CriarTerceiroRapido,
  LADO_CLIENTE,
  type TerceiroCriado,
} from "@/components/comercial/CriarTerceiroRapido";

/* ---------------------------------------------------------------------------
   Criar um cliente sem sair da facturação.

   O CONTEÚDO MUDOU DE CASA. Quando a mesma janela passou a servir também os
   fornecedores, ficar com duas cópias garantia que a segunda ficava para trás
   à primeira melhoria — é a mesma razão por que a ficha já era partilhada.
   O componente vive agora em `CriarTerceiroRapido`, parametrizado pelo lado.

   Este ficheiro fica porque é assim que a facturação lhe chama, e trocar o
   nome em todo o lado não acrescentava nada.
--------------------------------------------------------------------------- */

export type { Categoria };

/** O que a facturação recebe de volta. `nacional` mantém-se para quem já o lê. */
export interface ClienteCriado extends TerceiroCriado {
  nacional: boolean;
}

export function CriarClienteRapido({
  nomeInicial = "",
  aoFechar,
  aoCriar,
}: {
  nomeInicial?: string;
  aoFechar: () => void;
  aoCriar: (c: ClienteCriado) => void;
}) {
  return (
    <CriarTerceiroRapido
      lado={LADO_CLIENTE}
      nomeInicial={nomeInicial}
      aoFechar={aoFechar}
      aoCriar={(t) =>
        aoCriar({ ...t, nacional: t.categoria_conta !== "estrangeiro" })
      }
    />
  );
}
