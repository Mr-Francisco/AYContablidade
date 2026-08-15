"use client";

import { X } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import useSWR from "swr";

import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Ficha do colaborador — os oito separadores do Piloto (`pessoal.html`).
 *
 * O formulário que aqui estava tinha nove campos. A ficha do Piloto tem perto
 * de trinta, repartidos por Identificação, Documentos, Dados Fiscais,
 * Contrato, Processamento, Pagamento, Subsídios e Férias e Habilitações — e a
 * tabela nem sequer tinha colunas para os guardar, por isso o que faltava aqui
 * não havia forma de gravar.
 *
 * IDENTIFICAÇÃO MÍNIMA OBRIGATÓRIA: NIF **ou** número do documento, e pelo
 * menos um contacto. Não é uma exigência inventada — sem um identificador
 * fiscal o trabalhador não entra no Mapa de Remunerações, e uma ficha sem
 * contacto é uma ficha incompleta no dia em que faz falta. O servidor recusa;
 * aqui avisa-se antes, para não se perder o preenchimento todo.
 */

interface CampoDaFicha {
  k: string;
  l: string;
  full?: boolean;
  t?: "texto" | "email" | "num" | "inteiro" | "data" | "sel" | "moeda";
  opcoes?: { valor: string; rotulo: string }[];
  dica?: string;
}

const op = (...vs: string[]) => vs.map((v) => ({ valor: v, rotulo: v }));

function separadores(provincias: string[]) {
  return [
    {
      id: "ident",
      rotulo: "Identificação",
      campos: [
        { k: "nome", l: "Nome", full: true },
        { k: "nome_abreviado", l: "Nome abreviado" },
        {
          k: "genero",
          l: "Género",
          t: "sel",
          opcoes: op("Masculino", "Feminino"),
        },
        { k: "data_nascimento", l: "Data de nascimento", t: "data" },
        { k: "nacionalidade", l: "Nacionalidade" },
        { k: "naturalidade", l: "Naturalidade" },
        { k: "morada", l: "Morada", full: true },
        { k: "localidade", l: "Localidade" },
        { k: "codigo_postal", l: "Código postal" },
        { k: "pais", l: "País" },
        {
          k: "provincia",
          l: "Província",
          t: "sel",
          opcoes: provincias.map((p) => ({ valor: p, rotulo: p })),
        },
        { k: "municipio", l: "Município" },
        { k: "comuna", l: "Comuna" },
        {
          k: "email",
          l: "E-mail",
          t: "email",
          dica: "Um contacto é obrigatório.",
        },
        { k: "telefone", l: "Telefone" },
        { k: "telemovel", l: "Telemóvel" },
      ] as CampoDaFicha[],
    },
    {
      id: "doc",
      rotulo: "Documentos",
      campos: [
        {
          k: "tipo_documento",
          l: "Tipo de documento",
          t: "sel",
          opcoes: op(
            "Bilhete de Identidade",
            "Passaporte",
            "Cartão de Residente",
          ),
        },
        {
          k: "num_documento",
          l: "Nº do documento",
          dica: "Obrigatório se não houver NIF.",
        },
        { k: "validade_documento", l: "Validade", t: "data" },
      ] as CampoDaFicha[],
    },
    {
      id: "fiscais",
      rotulo: "Dados Fiscais",
      campos: [
        { k: "nif", l: "NIF", dica: "Obrigatório se não houver documento." },
        { k: "num_ss", l: "Nº Segurança Social" },
        {
          k: "estado_civil",
          l: "Estado civil",
          t: "sel",
          opcoes: op(
            "Solteiro(a)",
            "Casado(a)",
            "Divorciado(a)",
            "Viúvo(a)",
            "União de facto",
          ),
        },
        { k: "dependentes", l: "Nº de dependentes", t: "inteiro" },
        {
          k: "regime_irt",
          l: "Regime de IRT",
          full: true,
          t: "sel",
          opcoes: op(
            "Grupo A — Trabalho por conta de outrem",
            "Grupo B — Trabalho independente",
            "Grupo C — Atividade industrial/comercial",
          ),
        },
      ] as CampoDaFicha[],
    },
    {
      id: "contrato",
      rotulo: "Contrato",
      campos: [
        {
          k: "numero",
          l: "Nº de funcionário",
          dica: "Em branco, atribui o próximo.",
        },
        { k: "categoria", l: "Categoria / Carreira" },
        {
          k: "tipo_contrato",
          l: "Tipo de contrato",
          t: "sel",
          opcoes: op(
            "Sem termo",
            "A termo certo",
            "A termo incerto",
            "Estágio",
            "Prestação de serviços",
          ),
        },
        { k: "data_admissao", l: "Data de admissão", t: "data" },
        { k: "data_fim", l: "Data de fim (se aplicável)", t: "data" },
      ] as CampoDaFicha[],
    },
    {
      id: "proc",
      rotulo: "Processamento",
      campos: [
        { k: "salario_base", l: "Salário base", t: "moeda" },
        { k: "subsidios", l: "Subsídios sujeitos a IRT", t: "moeda" },
        {
          k: "subs_nao_sujeitos",
          l: "Subsídios não sujeitos a IRT",
          t: "moeda",
          dica: "Alimentação, transporte… são isentos.",
        },
        {
          k: "estado",
          l: "Estado",
          t: "sel",
          opcoes: [
            { valor: "activo", rotulo: "Activo" },
            { valor: "inactivo", rotulo: "Inactivo" },
          ],
        },
      ] as CampoDaFicha[],
    },
    {
      id: "pag",
      rotulo: "Pagamento",
      campos: [
        {
          k: "forma_pagamento",
          l: "Forma de pagamento",
          t: "sel",
          opcoes: op("Transferência bancária", "Cheque", "Numerário"),
        },
        { k: "banco", l: "Banco" },
        { k: "iban", l: "IBAN", full: true },
      ] as CampoDaFicha[],
    },
    {
      id: "ferias",
      rotulo: "Subsídios e Férias",
      campos: [
        { k: "dias_ferias", l: "Dias de férias / ano", t: "inteiro" },
        { k: "subsidio_ferias", l: "Subsídio de férias", t: "moeda" },
        { k: "subsidio_natal", l: "Subsídio de Natal", t: "moeda" },
      ] as CampoDaFicha[],
    },
    {
      id: "habil",
      rotulo: "Habilitações",
      campos: [
        { k: "habilitacoes", l: "Habilitações literárias", full: true },
        { k: "notas", l: "Notas", full: true },
      ] as CampoDaFicha[],
    },
  ];
}

type Valores = Record<string, string>;

const OMISSOES: Valores = {
  nome: "",
  numero: "",
  nome_abreviado: "",
  genero: "Masculino",
  data_nascimento: "",
  nacionalidade: "Angolana",
  naturalidade: "",
  morada: "",
  localidade: "",
  codigo_postal: "",
  pais: "Angola",
  provincia: "Luanda",
  municipio: "",
  comuna: "",
  email: "",
  telefone: "",
  telemovel: "",
  tipo_documento: "Bilhete de Identidade",
  num_documento: "",
  validade_documento: "",
  nif: "",
  num_ss: "",
  estado_civil: "Solteiro(a)",
  dependentes: "0",
  regime_irt: "Grupo A — Trabalho por conta de outrem",
  categoria: "",
  tipo_contrato: "Sem termo",
  data_admissao: "",
  data_fim: "",
  salario_base: "0",
  subsidios: "0",
  subs_nao_sujeitos: "0",
  estado: "activo",
  forma_pagamento: "Transferência bancária",
  banco: "",
  iban: "",
  dias_ferias: "22",
  subsidio_ferias: "0",
  subsidio_natal: "0",
  habilitacoes: "",
  notas: "",
};

const INTEIROS = new Set(["dependentes", "dias_ferias"]);
const MOEDAS = new Set([
  "salario_base",
  "subsidios",
  "subs_nao_sujeitos",
  "subsidio_ferias",
  "subsidio_natal",
]);

export function FichaColaborador({
  registo,
  aoFechar,
  aoGravar,
}: {
  registo: ({ id: string; nome: string } & object) | null;
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
    const v = { ...OMISSOES };
    const r = registo as Record<string, unknown> | null;
    if (r) {
      for (const k of Object.keys(v)) {
        const bruto = r[k];
        if (bruto !== null && bruto !== undefined) v[k] = String(bruto);
      }
    }
    return v;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [aba, setAba] = useState("ident");

  const abas = separadores(provincias ?? ["Luanda"]);

  function alterar(k: string, v: string) {
    setValores((antes) => ({ ...antes, [k]: v }));
  }

  /** O que falta para a ficha poder ser gravada, na linguagem de quem a lê. */
  function emFalta(): { mensagem: string; separador: string } | null {
    if (!valores.nome.trim())
      return { mensagem: "O nome é obrigatório.", separador: "ident" };
    if (!valores.nif.trim() && !valores.num_documento.trim())
      return {
        mensagem:
          "Indique o NIF ou o número do documento de identificação — sem um dos dois, o colaborador não entra no Mapa de Remunerações.",
        separador: "fiscais",
      };
    if (
      !valores.telefone.trim() &&
      !valores.telemovel.trim() &&
      !valores.email.trim()
    )
      return {
        mensagem:
          "Indique pelo menos um contacto: telefone, telemóvel ou e-mail.",
        separador: "ident",
      };
    return null;
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    const falta = emFalta();
    if (falta) {
      // Leva o utilizador ao separador onde falta preencher: dizer «falta o
      // NIF» com o separador dos Dados Fiscais fechado é mandá-lo procurar.
      setAba(falta.separador);
      setErro(falta.mensagem);
      return;
    }
    setErro(null);
    setAGravar(true);
    try {
      const corpo: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valores)) {
        if (INTEIROS.has(k)) corpo[k] = Number(v) || 0;
        else if (MOEDAS.has(k)) corpo[k] = v || "0";
        else corpo[k] = v === "" ? null : v;
      }
      corpo.nome = valores.nome;
      if (novo) await api.post("/api/rh/colaboradores", corpo);
      else await api.patch(`/api/rh/colaboradores/${registo.id}`, corpo);
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
        {/* 880 e não 780: com 780 os oito separadores não cabiam numa linha e
            partiam-se em duas, que é o mesmo que dizer ao utilizador que a
            ficha tem duas famílias de separadores quando tem uma. */}
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(880px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda bg-superficie-2 px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {novo ? "Novo colaborador" : `Ficha de ${registo.nome}`}
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
            id="form-colaborador"
            className="min-w-0 flex-1 overflow-auto p-5"
          >
            <Tabs.Root value={aba} onValueChange={setAba}>
              <Tabs.List className="mb-4 flex flex-wrap gap-1 border-b-2 border-borda">
                {abas.map((a) => (
                  <Tabs.Trigger
                    key={a.id}
                    value={a.id}
                    className={cn(
                      "-mb-0.5 whitespace-nowrap rounded-t-lg border-b-2 border-transparent px-2.5 py-2 text-[13px] font-semibold text-texto-suave",
                      "hover:text-texto data-[state=active]:border-acento data-[state=active]:text-texto",
                    )}
                  >
                    {a.rotulo}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {abas.map((a) => (
                <Tabs.Content key={a.id} value={a.id}>
                  {/* Três colunas em ecrã grande: a Identificação tem dezasseis
                      campos e em duas colunas obrigava a rolar a ficha toda
                      para chegar ao contacto. */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {a.campos.map((c) => (
                      <CampoFicha
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
              <div className="mt-4">
                <Alerta tipo="erro">{erro}</Alerta>
              </div>
            )}
          </form>

          <div className="flex justify-end gap-2 border-t border-borda bg-superficie-2 px-5 py-3.5">
            <Botao onClick={aoFechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form="form-colaborador"
              variante="primario"
              disabled={aGravar}
              motivoBloqueio={
                aGravar ? "A gravar a ficha — aguarde." : undefined
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

function CampoFicha({
  campo,
  valor,
  aoMudar,
}: {
  campo: CampoDaFicha;
  valor: string;
  aoMudar: (v: string) => void;
}): ReactNode {
  const largura = campo.full ? "sm:col-span-2 lg:col-span-3" : undefined;

  if (campo.t === "sel") {
    return (
      <Selector
        rotulo={campo.l}
        valor={valor}
        aoMudar={aoMudar}
        opcoes={campo.opcoes ?? []}
        className={largura}
        larguraMinima="100%"
      />
    );
  }
  const tipo =
    campo.t === "data"
      ? "date"
      : campo.t === "email"
        ? "email"
        : campo.t === "moeda" || campo.t === "inteiro" || campo.t === "num"
          ? "number"
          : "text";
  return (
    <Campo rotulo={campo.l} dica={campo.dica} className={largura}>
      <Entrada
        type={tipo}
        step={
          campo.t === "moeda" ? "0.01" : campo.t === "inteiro" ? "1" : undefined
        }
        min={tipo === "number" ? "0" : undefined}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={tipo === "number" ? "text-right tabular" : undefined}
      />
    </Campo>
  );
}
