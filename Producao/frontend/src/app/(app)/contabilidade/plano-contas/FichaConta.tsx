"use client";

import { Tabs } from "radix-ui";
import { type FormEvent, useId, useState } from "react";

import { useSelectorDeConta } from "@/components/contabilidade/SelectorDeConta";
import { Campo, Entrada, Selector } from "@/components/ui";
import { DialogoMestre } from "@/components/ui/CrudMestre";
import { api, ErroApi } from "@/lib/api";
import { useContas, useExercicios } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { Conta } from "@/types";

/**
 * A ficha de conta do Piloto — os catorze campos da janela «Nova conta».
 *
 * Três separadores, como lá: Geral (fiscalidade), Integração e Tesouraria.
 * Nenhum destes campos entra no motor de lançamentos; são parametrização e
 * arquivo. O que decide se uma conta recebe movimentos é o `tipo`, e esse
 * calcula-se da árvore, não se escreve aqui.
 *
 * F4 nos dois campos de conta — o próprio código e a conta alternativa — com o
 * botão visível, como no Piloto. Na alternativa o selector deixa escolher
 * QUALQUER conta, integradora incluída: é um mapeamento de plano, não um
 * destino de lançamento.
 */

const CLASSES_IVA = [
  "Taxa Normal (14%)",
  "Taxa Reduzida (7%)",
  "Taxa Reduzida (5%)",
  "Isento",
  "Não sujeito",
  "IVA Cativo",
];

const RETENCOES = [
  "Nenhuma",
  "Imposto Industrial (6,5%)",
  "IRT",
  "IAC",
  "Imposto de Selo",
];

const ITENS_TESOURARIA = [
  "",
  "Recebimentos",
  "Pagamentos",
  "Disponibilidades",
  "Financiamentos",
  "Não aplicável",
];

const SEPARADOR =
  "rounded-none border-b-2 border-transparent px-3 pb-2 pt-1 text-[13px] font-semibold text-texto-suave data-[state=active]:border-marca data-[state=active]:text-texto";

export interface DadosFicha {
  codigo: string;
  nome: string;
  natureza: string;
  ativa: boolean;
  classe_iva: string;
  classe_primavera: string;
  conta_alt_codigo: string;
  conta_alt_nome: string;
  retencao: string;
  motivo_tributacao: string;
  trat_pendentes: boolean;
  integra_equipamentos: boolean;
  integra_ativos: boolean;
  investimento: string;
  custo_fixo: string;
  item_tesouraria: string;
}

export function fichaDe(c: Conta | null, codigoSugerido = ""): DadosFicha {
  return {
    codigo: c?.codigo ?? codigoSugerido,
    nome: c?.nome ?? "",
    natureza: c?.natureza ?? "D",
    ativa: c?.ativa ?? true,
    classe_iva: c?.classe_iva ?? "",
    classe_primavera: c?.classe_primavera ?? "",
    conta_alt_codigo: c?.conta_alt_codigo ?? "",
    conta_alt_nome: c?.conta_alt_nome ?? "",
    retencao: c?.retencao ?? "Nenhuma",
    motivo_tributacao: c?.motivo_tributacao ?? "",
    trat_pendentes: c?.trat_pendentes ?? false,
    integra_equipamentos: c?.integra_equipamentos ?? false,
    integra_ativos: c?.integra_ativos ?? false,
    investimento: c?.investimento ?? "",
    custo_fixo: c?.custo_fixo ?? "0",
    item_tesouraria: c?.item_tesouraria ?? "",
  };
}

export function FichaConta({
  conta,
  codigoSugerido,
  aoFechar,
  aoGravar,
}: {
  /** `null` cria; uma conta altera. */
  conta: Conta | null;
  codigoSugerido?: string;
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const { activo } = useExercicios();
  const { mutate } = useContas();
  const [campos, setCampos] = useState<DadosFicha>(() =>
    fichaDe(conta, codigoSugerido),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const idContas = useId();

  const novo = conta === null;

  const selectorCodigo = useSelectorDeConta((c) => alterar("codigo", c), {
    soMovimento: false,
  });
  const selectorAlt = useSelectorDeConta(
    (c) => alterar("conta_alt_codigo", c),
    { soMovimento: false, titulo: "Plano de Contas — conta alternativa" },
  );

  function alterar<K extends keyof DadosFicha>(campo: K, valor: DadosFicha[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      const corpo = {
        nome: campos.nome,
        natureza: campos.natureza,
        ativa: campos.ativa,
        classe_iva: campos.classe_iva || null,
        classe_primavera: campos.classe_primavera || null,
        conta_alt_codigo: campos.conta_alt_codigo || null,
        conta_alt_nome: campos.conta_alt_nome || null,
        retencao: campos.retencao || null,
        motivo_tributacao: campos.motivo_tributacao || null,
        trat_pendentes: campos.trat_pendentes,
        integra_equipamentos: campos.integra_equipamentos,
        integra_ativos: campos.integra_ativos,
        investimento: campos.investimento || null,
        custo_fixo: campos.custo_fixo || "0",
        item_tesouraria: campos.item_tesouraria || null,
      };

      if (novo) {
        const r = await api.post<{
          tornou_integradora: boolean;
          movidos: number;
        }>("/api/contabilidade/contas", { ...corpo, codigo: campos.codigo });
        await mutate();
        aoGravar(
          r.tornou_integradora
            ? `Conta ${campos.codigo} criada. A conta-mãe passou a integradora e ${r.movidos} movimento(s) migraram.`
            : `Conta ${campos.codigo} criada.`,
        );
      } else {
        await api.patch(`/api/contabilidade/contas/${conta.id}`, corpo);
        await mutate();
        aoGravar(`Conta ${campos.codigo} gravada.`);
      }
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
    <DialogoMestre
      titulo={novo ? "Nova conta" : `Conta ${conta.codigo}`}
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
    >
      {/* Topo: exercício, agrupamento, inactivo */}
      <Campo rotulo="Exercício">
        <Entrada value={activo?.nome ?? "—"} disabled />
      </Campo>
      <Campo rotulo="Classe (agrupamento)" dica="Agrupamento do Primavera.">
        <Entrada
          value={campos.classe_primavera}
          onChange={(e) => alterar("classe_primavera", e.target.value)}
          placeholder="Ex.: DEFA"
          maxLength={20}
        />
      </Campo>

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={!campos.ativa}
          onChange={(e) => alterar("ativa", !e.target.checked)}
          className="size-4 accent-[var(--color-marca)]"
        />
        Inactivo — deixa de ser oferecida em lançamentos novos, e o histórico
        mantém-se.
      </label>

      <Campo
        rotulo="Conta (código)"
        dica={
          novo
            ? "F4 procura no plano. Se estender uma conta de movimento, ela passa a integradora."
            : "Não se altera: os movimentos guardam-no."
        }
      >
        <div className="flex items-center gap-1">
          <Entrada
            value={campos.codigo}
            onChange={(e) => alterar("codigo", e.target.value)}
            list={idContas}
            disabled={!novo}
            required
            maxLength={20}
            placeholder="Ex.: 632 · F4 procura"
            className="tabular"
            {...(novo ? selectorCodigo.props : {})}
          />
          {novo && (
            <button
              type="button"
              onClick={selectorCodigo.abrir}
              title="F4 — procurar conta no plano"
              className="shrink-0 rounded-lg border border-borda px-2.5 py-2.5 text-[11px] font-bold text-texto-suave hover:border-marca hover:text-marca"
            >
              F4
            </button>
          )}
        </div>
      </Campo>

      <Campo rotulo="Natureza">
        <Selector
          valor={campos.natureza}
          aoMudar={(v) => alterar("natureza", v)}
          opcoes={[
            { valor: "D", rotulo: "Devedora" },
            { valor: "C", rotulo: "Credora" },
            { valor: "M", rotulo: "Mista" },
          ]}
        />
      </Campo>

      <Campo rotulo="Designação" className="sm:col-span-2">
        <Entrada
          value={campos.nome}
          onChange={(e) => alterar("nome", e.target.value)}
          required
          maxLength={200}
          placeholder="Nome da conta"
        />
      </Campo>

      <Campo rotulo="Conta Alternativa (código)">
        <div className="flex items-center gap-1">
          <Entrada
            value={campos.conta_alt_codigo}
            onChange={(e) => alterar("conta_alt_codigo", e.target.value)}
            list={idContas}
            maxLength={20}
            placeholder="(opcional) · F4"
            className="tabular"
            {...selectorAlt.props}
          />
          <button
            type="button"
            onClick={selectorAlt.abrir}
            title="F4 — escolher conta alternativa"
            className="shrink-0 rounded-lg border border-borda px-2.5 py-2.5 text-[11px] font-bold text-texto-suave hover:border-marca hover:text-marca"
          >
            F4
          </button>
        </div>
      </Campo>

      <Campo rotulo="Conta Alternativa (designação)">
        <Entrada
          value={campos.conta_alt_nome}
          onChange={(e) => alterar("conta_alt_nome", e.target.value)}
          maxLength={200}
        />
      </Campo>

      <DatalistContas id={idContas} />

      {/* Separadores */}
      <div className="sm:col-span-2">
        <Tabs.Root defaultValue="geral">
          <Tabs.List className="mb-3 flex gap-1 border-b border-borda">
            <Tabs.Trigger value="geral" className={SEPARADOR}>
              Geral
            </Tabs.Trigger>
            <Tabs.Trigger value="integracao" className={SEPARADOR}>
              Integração
            </Tabs.Trigger>
            <Tabs.Trigger value="tesouraria" className={SEPARADOR}>
              Tesouraria
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="geral" className="grid gap-3 sm:grid-cols-2">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-texto-suave sm:col-span-2">
              Fiscalidade
            </p>
            <Campo rotulo="Classe IVA">
              <Entrada
                value={campos.classe_iva}
                onChange={(e) => alterar("classe_iva", e.target.value)}
                list="lista-classes-iva"
                maxLength={20}
                placeholder="Código ou classe"
              />
              <datalist id="lista-classes-iva">
                {CLASSES_IVA.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Retenção na Fonte">
              <Selector
                valor={campos.retencao}
                aoMudar={(v) => alterar("retencao", v)}
                opcoes={RETENCOES.map((r) => ({ valor: r, rotulo: r }))}
              />
            </Campo>
            <Campo
              rotulo="Motivo de Tributação / Isenção"
              className="sm:col-span-2"
            >
              <Entrada
                value={campos.motivo_tributacao}
                onChange={(e) => alterar("motivo_tributacao", e.target.value)}
                maxLength={200}
                placeholder="Ex.: Isenção artigo… / bem isento"
              />
            </Campo>
          </Tabs.Content>

          <Tabs.Content
            value="integracao"
            className="grid gap-3 sm:grid-cols-2"
          >
            <Interruptor
              rotulo="Tratamento de pendentes (conta corrente)"
              ligado={campos.trat_pendentes}
              aoMudar={(v) => alterar("trat_pendentes", v)}
              className="sm:col-span-2"
            />
            <Interruptor
              rotulo="Integração com Equipamentos"
              ligado={campos.integra_equipamentos}
              aoMudar={(v) => alterar("integra_equipamentos", v)}
            />
            <Interruptor
              rotulo="Integração com Activos"
              ligado={campos.integra_ativos}
              aoMudar={(v) => alterar("integra_ativos", v)}
            />
            <Campo rotulo="Investimento">
              <Entrada
                value={campos.investimento}
                onChange={(e) => alterar("investimento", e.target.value)}
                maxLength={40}
                placeholder="(código de investimento)"
              />
            </Campo>
            <Campo rotulo="Custo fixo (%)">
              <Entrada
                type="number"
                step="0.01"
                min="0"
                value={campos.custo_fixo}
                onChange={(e) => alterar("custo_fixo", e.target.value)}
                className="tabular"
              />
            </Campo>
          </Tabs.Content>

          <Tabs.Content value="tesouraria" className="grid gap-3">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.5px] text-texto-suave">
              Classificação de Tesouraria
            </p>
            <Campo rotulo="Item de Tesouraria">
              <Selector
                valor={campos.item_tesouraria}
                aoMudar={(v) => alterar("item_tesouraria", v)}
                opcoes={ITENS_TESOURARIA.map((i) => ({
                  valor: i,
                  rotulo: i || "—",
                }))}
              />
            </Campo>
          </Tabs.Content>
        </Tabs.Root>
      </div>

      {selectorCodigo.dialogo}
      {selectorAlt.dialogo}
    </DialogoMestre>
  );
}

// ---------------------------------------------------------------------------
function Interruptor({
  rotulo,
  ligado,
  aoMudar,
  className,
}: {
  rotulo: string;
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-4 accent-[var(--color-marca)]"
      />
      {rotulo}
    </label>
  );
}

function DatalistContas({ id }: { id: string }) {
  const { contas } = useContas();
  return (
    <datalist id={id}>
      {contas.map((c) => (
        <option key={c.id} value={c.codigo}>
          {c.nome}
        </option>
      ))}
    </datalist>
  );
}
