"use client";

import { useState } from "react";

import {
  ACarregar,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import type { RegistoAuditoria } from "@/types";

/** Cor por família de acção, para se perceber a natureza de relance. */
const CORES: Record<string, string> = {
  licenca: "#6c2fb0",
  empresa: "#3d7fe0",
  utilizador: "#1a9c5f",
  "2fa": "#c77700",
  superadmin: "#c62828",
};

const ROTULOS: Record<string, string> = {
  "licenca.gerar": "Licença gerada",
  "licenca.actualizar": "Contrato alterado",
  "licenca.revogar": "Licença revogada",
  "licenca.activar": "Licença activada",
  "empresa.actualizar": "Empresa alterada",
  "empresa.estado": "Estado alterado",
  "utilizador.criar": "Utilizador criado",
  "utilizador.actualizar": "Utilizador alterado",
  "utilizador.aprovar": "Conta aprovada",
  "utilizador.definir_password": "Palavra-passe definida",
  "utilizador.remover": "Utilizador removido",
  "2fa.activar": "2FA activado",
  "2fa.desactivar": "2FA desactivado",
  "2fa.codigos": "Códigos de recuperação renovados",
  "2fa.recuperacao_usada": "Entrou com código de recuperação",
  "2fa.bloqueio": "Conta bloqueada por tentativas",
  "utilizador.perfil": "Perfil alterado",
  "utilizador.password_temporaria": "Palavra-passe temporária gerada",
  "utilizador.2fa_reposto": "2FA reposto pela plataforma",
  "superadmin.criar": "Conta de plataforma criada",
  "superadmin.activar": "Conta de plataforma activada",
  "superadmin.desactivar": "Conta de plataforma desactivada",
  "superadmin.remover": "Conta de plataforma removida",
  "superadmin.password_temporaria": "Palavra-passe de plataforma gerada",
  "superadmin.2fa_reposto": "2FA de plataforma reposto",
};

/** Rótulo da linha. Sem isto, uma acção nova aparece como slug cru.
 *
 * A mudança de estado de uma empresa diz QUAL — num registo, «Estado alterado»
 * obriga a abrir os detalhes para saber se a empresa foi suspensa ou
 * reactivada, que é justamente o que se quer ver de relance. */
function rotulo(accao: string, detalhes?: Record<string, unknown> | null) {
  if (accao === "empresa.estado") {
    const depois = detalhes?.depois;
    if (depois === "suspensa") return "Empresa suspensa";
    if (depois === "cancelada") return "Empresa cancelada";
    if (depois === "activa") return "Empresa reactivada";
  }
  return ROTULOS[accao] ?? accao;
}

export function TabelaAuditoria({
  registos,
  aCarregar,
  mostrarIp = true,
}: {
  registos?: RegistoAuditoria[];
  aCarregar?: boolean;
  mostrarIp?: boolean;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  if (aCarregar) return <ACarregar />;
  if (!registos?.length) {
    return (
      <Vazio>
        Ainda não há nada registado. Cada acção administrativa aparece aqui
        assim que acontecer.
      </Vazio>
    );
  }

  return (
    <EnvolveTabela className="rounded-none border-0 border-t">
      <Tabela>
        <thead>
          <tr>
            <Th>Quando</Th>
            <Th>Acção</Th>
            <Th>Quem</Th>
            <Th>Sobre o quê</Th>
            {mostrarIp && <Th>Origem</Th>}
            <Th />
          </tr>
        </thead>
        <tbody>
          {registos.map((r) => {
            const familia = r.accao.split(".")[0];
            const temDetalhes = Object.keys(r.detalhes ?? {}).length > 0;
            return (
              <Tr key={r.id}>
                <Td className="tabular whitespace-nowrap">
                  {new Date(r.criado_em).toLocaleString("pt-PT", {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })}
                </Td>
                <Td>
                  <Selo cor={CORES[familia] ?? "#62657a"}>
                    {rotulo(r.accao, r.detalhes)}
                  </Selo>
                </Td>
                <Td className="max-w-[200px] truncate">
                  {r.actor_nome ? (
                    <>
                      <span className="font-semibold">{r.actor_nome}</span>
                      {r.actor_perfil && (
                        <span className="ml-1 text-xs text-texto-suave">
                          ({r.actor_perfil})
                        </span>
                      )}
                    </>
                  ) : (
                    // A activação de licença é feita por quem ainda não tem
                    // conta. É o único registo sem autor, e tem de o dizer.
                    <span className="italic text-texto-suave">
                      sem sessão iniciada
                    </span>
                  )}
                </Td>
                <Td className="max-w-[280px] truncate">{r.alvo_desc || "—"}</Td>
                {mostrarIp && (
                  <Td className="tabular text-texto-suave">{r.ip || "—"}</Td>
                )}
                <Td numerico>
                  {temDetalhes && (
                    <button
                      type="button"
                      onClick={() => setAberto(aberto === r.id ? null : r.id)}
                      className="text-xs font-semibold text-marca hover:underline"
                    >
                      {aberto === r.id ? "Fechar" : "Detalhes"}
                    </button>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Tabela>

      {aberto && (
        <div className="border-t border-borda bg-fundo p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
            Detalhes do registo
          </p>
          <pre className="overflow-x-auto text-xs leading-relaxed">
            {JSON.stringify(
              registos.find((r) => r.id === aberto)?.detalhes,
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </EnvolveTabela>
  );
}
