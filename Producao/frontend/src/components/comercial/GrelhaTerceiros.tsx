"use client";

import { Selo } from "@/components/ui";
import { AccoesDaLinha } from "@/components/ui/CrudMestre";
import { type Coluna, Grelha } from "@/components/ui/Grelha";
import type { Terceiro } from "@/types";

/* ---------------------------------------------------------------------------
   A grelha de terceiros — clientes e fornecedores.

   PORQUE É UMA SÓ: as duas páginas eram o mesmo ficheiro de 210 linhas com os
   nomes trocados. Mantidas separadas, qualquer melhoria teria de ser feita
   duas vezes e mais cedo ou mais tarde só era feita numa. É o mesmo motivo
   por que a ficha (`FichaTerceiro`) já é partilhada.

   O que muda entre as duas é a palavra que se lê e para onde vão as acções.
   Isso são propriedades, não um ficheiro novo.
--------------------------------------------------------------------------- */

export function GrelhaTerceiros({
  registos,
  singular,
  semConta,
  accoes,
  vazio,
}: {
  registos: Terceiro[];
  /** «cliente» ou «fornecedor», em minúsculas — entra nos textos das acções. */
  singular: string;
  /** Quando a conta corrente ainda não existe: nos clientes nasce na primeira
   *  facturação, nos fornecedores na primeira recepção. São momentos
   *  diferentes e o texto tem de o dizer. */
  semConta: string;
  /** Ausente para quem não pode gerir: a coluna nem chega a aparecer. */
  accoes?: {
    editar: (t: Terceiro) => void;
    apagar: (t: Terceiro) => void;
    ocupado: boolean;
  };
  vazio: string;
}) {
  const colunas: Coluna<Terceiro>[] = [
    {
      chave: "numero",
      titulo: "Nº",
      // Texto, não número: o `localeCompare` com `numeric` já põe o 10 depois
      // do 9, e trata um número com zeros à esquerda sem os comer.
      valor: (t) => t.numero,
      largura: "100px",
      celula: (t) => <span className="tabular font-bold">{t.numero}</span>,
    },
    {
      chave: "nome",
      titulo: "Nome",
      valor: (t) => t.nome,
      celula: (t) => (
        <span className="block max-w-[280px] truncate font-semibold">
          {t.nome}
        </span>
      ),
    },
    {
      chave: "nif",
      titulo: "NIF",
      valor: (t) => t.nif ?? "",
      largura: "140px",
      celula: (t) => <span className="tabular">{t.nif || "—"}</span>,
    },
    {
      chave: "localidade",
      titulo: "Localidade",
      valor: (t) => t.localidade ?? "",
      celula: (t) => t.localidade || "—",
    },
    {
      chave: "telefone",
      titulo: "Telefone",
      valor: (t) => t.telefone ?? "",
      largura: "140px",
      celula: (t) => <span className="tabular">{t.telefone || "—"}</span>,
    },
    {
      chave: "conta",
      titulo: "Conta corrente",
      valor: (t) => t.conta ?? "",
      largura: "150px",
      celula: (t) =>
        t.conta ? (
          <a
            href={`/contabilidade/extrato?conta=${t.conta}`}
            className="tabular font-semibold text-marca hover:underline"
            // A linha inteira abre a ficha com duplo clique. Sem isto, um
            // duplo clique em cima do código da conta fazia as duas coisas.
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {t.conta}
          </a>
        ) : (
          <span className="text-texto-suave">{semConta}</span>
        ),
    },
    {
      chave: "estado",
      titulo: "Estado",
      // Filtra-se por «activo» — o que se lê na coluna — e não pelo valor
      // guardado, que é parecido mas não está à vista.
      valor: (t) => (t.estado === "activo" ? "Activo" : "Inactivo"),
      largura: "110px",
      celula: (t) => (
        <Selo cor={t.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}>
          {t.estado === "activo" ? "Activo" : "Inactivo"}
        </Selo>
      ),
    },
  ];

  if (accoes) {
    // Sem `valor`: uma coluna de acções não filtra nem ordena.
    colunas.push({
      chave: "accoes",
      titulo: " ",
      largura: "110px",
      celula: (t) => (
        <AccoesDaLinha
          nome={`${singular} ${t.numero}`}
          aoEditar={() => accoes.editar(t)}
          aoApagar={() => accoes.apagar(t)}
          desactivado={accoes.ocupado}
        />
      ),
    });
  }

  return (
    <Grelha
      linhas={registos}
      colunas={colunas}
      chaveDaLinha={(t) => t.id}
      aoAbrir={accoes ? (t) => accoes.editar(t) : undefined}
      vazio={vazio}
      altura={520}
    />
  );
}
