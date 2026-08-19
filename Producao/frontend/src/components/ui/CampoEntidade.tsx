"use client";

import { Plus, Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Botao, Entrada } from "@/components/ui";
import { buscador } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Um campo que representa uma ENTIDADE com tabela própria.

   O padrão vem do Piloto e já existia aqui para as contas (`CampoConta` e o
   `conta-picker.js` de lá): escreve-se o código e segue-se, ou carrega-se em
   **F4** e procura-se na tabela. Quem lança todos os dias sabe o código de cor;
   quem não sabe precisa de a ver.

   O QUE ISTO SUBSTITUI: listas de opções fechadas. Uma caixa com «Consumidor
   Final» e mais meia dúzia de nomes não é uma tabela de clientes — é uma lista
   que alguém escreveu à mão e que fica desactualizada no dia seguinte. E com
   trezentos clientes, mil artigos ou mil e seiscentas contas, uma lista de
   opções obriga a rolar para chegar ao que se procura.

   ESTE COMPONENTE NÃO SABE O QUE É UM CLIENTE. Recebe de onde ler, o que
   mostrar e por onde procurar; cada entidade traz a sua tabela. É a mesma
   experiência com dados diferentes, que é o que se pediu — e não um plano de
   contas disfarçado para tudo.
--------------------------------------------------------------------------- */

export interface Registo {
  id: string;
  /** O que se escreve no campo e identifica a linha: número, código, matrícula. */
  codigo: string;
  /** O nome que se lê. */
  nome: string;
  /** Uma linha de contexto, opcional: NIF, preço, unidade, saldo. */
  detalhe?: string;
}

export function CampoEntidade({
  valor,
  aoEscolher,
  fonte,
  titulo,
  placeholder,
  colunas,
  aoCriar,
  rotuloCriar,
  disabled,
  className,
  emGrelha,
  semBotao,
}: {
  /** O registo escolhido, ou `null`. */
  valor: Registo | null;
  aoEscolher: (r: Registo | null) => void;
  /** Endereço que devolve a tabela. Recebe `?procura=` quando se escreve. */
  fonte: string;
  /** «Clientes», «Artigos», «Vendedores» — o título da tabela de pesquisa. */
  titulo: string;
  placeholder?: string;
  /** Cabeçalhos da tabela, para a pesquisa não ser uma lista de nomes soltos. */
  colunas?: [string, string, string];
  /** Criar sem sair daqui. Sem isto, quem descobre a meio de uma factura que o
   *  cliente não existe tem de abandonar o documento. */
  aoCriar?: (termo: string) => void;
  rotuloCriar?: string;
  disabled?: boolean;
  className?: string;
  emGrelha?: boolean;
  semBotao?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const texto = valor ? `${valor.codigo} · ${valor.nome}` : "";

  return (
    <>
      <div className={cn("flex items-center gap-1.5", className)}>
        <input
          ref={campo}
          value={texto}
          readOnly
          disabled={disabled}
          placeholder={placeholder ?? `${titulo} (F4)`}
          title={`Carregue em F4 ou faça duplo clique para procurar em ${titulo}`}
          // F4 E DUPLO CLIQUE, como nas contas e como no Piloto. O campo é só
          // de leitura de propósito: o valor tem de vir da tabela, e deixar
          // escrever texto livre aqui era voltar a ter nomes que não
          // correspondem a registo nenhum.
          onKeyDown={(e) => {
            if (e.key === "F4" || (e.key === "Enter" && !valor)) {
              e.preventDefault();
              setAberto(true);
            }
            // Apagar limpa a escolha sem ter de abrir a tabela.
            if ((e.key === "Backspace" || e.key === "Delete") && valor) {
              e.preventDefault();
              aoEscolher(null);
            }
          }}
          onDoubleClick={() => !disabled && setAberto(true)}
          onClick={() => !disabled && !valor && setAberto(true)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer text-sm outline-none",
            emGrelha
              ? "w-full bg-transparent px-1 py-1"
              : "rounded-[10px] border border-borda bg-superficie px-3 py-2.5 focus:border-acento focus:ring-2 focus:ring-acento/25",
            disabled && "opacity-60",
          )}
        />

        {!semBotao && (
          <button
            type="button"
            onClick={() => setAberto(true)}
            disabled={disabled}
            title={`Procurar em ${titulo} (F4)`}
            className="flex h-[38px] shrink-0 items-center gap-1 rounded-[10px] border border-borda px-2.5 text-[11px] font-bold text-texto-suave transition-colors hover:border-marca hover:text-marca disabled:opacity-60"
          >
            F4
          </button>
        )}
      </div>

      {aberto && (
        <TabelaDePesquisa
          fonte={fonte}
          titulo={titulo}
          colunas={colunas}
          aoCriar={aoCriar}
          rotuloCriar={rotuloCriar}
          aoFechar={() => setAberto(false)}
          aoEscolher={(r) => {
            aoEscolher(r);
            setAberto(false);
            campo.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** A tabela, com pesquisa. Igual para todas as entidades. */
function TabelaDePesquisa({
  fonte,
  titulo,
  colunas = ["Código", "Nome", ""],
  aoFechar,
  aoEscolher,
  aoCriar,
  rotuloCriar,
}: {
  fonte: string;
  titulo: string;
  colunas?: [string, string, string];
  aoFechar: () => void;
  aoEscolher: (r: Registo) => void;
  aoCriar?: (termo: string) => void;
  rotuloCriar?: string;
}) {
  const [procura, setProcura] = useState("");
  const [marcada, setMarcada] = useState(0);

  const { data, isLoading } = useSWR<Registo[]>(
    `${fonte}${fonte.includes("?") ? "&" : "?"}procura=${encodeURIComponent(procura)}`,
    buscador,
    { keepPreviousData: true },
  );

  const linhas = useMemo(() => {
    const todas = data ?? [];
    // O servidor já filtra, mas nem todas as rotas o fazem — e filtrar aqui
    // também apanha o que o servidor devolveu antes de a procura mudar.
    const t = procura.trim().toLowerCase();
    if (!t) return todas;
    return todas.filter(
      (r) =>
        r.codigo.toLowerCase().includes(t) ||
        r.nome.toLowerCase().includes(t) ||
        (r.detalhe ?? "").toLowerCase().includes(t),
    );
  }, [data, procura]);

  // A LINHA MARCADA É LIMITADA NO DESENHO, não corrigida depois por um efeito.
  // Manter a décima marcada numa lista que passou a ter três é apontar para o
  // vazio; corrigi-lo num efeito mostrava a posição errada durante um
  // fotograma antes de saltar.
  const marcadaSegura = Math.min(marcada, Math.max(linhas.length - 1, 0));

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex max-h-[86vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
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

          <div className="border-b border-borda px-5 py-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              />
              <Entrada
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Procurar por código, nome ou descrição"
                className="pl-9"
                autoFocus
                // As setas percorrem a lista e o Enter escolhe, sem tirar as
                // mãos do teclado — é assim que se lança um documento inteiro.
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMarcada(Math.min(marcadaSegura + 1, linhas.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMarcada(Math.max(marcadaSegura - 1, 0));
                  }
                  if (e.key === "Enter" && linhas[marcadaSegura]) {
                    e.preventDefault();
                    aoEscolher(linhas[marcadaSegura]);
                  }
                }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && !data ? (
              <p className="px-5 py-8 text-center text-sm text-texto-suave">
                A carregar…
              </p>
            ) : !linhas.length ? (
              <SemResultados
                termo={procura}
                titulo={titulo}
                aoCriar={aoCriar}
                rotuloCriar={rotuloCriar}
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-superficie-2">
                  <tr>
                    {colunas.map((c) => (
                      <th
                        key={c}
                        className="px-5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-texto-suave"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => aoEscolher(r)}
                      onMouseEnter={() => setMarcada(i)}
                      className={cn(
                        "cursor-pointer border-b border-borda/60",
                        i === marcadaSegura
                          ? "bg-marca/[0.07]"
                          : "hover:bg-fundo",
                      )}
                    >
                      <td className="tabular px-5 py-2 font-semibold">
                        {r.codigo}
                      </td>
                      <td className="px-5 py-2">{r.nome}</td>
                      <td className="px-5 py-2 text-texto-suave">
                        {r.detalhe ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {aoCriar && linhas.length > 0 && (
            <div className="border-t border-borda px-5 py-3">
              <Botao
                type="button"
                variante="contorno"
                onClick={() => aoCriar(procura.trim())}
              >
                <Plus size={15} />
                {rotuloCriar ?? "Criar novo"}
              </Botao>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Não encontrou nada — e é aqui que criar faz mais falta.
 *
 *  Quem procura e não encontra está a meio de um documento. Mandá-lo a outro
 *  ecrã criar o registo é fazê-lo perder o que estava a preencher. */
function SemResultados({
  termo,
  titulo,
  aoCriar,
  rotuloCriar,
}: {
  termo: string;
  titulo: string;
  aoCriar?: (termo: string) => void;
  rotuloCriar?: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <p className="text-sm text-texto-suave">
        {termo
          ? `Não há nada em ${titulo} que corresponda a «${termo}».`
          : `Ainda não há registos em ${titulo}.`}
      </p>
      {aoCriar && (
        <Botao type="button" variante="primario" onClick={() => aoCriar(termo)}>
          <Plus size={15} />
          {rotuloCriar ?? "Criar novo"}
          {termo && ` — ${termo}`}
        </Botao>
      )}
    </div>
  );
}
