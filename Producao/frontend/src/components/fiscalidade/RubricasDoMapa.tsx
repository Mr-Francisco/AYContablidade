"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataMoeda } from "@/lib/dinheiro";
import type { LinhaMapaIrt } from "@/types";

/**
 * Rubricas do Mapa IRT — a janela do Piloto (`mapa-remuneracoes.html`).
 *
 * O modelo da AGT não aceita «subsídios»: aceita subsídio de alimentação,
 * abono de família, horas extras, prémios — cada um na sua coluna, porque uns
 * entram na matéria colectável e outros não. É aqui que se faz essa
 * classificação, por trabalhador e por mês.
 *
 * A pré-visualização ao fundo replica a fórmula com o que está no formulário e
 * NÃO grava — é o que faz o «Cancelar» continuar a funcionar depois de se
 * terem escrito valores.
 */

const NAO_SUJEITOS: [string, string][] = [
  ["sub_alimentacao", "Subsídio Alimentação"],
  ["sub_transporte", "Subsídio Transporte"],
  ["abono_familia", "Abono Família"],
  ["reembolso_despesas", "Reembolso de Despesas"],
  ["outros_nao_sujeitos", "Outros"],
];

const SUJEITOS: [string, string][] = [
  ["abono_falhas", "Abono de Falhas"],
  ["sub_renda_casa", "Subsídio Renda de Casa"],
  ["compensacao_rescisao", "Compensação Por Rescisão"],
  ["sub_ferias", "Subsídio de Férias"],
  ["horas_extras", "Horas Extras"],
  ["sub_atavio", "Subsídio de Atavio"],
  ["sub_representacao", "Subsídio de Representação"],
  ["premios", "Prémios"],
  ["sub_natal", "Subsídio de Natal"],
  ["outros_sujeitos", "Outros Subsídios Sujeitos"],
];

interface ConfigRhMinima {
  inss_trab: number | string;
  irt: { de: string; ate: string | null; taxa: string; fixa: string }[];
}

/** O IRT pela tabela em vigor — a mesma conta do servidor, por escalões. */
function calcIrt(
  materia: ReturnType<typeof big>,
  tabela: ConfigRhMinima["irt"],
) {
  for (const b of tabela) {
    if (b.ate === null || materia.lte(big(b.ate))) {
      return big(b.fixa)
        .plus(materia.minus(big(b.de)).times(big(b.taxa)).div(100))
        .round(2);
    }
  }
  const ultimo = tabela[tabela.length - 1];
  if (!ultimo) return big("0");
  return big(ultimo.fixa)
    .plus(materia.minus(big(ultimo.de)).times(big(ultimo.taxa)).div(100))
    .round(2);
}

export function RubricasDoMapa({
  linha,
  mes,
  rotuloMes,
  moeda,
  aoFechar,
  aoGravar,
}: {
  linha: LinhaMapaIrt;
  mes: string;
  rotuloMes: string;
  moeda: string;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { data: cfg } = useSWR<ConfigRhMinima>("/api/rh/config", buscador, {
    revalidateOnFocus: false,
  });

  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const [k] of [...NAO_SUJEITOS, ...SUJEITOS]) {
      v[k] = String(Number(linha[k as keyof LinhaMapaIrt] ?? 0) || 0);
    }
    return v;
  });
  const [excesso, setExcesso] = useState(
    String(Number(linha.excesso_subsidios_nao_sujeitos) || 0),
  );
  const [isentoIrt, setIsentoIrt] = useState(linha.isento_irt ? "S" : "N");
  const [naoSujeitoSs, setNaoSujeitoSs] = useState(
    linha.nao_sujeito_ss ? "S" : "N",
  );
  const [manualSs, setManualSs] = useState(linha.registo_manual_ss ? "S" : "N");
  const [baseSsManual, setBaseSsManual] = useState(
    String(Number(linha.base_tributavel_ss_manual) || 0),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  /** Sem a tabela do IRT não há apuramento nenhum para mostrar. */
  const pronto = Boolean(cfg);

  const alterar = (k: string, v: string) =>
    setValores((antes) => ({ ...antes, [k]: v }));

  // Pré-visualização: a mesma ordem de operações do servidor.
  const previsao = useMemo(() => {
    const soma = (campos: [string, string][]) =>
      campos.reduce((s, [k]) => s.plus(big(valores[k] || "0")), big("0"));

    const subNaoSuj = soma(NAO_SUJEITOS).round(2);
    const subSuj = soma(SUJEITOS).round(2);
    const base = big(linha.salario_base);
    const faltas = big(linha.descontos_falta);
    const exc = Number(excesso) > 0 ? big(excesso) : big("0");

    const iliquido = base.minus(faltas).plus(subSuj).plus(subNaoSuj).round(2);
    const baseSs =
      manualSs === "S" ? big(baseSsManual || "0") : base.minus(faltas).round(2);
    const contribSs =
      naoSujeitoSs === "S"
        ? big("0")
        : baseSs
            .times(big(String(cfg?.inss_trab ?? 3)))
            .div(100)
            .round(2);

    const bruta = base.minus(faltas).plus(subSuj).plus(exc).minus(contribSs);
    const baseIrt =
      isentoIrt === "S" ? big("0") : bruta.lt(0) ? big("0") : bruta.round(2);
    const irt =
      isentoIrt === "S" || !cfg ? big("0") : calcIrt(baseIrt, cfg.irt);

    return { iliquido, baseSs, contribSs, baseIrt, irt };
  }, [
    valores,
    excesso,
    manualSs,
    baseSsManual,
    naoSujeitoSs,
    isentoIrt,
    cfg,
    linha.salario_base,
    linha.descontos_falta,
  ]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.put(`/api/rh/mapa-irt/${linha.colaborador_id}`, {
        mes,
        valores: Object.fromEntries(
          Object.entries(valores).map(([k, v]) => [k, v || "0"]),
        ),
        calc_manual_excesso: Number(excesso) > 0,
        excesso_subsidios_nao_sujeitos: excesso || "0",
        registo_manual_ss: manualSs === "S",
        base_tributavel_ss_manual: baseSsManual || "0",
        nao_sujeito_ss: naoSujeitoSs === "S",
        isento_irt: isentoIrt === "S",
      });
      aoGravar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(820px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda bg-superficie-2 px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              Rubricas — {linha.nome} · {rotuloMes}
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

          <form
            id="form-rubricas"
            onSubmit={submeter}
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <Seccao titulo="Subsídios Não Sujeitos a IRT (Art. 2º do CIRT)" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NAO_SUJEITOS.map(([k, rotulo]) => (
                <CampoValor
                  key={k}
                  rotulo={rotulo}
                  valor={valores[k]}
                  aoMudar={(v) => alterar(k, v)}
                />
              ))}
              <CampoValor
                rotulo="Excesso Subsídios Não Sujeitos"
                valor={excesso}
                aoMudar={setExcesso}
                dica="Acima do limite legal, o excesso é tributado."
              />
            </div>

            <Seccao titulo="Subsídios Sujeitos a IRT" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SUJEITOS.map(([k, rotulo]) => (
                <CampoValor
                  key={k}
                  rotulo={rotulo}
                  valor={valores[k]}
                  aoMudar={(v) => alterar(k, v)}
                />
              ))}
            </div>

            <Seccao titulo="Segurança Social e IRT" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Selector
                rotulo="Isento de IRT?"
                valor={isentoIrt}
                aoMudar={setIsentoIrt}
                opcoes={[
                  { valor: "N", rotulo: "Não" },
                  { valor: "S", rotulo: "Sim" },
                ]}
                larguraMinima="100%"
              />
              <Selector
                rotulo="Não sujeito a Segurança Social?"
                valor={naoSujeitoSs}
                aoMudar={setNaoSujeitoSs}
                opcoes={[
                  { valor: "N", rotulo: "Não" },
                  { valor: "S", rotulo: "Sim" },
                ]}
                larguraMinima="100%"
              />
              <Selector
                rotulo="Registo manual da Base Tributável SS?"
                valor={manualSs}
                aoMudar={setManualSs}
                opcoes={[
                  { valor: "N", rotulo: "Não" },
                  { valor: "S", rotulo: "Sim" },
                ]}
                larguraMinima="100%"
              />
              {manualSs === "S" && (
                <CampoValor
                  rotulo="Base Tributável SS (manual)"
                  valor={baseSsManual}
                  aoMudar={setBaseSsManual}
                />
              )}
            </div>

            {erro && (
              <div className="mt-4">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
          </form>

          {/* O que estes valores produzem, antes de gravar. */}
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-borda bg-fundo px-5 py-2.5 text-[12.5px] text-texto-suave">
            <Resultado
              rotulo="Salário Ilíquido"
              valor={previsao.iliquido}
              moeda={moeda}
              pronto={pronto}
            />
            <Resultado
              rotulo="Base SS"
              valor={previsao.baseSs}
              moeda={moeda}
              pronto={pronto}
            />
            <Resultado
              rotulo="Contribuição SS"
              valor={previsao.contribSs}
              moeda={moeda}
              pronto={pronto}
            />
            <Resultado
              rotulo="Base IRT"
              valor={previsao.baseIrt}
              moeda={moeda}
              pronto={pronto}
            />
            <Resultado
              rotulo="IRT Apurado"
              valor={previsao.irt}
              moeda={moeda}
              pronto={pronto}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-borda bg-superficie-2 px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-rubricas"
              variante="primario"
              disabled={aGravar}
              motivoBloqueio={
                aGravar ? "A gravar as rubricas — aguarde." : undefined
              }
            >
              {aGravar ? "A gravar…" : "Guardar"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Seccao({ titulo }: { titulo: string }) {
  return (
    <h3 className="mb-2 mt-5 border-b border-borda pb-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave first:mt-0">
      {titulo}
    </h3>
  );
}

function CampoValor({
  rotulo,
  valor,
  aoMudar,
  dica,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  dica?: string;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <Entrada
        type="number"
        step="1000"
        min="0"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="text-right tabular"
      />
    </Campo>
  );
}

function Resultado({
  rotulo,
  valor,
  moeda,
  pronto,
}: {
  rotulo: string;
  valor: ReturnType<typeof big>;
  moeda: string;
  /** Enquanto a tabela do IRT não chega, mostrar «0,00» seria mentir. */
  pronto: boolean;
}) {
  return (
    <span>
      {rotulo}{" "}
      <b className="tabular text-texto">
        {pronto ? formataMoeda(valor, moeda) : "—"}
      </b>
    </span>
  );
}
