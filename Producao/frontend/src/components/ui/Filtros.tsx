"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Barra de filtros — o mesmo bloco em todas as páginas de listagem. */
export function BarraFiltros({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // A `.toolbar` do Piloto: só uma fila de controlos, sem moldura nem fundo
    // próprios. O cartão que aqui estava criava uma caixa dentro da caixa e
    // afastava a Produção do Piloto em todas as páginas de uma vez.
    <div
      className={cn(
        // `sem-imprimir`: os campos já não se imprimiam, mas os RÓTULOS
        // ficavam — saía uma fila de «Exercício · Análise · De · Até» sem um
        // único valor por baixo, que num mapa entregue parece um erro. O que
        // restringe o mapa está no `CabecalhoDoMapa`, que é onde se lê.
        "sem-imprimir flex flex-wrap items-center gap-2.5",
        ROTULO_AO_LADO,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Numa barra de filtros o rótulo fica AO LADO do campo, não por cima.
 *
 * É a regra do Piloto — `label { display: block }` com o texto e o controlo na
 * mesma linha, e `.toolbar label { margin: 0; font-weight: 600 }`. A Produção
 * empilhava-os, o que faz a barra crescer em altura e dá àquela fila de
 * controlos um ar de formulário. Posto aqui e não em cada `Campo` porque a
 * diferença é da barra: no meio de um formulário o rótulo por cima está certo.
 */
const ROTULO_AO_LADO = [
  "[&>label]:flex-row [&>label]:items-center [&>label]:gap-2",
  // `.toolbar label { font-weight: 600 }` — um grau abaixo do rótulo de
  // formulário, porque aqui há muitos lado a lado.
  "[&>label>span:first-child]:whitespace-nowrap",
  "[&>label>span:first-child]:font-semibold",
  // A caixa de pesquisa é a única que quer crescer: vem embrulhada num `div`
  // por causa da lupa, e sem isto ficava com a largura de sempre e um vão de
  // quatrocentos pixéis ao lado. Os outros campos ficam do seu tamanho.
  "[&>label>div]:flex-1",
].join(" ");

interface Opcao {
  valor: string;
  rotulo: string;
}

/**
 * O Radix reserva a string vazia para «nada seleccionado» e, ao vê-la, mostra
 * o placeholder. Só que nos filtros o vazio É uma escolha, e tem nome próprio:
 * «Todos os exercícios», «Toda a natureza», «Todos (15 · Resultado Líquido)».
 * O ecrã dizia «Seleccionar…» em vinte páginas onde o Piloto diz o nome da
 * opção.
 *
 * Trocamos por um sentinela à entrada e desfazemos à saída, para que as
 * páginas continuem a escrever `valor: ""` como no `<option value="">` do
 * Piloto e ninguém tenha de se lembrar disto.
 */
const SEM_VALOR = "__vazio__";
const paraRadix = (v: string | undefined) => (v === "" ? SEM_VALOR : v);
const doRadix = (v: string) => (v === SEM_VALOR ? "" : v);

/**
 * Selector. Usa Radix `Select` — teclado, leitores de ecrã e posicionamento
 * já resolvidos, ao contrário de um `<select>` estilizado à mão.
 */
export function Selector({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  placeholder = "Seleccionar…",
  className,
  larguraMinima = "10rem",
}: {
  rotulo?: string;
  valor: string | undefined;
  aoMudar: (v: string) => void;
  opcoes: Opcao[];
  placeholder?: string;
  className?: string;
  larguraMinima?: string;
}) {
  // O rótulo da opção escolhida, ou o próprio valor quando a opção ainda não
  // chegou: mais vale mostrar «713» do que nada.
  //
  // A opção vem primeiro, mesmo quando o valor é "" — há listas em que o vazio
  // É uma escolha («Todos», «A da configuração»), e tratá-lo sempre como
  // «nada escolhido» punha o campo a dizer «Seleccionar…» com uma opção
  // seleccionada. Só quando não existe opção nenhuma para o valor é que se
  // mostra o placeholder.
  const escolhida = opcoes.find((o) => o.valor === valor);
  const rotuloDoValor =
    escolhida?.rotulo ?? (valor === undefined || valor === "" ? null : valor);

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o label envolve o trigger do Radix Select, que ja recebe aria-label; o Biome nao reconhece o componente como controlo.
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {rotulo && (
        <span className="text-[13px] font-bold text-texto">{rotulo}</span>
      )}
      <Select.Root
        value={paraRadix(valor)}
        onValueChange={(v) => aoMudar(doRadix(v))}
      >
        <Select.Trigger
          className="flex items-center justify-between gap-2 rounded-[10px] border border-borda bg-superficie px-3 py-2.5 text-sm text-texto outline-none focus:border-acento focus:ring-2 focus:ring-acento/25 data-[placeholder]:text-texto-suave/70"
          style={{ minWidth: larguraMinima }}
          aria-label={rotulo}
        >
          {/* O RÓTULO É NOSSO, não do registo interno do Radix.
              O `Select.Value` sem filhos lê o texto do item escolhido, e só o
              conhece se o item já existia quando o valor foi posto. Numa
              janela que carrega a configuração e as opções ao mesmo tempo, o
              valor chega primeiro e o campo fica VAZIO para sempre — com o
              valor lá dentro, pronto a ser gravado por cima sem ninguém ver o
              que estava. Aconteceu no documento das amortizações. */}
          <Select.Value placeholder={placeholder}>
            {rotuloDoValor ?? (
              <span className="text-texto-suave/70">{placeholder}</span>
            )}
          </Select.Value>
          <Select.Icon>
            <ChevronDown size={15} className="text-texto-suave" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-[320px] overflow-hidden rounded-xl border border-borda bg-superficie shadow-forte"
          >
            <Select.Viewport className="p-1.5">
              {opcoes.map((o) => (
                <Select.Item
                  key={o.valor}
                  value={paraRadix(o.valor) ?? o.valor}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-superficie-2"
                >
                  <Select.ItemText>{o.rotulo}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} className="text-marca" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
}
