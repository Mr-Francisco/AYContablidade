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
import {
  BarraPaginacao,
  CaixaHistorico,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
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
  const p = usePaginacao();
  const { data, isLoading } = useSWR<Pagina<RegistoAuditoria>>(
    `/api/empresa/auditoria?${p.query}${accao ? `&accao=${accao}` : ""}`,
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
          aoMudar={(v) => {
            setAccao(v);
            p.reiniciar();
          }}
          opcoes={ACCOES}
          larguraMinima="18rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {/* O registo de auditoria é o histórico que cresce mais depressa —
            uma linha por cada acção administrativa, para sempre. A caixa é
            que rola, e vem uma página de cada vez. */}
        <CaixaHistorico altura={560}>
          <TabelaAuditoria registos={data?.linhas} aCarregar={isLoading} />
        </CaixaHistorico>
        <BarraPaginacao pagina={data} nome="acções" {...p.controlos} />
      </Cartao>
    </>
  );
}
