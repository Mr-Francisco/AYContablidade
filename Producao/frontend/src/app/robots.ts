import type { MetadataRoute } from "next";

import { SITE } from "@/lib/institucional";

/**
 * A apresentação é para ser encontrada; a aplicação não.
 *
 * As rotas internas já exigem sessão, por isso isto não é uma barreira de
 * segurança — é para não deixar aparecer nos resultados de pesquisa páginas
 * que a quem pesquisa só devolvem um ecrã de login.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/painel",
        "/contabilidade/",
        "/analitica/",
        "/contas-correntes/",
        "/comercial/",
        "/logistica/",
        "/imobilizados/",
        "/rh/",
        "/fiscalidade/",
        "/assistente",
        "/gestao/",
        "/plataforma/",
        "/configuracoes",
        "/perfil",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
