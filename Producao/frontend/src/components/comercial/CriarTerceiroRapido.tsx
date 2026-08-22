"use client";

import { Globe, Landmark, MapPin, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { CampoNif } from "@/components/ui/CampoNif";
import { api, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Criar um cliente ou um fornecedor sem sair do documento.

   O caso é o mesmo dos dois lados: descobre-se a meio de uma factura — ou de
   uma compra — que a entidade não está registada. Mandar a pessoa a outro ecrã
   é fazê-la perder o documento que estava a preencher.

   UM COMPONENTE E NÃO DOIS. As duas janelas pedem o mesmo (nome, NIF,
   telefone, categoria), criam o mesmo (número sequencial e conta corrente) e
   diferem em três coisas: a palavra que se lê, a rota, e as contas de cada
   categoria. Isso são propriedades. Escrito duas vezes, o segundo ficava para
   trás à primeira melhoria — foi assim que a ficha do fornecedor ficou com
   nove campos enquanto a do cliente tinha dez.

   NÃO É SÓ UM REGISTO COMERCIAL. A entidade nasce com:

   - **número sequencial** (001, 002…), como na ficha completa e como no Piloto;
   - **conta corrente própria**, a próxima subconta da conta-mãe, gravada na
     ficha para os documentos seguintes;
   - a conta-mãe escolhida pela **categoria**.

   E «OUTROS DEVEDORES»/«OUTROS CREDORES» NÃO SÃO UM PAÍS. São contas a receber
   ou a pagar que não vêm de uma venda nem de uma compra. Deduzi-las da morada
   era impossível: o titular é de cá na mesma. Por isso a escolha é explícita e
   não sai do campo do país.

   A FICHA COMPLETA CONTINUA A EXISTIR. Aqui pede-se o mínimo; o resto —
   moradas, condições, crédito, bancos — preenche-se depois, sem pressa e sem
   um documento à espera.
--------------------------------------------------------------------------- */

/** As três categorias do plano PGC-AR. As contas mudam conforme o lado. */
export type Categoria = "nacional" | "estrangeiro" | "outros";

export interface TerceiroCriado {
  id: string;
  numero: string;
  nome: string;
  nif: string | null;
  pais: string;
  conta: string;
  categoria_conta: Categoria;
}

/** O que distingue o lado dos clientes do lado dos fornecedores. */
export interface LadoDoTerceiro {
  /** «cliente» ou «fornecedor», para os textos. */
  singular: string;
  /** Título da janela. */
  titulo: string;
  rota: string;
  /** A nota de cada opção — a conta e o que ela significa. */
  contas: Record<Categoria, string>;
  /** Como se chama a terceira categoria deste lado. */
  rotuloOutros: string;
}

export const LADO_CLIENTE: LadoDoTerceiro = {
  singular: "cliente",
  titulo: "Novo cliente",
  rota: "/api/comercial/clientes/rapido",
  contas: {
    nacional: "Conta 31121 · Clientes nacionais",
    estrangeiro: "Conta 31122 · Clientes estrangeiros",
    outros: "Conta 3791 · Não vem de uma venda",
  },
  rotuloOutros: "Outro devedor",
};

export const LADO_FORNECEDOR: LadoDoTerceiro = {
  singular: "fornecedor",
  titulo: "Novo fornecedor",
  rota: "/api/compras/fornecedores/rapido",
  contas: {
    nacional: "Conta 32121 · Fornecedores nacionais",
    estrangeiro: "Conta 32221 · Fornecedores estrangeiros",
    outros: "Conta 3792 · Não vem de uma compra",
  },
  rotuloOutros: "Outro credor",
};

export function CriarTerceiroRapido({
  lado,
  nomeInicial = "",
  aoFechar,
  aoCriar,
}: {
  lado: LadoDoTerceiro;
  /** O que a pessoa já tinha escrito na pesquisa — não se perde. */
  nomeInicial?: string;
  aoFechar: () => void;
  aoCriar: (t: TerceiroCriado) => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [nif, setNif] = useState("");
  const [telefone, setTelefone] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("nacional");
  const [pais, setPais] = useState("Angola");
  const [erro, setErro] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setACriar(true);
    try {
      const t = await api.post<TerceiroCriado>(lado.rota, {
        nome: nome.trim(),
        nif: nif.trim() || null,
        telefone: telefone.trim() || null,
        // O país continua a ir na ficha; a conta é decidida pela categoria.
        pais:
          categoria === "estrangeiro" ? pais.trim() || "Estrangeiro" : "Angola",
        categoria_conta: categoria,
      });
      aoCriar(t);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : `Não foi possível criar o ${lado.singular}.`,
      );
    } finally {
      setACriar(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {lado.titulo}
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

          <form onSubmit={submeter} className="flex flex-col gap-4 px-5 py-4">
            <p className="text-[13px] leading-relaxed text-texto-suave">
              O {lado.singular} fica criado com <b>número próprio</b> e{" "}
              <b>conta corrente</b> na contabilidade. O resto da ficha —
              moradas, condições, crédito — preenche-se depois.
            </p>

            <Campo rotulo="Nome">
              <Entrada
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Empresa, Lda. ou nome da pessoa"
                required
                autoFocus
              />
            </Campo>

            {/* A CATEGORIA DECIDE A CONTA CONTABILÍSTICA, e fica à vista em vez
                de escondida num campo «país»: é uma decisão de contabilidade,
                não um dado de morada. */}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold">Categoria</span>
              <div className="grid gap-2 sm:grid-cols-3">
                <Escolha
                  activo={categoria === "nacional"}
                  icone={<MapPin size={16} />}
                  titulo="Nacional"
                  nota={lado.contas.nacional}
                  aoEscolher={() => {
                    setCategoria("nacional");
                    setPais("Angola");
                  }}
                />
                <Escolha
                  activo={categoria === "estrangeiro"}
                  icone={<Globe size={16} />}
                  titulo="Estrangeiro"
                  nota={lado.contas.estrangeiro}
                  aoEscolher={() => {
                    setCategoria("estrangeiro");
                    setPais("");
                  }}
                />
                <Escolha
                  activo={categoria === "outros"}
                  icone={<Landmark size={16} />}
                  titulo={lado.rotuloOutros}
                  nota={lado.contas.outros}
                  aoEscolher={() => {
                    setCategoria("outros");
                    setPais("Angola");
                  }}
                />
              </div>
            </div>

            {categoria === "estrangeiro" && (
              <Campo rotulo="País" dica={`Fica na ficha do ${lado.singular}.`}>
                <Entrada
                  value={pais}
                  onChange={(e) => setPais(e.target.value)}
                  placeholder="Portugal, Brasil, África do Sul…"
                />
              </Campo>
            )}

            <CampoNif
              rotulo="NIF"
              valor={nif}
              aoMudar={setNif}
              aoConfirmar={(r) => {
                if (r.nome && !nome.trim()) setNome(r.nome);
                setNif(r.nif);
              }}
              dica="Opcional. Confirme na AGT para trazer o nome registado."
            />

            <Campo rotulo="Telefone" dica="Opcional.">
              <Entrada
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="+244 900 000 000"
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <div className="flex justify-end gap-2 pt-1">
              <Botao type="button" variante="contorno" onClick={aoFechar}>
                Cancelar
              </Botao>
              <Botao
                type="submit"
                variante="primario"
                disabled={aCriar || !nome.trim()}
                motivoBloqueio={
                  !nome.trim()
                    ? `Escreva o nome do ${lado.singular}.`
                    : aCriar
                      ? "A criar — aguarde."
                      : undefined
                }
              >
                {aCriar ? "A criar…" : "Criar e usar"}
              </Botao>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Escolha({
  activo,
  icone,
  titulo,
  nota,
  aoEscolher,
}: {
  activo: boolean;
  icone: ReactNode;
  titulo: string;
  nota: string;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={activo}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
        activo
          ? "border-marca bg-marca/[0.07]"
          : "border-borda hover:border-marca",
      )}
    >
      <span
        className={cn("mt-0.5", activo ? "text-marca" : "text-texto-suave")}
      >
        {icone}
      </span>
      <span>
        <span className="block text-[13.5px] font-bold">{titulo}</span>
        <span className="tabular mt-0.5 block text-[11.5px] text-texto-suave">
          {nota}
        </span>
      </span>
    </button>
  );
}
