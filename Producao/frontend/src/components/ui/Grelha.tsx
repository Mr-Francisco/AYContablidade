"use client";

import { ArrowDownAZ, ArrowUpAZ, Filter, Search, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Grelha com filtro e ordenação por coluna — o padrão do Primavera.

   O QUE SE PEDIU, e está nas imagens: uma linha de filtros por baixo dos
   títulos, onde se escreve e a tabela filtra à medida que se escreve; e um
   menu no título com ordenar ascendente, descendente e limpar a ordenação.

   TRÊS DECISÕES QUE VALE A PENA CONHECER:

   **O filtro está SEMPRE à vista**, numa linha própria. Escondê-lo atrás de um
   ícone poupa trinta pixels e custa um clique em cada utilização — e este é um
   gesto que se repete o dia inteiro. É também o que a imagem mostra.

   **Filtra à medida que se escreve, sem botão.** A filtragem usa
   `useDeferredValue`: o que se escreve aparece no campo de imediato e o
   recálculo da lista acontece a seguir, sem prender o teclado. Com poucas
   centenas de linhas é instantâneo; com milhares, o campo continua a responder
   enquanto a lista alcança.

   **Ordena por tipo e não por texto.** `1000` vem depois de `999` num número e
   antes num texto. A coluna diz o que é, e é isso que decide a comparação.
--------------------------------------------------------------------------- */

export interface Coluna<T> {
  /** A chave da coluna. Serve de identificador do filtro e da ordenação. */
  chave: string;
  titulo: string;
  /** O que se lê na célula. */
  celula: (linha: T) => ReactNode;
  /** O que se filtra e se ordena. Sem isto, a coluna não filtra nem ordena —
   *  é o caso das colunas de acções. */
  valor?: (linha: T) => string | number | null | undefined;
  /** `numero` alinha à direita e ordena por grandeza. */
  tipo?: "texto" | "numero";
  largura?: string;
  className?: string;
}

type Ordem = { chave: string; ascendente: boolean } | null;

export function Grelha<T>({
  linhas,
  colunas,
  chaveDaLinha,
  aoAbrir,
  vazio = "Sem registos.",
  altura = 460,
  rodape,
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  chaveDaLinha: (linha: T, i: number) => string;
  /** Duplo clique numa linha. O gesto do Piloto para saltar ao detalhe. */
  aoAbrir?: (linha: T) => void;
  vazio?: ReactNode;
  altura?: number;
  rodape?: ReactNode;
}) {
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<Ordem>(null);

  // O QUE SE ESCREVE APARECE JÁ; a lista alcança a seguir. Sem isto, filtrar
  // mil linhas a cada tecla prendia o cursor no campo.
  const filtrosAdiados = useDeferredValue(filtros);

  const visiveis = useMemo(() => {
    const activos = Object.entries(filtrosAdiados).filter(([, v]) => v.trim());

    let r = linhas;
    if (activos.length) {
      const porChave = new Map(colunas.map((c) => [c.chave, c]));
      r = linhas.filter((linha) =>
        activos.every(([chave, termo]) => {
          const col = porChave.get(chave);
          if (!col?.valor) return true;
          const v = col.valor(linha);
          return String(v ?? "")
            .toLowerCase()
            .includes(termo.trim().toLowerCase());
        }),
      );
    }

    if (ordem) {
      const col = colunas.find((c) => c.chave === ordem.chave);
      if (col?.valor) {
        const sinal = ordem.ascendente ? 1 : -1;
        // Cópia: ordenar no sítio mexia na lista que veio de fora.
        r = [...r].sort((a, b) => {
          const va = col.valor?.(a);
          const vb = col.valor?.(b);
          // Vazios sempre no fim, suba ou desça a ordenação: uma coluna
          // ordenada que começa com dez linhas em branco não mostra nada.
          const av = va === null || va === undefined || va === "";
          const bv = vb === null || vb === undefined || vb === "";
          if (av && bv) return 0;
          if (av) return 1;
          if (bv) return -1;

          if (col.tipo === "numero") {
            return (Number(va) - Number(vb)) * sinal;
          }
          // `localeCompare` com `numeric`: «Conta 10» depois de «Conta 9», e
          // acentos comparados como em português.
          return (
            String(va).localeCompare(String(vb), "pt", {
              numeric: true,
              sensitivity: "base",
            }) * sinal
          );
        });
      }
    }
    return r;
  }, [linhas, colunas, filtrosAdiados, ordem]);

  const comFiltro = Object.values(filtros).some((v) => v.trim());

  return (
    <div className="flex min-w-0 flex-col">
      <div
        className="overflow-auto overscroll-contain"
        style={{ maxHeight: altura }}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-superficie-2">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  style={c.largura ? { width: c.largura } : undefined}
                  className={cn(
                    "border-b border-borda px-3 py-2 text-left text-[11.5px] font-bold uppercase tracking-[0.3px] text-texto-suave",
                    c.tipo === "numero" && "text-right",
                  )}
                >
                  {c.valor ? (
                    <MenuDaColuna
                      titulo={c.titulo}
                      ordem={ordem?.chave === c.chave ? ordem : null}
                      aoOrdenar={(ascendente) =>
                        setOrdem({ chave: c.chave, ascendente })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(filtros[c.chave]?.trim())}
                      aoLimparFiltro={() =>
                        setFiltros((f) => ({ ...f, [c.chave]: "" }))
                      }
                    />
                  ) : (
                    c.titulo
                  )}
                </th>
              ))}
            </tr>

            {/* A LINHA DOS FILTROS, sempre à vista. Escondê-la atrás de um
                ícone poupa trinta pixels e custa um clique em cada utilização
                — e isto usa-se o dia inteiro. */}
            <tr className="bg-superficie">
              {colunas.map((c) => (
                <th key={c.chave} className="border-b border-borda p-1">
                  {c.valor ? (
                    <div className="relative">
                      <Search
                        size={12}
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-texto-suave"
                      />
                      <input
                        value={filtros[c.chave] ?? ""}
                        onChange={(e) =>
                          setFiltros((f) => ({
                            ...f,
                            [c.chave]: e.target.value,
                          }))
                        }
                        placeholder="filtrar"
                        aria-label={`Filtrar por ${c.titulo}`}
                        className={cn(
                          "w-full rounded-md border border-borda bg-superficie py-1 pl-7 pr-2 text-[12px] font-normal outline-none placeholder:text-texto-suave/70 focus:border-acento",
                          c.tipo === "numero" && "text-right",
                        )}
                      />
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {!visiveis.length ? (
              <tr>
                <td
                  colSpan={colunas.length}
                  className="px-3 py-8 text-center text-texto-suave"
                >
                  {comFiltro ? (
                    <span className="flex flex-col items-center gap-2">
                      Nenhum registo corresponde aos filtros.
                      <button
                        type="button"
                        onClick={() => setFiltros({})}
                        className="text-[13px] font-semibold text-marca hover:underline"
                      >
                        Limpar filtros
                      </button>
                    </span>
                  ) : (
                    vazio
                  )}
                </td>
              </tr>
            ) : (
              visiveis.map((linha, i) => (
                <tr
                  key={chaveDaLinha(linha, i)}
                  onDoubleClick={aoAbrir ? () => aoAbrir(linha) : undefined}
                  title={aoAbrir ? "Duplo clique para abrir" : undefined}
                  className={cn(
                    "border-b border-borda/60",
                    aoAbrir && "cursor-pointer hover:bg-marca/[0.07]",
                  )}
                >
                  {colunas.map((c) => (
                    <td
                      key={c.chave}
                      className={cn(
                        "px-3 py-1.5",
                        c.tipo === "numero" && "tabular text-right",
                        c.className,
                      )}
                    >
                      {c.celula(linha)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-borda px-3 py-2 text-[12.5px] text-texto-suave">
        <span>
          {visiveis.length === linhas.length
            ? `${linhas.length} registos`
            : `${visiveis.length} de ${linhas.length} registos`}
        </span>
        {comFiltro && (
          <button
            type="button"
            onClick={() => setFiltros({})}
            className="inline-flex items-center gap-1 font-semibold text-marca hover:underline"
          >
            <X size={12} />
            Limpar filtros
          </button>
        )}
        {ordem && (
          <button
            type="button"
            onClick={() => setOrdem(null)}
            className="inline-flex items-center gap-1 font-semibold text-marca hover:underline"
          >
            <X size={12} />
            Limpar ordenação
          </button>
        )}
        <span className="flex-1" />
        {rodape}
      </div>
    </div>
  );
}

/** O menu do título: ordenar e limpar. Abre com o botão direito também, que é
 *  como se faz no Primavera. */
function MenuDaColuna({
  titulo,
  ordem,
  aoOrdenar,
  aoLimparOrdem,
  temFiltro,
  aoLimparFiltro,
}: {
  titulo: string;
  ordem: { ascendente: boolean } | null;
  aoOrdenar: (ascendente: boolean) => void;
  aoLimparOrdem: () => void;
  temFiltro: boolean;
  aoLimparFiltro: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          // Clique esquerdo alterna a ordenação — é o gesto mais usado e não
          // deve custar dois passos. O menu fica no botão direito, para o
          // resto.
          onClick={(e) => {
            e.preventDefault();
            aoOrdenar(ordem ? !ordem.ascendente : true);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.currentTarget.dispatchEvent(
              new PointerEvent("pointerdown", { bubbles: true }),
            );
          }}
          className="flex w-full items-center gap-1 text-left uppercase tracking-[0.3px] transition-colors hover:text-marca"
        >
          {titulo}
          {ordem &&
            (ordem.ascendente ? (
              <ArrowUpAZ size={13} className="text-marca" />
            ) : (
              <ArrowDownAZ size={13} className="text-marca" />
            ))}
          {temFiltro && <Filter size={11} className="text-acento" />}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[188px] rounded-xl border border-borda bg-superficie p-1 shadow-forte"
        >
          <Item
            icone={<ArrowUpAZ size={14} />}
            onSelect={() => aoOrdenar(true)}
          >
            Ordenar ascendente
          </Item>
          <Item
            icone={<ArrowDownAZ size={14} />}
            onSelect={() => aoOrdenar(false)}
          >
            Ordenar descendente
          </Item>
          <Item
            icone={<X size={14} />}
            onSelect={aoLimparOrdem}
            desactivado={!ordem}
          >
            Limpar ordenação
          </Item>
          <DropdownMenu.Separator className="my-1 h-px bg-borda" />
          <Item
            icone={<Filter size={14} />}
            onSelect={aoLimparFiltro}
            desactivado={!temFiltro}
          >
            Remover filtro
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  icone,
  children,
  onSelect,
  desactivado,
}: {
  icone: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  desactivado?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={desactivado}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal outline-none",
        desactivado
          ? "cursor-default text-texto-suave/50"
          : "hover:bg-marca/[0.07] focus:bg-marca/[0.07]",
      )}
    >
      <span className="text-texto-suave">{icone}</span>
      {children}
    </DropdownMenu.Item>
  );
}
