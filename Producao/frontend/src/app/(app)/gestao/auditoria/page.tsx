"use client";

import { useState } from "react";
import useSWR from "swr";

import { TabelaAuditoria } from "@/components/auditoria/TabelaAuditoria";
import {
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Selector,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import type { RegistoAuditoria } from "@/types";

const ACCOES = [
  { valor: "", rotulo: "Todas as acções" },
  { valor: "utilizador.criar", rotulo: "Utilizadores criados" },
  { valor: "utilizador.actualizar", rotulo: "Utilizadores alterados" },
  { valor: "utilizador.aprovar", rotulo: "Contas aprovadas" },
  { valor: "utilizador.definir_password", rotulo: "Palavras-passe definidas" },
  { valor: "utilizador.remover", rotulo: "Utilizadores removidos" },
  { valor: "empresa.actualizar", rotulo: "Alterações à empresa" },
];

export default function AuditoriaEmpresa() {
  const [accao, setAccao] = useState("");
  const { data, isLoading } = useSWR<RegistoAuditoria[]>(
    `/api/empresa/auditoria${accao ? `?accao=${accao}` : ""}`,
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        descricao="Tudo o que foi feito na administração desta empresa, e por quem."
      />

      <Alerta tipo="info" className="mb-4">
        Inclui as acções que o administrador da plataforma fez sobre esta
        empresa — alterações ao contrato, ao plano ou aos limites. O registo é
        só de escrita: não há forma de o alterar nem de o apagar, nem por alguém
        desta empresa nem pela plataforma.
      </Alerta>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Acção"
          valor={accao}
          aoMudar={setAccao}
          opcoes={ACCOES}
          larguraMinima="18rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        <TabelaAuditoria registos={data} aCarregar={isLoading} />
      </Cartao>
    </>
  );
}
