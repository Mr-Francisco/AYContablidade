"use client";

import { useState } from "react";
import useSWR from "swr";

import { SeccaoAssistente } from "@/components/plataforma/definicoes/Assistente";
import {
  type CertificacaoPlataforma,
  SeccaoCertificacao,
} from "@/components/plataforma/definicoes/Certificacao";
import {
  type Categoria,
  NavegacaoDefinicoes,
} from "@/components/plataforma/definicoes/Estrutura";
import { SeccaoRetencao } from "@/components/plataforma/definicoes/Retencao";
import { ACarregar, CabecalhoPagina } from "@/components/ui";
import { buscador } from "@/lib/api";
import type { ConfigIa } from "@/types";

/* ---------------------------------------------------------------------------
   Configurações da plataforma.

   Era uma grelha de cartões todos ao mesmo nível — o interruptor do assistente,
   o tamanho das respostas, os prazos de limpeza e uma caixa de texto — à vista
   ao mesmo tempo e com o mesmo peso. Quem lá chegava para mudar uma coisa
   procurava-a entre as outras, e nada dizia quais eram as decisões
   importantes.

   Passa a ser um índice de categorias e uma secção de cada vez. O índice mostra
   o valor actual de cada categoria, para não ser preciso entrar em todas só
   para saber como está o sistema — e chama a atenção a amarelo quando o estado
   merece, como não haver certificação nenhuma.

   As secções vivem em `components/plataforma/definicoes/`. Acrescentar uma
   categoria é acrescentar uma entrada em `CATEGORIAS` e um componente ao lado
   dos outros; a moldura, a barra de acções e o comportamento de «alterações
   por guardar» vêm de `Estrutura.tsx` e são iguais em todas.
--------------------------------------------------------------------------- */

export default function ConfiguracoesDaPlataforma() {
  const [aberta, setAberta] = useState("certificacao");

  const { data, isLoading, mutate } = useSWR<ConfigIa>(
    "/api/licencas/config-ia",
    buscador,
    { revalidateOnFocus: false },
  );
  const { data: cert, mutate: mutarCert } = useSWR<CertificacaoPlataforma>(
    "/api/licencas/certificacao",
    buscador,
    { revalidateOnFocus: false },
  );

  const categorias: Categoria[] = [
    {
      id: "certificacao",
      icone: "shield",
      rotulo: "Certificação",
      resumo: cert?.numero
        ? cert.numero
        : cert
          ? "Programa não certificado"
          : "—",
      alerta: Boolean(cert) && !cert?.numero,
    },
    {
      id: "assistente",
      icone: "sparkles",
      rotulo: "Assistente",
      resumo: !data
        ? "—"
        : data.ia_ativa
          ? `Disponível · ${data.max_tokens_saida} tokens`
          : "Desligado",
      alerta: Boolean(data) && !data?.ia_ativa,
    },
    {
      id: "retencao",
      icone: "documentos",
      rotulo: "Dados guardados",
      resumo: data
        ? `${data.ia_dias_pacote} e ${data.ia_dias_historico} dias`
        : "—",
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações da plataforma"
        descricao="Definições que valem para todas as empresas."
      />

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <NavegacaoDefinicoes
          categorias={categorias}
          activa={aberta}
          aoEscolher={setAberta}
        />

        <div className="min-w-0">
          {aberta === "certificacao" && (
            <SeccaoCertificacao aoMudar={mutarCert} />
          )}

          {aberta === "assistente" &&
            (isLoading || !data ? (
              <ACarregar />
            ) : (
              <SeccaoAssistente data={data} aoGravar={mutate} />
            ))}

          {aberta === "retencao" &&
            (isLoading || !data ? (
              <ACarregar />
            ) : (
              <SeccaoRetencao data={data} aoGravar={mutate} />
            ))}
        </div>
      </div>
    </>
  );
}
