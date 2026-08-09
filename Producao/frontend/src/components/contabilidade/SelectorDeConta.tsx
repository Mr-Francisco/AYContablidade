"use client";

import { Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Selo } from "@/components/ui";
import { useContas } from "@/lib/hooks";
import {
  type ArvorePlano,
  CLASSES,
  construirArvore,
  ehMovimento,
  NATUREZAS,
  visiveisNaPesquisa,
} from "@/lib/plano";
import type { Conta } from "@/types";

/**
 * Selector de conta em árvore — o `conta-picker.js` do Piloto.
 *
 * Abre com **F4** ou **duplo clique** em qualquer campo de conta. É a
 * interacção mais usada de quem lança todos os dias: escrever `34521111` de cor
 * é para quem já sabe o plano, e quem não sabe precisa de o percorrer.
 *
 * As três regras que vêm do Piloto e que importa não perder:
 *
 *   1. **Só contas de movimento se escolhem** (salvo `soMovimento={false}`).
 *      Clicar numa integradora expande-a em vez de a escolher — porque uma
 *      integradora não recebe lançamentos, e o servidor recusaria.
 *   2. **A pesquisa mostra os ascendentes** do que encontra, senão os
 *      resultados apareciam pendurados fora do seu ramo.
 *   3. **`Enter` escolhe o primeiro** resultado, **`Esc` fecha**. Quem procura
 *      «banco» quer escrever quatro letras e carregar em Enter, não pegar no
 *      rato.
 */

interface Opcoes {
  /** `false` deixa escolher integradoras também. Por omissão só movimento. */
  soMovimento?: boolean;
  titulo?: string;
}

/**
 * Liga o selector a um campo.
 *
 * Devolve `props` para espalhar no `<input>` (F4 e duplo clique), `abrir` para
 * um botão «F4» visível, e `dialogo` para desenhar onde der jeito.
 */
export function useSelectorDeConta(
  aoEscolher: (codigo: string) => void,
  opcoes: Opcoes = {},
) {
  const [aberto, setAberto] = useState(false);
  const regressar = useRef<HTMLElement | null>(null);

  const abrir = useCallback(() => {
    // Guarda quem tinha o foco para lho devolver ao fechar: sem isto, fechar o
    // selector deixava o foco no corpo da página e o Tab recomeçava do início
    // do formulário.
    regressar.current = document.activeElement as HTMLElement | null;
    setAberto(true);
  }, []);

  const fechar = useCallback(() => {
    setAberto(false);
    // Adiado de propósito: o diálogo do Radix devolve o foco ao fechar, e faz
    // isso DEPOIS desta chamada. Focar já era desfeito logo a seguir, e quem
    // escolhesse a conta ficava sem foco no campo — o Tab recomeçava do
    // princípio do formulário em vez de saltar para o débito.
    requestAnimationFrame(() => regressar.current?.focus?.());
  }, []);

  const props = useMemo(
    () => ({
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === "F4") {
          e.preventDefault();
          abrir();
        }
      },
      onDoubleClick: abrir,
      title: "F4 ou duplo clique: procurar no plano de contas",
    }),
    [abrir],
  );

  const dialogo = aberto ? (
    <DialogoSelectorDeConta
      aoFechar={fechar}
      aoEscolher={(c) => {
        aoEscolher(c);
        fechar();
      }}
      {...opcoes}
    />
  ) : null;

  return { abrir, fechar, props, dialogo, aberto };
}

// ---------------------------------------------------------------------------
function DialogoSelectorDeConta({
  aoFechar,
  aoEscolher,
  soMovimento = true,
  titulo,
}: Opcoes & {
  aoFechar: () => void;
  aoEscolher: (codigo: string) => void;
}) {
  const { contas } = useContas();
  const [procura, setProcura] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoBusca.current?.focus();
  }, []);

  const arvore = useMemo(() => construirArvore(contas), [contas]);
  const visiveis = useMemo(
    () => visiveisNaPesquisa(contas, arvore, procura),
    [contas, arvore, procura],
  );

  // Tudo aberto por omissão, como no Piloto — guarda-se o que está FECHADO e
  // não o que está aberto. Com 1600 contas, começar fechado obrigava a
  // desdobrar quatro níveis para chegar a qualquer sítio. E durante uma
  // pesquisa está tudo aberto, senão o resultado ficava escondido no ramo.
  const aPesquisar = visiveis !== null;
  const estaAberto = useCallback(
    (chave: string) => aPesquisar || !fechados.has(chave),
    [aPesquisar, fechados],
  );

  function alternar(chave: string) {
    setFechados((f) => {
      const novo = new Set(f);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  const linhas = useMemo(
    () => achatar(contas, arvore, visiveis, estaAberto),
    [contas, arvore, visiveis, estaAberto],
  );

  const escolhiveis = linhas.filter(
    (l) => l.tipo === "conta" && (l.movimento || !soMovimento),
  );

  function aoTeclar(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      aoFechar();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const primeira = escolhiveis[0];
      if (primeira?.conta) aoEscolher(primeira.conta.codigo);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] flex max-h-[88vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo ??
                `Plano de Contas — escolher conta${soMovimento ? " (só contas de movimento)" : ""}`}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
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
              <input
                // O foco vai para aqui ao abrir (`ref` + efeito, mais abaixo):
                // o selector abre para se escrever, e pôr o foco noutro sítio
                // obrigava a um clique extra a cada utilização.
                ref={campoBusca}
                type="search"
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Pesquisar por código ou nome… (Enter escolhe · Esc fecha)"
                className="w-full rounded-lg border border-borda bg-fundo py-2 pl-9 pr-3 text-sm outline-none focus:border-marca"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-auto">
            {linhas.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-texto-suave">
                Sem contas para «{procura}».
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-superficie">
                  <tr className="border-b border-borda text-left">
                    <th className="w-[30%] px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-texto-suave">
                      Código
                    </th>
                    <th className="px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-texto-suave">
                      Designação
                    </th>
                    <th className="w-[110px] px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-texto-suave">
                      Natureza
                    </th>
                    <th className="w-[120px] px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-texto-suave">
                      Tipo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) =>
                    l.tipo === "classe" ? (
                      <tr
                        key={`cls-${l.classe}`}
                        className="cursor-pointer border-b border-borda bg-fundo hover:bg-fundo/70"
                        onClick={() => alternar(`cls-${l.classe}`)}
                      >
                        <td colSpan={4} className="px-4 py-2">
                          <span className="mr-1 inline-block w-3 text-texto-suave">
                            {estaAberto(`cls-${l.classe}`) ? "▾" : "▸"}
                          </span>
                          <b>
                            {l.classe} · {CLASSES[l.classe ?? ""] ?? ""}
                          </b>{" "}
                          <span className="text-[12.5px] text-texto-suave">
                            — {l.quantas} conta(s)
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <LinhaConta
                        key={l.conta?.id}
                        conta={l.conta as Conta}
                        nivel={l.nivel}
                        temFilhos={l.temFilhos}
                        aberto={estaAberto((l.conta as Conta).codigo)}
                        movimento={l.movimento}
                        escolhivel={l.movimento || !soMovimento}
                        aoAlternar={() => alternar((l.conta as Conta).codigo)}
                        aoEscolher={() => aoEscolher((l.conta as Conta).codigo)}
                      />
                    ),
                  )}
                </tbody>
              </table>
            )}
          </div>

          <p className="border-t border-borda px-5 py-3 text-[13px] text-texto-suave">
            {soMovimento
              ? "Só contas de movimento podem ser escolhidas — clique numa integradora para a expandir."
              : "Pode escolher qualquer conta, integradora ou de movimento."}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
function LinhaConta({
  conta,
  nivel,
  temFilhos,
  aberto,
  movimento,
  escolhivel,
  aoAlternar,
  aoEscolher,
}: {
  conta: Conta;
  nivel: number;
  temFilhos: boolean;
  aberto: boolean;
  movimento: boolean;
  escolhivel: boolean;
  aoAlternar: () => void;
  aoEscolher: () => void;
}) {
  const nat = NATUREZAS[conta.natureza] ?? NATUREZAS.M;
  return (
    <tr
      className={`border-b border-borda ${
        escolhivel
          ? "cursor-pointer hover:bg-marca/10"
          : "cursor-pointer text-texto-suave hover:bg-fundo/60"
      }`}
      title={
        escolhivel
          ? "Escolher esta conta"
          : "Integradora — não recebe lançamentos; escolha uma subconta"
      }
      // Uma integradora não se escolhe: clicar nela expande-a. É o que o
      // Piloto faz, e poupa o clique certeiro no triângulo.
      onClick={() => (escolhivel ? aoEscolher() : temFilhos && aoAlternar())}
    >
      <td className="px-4 py-1.5">
        <span
          className="tabular inline-flex items-center gap-1"
          style={{ paddingLeft: `${nivel * 14}px` }}
        >
          {temFilhos ? (
            <button
              type="button"
              aria-label={aberto ? "Fechar" : "Abrir"}
              onClick={(e) => {
                e.stopPropagation();
                aoAlternar();
              }}
              className="w-3 text-texto-suave hover:text-texto"
            >
              {aberto ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-3 text-center text-texto-suave">·</span>
          )}
          {temFilhos ? <b>{conta.codigo}</b> : conta.codigo}
        </span>
      </td>
      <td className="px-4 py-1.5">
        {temFilhos ? <b>{conta.nome}</b> : conta.nome}
      </td>
      <td className="px-4 py-1.5">
        <Selo cor={nat.cor}>{nat.rotulo}</Selo>
      </td>
      <td className="px-4 py-1.5">
        <Selo cor={movimento ? "#2980b9" : "#8a8a8a"}>
          {movimento ? "Movimento" : "Integração"}
        </Selo>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
interface LinhaAchatada {
  tipo: "classe" | "conta";
  classe?: string;
  quantas?: number;
  conta?: Conta;
  nivel: number;
  temFilhos: boolean;
  movimento: boolean;
}

/** Percorre a árvore em profundidade e devolve as linhas a desenhar. */
function achatar(
  contas: Conta[],
  arvore: ArvorePlano,
  visiveis: Set<string> | null,
  estaAberto: (chave: string) => boolean,
): LinhaAchatada[] {
  const saida: LinhaAchatada[] = [];

  function descer(c: Conta, nivel: number) {
    if (visiveis && !visiveis.has(c.codigo)) return;
    const filhos = arvore.filhos.get(c.codigo) ?? [];
    saida.push({
      tipo: "conta",
      conta: c,
      nivel,
      temFilhos: filhos.length > 0,
      movimento: ehMovimento(c, contas),
    });
    if (filhos.length && estaAberto(c.codigo)) {
      for (const f of filhos) descer(f, nivel + 1);
    }
  }

  for (const cl of Object.keys(CLASSES)) {
    const raizes = (arvore.raizesPorClasse[cl] ?? []).filter(
      (c) => !visiveis || visiveis.has(c.codigo),
    );
    if (raizes.length === 0) continue;
    saida.push({
      tipo: "classe",
      classe: cl,
      quantas: contas.filter((c) => c.codigo[0] === cl).length,
      nivel: 0,
      temFilhos: true,
      movimento: false,
    });
    if (estaAberto(`cls-${cl}`)) for (const r of raizes) descer(r, 0);
  }

  return saida;
}
