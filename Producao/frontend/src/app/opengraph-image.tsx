import { ImageResponse } from "next/og";

import { PRODUTO } from "@/lib/institucional";

/**
 * A imagem que aparece quando alguém cola o endereço do sistema numa conversa,
 * num e-mail ou numa publicação.
 *
 * Sem ela, uma partilha mostra o endereço em cru — `aycontabilidade-web…` — e
 * quem recebe não faz ideia do que está a receber. É a primeira impressão do
 * produto em metade dos sítios onde ele é mencionado, e custa um ficheiro.
 *
 * DESENHADA EM CÓDIGO e não guardada como imagem: fica sempre igual à marca
 * (o mesmo azul do Piloto), não há um `.png` a envelhecer no repositório, e o
 * texto muda sem alguém ter de reabrir um editor de imagem.
 *
 * O DESENHO: a marca ao centro e a frase por baixo. Uma pré-visualização é
 * vista de relance e em miniatura — ao tamanho de um cartão numa conversa, o
 * que tem de sobreviver é o símbolo. Tudo o que é acessório fica em baixo, em
 * tamanho pequeno, para quem abrir em grande.
 *
 * 1200×630 é a medida que o Open Graph e o Twitter esperam; fora dela as
 * pré-visualizações cortam pelo meio. O Next liga esta imagem sozinho a
 * `og:image` e a `twitter:image` — não se escreve o caminho à mão, que seria
 * um segundo sítio a dizer o mesmo.
 */

export const alt = `${PRODUTO.nomeCompleto} — ERP de contabilidade para Angola`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Imagem() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        // O `--gradiente-marca` escrito à mão: aqui não corre o CSS do projecto.
        background: "linear-gradient(115deg, #0b3d91 0%, #3d7fe0 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      {/* As duas circunferências do cabeçalho dos painéis, muito diluídas.
          Dão profundidade sem competir com o texto. */}
      <div
        style={{
          position: "absolute",
          top: -220,
          right: -160,
          width: 620,
          height: 620,
          borderRadius: 620,
          background: "rgba(255,255,255,0.09)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -260,
          left: -180,
          width: 560,
          height: 560,
          borderRadius: 560,
          background: "rgba(255,255,255,0.06)",
        }}
      />

      {/* A MARCA, em grande. É o que sobrevive à miniatura. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "26px 54px",
          borderRadius: 34,
          background: "rgba(255,255,255,0.14)",
          border: "3px solid rgba(255,255,255,0.45)",
          fontSize: 132,
          fontWeight: 900,
          letterSpacing: -8,
          lineHeight: 1,
        }}
      >
        SGD
      </div>

      {/* E o texto por baixo. */}
      <div
        style={{
          fontSize: 27,
          letterSpacing: 11,
          opacity: 0.92,
          marginTop: 30,
        }}
      >
        SOFTWARE DE GESTÃO DIRIGIDA
      </div>

      <div
        style={{
          fontSize: 47,
          fontWeight: 800,
          letterSpacing: -1.2,
          marginTop: 34,
          textAlign: "center",
        }}
      >
        Toda a empresa, num só sistema.
      </div>

      <div
        style={{
          fontSize: 26,
          opacity: 0.9,
          marginTop: 16,
          maxWidth: 860,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        ERP de contabilidade para empresas em Angola, em conformidade com o
        PGC-AR.
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          fontSize: 21,
          opacity: 0.86,
          marginTop: 40,
        }}
      >
        {["Contabilidade", "IVA e IRT", "RH", "Facturação", "Existências"].map(
          (m) => (
            <div
              key={m}
              style={{
                padding: "9px 20px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.42)",
              }}
            >
              {m}
            </div>
          ),
        )}
      </div>
    </div>,
    size,
  );
}
