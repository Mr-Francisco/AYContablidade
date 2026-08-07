import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/contexts/AuthContext";
import { SCRIPT_TEMA, TemaProvider } from "@/contexts/TemaContext";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SGD — Sistema de Gestão Distribuído",
    template: "%s · SGD",
  },
  description: "ERP de Contabilidade — Plano Geral de Contabilidade de Angola.",
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
