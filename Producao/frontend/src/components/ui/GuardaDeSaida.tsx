"use client";

import { useCallback, useRef, useState } from "react";

import { Botao } from "@/components/ui/Botao";

/* ---------------------------------------------------------------------------
   Uma janela com dados dentro não se fecha por acidente.

   O QUE OS CLIENTES RELATARAM, e que é o motivo desta peça existir: estavam a
   preencher uma janela, carregavam num sítio qualquer fora dela — outro campo,
   a barra lateral, o vazio à volta — e a janela desaparecia com tudo o que
   tinham escrito. Não havia aviso nem forma de voltar atrás.

   TRÊS GESTOS FECHAM UMA JANELA, e não são a mesma coisa:

   - **Carregar fora** não é uma decisão. Ninguém carrega ao lado de uma janela
     com a intenção de deitar fora o que lá escreveu. Num formulário, este
     gesto passa a NÃO FAZER NADA. Não pergunta — nem sequer chega a haver o
     que perguntar, porque nada se perde.
   - **`Esc`** é deliberado, mas é uma tecla ao lado de outras e engana-se.
   - **O X e o «Cancelar»** são deliberados de verdade.

   Os dois últimos perguntam, e só quando há alguma coisa escrita. Abrir uma
   janela e fechá-la logo a seguir continua a ser um gesto só.

   COMO SE SABE QUE HÁ DADOS: pelos acontecimentos do formulário. Escrever num
   campo, mudar uma data, marcar uma caixa — tudo isso sobe até ao `<form>` e
   marca a janela como suja. Quem tiver campos que não disparam estes
   acontecimentos (uma lista do Radix, por exemplo) passa `sujo` à mão.

   Se a marca falhar por defeito, o pior que acontece é o «Cancelar» fechar sem
   perguntar — que é o que já fazia. O acidente que se queria travar era o
   outro, e esse fica travado sempre.
--------------------------------------------------------------------------- */

export interface GuardaDeSaida {
  /** Passa-se ao `Dialog.Content`: trava o clique fora e trata do `Esc`. */
  propsDoConteudo: {
    onInteractOutside: (e: Event) => void;
    onEscapeKeyDown: (e: KeyboardEvent) => void;
  };
  /** Passa-se ao `<form>`: é daqui que se sabe que alguém escreveu. */
  propsDoFormulario: {
    onInput: () => void;
    onChange: () => void;
  };
  /** O que o X e o «Cancelar» chamam. Pergunta se for preciso. */
  tentarFechar: () => void;
  /** Marca a janela como suja à mão, para campos que não disparam eventos. */
  marcarSujo: () => void;
  /** `true` enquanto a pergunta está no ecrã. */
  aPerguntar: boolean;
  /** Fecha mesmo, perdendo o que lá está. */
  sairMesmo: () => void;
  /** Volta ao formulário. */
  continuar: () => void;
}

export function useGuardaDeSaida({
  aoFechar,
  sujo,
}: {
  aoFechar: () => void;
  /** Força o estado. Sem isto, deduz-se dos acontecimentos do formulário. */
  sujo?: boolean;
}): GuardaDeSaida {
  const [aPerguntar, setAPerguntar] = useState(false);
  // NUMA `ref` E NÃO NO ESTADO. Ninguém precisa de voltar a desenhar a janela
  // por alguém ter escrito uma letra — e o `onInteractOutside` do Radix corre
  // fora do ciclo do React, onde um valor de estado chegaria velho.
  const tocado = useRef(false);

  const marcarSujo = useCallback(() => {
    tocado.current = true;
  }, []);

  const tentarFechar = useCallback(() => {
    if (sujo ?? tocado.current) setAPerguntar(true);
    else aoFechar();
  }, [aoFechar, sujo]);

  return {
    propsDoConteudo: {
      // O CLIQUE FORA NÃO FECHA. Ponto. Ver o comentário no topo.
      onInteractOutside: (e) => e.preventDefault(),
      onEscapeKeyDown: (e) => {
        e.preventDefault();
        tentarFechar();
      },
    },
    propsDoFormulario: { onInput: marcarSujo, onChange: marcarSujo },
    tentarFechar,
    marcarSujo,
    aPerguntar,
    sairMesmo: () => {
      setAPerguntar(false);
      aoFechar();
    },
    continuar: () => setAPerguntar(false),
  };
}

/**
 * A pergunta, por cima do formulário.
 *
 * POR CIMA E NÃO AO LADO: fica no mesmo sítio para onde a pessoa estava a
 * olhar, e o formulário continua visível por trás — vê-se o que se está
 * prestes a perder.
 *
 * Não é um diálogo do Radix dentro de outro: dois diálogos encaixados
 * disputam o foco entre si, e o teclado deixa de ir onde devia.
 */
export function PerguntaDeSaida({ guarda }: { guarda: GuardaDeSaida }) {
  if (!guarda.aPerguntar) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-5 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="saida-titulo"
        className="w-[min(26rem,100%)] rounded-2xl border border-borda bg-superficie p-5 shadow-forte"
      >
        <p id="saida-titulo" className="text-[15px] font-bold">
          Ainda não gravou este registo
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
          Se sair agora, o que preencheu não fica guardado e terá de escrever
          tudo outra vez.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="neutro" onClick={guarda.continuar}>
            Continuar a preencher
          </Botao>
          <Botao variante="perigo" onClick={guarda.sairMesmo}>
            Sair sem gravar
          </Botao>
        </div>
      </div>
    </div>
  );
}
