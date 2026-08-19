"use client";

import { Globe, MapPin, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useState } from "react";
import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { CampoNif } from "@/components/ui/CampoNif";
import { api, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Criar um cliente sem sair da facturação.

   O caso é concreto: descobre-se a meio de uma factura que o cliente não está
   registado. Mandar a pessoa a Comercial → Clientes é fazê-la perder o
   documento que estava a preencher.

   NÃO É SÓ UM REGISTO COMERCIAL. O cliente nasce com:

   - **número sequencial** (001, 002…), como na ficha completa e como no Piloto;
   - **conta corrente própria**, a próxima subconta da conta-mãe — `31121001`,
     `31121002`… — gravada na ficha para os documentos seguintes;
   - a conta-mãe escolhida pela **nacionalidade**: `31121 Nacionais` ou
     `31122 Estrangeiros`, que são as duas contas que o plano PGC-AR traz.

   Essa última parte não existia. O Piloto tem as duas contas no plano e o campo
   do país na ficha, mas usa sempre a dos nacionais — um cliente estrangeiro
   ficava na conta dos nacionais e o balancete dizia que a empresa não tinha
   clientes estrangeiros.

   A FICHA COMPLETA CONTINUA A EXISTIR. Aqui pede-se o mínimo; o resto —
   moradas, condições, crédito, bancos — preenche-se depois, sem pressa e sem
   uma factura à espera.
--------------------------------------------------------------------------- */

export interface ClienteCriado {
  id: string;
  numero: string;
  nome: string;
  nif: string | null;
  pais: string;
  conta: string;
  nacional: boolean;
}

export function CriarClienteRapido({
  nomeInicial = "",
  aoFechar,
  aoCriar,
}: {
  /** O que a pessoa já tinha escrito na pesquisa — não se perde. */
  nomeInicial?: string;
  aoFechar: () => void;
  aoCriar: (c: ClienteCriado) => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [nif, setNif] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nacional, setNacional] = useState(true);
  const [pais, setPais] = useState("Angola");
  const [erro, setErro] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setACriar(true);
    try {
      const c = await api.post<ClienteCriado>(
        "/api/comercial/clientes/rapido",
        {
          nome: nome.trim(),
          nif: nif.trim() || null,
          telefone: telefone.trim() || null,
          pais: nacional ? "Angola" : pais.trim() || "Estrangeiro",
        },
      );
      aoCriar(c);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível criar o cliente.",
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
              Novo cliente
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
              O cliente fica criado com <b>número próprio</b> e{" "}
              <b>conta corrente</b> na contabilidade. O resto da ficha —
              moradas, condições, crédito — preenche-se depois em Comercial →
              Clientes.
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

            {/* NACIONAL OU ESTRANGEIRO — decide a conta contabilística.
                Fica à vista e não escondido num campo «país» qualquer, porque
                é uma decisão contabilística e não um dado de morada. */}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold">Origem</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <Escolha
                  activo={nacional}
                  icone={<MapPin size={16} />}
                  titulo="Nacional"
                  nota="Conta 31121 · Clientes nacionais"
                  aoEscolher={() => {
                    setNacional(true);
                    setPais("Angola");
                  }}
                />
                <Escolha
                  activo={!nacional}
                  icone={<Globe size={16} />}
                  titulo="Estrangeiro"
                  nota="Conta 31122 · Clientes estrangeiros"
                  aoEscolher={() => {
                    setNacional(false);
                    setPais("");
                  }}
                />
              </div>
            </div>

            {!nacional && (
              <Campo rotulo="País" dica="Fica na ficha do cliente.">
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
                    ? "Escreva o nome do cliente."
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
  icone: React.ReactNode;
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
