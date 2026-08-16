import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/contexts/AuthContext";
import { SCRIPT_TEMA, TemaProvider } from "@/contexts/TemaContext";
import { AUTOR, CONTRIBUICAO, PRODUTO, SITE } from "@/lib/institucional";

import "./globals.css";

/**
 * Metadados que valem para o site inteiro.
 *
 * Cada página pode acrescentar os seus — a de apresentação tem descrição e
 * dados estruturados próprios — mas o que está aqui é o que se aplica quando
 * ninguém disse nada. É também o que aparece quando alguém cola um endereço
 * numa conversa: sem isto, uma partilha do sistema mostrava o endereço em cru.
 *
 * `metadataBase` é o que torna relativos os caminhos das imagens e das
 * etiquetas canónicas. Sem ele, o Next avisa e as pré-visualizações apontam
 * para lado nenhum.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: PRODUTO.nomeCompleto,
  title: {
    default: PRODUTO.nomeCompleto,
    template: "%s · SGD",
  },
  description: PRODUTO.descricaoCurta,
  authors: [{ name: AUTOR.nome, url: AUTOR.github }],
  creator: AUTOR.nome,
  publisher: AUTOR.nome,
  // Não é decorativo: é o que credita a contribuição em cada página do
  // produto, e não só no rodapé da apresentação.
  other: { contribuicao: `${CONTRIBUICAO.nome} — ${CONTRIBUICAO.papel}` },
  category: "business",
  alternates: { canonical: "/" },
  // Números de telefone e moradas deixam de ser transformados em links pelo
  // iOS: num ERP, uma referência de documento com nove dígitos era apanhada
  // como número de telefone e ficava azul e clicável a meio de uma tabela.
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: PRODUTO.nomeCompleto,
    title: PRODUTO.nomeCompleto,
    description: PRODUTO.descricaoCurta,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUTO.nomeCompleto,
    description: PRODUTO.descricaoCurta,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
  // Por omissão a aplicação NÃO é indexável — só a apresentação o pede
  // explicitamente. Cada rota interna exige sessão e devolveria um
  // redireccionamento a quem chegasse de uma pesquisa.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        {/* Corre antes da hidratação para não haver flash de tema claro.
            biome-ignore lint/security/noDangerouslySetInnerHtml: a string é uma
            constante do próprio código, sem qualquer entrada do utilizador, e
            tem MESMO de correr antes da hidratação — um <Script> do Next já
            seria tarde e o flash aconteceria. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased">
        <TemaProvider>
          <AuthProvider>{children}</AuthProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
