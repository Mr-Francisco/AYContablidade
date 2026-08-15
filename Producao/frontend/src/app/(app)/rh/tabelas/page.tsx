"use client";

import { Tabs } from "radix-ui";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda, soma } from "@/lib/dinheiro";
import { numeroLimpo, plural } from "@/lib/texto";
import type { Colaborador, ConfigRh, EscalaoIrt } from "@/types";

interface Irps {
  vigor: string;
  isencao: string;
  escaloes: EscalaoIrt[];
  retencoes?: { tipo: string; taxa: string }[];
  deducoes?: string[];
  indicativo?: boolean;
  [chave: string]: unknown;
}

/**
 * Carreiras e Configuração — os dois lados da mesma página, separados.
 *
 * O que se CONSULTA (carreiras, escalões do IRT, IRPS) é para toda a gente que
 * entra no módulo. O que se CONFIGURA — as taxas de INSS e as contas onde a
 * folha cai — muda o que se retém a toda a gente todos os meses, e é do
 * administrador. Estavam no mesmo ecrã sem distinção nenhuma.
 */
export default function Tabelas() {
  const { empresa, utilizador } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const admin =
    utilizador?.perfil === "admin" || utilizador?.perfil === "superadmin";

  const [aba, setAba] = useState("carreiras");

  const {
    data: cfg,
    isLoading,
    mutate,
  } = useSWR<ConfigRh>("/api/rh/config", buscador, {
    revalidateOnFocus: false,
  });
  const { data: irps } = useSWR<Irps>("/api/rh/irps", buscador, {
    revalidateOnFocus: false,
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Carreiras e Configuração"
        descricao="Categorias/carreiras, taxas de segurança social e tabela do IRT (Angola)."
      />

      <Tabs.Root value={aba} onValueChange={setAba}>
        <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
          {[
            { v: "carreiras", r: "Carreiras e tabelas" },
            { v: "config", r: "Configurações" },
          ].map((x) => (
            <Tabs.Trigger
              key={x.v}
              value={x.v}
              className="-mb-0.5 rounded-t-lg border-b-2 border-transparent px-4 py-2 text-[13.5px] font-semibold text-texto-suave hover:text-texto data-[state=active]:border-acento data-[state=active]:text-texto"
            >
              {x.r}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {isLoading || !cfg ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : aba === "config" ? (
        <Configuracoes cfg={cfg} admin={admin} aoGravar={mutate} />
      ) : (
        <div className="flex flex-col gap-4">
          <ResumoPorCategoria moeda={moeda} />

          <Cartao className="p-0">
            <TituloCartao
              className="px-5 pt-5"
              extra={<Selo cor="#3d7fe0">Lei 14/25 · OGE 2026</Selo>}
            >
              Tabela do IRT — Grupo A (matéria colectável mensal)
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
            <EscaloesIrt escaloes={cfg.irt} moeda={moeda} />
            <p className="px-5 pb-4 pt-3 text-[12.5px] leading-relaxed text-texto-suave">
              Actualizada pela{" "}
              <b>Lei n.º 14/25, de 30 de Dezembro (OGE 2026)</b> — isenção até{" "}
              <b>150.000 Kz</b>. IRT = parcela fixa + taxa × (matéria colectável
              − limite anterior).
            </p>
          </Cartao>

          {irps && (
            <Cartao className="p-0">
              <TituloCartao
                className="px-5 pt-5"
                extra={<Selo cor="#c98a10">Vigor {irps.vigor}</Selo>}
              >
                Novo IRPS — Imposto sobre o Rendimento das Pessoas Singulares
              </TituloCartao>
              <div className="px-5 pb-3">
                <Alerta tipo="info">
                  Substitui o IRT a partir de <b>{irps.vigor}</b>. Isenção até
                  150.000 Kz, 6 escalões (taxa marginal até <b>30%</b>) e
                  deduções à colecta. Até lá o sistema continua a reter pelo IRT
                  acima: esta tabela está aqui para se antecipar o impacto, não
                  para ser usada nos cálculos.
                </Alerta>
              </div>
              <div className="grid items-start gap-4 px-5 pb-5 lg:grid-cols-2">
                <div>
                  <EscaloesIrt
                    escaloes={irps.escaloes}
                    moeda={moeda}
                    comMoldura
                  />
                  <p className="mt-2 text-[12.5px] text-texto-suave">
                    6 escalões · taxa marginal até 30%.
                    {irps.indicativo ? (
                      <b> Escalões intermédios indicativos.</b>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  {irps.retencoes?.length ? (
                    <div>
                      <h3 className="mb-2 text-[13px] font-bold">
                        Retenções na fonte
                      </h3>
                      <EnvolveTabela>
                        <Tabela>
                          <thead>
                            <tr>
                              <Th>Rendimento</Th>
                              <Th numerico>Taxa</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {irps.retencoes.map((r) => (
                              <Tr key={r.tipo}>
                                <Td className="text-[13px]">{r.tipo}</Td>
                                <Td numerico>{r.taxa}</Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Tabela>
                      </EnvolveTabela>
                    </div>
                  ) : null}
                  {irps.deducoes?.length ? (
                    <div>
                      <h3 className="mb-2 text-[13px] font-bold">
                        Deduções à colecta
                      </h3>
                      <ul className="list-disc pl-5 text-[12.5px] leading-relaxed text-texto-suave">
                        {irps.deducoes.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </Cartao>
          )}
        </div>
      )}
    </>
  );
}

/** Resumo por categoria — o primeiro quadro do Piloto, que faltava. */
function ResumoPorCategoria({ moeda }: { moeda: string }) {
  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores",
    buscador,
  );

  const linhas = useMemo(() => {
    const mapa = new Map<string, { n: number; massa: string[] }>();
    for (const c of colaboradores ?? []) {
      const chave = c.categoria || "(sem categoria)";
      const g = mapa.get(chave) ?? { n: 0, massa: [] };
      g.n += 1;
      g.massa.push(c.salario_base, c.subsidios);
      mapa.set(chave, g);
    }
    return [...mapa.entries()]
      .map(([categoria, g]) => {
        const massa = soma(...g.massa);
        return { categoria, n: g.n, massa, media: massa.div(g.n) };
      })
      .sort((a, b) => b.massa.cmp(a.massa));
  }, [colaboradores]);

  return (
    <Cartao className="p-0">
      <TituloCartao className="px-5 pt-5">Resumo por Categoria</TituloCartao>
      {!linhas.length ? (
        <Vazio>Sem colaboradores.</Vazio>
      ) : (
        <EnvolveTabela className="rounded-none border-0 border-t">
          <Tabela>
            <thead>
              <tr>
                <Th>Categoria / Carreira</Th>
                <Th numerico>Colaboradores</Th>
                <Th numerico>Massa salarial</Th>
                <Th numerico>Média</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Tr key={l.categoria}>
                  <Td className="font-semibold">{l.categoria}</Td>
                  <Td numerico>{l.n}</Td>
                  <Td numerico>{formataMoeda(l.massa, moeda)}</Td>
                  <Td numerico>{formataMoeda(l.media, moeda)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </EnvolveTabela>
      )}
    </Cartao>
  );
}

/** Os escalões, com o isento assinalado como no Piloto. */
function EscaloesIrt({
  escaloes,
  moeda,
  comMoldura,
}: {
  escaloes: EscalaoIrt[];
  moeda: string;
  comMoldura?: boolean;
}) {
  return (
    <EnvolveTabela
      className={comMoldura ? undefined : "rounded-none border-0 border-t"}
    >
      <Tabela>
        <thead>
          <tr>
            <Th numerico>Até</Th>
            <Th numerico>Parcela fixa</Th>
            <Th numerico>Taxa s/ excesso</Th>
            <Th numerico>Excesso de</Th>
          </tr>
        </thead>
        <tbody>
          {escaloes.map((e) => {
            const isento = Number(e.taxa) === 0;
            return (
              <Tr key={`${e.de}-${e.ate ?? "fim"}`}>
                <Td numerico className={isento ? "text-sucesso" : ""}>
                  {e.ate ? (
                    formataMoeda(e.ate, moeda)
                  ) : (
                    <span className="text-texto-suave">acima</span>
                  )}
                </Td>
                <Td numerico className={isento ? "text-sucesso" : ""}>
                  {isento ? "—" : formataMoeda(e.fixa, moeda)}
                </Td>
                <Td
                  numerico
                  className={
                    isento ? "font-semibold text-sucesso" : "font-semibold"
                  }
                >
                  {isento ? "Isento" : `${numeroLimpo(e.taxa)} %`}
                </Td>
                <Td numerico className={isento ? "text-sucesso" : ""}>
                  {isento ? "—" : formataMoeda(e.de, moeda)}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Tabela>
    </EnvolveTabela>
  );
}

/** Configurações — só o administrador. */
function Configuracoes({
  cfg,
  admin,
  aoGravar,
}: {
  cfg: ConfigRh;
  admin: boolean;
  aoGravar: () => void;
}) {
  const [trab, setTrab] = useState(String(cfg.inss_trab));
  const [empr, setEmpr] = useState(String(cfg.inss_empr));
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function gravar() {
    setErro(null);
    setAviso(null);
    setAGravar(true);
    try {
      await api.put("/api/rh/config", {
        inss_trab: Number(trab) || 0,
        inss_empr: Number(empr) || 0,
      });
      setAviso("Taxas de INSS guardadas.");
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  if (!admin) {
    return (
      <Cartao>
        <Alerta tipo="info">
          As taxas de Segurança Social e as contas de contabilização são geridas
          pelo <b>administrador</b> da empresa. Alterá-las muda o que se retém a
          toda a gente, todos os meses, e onde a folha cai na contabilidade.
        </Alerta>
      </Cartao>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Cartao>
        <TituloCartao>Segurança Social (INSS)</TituloCartao>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Taxa trabalhador (%)"
            dica="Descontada no recibo. Incide só sobre o salário base, já deduzidas as faltas."
          >
            <Entrada
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={trab}
              onChange={(e) => setTrab(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo
            rotulo="Taxa empresa (%)"
            dica="Custo da entidade patronal. Não desconta ao colaborador."
          >
            <Entrada
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={empr}
              onChange={(e) => setEmpr(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
        </div>
        <div className="mt-4 flex justify-end">
          <Botao
            variante="primario"
            onClick={gravar}
            disabled={aGravar}
            motivoBloqueio={
              aGravar ? "A gravar as taxas — aguarde." : undefined
            }
          >
            {aGravar ? "A gravar…" : "Guardar taxas"}
          </Botao>
        </div>
      </Cartao>

      <Cartao>
        <TituloCartao>Contas de contabilização</TituloCartao>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Valor rotulo="Custo com pessoal" valor={String(cfg.conta_custo)} />
          <Valor rotulo="Salários a pagar" valor={String(cfg.conta_pagar)} />
          <Valor rotulo="IRT retido" valor={String(cfg.conta_irt)} />
          <Valor rotulo="INSS a entregar" valor={String(cfg.conta_inss)} />
          <Valor rotulo="Banco (pagamento)" valor={String(cfg.conta_banco)} />
          <Valor
            rotulo="Retenção de honorários"
            valor={`${numeroLimpo(cfg.taxa_ret_hon)} %`}
          />
        </div>
        <p className="mt-3 text-[12.5px] text-texto-suave">
          {plural(6, "parâmetro")} usados ao processar e ao pagar a folha.
        </p>
      </Cartao>
    </div>
  );
}

function Valor({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-borda bg-fundo p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
        {rotulo}
      </p>
      <p className="tabular mt-1 text-xl font-bold">{valor}</p>
    </div>
  );
}
