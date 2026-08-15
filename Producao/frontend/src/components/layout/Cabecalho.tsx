"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { Fragment, useMemo, useState } from "react";

import { EtiquetaExercicio } from "@/components/layout/EtiquetaExercicio";
import { iconeNav } from "@/components/layout/iconesNav";
import { Notificacoes } from "@/components/layout/Notificacoes";
import { useAuth } from "@/contexts/AuthContext";
import { useTema } from "@/contexts/TemaContext";
import {
  type GrupoNav,
  grupoDaRota,
  type ItemNav,
  itemActivo,
  NAV,
} from "@/lib/navegacao";
import { cn } from "@/lib/utils";
import type { Modulo } from "@/types";

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
  const { utilizador, empresa, pode, moduloAtivo, sair } = useAuth();
  const { tema, alternar } = useTema();
  const [menuAberto, setMenuAberto] = useState(false);

  const itemVisivel = useMemo(
    () => (item: ItemNav) => {
      if (item.perfis?.length) {
        const p = utilizador?.perfil;
        return (
          !!p &&
          (item.perfis.includes(p) ||
            (p === "superadmin" && item.perfis.includes("admin")))
        );
      }
      return item.cap ? pode(item.cap) : true;
    },
    [utilizador, pode],
  );

  const grupoVisivel = useMemo(
    () => (g: GrupoNav) => {
      // Uma conta de administração da plataforma não pertence a empresa
      // nenhuma. Oferecer-lhe Contabilidade ou RH era oferecer portas que dão
      // para uma parede: essas rotas consultam dados de uma empresa e
      // respondem 400 a quem não tem nenhuma.
      if (utilizador && !utilizador.empresa_id) return Boolean(g.daPlataforma);
      if (g.modulo && !moduloAtivo(g.modulo as Modulo)) return false;
      if (g.filhos) return g.filhos.some(itemVisivel);
      if (g.perfis?.length) {
        const p = utilizador?.perfil;
        return (
          !!p &&
          (g.perfis.includes(p) ||
            (p === "superadmin" && g.perfis.includes("admin")))
        );
      }
      return true;
    },
    [moduloAtivo, itemVisivel, utilizador],
  );

  const grupos = useMemo(() => NAV.filter(grupoVisivel), [grupoVisivel]);
  const grupoActivo = grupoDaRota(caminho);

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
    <header className="sticky top-0 z-40 border-b border-borda bg-superficie shadow-suave">
      {/* --- Fila de cima: marca, empresa, pessoa ------------------------ */}
      <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-5 pb-2 pt-2.5">
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

        <div className="ml-auto flex min-w-0 items-center gap-2.5">
          {empresa && (
            // Nome de empresa vem de dados: precisa de largura máxima e
            // truncate, senão empurra o resto do cabeçalho (docs/LESSONS.md).
            <span className="hidden max-w-[220px] truncate rounded-full border border-borda bg-superficie-2 px-3 py-1.5 text-[12.5px] font-semibold text-texto-suave md:block">
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
            className="flex size-[38px] items-center justify-center rounded-[10px] border border-borda bg-superficie-2 text-texto transition-colors hover:border-acento"
          >
            {tema === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {utilizador && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex max-w-[220px] items-center gap-2 rounded-full border border-borda bg-superficie-2 py-[5px] pl-[5px] pr-3 text-left transition-colors hover:border-acento"
                >
                  <span
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                    style={{
                      background: COR_PERFIL[utilizador.perfil] ?? "#555",
                    }}
                  >
                    {iniciais}
                  </span>
                  <span className="hidden min-w-0 flex-col leading-[1.1] md:flex">
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

          {/* Menu lateral, abaixo de lg. */}
          <Dialog.Root open={menuAberto} onOpenChange={setMenuAberto}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Abrir menu"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-borda bg-superficie-2 lg:hidden"
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

      {/* --- Fila de baixo: para onde se vai --------------------------- */}
      <nav className="mx-auto hidden max-w-[1360px] items-center gap-1 overflow-x-auto px-5 pb-1.5 lg:flex">
        {grupos.map((g) => {
          const activo =
            g === grupoActivo || (g.href && itemActivo(caminho, g.href));
          return (
            <Link
              key={g.rotulo}
              href={hrefDoGrupo(g)}
              className={cn(
                // A marca do separador activo é uma barra em baixo e não um
                // fundo: numa fila própria, o sublinhado diz onde se está sem
                // partir a linha em caixas.
                "relative whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors",
                activo
                  ? "text-marca after:absolute after:inset-x-2 after:-bottom-[1.5px] after:h-[3px] after:rounded-full after:bg-marca after:content-['']"
                  : "text-texto-suave hover:bg-superficie-2 hover:text-marca",
              )}
            >
              {g.rotulo}
            </Link>
          );
        })}
      </nav>

      {grupoActivo?.filhos && (
        <Ribbon grupo={grupoActivo} visivel={itemVisivel} />
      )}
    </header>
  );
}

/**
 * Sub-barra do módulo activo, agrupada por secção — o "ribbon" do Piloto.
 * Rola na horizontal em ecrãs estreitos, dentro do seu próprio contentor.
 */
function Ribbon({
  grupo,
  visivel,
}: {
  grupo: GrupoNav;
  visivel: (i: ItemNav) => boolean;
}) {
  const caminho = usePathname();
  const itens = (grupo.filhos ?? []).filter(visivel);
  if (!itens.length) return null;

  const seccoes: { nome: string; itens: ItemNav[] }[] = [];
  for (const item of itens) {
    let s = seccoes.find((x) => x.nome === item.seccao);
    if (!s) {
      s = { nome: item.seccao, itens: [] };
      seccoes.push(s);
    }
    s.itens.push(item);
  }

  // `justify-center` com `min-w-max` por dentro: quando a faixa cabe, fica
  // centrada; quando não cabe, o `min-w-max` manda e a barra de scroll aparece
  // em vez de espremer os botões. Sem o `justify-center`, um módulo com poucos
  // separadores ficava encostado à esquerda com meio ecrã vazio à direita.
  return (
    <div className="sem-imprimir flex justify-center overflow-x-auto border-t border-borda bg-superficie-2">
      <div className="flex w-full max-w-[1360px] items-stretch whitespace-nowrap px-2 pb-0.5 pt-1.5">
        {seccoes.map((s, i) => (
          <Fragment key={s.nome}>
            {i > 0 && (
              <span aria-hidden className="mx-px mb-5 mt-1 w-px bg-borda" />
            )}
            {/* Coluna por secção: os botões em cima, o rótulo da secção por
                baixo com um traço a separar — a forma do ribbon do Piloto. */}
            <div className="flex grow flex-col items-center px-1">
              <div className="flex w-full flex-1 items-start justify-center gap-0.5">
                {s.itens.map((item) => {
                  const activo = itemActivo(caminho, item.href);
                  const traco = iconeNav(item.icone);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.rotulo}
                      className={cn(
                        "flex min-w-[60px] max-w-[92px] flex-1 flex-col items-center justify-start gap-[2px] rounded-lg px-0.5 py-1 text-center transition-colors",
                        activo
                          ? "gradiente-marca text-white"
                          : "hover:bg-superficie",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-[clamp(21px,1.7vw,26px)] items-center justify-center",
                          activo
                            ? "text-white"
                            : "text-texto-suave group-hover:text-acento",
                        )}
                      >
                        {traco ? (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="size-[clamp(19px,1.5vw,23px)] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]"
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado SVG constante do nosso próprio iconesNav.ts — não há entrada de utilizador neste caminho.
                            dangerouslySetInnerHTML={{ __html: traco }}
                          />
                        ) : (
                          <span className="size-[clamp(19px,1.5vw,23px)]" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "w-full whitespace-normal text-[clamp(10.5px,0.82vw,12px)] font-semibold leading-[1.12]",
                          activo ? "text-white" : "text-texto-suave",
                        )}
                      >
                        {item.rotulo}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-0.5 w-full border-t border-borda pb-0.5 pt-[3px] text-center text-[clamp(9.5px,0.72vw,11px)] font-bold uppercase tracking-[0.6px] text-texto-suave">
                {s.nome}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
