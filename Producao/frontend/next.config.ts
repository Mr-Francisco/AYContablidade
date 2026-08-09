import type { NextConfig } from "next";

/**
 * Configuração do Next.
 *
 * As diferenças entre desenvolvimento e produção estão quase todas do lado do
 * backend (ver `backend/.env.producao.example`). Aqui ficam as duas que são do
 * browser: não anunciar a versão do servidor, e os cabeçalhos de segurança que
 * um proxy à frente pode não pôr.
 */
const emProducao = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // O cabeçalho `X-Powered-By: Next.js` diz a quem passa que software correr
  // à procura de vulnerabilidades. Não serve para nada a quem usa o site.
  poweredByHeader: false,

  // `standalone` produz uma pasta que corre sozinha, sem `node_modules` — é o
  // que torna a imagem de produção pequena e o arranque imediato.
  output: "standalone",

  // Um erro de tipos não pode passar despercebido num build de produção.
  // Explícito porque o valor por omissão já mudou entre versões do Next.
  //
  // O lint não está aqui: este projecto usa Biome e não ESLint, e o Next 16 já
  // não aceita a chave `eslint` na configuração. Corre-se com `npm run lint`.
  typescript: { ignoreBuildErrors: false },

  async headers() {
    if (!emProducao) return [];
    return [
      {
        source: "/:caminho*",
        headers: [
          // Nenhuma página desta aplicação é para ser embebida noutro site.
          // É o que impede um ataque de clique enganado sobre os botões de
          // aprovar, emitir ou apagar.
          { key: "X-Frame-Options", value: "DENY" },
          // O browser respeita o tipo declarado em vez de o adivinhar — sem
          // isto, um ficheiro carregado pode ser executado como script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // O endereço interno da página não sai para sites de terceiros.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // A aplicação não usa câmara, microfone nem localização. Dizê-lo
          // fecha a porta a qualquer script que venha a tentar.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Só https durante dois anos. Vale para o domínio inteiro, por isso
          // só se activa em produção — num domínio de testes trancava o
          // acesso em http sem forma fácil de voltar atrás.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
