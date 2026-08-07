"use client";

import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import type { ConfigRh, EscalaoIrt } from "@/types";

interface Irps {
  vigor: string;
  isencao: string;
  escaloes: EscalaoIrt[];
  [chave: string]: unknown;
}

export default function Tabelas() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const { data: cfg, isLoading } = useSWR<ConfigRh>(
    "/api/rh/config",
    buscador,
    {
      revalidateOnFocus: false,
    },
  );
  const { data: irps } = useSWR<Irps>("/api/rh/irps", buscador, {
    revalidateOnFocus: false,
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Tabelas"
        descricao="Taxas e escalões em vigor para o cálculo de salários."
      />

      {isLoading || !cfg ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <div className="flex flex-col gap-4">
          <Cartao>
            <TituloCartao extra="Segurança Social">Contribuições</TituloCartao>
            <div className="grid gap-3 sm:grid-cols-2">
              <Taxa
                rotulo="Trabalhador"
                valor={`${cfg.inss_trab} %`}
                nota="Descontado no recibo. Incide só sobre o salário base, já deduzidas as faltas — subsídios e abonos não entram."
              />
              <Taxa
                rotulo="Entidade patronal"
                valor={`${cfg.inss_empr} %`}
                nota="Custo da empresa. Não desconta ao colaborador e não aparece no líquido."
              />
            </div>
          </Cartao>

          <Cartao className="p-0">
            <TituloCartao
              className="px-5 pt-5"
              extra={`Versão ${cfg.irt_versao}`}
            >
              Escalões do IRT
            </TituloCartao>
            <div className="px-5 pb-3">
              <Alerta tipo="info">
                A matéria colectável é o{" "}
                <b>bruto menos o INSS do trabalhador</b> — a contribuição é
                dedutível. Cada escalão tem uma parcela fixa que já inclui o
                imposto dos escalões anteriores; a taxa aplica-se só ao que
                excede o limite inferior.
              </Alerta>
            </div>
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th numerico>De</Th>
                    <Th numerico>Até</Th>
                    <Th numerico>Taxa</Th>
                    <Th numerico>Parcela fixa</Th>
                  </tr>
                </thead>
                <tbody>
                  {cfg.irt.map((e) => (
                    <Tr key={`${e.de}-${e.ate ?? "fim"}`}>
                      <Td numerico>{formataMoeda(e.de, moeda)}</Td>
                      <Td numerico>
                        {e.ate ? (
                          formataMoeda(e.ate, moeda)
                        ) : (
                          <span className="text-texto-suave">sem limite</span>
                        )}
                      </Td>
                      <Td numerico className="font-semibold">
                        {e.taxa} %
                      </Td>
                      <Td numerico>{formataMoeda(e.fixa, moeda)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          </Cartao>

          {irps && (
            <Cartao className="p-0">
              <TituloCartao
                className="px-5 pt-5"
                extra={<Selo cor="#c98a10">Ainda não aplicável</Selo>}
              >
                IRPS — entra em vigor a {irps.vigor}
              </TituloCartao>
              <div className="px-5 pb-3">
                <Alerta tipo="aviso">
                  Esta tabela é <b>informativa</b>. O IRPS substitui o IRT a
                  partir de {irps.vigor}; até lá o sistema continua a reter pelo
                  IRT acima. Está aqui para se poder antecipar o impacto, não
                  para ser usada nos cálculos.
                </Alerta>
              </div>
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th numerico>De</Th>
                      <Th numerico>Até</Th>
                      <Th numerico>Taxa</Th>
                      <Th numerico>Parcela fixa</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {irps.escaloes.map((e) => (
                      <Tr key={`irps-${e.de}-${e.ate ?? "fim"}`}>
                        <Td numerico>{formataMoeda(e.de, moeda)}</Td>
                        <Td numerico>
                          {e.ate ? (
                            formataMoeda(e.ate, moeda)
                          ) : (
                            <span className="text-texto-suave">sem limite</span>
                          )}
                        </Td>
                        <Td numerico className="font-semibold">
                          {e.taxa} %
                        </Td>
                        <Td numerico>{formataMoeda(e.fixa, moeda)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
            </Cartao>
          )}

          <Cartao>
            <TituloCartao>Contas de contabilização</TituloCartao>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Taxa
                rotulo="Custo com pessoal"
                valor={String(cfg.conta_custo)}
              />
              <Taxa rotulo="Salários a pagar" valor={String(cfg.conta_pagar)} />
              <Taxa rotulo="IRT retido" valor={String(cfg.conta_irt)} />
              <Taxa rotulo="INSS a entregar" valor={String(cfg.conta_inss)} />
              <Taxa
                rotulo="Banco (pagamento)"
                valor={String(cfg.conta_banco)}
              />
              <Taxa
                rotulo="Retenção de honorários"
                valor={`${cfg.taxa_ret_hon} %`}
              />
            </div>
          </Cartao>
        </div>
      )}
    </>
  );
}

function Taxa({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-borda bg-fundo p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
        {rotulo}
      </p>
      <p className="tabular mt-1 text-xl font-bold">{valor}</p>
      {nota && <p className="mt-1 text-xs text-texto-suave">{nota}</p>}
    </div>
  );
}
