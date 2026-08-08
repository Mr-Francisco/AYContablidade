"use client";

import { useState } from "react";
import useSWR from "swr";

import { TabelaAuditoria } from "@/components/auditoria/TabelaAuditoria";
import {
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  Kpi,
  Selector,
} from "@/components/ui";
import { buscador } from "@/lib/api";
import type { EmpresaPlataforma, RegistoAuditoria } from "@/types";

const ACCOES = [
  { valor: "", rotulo: "Todas as acções" },
  { valor: "licenca.gerar", rotulo: "Licenças geradas" },
  { valor: "licenca.activar", rotulo: "Licenças activadas" },
  { valor: "licenca.actualizar", rotulo: "Contratos alterados" },
  { valor: "licenca.revogar", rotulo: "Licenças revogadas" },
  { valor: "empresa.actualizar", rotulo: "Alterações a empresas" },
  { valor: "utilizador.criar", rotulo: "Utilizadores criados" },
  { valor: "utilizador.remover", rotulo: "Utilizadores removidos" },
];

export default function AuditoriaPlataforma() {
  const [accao, setAccao] = useState("");
  const [empresaId, setEmpresaId] = useState("");

  const params = new URLSearchParams();
  if (accao) params.set("accao", accao);
  if (empresaId) params.set("empresa_id", empresaId);

  const { data, isLoading } = useSWR<RegistoAuditoria[]>(
    `/api/licencas/auditoria${params.size ? `?${params}` : ""}`,
    buscador,
  );
  const { data: empresas } = useSWR<EmpresaPlataforma[]>(
    "/api/licencas/empresas",
    buscador,
    { revalidateOnFocus: false },
  );

  const registos = data ?? [];
  const daPlataforma = registos.filter((r) => r.accao.startsWith("licenca"));
  const semAutor = registos.filter((r) => !r.actor_nome);

  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria da plataforma"
        descricao="Todas as acções administrativas, de todas as empresas."
      />

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="min-w-0">
          <Kpi
            rotulo="Registos"
            valor={String(registos.length)}
            detalhe="Mais recentes primeiro"
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Sobre licenças"
            valor={String(daPlataforma.length)}
            detalhe="Geradas, activadas, alteradas"
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Sem sessão iniciada"
            valor={String(semAutor.length)}
            detalhe="Activações de licença"
            cor="var(--grafico-4)"
          />
        </div>
      </div>

      <Alerta tipo="info" className="mb-4">
        As activações de licença aparecem <b>sem autor</b>: quem activa ainda
        não tem conta no momento em que o faz. É o único tipo de registo assim,
        e é por isso que a linha o diz em vez de mostrar um espaço em branco.
      </Alerta>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Acção"
          valor={accao}
          aoMudar={setAccao}
          opcoes={ACCOES}
          larguraMinima="18rem"
        />
        <Selector
          rotulo="Empresa"
          valor={empresaId}
          aoMudar={setEmpresaId}
          opcoes={[
            { valor: "", rotulo: "Todas as empresas" },
            ...(empresas ?? []).map((e) => ({
              valor: e.id,
              rotulo: `${e.codigo} — ${e.nome}`,
            })),
          ]}
          larguraMinima="18rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        <TabelaAuditoria registos={data} aCarregar={isLoading} />
      </Cartao>
    </>
  );
}
