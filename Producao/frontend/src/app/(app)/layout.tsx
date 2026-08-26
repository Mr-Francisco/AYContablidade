"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tooltip } from "radix-ui";
import { useEffect, useState } from "react";

import { AcessoRapido } from "@/components/layout/AcessoRapido";
import { AvisoDeSeguranca } from "@/components/layout/AvisoDeSeguranca";
import { BarraDeModulos } from "@/components/layout/BarraDeModulos";
import { Cabecalho } from "@/components/layout/Cabecalho";
import { LateralDaSeccao } from "@/components/layout/LateralDaSeccao";
import { SessaoViva } from "@/components/layout/SessaoViva";
import { ACarregar } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { ProvedorDoCabecalhoDaPagina } from "@/contexts/CabecalhoDaPagina";
import { type GrupoNav, grupoDaRota } from "@/lib/navegacao";
import { useNavegacaoVisivel } from "@/lib/navegacaoVisivel";

/* ---------------------------------------------------------------------------
   A moldura da aplicação.

   O QUE MUDOU, E PORQUÊ. Estava tudo em cima: o logótipo, os módulos e os
   campos da secção, em três filas empilhadas. Medido num portátil de
   1366×768 — o ecrã que a maior parte das pessoas tem à frente —, o cabeçalho
   sozinho ocupava 193 px e a faixa de aviso mais 86. Num balancete, **92% da
   altura do ecrã era gasta antes de aparecer o primeiro número**, e viam-se
   DUAS linhas de setenta.

   O ecrã de quem trabalha é largo e baixo. A altura é o que falta; a largura
   sobra. Estava tudo empilhado no eixo que escasseia.

   - **Os campos da secção passaram para a esquerda.** É o que se usa a toda a
     hora, e numa coluna não custa altura nenhuma.
   - **Os módulos passaram para baixo.** Trocar de módulo é o gesto mais raro
     da aplicação — quem entra na Contabilidade fica lá a manhã inteira. Dar-lhe
     o sítio mais caro do ecrã era ao contrário.

   Em cima fica só QUEM: a marca, a empresa e a pessoa.
--------------------------------------------------------------------------- */

/** Altura da barra dos módulos. Em CSS porque a coluna lateral e o conteúdo
 *  precisam de a descontar, e um número escrito em três sítios diverge. */
const ALTURA_MODULOS = "56px";

export default function LayoutAplicacao({
  children,
}: {
  children: React.ReactNode;
}) {
  const { utilizador, aCarregar } = useAuth();
  const router = useRouter();
  const caminho = usePathname();

  /*
   * A COLUNA ENCOLHIDA — a escolha dura a sessão e não sobrevive a um
   * recarregamento: quem recarrega à procura dos nomes tem de os encontrar.
   *
   * O assistente abre com ela encolhida. É uma conversa, ocupa o ecrã todo, e
   * quem está a escrever não está a navegar.
   */
  const noAssistente = caminho.startsWith("/assistente");
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const recolhido = escolha ?? noAssistente;

  const { grupos, itemVisivel } = useNavegacaoVisivel();
  const grupoActivo = grupoDaRota(caminho);

  function hrefDoGrupo(g: GrupoNav): string {
    if (g.href) return g.href;
    return g.filhos?.find(itemVisivel)?.href ?? "#";
  }

  useEffect(() => {
    // O `proxy.ts` já barra quem não tem cookie. Isto apanha o caso em que o
    // cookie existe mas o token foi revogado — o /auth/me falha e ficamos sem
    // utilizador.
    if (!aCarregar && !utilizador) router.replace("/entrar");
  }, [aCarregar, utilizador, router]);

  if (aCarregar) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ACarregar texto="A repor a sessão…" />
      </div>
    );
  }

  if (!utilizador) return null;

  return (
    <ProvedorDoCabecalhoDaPagina>
      <Tooltip.Provider delayDuration={250}>
        <div
          className="flex min-h-screen flex-col"
          style={{ ["--altura-modulos" as string]: ALTURA_MODULOS }}
        >
          <Cabecalho />
          <AvisoDeSeguranca />

          {/* A COLUNA E O CONTEÚDO, LADO A LADO. `items-start` para a coluna
            poder ficar colada ao topo com o seu próprio scroll, em vez de
            esticar até ao fim de uma página comprida. */}
          <div className="flex min-w-0 flex-1 items-start">
            <div id="coluna-da-seccao" className="contents">
              <LateralDaSeccao
                grupo={grupoActivo}
                visivel={itemVisivel}
                recolhida={recolhido}
                aoRecolher={(v) => setEscolha(v)}
              />
            </div>

            {/* min-w-0 impede que uma tabela larga alargue o main e crie barra
              horizontal na página inteira. */}
            <main className="min-w-0 flex-1">
              {/* SEM LARGURA MÁXIMA — e é de propósito.

                Havia um limite de 1360 px herdado do Piloto, e num monitor
                grande deixava faixas vazias enormes dos dois lados: num ecrã
                de 2560 px o conteúdo ocupava 1360 e sobravam 600 px de nada de
                cada lado. Num site de texto o limite faz sentido — linhas
                muito compridas cansam a ler. Num ERP não: o que aqui se mostra
                são tabelas de nove e catorze colunas, e cada pixel de largura
                é uma coluna que deixa de ser cortada.

                O `pb` deixa passar a barra dos módulos: sem ele, a última
                linha de uma tabela ficava debaixo dela. */}
              <div className="min-w-0 px-5 pt-4 [padding-bottom:calc(var(--altura-modulos)+1.5rem)]">
                {children}
              </div>
            </main>
          </div>

          <BarraDeModulos
            grupos={grupos}
            grupoActivo={grupoActivo}
            hrefDoGrupo={hrefDoGrupo}
          />

          {/* O «+» dos módulos. Aqui, e não em cada página: é o mesmo atalho em
            todo o lado, e num sítio só não há hipótese de divergir. */}
          <AcessoRapido />

          {/* Renova a sessão em silêncio enquanto se trabalha e avisa antes de
            ela atingir o limite. Não desenha nada até haver o que dizer. */}
          <SessaoViva />
        </div>
      </Tooltip.Provider>
    </ProvedorDoCabecalhoDaPagina>
  );
}
