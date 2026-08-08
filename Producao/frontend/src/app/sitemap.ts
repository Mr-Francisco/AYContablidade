import type { MetadataRoute } from "next";

import { SITE } from "@/lib/institucional";

/**
 * Só as páginas públicas.
 *
 * A aplicação fica de fora por não ser indexável — cada rota dela exige sessão
 * e responderia com um redireccionamento — e por não haver razão nenhuma para
 * anunciar a estrutura interna a quem passa.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE}/entrar`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/activar`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
