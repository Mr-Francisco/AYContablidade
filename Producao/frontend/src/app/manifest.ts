import type { MetadataRoute } from "next";

import { PRODUTO } from "@/lib/institucional";

/**
 * Manifesto da aplicação web.
 *
 * É o que permite instalar o sistema no telemóvel ou no ambiente de trabalho e
 * abri-lo como uma aplicação — sem barra de endereços, com o ícone certo e a
 * cor certa na barra de estado. Para quem trabalha nele todos os dias, a
 * diferença é abrir um ícone em vez de procurar um separador.
 *
 * `start_url` aponta para `/painel` e não para a raiz: quem instalou isto já é
 * utilizador, e a página de apresentação é para quem ainda não é. Sem sessão,
 * o guarda de rotas encaminha para a entrada — que é o comportamento correcto
 * e não um erro.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUTO.nomeCompleto,
    short_name: PRODUTO.nome,
    description: PRODUTO.descricaoCurta,
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "pt-PT",
    dir: "ltr",
    background_color: "#f5f7fb",
    theme_color: "#0b3d91",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      // `maskable`: no Android o sistema recorta o ícone à forma do tema. Sem
      // uma versão declarada assim, a marca fica com as pontas cortadas.
      {
        src: "/icone-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
