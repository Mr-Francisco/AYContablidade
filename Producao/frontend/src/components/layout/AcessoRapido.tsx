"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { useState } from "react";

import { iconeNav } from "@/components/layout/iconesNav";
import { useNavegacaoVisivel } from "@/lib/navegacaoVisivel";
import { cn } from "@/lib/utils";

/**
 * Acesso rápido aos módulos — o «+» no canto inferior direito.
 *
 * EM TODOS OS ECRÃS DE TRABALHO, e não só no assistente. Nasceu lá porque uma
 * resposta acaba quase sempre em «vai ver ao Balancete» ou «confirma na ficha
 * do cliente» — mas o caminho longo é o mesmo em qualquer página: subir ao
 * topo, abrir o módulo, escolher a página. Fica no `layout` da aplicação, uma
 * vez só, e acompanha o utilizador por onde ele andar.
 *
 * SÓ O QUE O UTILIZADOR PODE ABRIR. A lista não é uma segunda cópia das
 * permissões: vem de `useNavegacaoVisivel`, a mesma função que decide o que a
 * barra de topo mostra. Se um módulo não está na barra, não está aqui.
 */
/** O mesmo traçado da barra de topo, no tamanho da lista. */
function IconeDoItem({ traco }: { traco: string | null }) {
  if (!traco) return <span className="size-4 shrink-0" />;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0 fill-none stroke-current text-texto-suave [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado constante do nosso `iconesNav.ts` — não há entrada de utilizador neste caminho.
      dangerouslySetInnerHTML={{ __html: traco }}
    />
  );
}

export function AcessoRapido() {
  const { grupos, itemVisivel } = useNavegacaoVisivel();
  const [aberto, setAberto] = useState(false);

  // Só os grupos com páginas — «Painel» e «Configurações» são links directos e
  // já estão a um clique no topo.
  const comPaginas = grupos.filter((g) => g.filhos?.some(itemVisivel));
  if (!comPaginas.length) return null;

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            aberto ? "Fechar acesso rápido" : "Acesso rápido aos módulos"
          }
          className={cn(
            // ACIMA DA BARRA DOS MÓDULOS. Com os módulos em baixo, um botão
            // flutuante a 24 px do fundo ficava por cima deles — e o que se
            // carregava era o que estivesse por baixo.
            "sem-imprimir fixed right-6 z-40 flex size-12 items-center justify-center rounded-full",
            "bottom-[calc(var(--altura-modulos,0px)+1.5rem)]",
            "bg-[image:var(--gradiente-marca)] text-white shadow-forte",
            "transition-transform hover:-translate-y-0.5 active:translate-y-0",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
          )}
        >
          {aberto ? <X size={20} /> : <Plus size={22} />}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={16}
          className="z-40 flex max-h-[70vh] w-[min(340px,92vw)] flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
        >
          <div className="border-b border-borda px-4 py-2.5">
            <p className="text-[13px] font-bold">Ir para</p>
            <p className="text-[11.5px] text-texto-suave">
              Só os módulos a que tem acesso.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {comPaginas.map((g) => (
              <section key={g.rotulo} className="mb-1.5 last:mb-0">
                <h3 className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.6px] text-texto-suave">
                  {g.rotulo}
                </h3>
                <ul>
                  {(g.filhos ?? []).filter(itemVisivel).map((f) => (
                    <li key={f.href}>
                      <Link
                        href={f.href}
                        onClick={() => setAberto(false)}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-marca/10 hover:text-marca"
                      >
                        <IconeDoItem traco={iconeNav(f.icone)} />
                        <span className="min-w-0 truncate">{f.rotulo}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
