"use client";

import { X } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import useSWR from "swr";

import { CampoConta } from "@/components/contabilidade/CampoConta";
import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Ficha de terceiro — cliente ou fornecedor — com separadores, como no Piloto.
 *
 * O formulário que aqui estava tinha dez campos numa lista corrida. A ficha do
 * Piloto (`terceiros.js`) tem SETE SEPARADORES e perto de trinta campos:
 * moradas, dados fiscais, bancos, dados comerciais, crédito, contabilidade e
 * observações. E não era só o formulário — a rota da API aceitava dez campos e
 * calava-se sobre os outros, por isso o que faltava aqui não havia sequer como
 * gravar.
 *
 * Os separadores não são decoração: uma ficha de trinta campos numa coluna só
 * obriga a rolar para encontrar o IBAN, e quem a preenche fá-lo por partes —
 * a morada num momento, os dados fiscais quando os recebe, o crédito quando é
 * acordado.
 */

interface CampoDaFichaDef {
  k: string;
  l: string;
  /** Ocupa a linha toda. */
  full?: boolean;
  t?: "texto" | "email" | "num" | "sel" | "conta" | "texto-longo";
  opcoes?: { valor: string; rotulo: string }[];
}

const SIM_NAO = [
  { valor: "nao", rotulo: "Não" },
  { valor: "sim", rotulo: "Sim" },
];

/** Os separadores e os campos, na ordem do Piloto. */
function separadores(provincias: string[]) {
  return [
    {
      id: "moradas",
      rotulo: "Moradas",
      campos: [
        { k: "morada", l: "Morada", full: true },
        { k: "morada2", l: "Morada (continuação)", full: true },
        { k: "localidade", l: "Localidade" },
        { k: "codigo_postal", l: "Código Postal" },
        {
          k: "provincia",
          l: "Província",
          t: "sel",
          opcoes: provincias.map((p) => ({ valor: p, rotulo: p })),
        },
        { k: "pais", l: "País" },
        { k: "telefone", l: "Telefone" },
        { k: "telefone2", l: "Telefone 2" },
        { k: "fax", l: "Fax" },
        { k: "email", l: "E-mail", t: "email" },
        { k: "web", l: "Endereço Web", full: true },
        {
          k: "tipo_terceiro",
          l: "Tipo de Terceiro",
          t: "sel",
          opcoes: [
            { valor: "Cliente", rotulo: "Cliente" },
            { valor: "Fornecedor", rotulo: "Fornecedor" },
            { valor: "Cliente e Fornecedor", rotulo: "Cliente e Fornecedor" },
            { valor: "Outro", rotulo: "Outro" },
          ],
        },
      ] as CampoDaFichaDef[],
    },
    {
      id: "fiscais",
      rotulo: "Dados Fiscais",
      campos: [
        { k: "nif", l: "NIF (Contribuinte)" },
        {
          k: "regime_iva",
          l: "Regime de IVA",
          t: "sel",
          opcoes: [
            { valor: "Regime Geral", rotulo: "Regime Geral" },
            { valor: "Regime Simplificado", rotulo: "Regime Simplificado" },
            {
              valor: "Regime de Exclusão / Não Sujeição",
              rotulo: "Regime de Exclusão / Não Sujeição",
            },
          ],
        },
        { k: "isento_iva", l: "Isento de IVA", t: "sel", opcoes: SIM_NAO },
        {
          k: "retencao_fonte",
          l: "Sujeito a retenção na fonte",
          t: "sel",
          opcoes: SIM_NAO,
        },
        { k: "reparticao_fiscal", l: "Repartição Fiscal" },
      ] as CampoDaFichaDef[],
    },
    {
      id: "bancos",
      rotulo: "Bancos",
      campos: [
        { k: "banco", l: "Banco" },
        { k: "iban", l: "IBAN", full: true },
        { k: "swift", l: "SWIFT / BIC" },
      ] as CampoDaFichaDef[],
    },
    {
      id: "comerciais",
      rotulo: "Dados Comerciais",
      campos: [
        {
          k: "condicoes_pagamento",
          l: "Condições de pagamento",
          t: "sel",
          opcoes: [
            "Pronto pagamento",
            "15 dias",
            "30 dias",
            "60 dias",
            "90 dias",
          ].map((v) => ({ valor: v, rotulo: v })),
        },
        { k: "desconto_comercial", l: "Desconto comercial (%)", t: "num" },
        {
          k: "moeda",
          l: "Moeda",
          t: "sel",
          opcoes: ["AKZ", "USD", "EUR"].map((v) => ({ valor: v, rotulo: v })),
        },
        { k: "responsavel", l: "Vendedor / Comprador habitual" },
      ] as CampoDaFichaDef[],
    },
    {
      id: "credito",
      rotulo: "Crédito",
      campos: [
        { k: "limite_credito", l: "Limite de crédito", t: "num" },
        { k: "dias_credito", l: "Dias de crédito", t: "num" },
        {
          k: "estado",
          l: "Estado",
          t: "sel",
          opcoes: [
            { valor: "activo", rotulo: "Activo" },
            { valor: "inactivo", rotulo: "Inactivo / Anulado" },
          ],
        },
      ] as CampoDaFichaDef[],
    },
    {
      id: "conta",
      rotulo: "Contabilidade",
      campos: [
        { k: "conta", l: "Conta corrente", t: "conta" },
      ] as CampoDaFichaDef[],
    },
    {
      id: "obs",
      rotulo: "Observações",
      campos: [
        { k: "observacoes", l: "Observações", full: true, t: "texto-longo" },
      ] as CampoDaFichaDef[],
    },
  ];
}

/** Os campos que o servidor quer como booleano e a ficha mostra como Sim/Não. */
const BOOLEANOS = new Set(["isento_iva", "retencao_fonte"]);

type Valores = Record<string, string>;

/**
 * O que a ficha precisa de saber sobre o registo que está a alterar.
 *
 * `id` e `nome` são obrigatórios; do resto lê o que existir. Não se exige um
 * índice de strings de propósito — os tipos do domínio (`Terceiro`) são
 * interfaces fechadas, e obrigá-las a abrir só para caber aqui era o tipo a
 * ceder à ficha em vez do contrário.
 */
export type RegistoDaFicha = { id: string; nome: string; numero?: string } & {
  [campo: string]: unknown;
};

function valoresIniciais(registo: Record<string, unknown> | null): Valores {
  const v: Valores = {
    nome: "",
    morada: "",
    morada2: "",
    localidade: "",
    codigo_postal: "",
    provincia: "Luanda",
    pais: "Angola",
    telefone: "",
    telefone2: "",
    fax: "",
    email: "",
    web: "",
    tipo_terceiro: "Cliente",
    nif: "",
    regime_iva: "Regime Geral",
    isento_iva: "nao",
    retencao_fonte: "nao",
    reparticao_fiscal: "",
    banco: "",
    iban: "",
    swift: "",
    condicoes_pagamento: "30 dias",
    desconto_comercial: "0",
    moeda: "AKZ",
    responsavel: "",
    limite_credito: "0",
    dias_credito: "30",
    estado: "activo",
    conta: "",
    observacoes: "",
  };
  if (!registo) return v;
  for (const k of Object.keys(v)) {
    const bruto = registo[k];
    if (bruto === null || bruto === undefined) continue;
    v[k] = BOOLEANOS.has(k) ? (bruto ? "sim" : "nao") : String(bruto);
  }
  return v;
}

export function FichaTerceiro({
  registo,
  rota,
  tipoPorOmissao,
  aoFechar,
  aoGravar,
}: {
  registo: ({ id: string; nome: string } & object) | null;
  /** `/api/comercial/clientes` ou `/api/compras/fornecedores`. */
  rota: string;
  /** «Cliente» ou «Fornecedor», para a ficha nova. */
  tipoPorOmissao: string;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = registo === null;
  const { data: provincias } = useSWR<string[]>(
    "/api/comercial/provincias",
    buscador,
    { revalidateOnFocus: false },
  );

  const [valores, setValores] = useState<Valores>(() => {
    const v = valoresIniciais(registo as Record<string, unknown> | null);
    if (!registo) v.tipo_terceiro = tipoPorOmissao;
    return v;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const abas = separadores(provincias ?? ["Luanda"]);

  function alterar(k: string, valor: string) {
    setValores((v) => ({ ...v, [k]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      // O corpo leva a ficha TODA, e é isso que faz a alteração ser
      // reversível: gravar por cima com metade dos campos apagava a outra
      // metade sem o dizer.
      const corpo: Record<string, unknown> = {};
      for (const [k, valor] of Object.entries(valores)) {
        if (BOOLEANOS.has(k)) corpo[k] = valor === "sim";
        else if (k === "dias_credito") corpo[k] = Number(valor) || 0;
        else if (k === "limite_credito" || k === "desconto_comercial")
          corpo[k] = valor || "0";
        else corpo[k] = valor === "" ? null : valor;
      }
      corpo.nome = valores.nome;

      if (novo) await api.post(rota, corpo);
      else await api.patch(`${rota}/${registo.id}`, corpo);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo
                ? `Novo ${tipoPorOmissao.toLowerCase()}`
                : `Alterar ${registo.nome}`}
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
            onSubmit={submeter}
            className="min-w-0 flex-1 overflow-auto"
            id="form-terceiro"
          >
            {/* Nome e número FORA dos separadores: identificam a ficha, e não
                pertencem a nenhum deles. O número é automático — é o que forma
                a conta corrente e não se escolhe. */}
            <div className="grid gap-3 border-b border-borda p-5 sm:grid-cols-[1fr_200px]">
              <Campo rotulo="Nome / Designação">
                <Entrada
                  value={valores.nome}
                  onChange={(e) => alterar("nome", e.target.value)}
                  required
                  autoFocus
                />
              </Campo>
              <Campo rotulo="Nº (código)">
                <Entrada
                  value={String(
                    (registo as { numero?: string } | null)?.numero ?? "",
                  )}
                  placeholder="(automático)"
                  disabled
                />
              </Campo>
            </div>

            <Tabs.Root defaultValue="moradas" className="p-5">
              <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
                {abas.map((a) => (
                  <Tabs.Trigger
                    key={a.id}
                    value={a.id}
                    className={cn(
                      "-mb-0.5 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-texto-suave",
                      "hover:text-texto data-[state=active]:border-acento data-[state=active]:text-texto",
                    )}
                  >
                    {a.rotulo}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {abas.map((a) => (
                <Tabs.Content key={a.id} value={a.id}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {a.campos.map((c) => (
                      <CampoDaFicha
                        key={c.k}
                        campo={c}
                        valor={valores[c.k] ?? ""}
                        aoMudar={(v) => alterar(c.k, v)}
                      />
                    ))}
                  </div>
                </Tabs.Content>
              ))}
            </Tabs.Root>

            {erro && (
              <div className="px-5 pb-5">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-terceiro"
              variante="primario"
              disabled={aGravar}
            >
              {aGravar ? "A gravar…" : "Gravar"}
            </Botao>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CampoDaFicha({
  campo,
  valor,
  aoMudar,
}: {
  campo: CampoDaFichaDef;
  valor: string;
  aoMudar: (v: string) => void;
}): ReactNode {
  const largura = campo.full ? "sm:col-span-2" : undefined;

  if (campo.t === "sel") {
    return (
      <Selector
        rotulo={campo.l}
        valor={valor}
        aoMudar={aoMudar}
        opcoes={campo.opcoes ?? []}
        className={largura}
      />
    );
  }
  if (campo.t === "conta") {
    return (
      <Campo
        rotulo={campo.l}
        dica="F4 procura no plano de contas."
        className={largura}
      >
        <CampoConta valor={valor} aoMudar={aoMudar} />
      </Campo>
    );
  }
  if (campo.t === "texto-longo") {
    return (
      <Campo rotulo={campo.l} className={largura}>
        <textarea
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          rows={4}
          className="w-full rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento"
        />
      </Campo>
    );
  }
  return (
    <Campo rotulo={campo.l} className={largura}>
      <Entrada
        type={
          campo.t === "email" ? "email" : campo.t === "num" ? "number" : "text"
        }
        step={campo.t === "num" ? "0.01" : undefined}
        min={campo.t === "num" ? "0" : undefined}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={campo.t === "num" ? "text-right tabular" : undefined}
      />
    </Campo>
  );
}
