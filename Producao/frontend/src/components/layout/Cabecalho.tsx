"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { EtiquetaExercicio } from "@/components/layout/EtiquetaExercicio";
import { Notificacoes } from "@/components/layout/Notificacoes";
import { useAuth } from "@/contexts/AuthContext";
import {
  ID_DAS_ACCOES,
  useCabecalhoDaPagina,
} from "@/contexts/CabecalhoDaPagina";
import { useTema } from "@/contexts/TemaContext";
import { type GrupoNav, grupoDaRota, itemActivo } from "@/lib/navegacao";
import { useNavegacaoVisivel } from "@/lib/navegacaoVisivel";
import { cn } from "@/lib/utils";

const COR_PERFIL: Record<string, string> = {
  superadmin: "#6c2fb0",
  admin: "#c0392b",
  contabilista: "#2c3e50",
  financeiro: "#1f7a44",
  comercial: "#2980b9",
  logistica: "#d68910",
  rh: "#16a085",
  consulta: "#8a8a8a",
};

const ROTULO_PERFIL: Record<string, string> = {
  superadmin: "Super Administrador",
  admin: "Administrador",
  contabilista: "Contabilista",
  financeiro: "Tesouraria",
  comercial: "Comercial",
  logistica: "Logística",
  rh: "Recursos Humanos",
  consulta: "Consulta",
};

export function Cabecalho() {
  const caminho = usePathname();
  const { utilizador, empresa, sair } = useAuth();
  const { tema, alternar } = useTema();
  const [menuAberto, setMenuAberto] = useState(false);

  /*
   * A altura real do cabeçalho, publicada em `--altura-cabecalho`.
   *
   * As páginas que ocupam o ecrã todo — o assistente é a primeira — precisam de
   * saber quanto sobra. Estava escrito à mão («100vh − 140px»), um número que
   * já não batia certo com o cabeçalho de duas filas e que passaria a estar
   * errado das duas maneiras assim que ele recolhesse. Medido, está sempre
   * certo: com faixa, sem faixa, recolhido ou aberto.
   */
  const barra = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const publicar = () =>
      document.documentElement.style.setProperty(
        "--altura-cabecalho",
        `${el.offsetHeight}px`,
      );
    publicar();
    const observador = new ResizeObserver(publicar);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // As mesmas regras que o acesso rápido do assistente usa — uma cópia só
  // (`lib/navegacaoVisivel.ts`), para a barra e o atalho nunca discordarem.
  const { grupos, itemVisivel } = useNavegacaoVisivel();
  const pagina = useCabecalhoDaPagina();
  const _grupoActivo = grupoDaRota(caminho);

  const iniciais =
    utilizador?.nome
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "";

  function hrefDoGrupo(g: GrupoNav): string {
    if (g.href) return g.href;
    const primeiro = g.filhos?.find(itemVisivel);
    return primeiro?.href ?? "#";
  }

  return (
    /*
     * DUAS FILAS, e não uma.
     *
     * Numa fila só, a navegação ficava espremida entre o logótipo e as acções
     * e quebrava para três linhas com onze módulos — a mais feia das soluções,
     * porque as linhas seguintes ficavam ocas do lado direito.
     *
     * Em cima fica QUEM: a marca, a empresa e a pessoa. Em baixo fica ONDE: a
     * navegação, com a largura toda. São as duas perguntas que o cabeçalho
     * responde, e cada uma tem agora o seu sítio.
     *
     * É um desvio ao Piloto, que tem tudo numa fila, e foi pedido.
     */
    <header
      ref={barra}
      className="sticky top-0 z-40 border-b border-borda bg-superficie shadow-suave"
    >
      {/* --- Fila de cima: marca, empresa, pessoa ------------------------
          É a fila que NUNCA desaparece. Recolhido, encolhe — o logótipo, o
          exercício, o sino, o tema, o perfil e a seta ficam sempre à mão. */}
      <div
        className={cn(
          "mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2 px-5",
          "xl:flex-nowrap",
          "pb-2 pt-2.5",
        )}
      >
        {/* O texto por baixo do símbolo: dizer «SGD» duas vezes lado a lado
            era redundante e é o que fazia o canto parecer desarrumado. */}
        <Link
          href="/painel"
          className="flex shrink-0 flex-col items-start leading-none"
        >
          <span className="gradiente-marca rounded-lg px-2.5 py-1 text-[22px] font-black leading-none tracking-[-1px] text-white">
            SGD
          </span>
          <span className="mt-1 hidden text-[8px] tracking-[1.6px] text-texto-suave sm:block">
            SOFTWARE DE GESTÃO DIRIGIDA
          </span>
        </Link>

        {/* --- ONDE ESTAMOS -------------------------------------------------
            O título da página e a frase que a explica, ao lado do logótipo.

            VIVIAM NO CORPO DA PÁGINA, numa faixa de 79 px com o nome em 26 px
            e um risco a fechar — repetida em cinquenta e sete ecrãs. Num
            portátil de 1366×768 era um décimo do ecrã gasto a dizer onde já se
            está, enquanto esta faixa da barra estava vazia.

            A DESCRIÇÃO SÓ APARECE COM LARGURA PARA ELA. Abaixo de 1280 px o
            título fica sozinho: entre saber onde se está e ler a explicação do
            ecrã, é o nome que não pode faltar. */}
        {pagina && (
          <div className="ml-4 min-w-0 flex-1 border-l border-borda pl-4">
            <h1 className="truncate text-[17px] font-bold leading-tight tracking-[-0.2px]">
              {pagina.titulo}
            </h1>
            {pagina.descricao && (
              <p className="hidden truncate text-[12px] leading-tight text-texto-suave xl:block">
                {pagina.descricao}
              </p>
            )}
          </div>
        )}

        {/* OS BOTÕES DA PÁGINA, à esquerda do que é da aplicação: «Novo
            documento» pertence ao ecrã, o sino e o perfil pertencem a quem
            está sentado. Misturá-los punha o utilizador a procurar o botão
            de gravar entre as notificações.

            ABAIXO DE `xl` DESCEM PARA UMA LINHA SÓ DELES. Não são um número
            fixo de botões: são conteúdo da página, variam de ecrã para ecrã, e
            há ecrãs com três. Na mesma fila que a empresa, o exercício, o sino
            e o perfil, empurravam a barra para fora do ecrã em tablet e em
            telemóvel — a página ganhava deslocação horizontal.

            `empty:hidden` porque a maioria das páginas não tem botões
            nenhuns, e sem isso ganhavam todas uma linha vazia. */}
        <div
          id={ID_DAS_ACCOES}
          className={cn(
            "order-last flex w-full min-w-0 items-center gap-2",
            "empty:hidden xl:order-none xl:w-auto xl:shrink-0",
          )}
        />

        {/* O que é da aplicação NÃO ENCOLHE: com `min-w-0` a fila cedia
            largura que os filhos não sabiam ceder, e o conteúdo saía por
            fora em vez de a fila se reorganizar. */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5 xl:min-w-0 xl:shrink">
          {/* Um risco a separar o que é da página do que é da aplicação —
              só quando estão mesmo lado a lado. */}
          <span
            aria-hidden
            className="mx-0.5 hidden h-6 w-px shrink-0 bg-borda xl:block"
          />

          {empresa && (
            // Nome de empresa vem de dados: precisa de largura máxima e
            // truncate, senão empurra o resto do cabeçalho (docs/LESSONS.md).
            <span className="hidden max-w-[220px] truncate rounded-full border border-borda bg-superficie-2 px-3 py-1.5 text-[12.5px] font-semibold text-texto-suave lg:block">
              {empresa.nome}
            </span>
          )}

          {/* O exercício activo, como no Piloto — mas este abre. Ligado ao
              utilizador ter empresa e não a termos a ficha dela: uma conta da
              plataforma não tem exercícios, um contabilista tem. */}
          {utilizador?.empresa_id && <EtiquetaExercicio />}

          {/* O sino do Piloto. Lá é uma casca — nada no Piloto cria uma
              notificação. Aqui as notificações nascem das operações. */}
          {utilizador?.empresa_id && <Notificacoes />}

          <button
            type="button"
            onClick={alternar}
            aria-label={
              tema === "dark"
                ? "Mudar para tema claro"
                : "Mudar para tema escuro"
            }
            className={cn(
              "flex items-center justify-center rounded-[10px] border border-borda bg-superficie-2 text-texto transition-colors hover:border-acento",
              "size-[38px]",
            )}
          >
            {tema === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {utilizador && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex max-w-[220px] items-center gap-2 rounded-full border border-borda bg-superficie-2 py-[5px] pl-[5px] pr-3 text-left transition-colors hover:border-acento",
                  )}
                >
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white",
                      "size-[30px]",
                    )}
                    style={{
                      background: COR_PERFIL[utilizador.perfil] ?? "#555",
                    }}
                  >
                    {iniciais}
                  </span>
                  <span className="hidden min-w-0 flex-col leading-[1.1] lg:flex">
                    <b className="truncate text-[13px]">{utilizador.nome}</b>
                    <small className="truncate text-[11px] text-texto-suave">
                      {ROTULO_PERFIL[utilizador.perfil] ?? utilizador.perfil}
                    </small>
                  </span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[220px] rounded-xl border border-borda bg-superficie p-1.5 shadow-forte"
                >
                  <div className="border-b border-borda px-3 py-2">
                    <div className="truncate text-[13px] font-bold">
                      {utilizador.nome}
                    </div>
                    <div className="truncate text-[11.5px] text-texto-suave">
                      {utilizador.email}
                    </div>
                  </div>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/perfil"
                      className="block cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-superficie-2"
                    >
                      O meu perfil
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={sair}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm text-perigo outline-none data-[highlighted]:bg-perigo/10"
                  >
                    Terminar sessão
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}

          {/* Menu lateral: abaixo de `lg`, onde a coluna da esquerda não
              existe. É a única forma de navegar num ecrã estreito. */}
          <Dialog.Root open={menuAberto} onOpenChange={setMenuAberto}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Abrir menu"
                className={cn(
                  "flex items-center justify-center rounded-[10px] border border-borda bg-superficie-2",
                  "size-[38px] lg:hidden",
                )}
              >
                <Menu size={18} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(320px,88vw)] flex-col overflow-y-auto bg-superficie shadow-forte">
                <div className="flex items-center justify-between border-b border-borda px-4 py-3">
                  <Dialog.Title className="text-sm font-bold">
                    Navegação
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Fechar menu"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda"
                    >
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>
                <nav className="flex flex-col gap-1 p-3">
                  {grupos.map((g) => (
                    <div key={g.rotulo} className="mb-1">
                      <Link
                        href={hrefDoGrupo(g)}
                        onClick={() => setMenuAberto(false)}
                        className="block rounded-lg px-3 py-2 text-sm font-bold text-marca"
                      >
                        {g.rotulo}
                      </Link>
                      {g.filhos && (
                        <div className="ml-2 flex flex-col border-l border-borda pl-2">
                          {g.filhos.filter(itemVisivel).map((f) => (
                            <Link
                              key={f.href}
                              href={f.href}
                              onClick={() => setMenuAberto(false)}
                              className={cn(
                                "truncate rounded-lg px-3 py-1.5 text-[13px]",
                                itemActivo(caminho, f.href)
                                  ? "bg-superficie-2 font-semibold text-marca"
                                  : "text-texto-suave",
                              )}
                            >
                              {f.rotulo}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
