import type { Metadata } from "next";
import Link from "next/link";

import ConstelacaoAnimada from "@/components/landing/ConstelacaoAnimada";
import {
  AUTOR,
  CONTRIBUICAO,
  DADOS_INSTITUCIONAIS,
  SITE,
} from "@/lib/institucional";

/* ---------------------------------------------------------------------------
   Página de apresentação — pública.

   É a única página do produto que se dirige a quem ainda não é cliente, e a
   única que os motores de busca conseguem ler. Por isso é um COMPONENTE DE
   SERVIDOR: nada do que se lê aqui precisa de estado, e o que se ganha é a
   página a chegar pronta, o que conta para quem a encontra numa pesquisa e
   para quem a abre com rede fraca.

   A ÚNICA EXCEPÇÃO é o fundo animado do herói (`ConstelacaoAnimada`), que é
   cliente porque desenha num `canvas`. Não trava nada: o texto, os botões e os
   dados estruturados continuam a vir do servidor, e sem JavaScript fica o
   gradiente e mais nada muda. Ao acrescentar seja o que for a esta página,
   pergunte-se primeiro se tem mesmo de correr no cliente.

   Não usa Framer Motion pela mesma razão. As micro-interacções que aqui fazem
   sentido — o realce ao passar o rato, a entrada suave do cabeçalho — fazem-se
   em CSS, custam zero bytes e respeitam `prefers-reduced-motion` pela regra
   global que já existe em `globals.css`.

   REGRA QUE NÃO SE QUEBRA: só se anuncia o que o sistema faz mesmo. Cada
   módulo listado abaixo corresponde a páginas construídas (ver
   `lib/navegacao.ts`), e cada afirmação sobre segurança corresponde a uma
   verificação que existe no servidor.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "SGD — ERP de contabilidade para empresas em Angola",
  description:
    "Contabilidade em PGC-AR, IVA, RH com IRT e INSS, facturação, stocks e " +
    "imobilizados num só sistema. Cada empresa com os seus dados isolados, e " +
    "um assistente que responde sobre eles sem os expor.",
  keywords: [
    "ERP Angola",
    "software de contabilidade Angola",
    "PGC-AR",
    "apuramento de IVA",
    "processamento salarial IRT INSS",
    "gestão de empresas",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_PT",
    url: SITE,
    siteName: "SGD — Software de Gestão Dirigida",
    title: "SGD — ERP de contabilidade para empresas em Angola",
    description:
      "Contabilidade em PGC-AR, IVA, RH com IRT e INSS, facturação, stocks e " +
      "imobilizados num só sistema.",
  },
  robots: { index: true, follow: true },
};

/** Dados estruturados. É o que permite a um motor de busca perceber que isto é
 *  um produto de software, para que serve e onde opera — sem ter de o deduzir
 *  do texto. As perguntas frequentes são as que as pessoas fazem mesmo. */
const DADOS_ESTRUTURADOS = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "SGD — Software de Gestão Dirigida",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Accounting",
      operatingSystem: "Web",
      inLanguage: "pt-PT",
      areaServed: { "@type": "Country", name: "Angola" },
      // Quem fez. Nos dados estruturados e não só no rodapé: é assim que um
      // motor de busca liga o produto ao autor em vez de o ler como texto.
      author: {
        "@type": "Person",
        name: AUTOR.nome,
        url: AUTOR.github,
        sameAs: [AUTOR.github],
      },
      creator: { "@type": "Person", name: AUTOR.nome, url: AUTOR.github },
      contributor: { "@type": "Person", name: CONTRIBUICAO.nome },
      description:
        "ERP de contabilidade para empresas em Angola: PGC-AR, apuramento de " +
        "IVA, retenções na fonte, processamento salarial com IRT e INSS, " +
        "facturação, stocks, imobilizados e contabilidade analítica.",
      featureList: [
        "Contabilidade geral em PGC-AR",
        "Balancetes, balanço e demonstração de resultados",
        "Apuramento de IVA e retenções na fonte",
        "Processamento salarial com IRT e INSS",
        "Facturação e contas correntes",
        "Gestão de stocks e armazéns",
        "Imobilizados e amortizações",
        "Contabilidade analítica por centros de custo",
        "Assistente de perguntas e respostas sobre os dados",
        "Verificação em dois passos e registo de auditoria",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "O SGD segue o plano de contas angolano?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Sim. A contabilidade assenta no PGC-AR e os mapas — balancetes, " +
              "balanço, demonstração de resultados, fluxos de caixa e notas — " +
              "saem já na estrutura que a lei angolana pede.",
          },
        },
        {
          "@type": "Question",
          name: "Uma empresa consegue ver os dados de outra?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Não. Todos os dados de negócio estão marcados com a empresa a " +
              "que pertencem, e o servidor confirma essa pertença em cada " +
              "pedido. A separação não depende do que o ecrã mostra.",
          },
        },
        {
          "@type": "Question",
          name: "O assistente envia dados pessoais para fora?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Não. Antes de qualquer envio, nomes e identificadores são " +
              "substituídos e o pacote é verificado; se algum identificador " +
              "escapar, a consulta é cancelada em vez de ser enviada. O " +
              "assistente também não executa SQL nem altera dados.",
          },
        },
        {
          "@type": "Question",
          name: "O processamento salarial calcula IRT e INSS?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Sim, com as tabelas em vigor, e produz a folha, os recibos e o " +
              "mapa de remunerações. Há também simulação, para ver o efeito de " +
              "uma alteração antes de a fazer.",
          },
        },
      ],
    },
  ],
};

/* --------------------------------------------------------------------------
   Conteúdo. Fora do JSX para a página se ler de uma vez, e para ser óbvio o
   que é texto e o que é estrutura.
--------------------------------------------------------------------------- */

/* O CONTEÚDO, e é pouco de propósito.

   A página é para se ler de uma vez, não para se estudar. Ficam as três
   secções que a navegação já anuncia — Módulos, Assistente, Segurança — e cada
   cartão diz o que é numa linha. Quem quiser mais entra e vê.

   Ao acrescentar aqui, pergunte-se se o que vai escrever cabe numa linha. Se
   não couber, provavelmente não é para esta página. */

const MODULOS = [
  ["Contabilidade", "Movimentos, balancetes, balanço e resultados."],
  ["Fiscalidade", "IVA, retenções, obrigações e calendário fiscal."],
  ["Recursos humanos", "Processamento com IRT e INSS, recibos e mapas."],
  ["Comercial", "Vendas e facturas, com o lançamento a sair do documento."],
  ["Logística", "Artigos, compras, existências e armazéns."],
  ["Contas correntes", "Saldos e antiguidade de clientes e fornecedores."],
  [
    "Imobilizados",
    "Activos e amortizações, com o efeito contabilístico feito.",
  ],
  ["Analítica", "Centros de custo — onde o dinheiro é gasto, não só quanto."],
];

const SEGURANCA = [
  [
    "Uma empresa nunca vê outra",
    "O servidor confirma a pertença em cada pedido.",
  ],
  [
    "Verificação em dois passos",
    "TOTP, códigos de recuperação e bloqueio por tentativas.",
  ],
  ["Registo de auditoria", "Quem mudou o quê, e quando."],
  ["Períodos que fecham a sério", "Exercício fechado não aceita lançamentos."],
];

const IA_FAZ = [
  "Responde sobre os dados da empresa em linguagem corrente",
  "Explica saldos, variações e o que está por conciliar",
  "Diagnostica o que falta fechar — por regras, no servidor",
];

const IA_NAO_FAZ = [
  "Não envia nomes nem identificadores para fora",
  "Não executa SQL nem altera dados",
  "Não decide por si",
];

/* ------------------------------------------------------------------------ */

export default function Apresentacao() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD estático, escrito neste ficheiro e serializado com JSON.stringify. Não passa por aqui nada vindo de fora.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DADOS_ESTRUTURADOS) }}
      />

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-marca focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-borda bg-superficie/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3">
          <Link
            href="/"
            aria-label="SGD — página inicial"
            className="flex shrink-0 items-center gap-2.5"
          >
            <span className="rounded-lg bg-marca px-2.5 py-1 text-2xl font-black leading-none tracking-[-1px] text-white">
              SGD
            </span>
            <span className="hidden flex-col leading-[1.05] sm:flex">
              <b className="text-[13px] tracking-[3px] text-acento">SGD</b>
              <span className="text-[8.5px] tracking-[2px] text-texto-suave">
                SOFTWARE DE GESTÃO DIRIGIDA
              </span>
            </span>
          </Link>

          <nav aria-label="Secções" className="hidden gap-6 md:flex">
            {[
              ["#modulos", "Módulos"],
              ["#assistente", "Assistente"],
              ["#seguranca", "Segurança"],
            ].map(([href, texto]) => (
              <a
                key={href}
                href={href}
                className="-my-2 py-2 text-sm font-semibold text-texto-suave transition-colors hover:text-marca"
              >
                {texto}
              </a>
            ))}
          </nav>

          <Link
            href="/entrar"
            className="rounded-[10px] bg-marca px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-marca-escuro hover:shadow-[0_6px_18px_rgba(11,61,145,0.35)] dark:text-[#0c1220]"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main id="conteudo">
        {/* ---------------------------------------------------------------
            HERO. Uma frase que diz o que isto faz, e uma que diz porquê.
        ---------------------------------------------------------------- */}
        {/* O herói é escuro nos DOIS temas, e é deliberado: a constelação só se
            lê sobre fundo escuro, e o azul da marca sobre navio já é a
            linguagem dos painéis do carrossel dentro da aplicação. Por isso as
            cores aqui são fixas e não tokens de tema. */}
        <section className="relative overflow-hidden border-b border-borda bg-[#06152f] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,#06152f_0%,#0b3d91_58%,#0a2c66_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_62%_38%,rgba(61,127,224,0.30)_0%,transparent_70%)]"
          />
          <ConstelacaoAnimada />
          <div className="relative mx-auto max-w-[1180px] px-5 py-20 sm:py-28">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#cfe0ff] backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-[#4ade80]" />
              Feito para o PGC-AR e para a fiscalidade angolana
            </p>

            <h1 className="max-w-[19ch] text-4xl font-black leading-[1.06] tracking-[-0.02em] text-white sm:text-[3.6rem]">
              A contabilidade da sua empresa,{" "}
              <span className="text-[#ff8fc4]">fechada a tempo</span>.
            </h1>

            <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-[#b9cdf0]">
              O SGD junta contabilidade, IVA, salários, facturação, stocks e
              imobilizados num só sistema. Lança-se uma vez e os mapas saem
              feitos — sem exportações, sem folhas de cálculo pelo meio e sem
              esperar pelo fecho para saber onde a empresa está.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/entrar"
                className="rounded-[10px] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0b3d91] transition-all hover:bg-[#e8f0ff] hover:shadow-[0_8px_24px_rgba(61,127,224,0.45)]"
              >
                Entrar na aplicação
              </Link>
              <a
                href="#modulos"
                className="-my-2 py-2 text-[15px] font-semibold text-[#9dc0ff] transition-colors hover:text-white"
              >
                Ver o que inclui →
              </a>
            </div>

            <dl className="mt-14 grid max-w-[54rem] grid-cols-2 gap-x-8 gap-y-6 border-t border-white/15 pt-8 sm:grid-cols-4">
              {[
                ["PGC-AR", "Plano de contas angolano"],
                ["IRT e INSS", "Salários com as tabelas em vigor"],
                ["Multiempresa", "Dados separados por empresa"],
                ["Dois passos", "Autenticação TOTP e auditoria"],
              ].map(([forte, fraco]) => (
                <div key={forte}>
                  <dt className="text-base font-bold text-white">{forte}</dt>
                  <dd className="mt-1 text-[13px] leading-snug text-[#a9c1e8]">
                    {fraco}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="modulos"
          etiqueta="Módulos"
          titulo="Um sistema, do documento ao balancete"
          intro="Partilham os mesmos dados: um documento dá origem aos seus lançamentos, e são esses que aparecem no balancete e no IVA."
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map(([nome, texto]) => (
              <article
                key={nome}
                className="rounded-[14px] border border-borda bg-superficie p-6 transition-colors hover:border-rosa"
              >
                <h3 className="text-[15px] font-bold">{nome}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-texto-suave">
                  {texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* ---------------------------------------------------------------
            O ASSISTENTE. Dito com os limites à frente, e não em letra
            pequena: é o que distingue isto de um chat colado a um ERP.
        ---------------------------------------------------------------- */}
        <Seccao
          id="assistente"
          etiqueta="Assistente"
          titulo="Perguntar aos seus dados, sem os entregar a ninguém"
          fundo
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[14px] border border-borda bg-superficie p-7">
              <h3 className="text-[17px] font-bold">O que faz</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {IA_FAZ.map((linha) => (
                  <li
                    key={linha}
                    className="flex gap-3 text-sm leading-relaxed"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sucesso"
                    />
                    {linha}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[14px] border border-borda bg-superficie p-7">
              <h3 className="text-[17px] font-bold">O que nunca faz</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {IA_NAO_FAZ.map((linha) => (
                  <li
                    key={linha}
                    className="flex gap-3 text-sm leading-relaxed"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-perigo"
                    />
                    {linha}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="seguranca"
          etiqueta="Segurança"
          titulo="Controlo dos dados, verificado no servidor"
          intro="Cada uma destas garantias é uma verificação que o servidor faz — não é o que o ecrã esconde."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {SEGURANCA.map(([titulo, texto]) => (
              <article
                key={titulo}
                className="rounded-[14px] border border-borda bg-superficie p-6 transition-colors hover:border-rosa"
              >
                <h3 className="text-[17px] font-bold leading-snug">{titulo}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        {/* A banda final fecha a página como o herói a abriu: escura, e nos
            dois temas. O gradiente vai do azul da marca ao roxo do Piloto —
            é onde a segunda cor pode ocupar espaço a sério sem competir com o
            conteúdo, porque aqui não há conteúdo nenhum a competir. */}
        <section
          aria-labelledby="entrar-titulo"
          className="border-t border-borda bg-[linear-gradient(100deg,#0b3d91_0%,#5b3a9e_60%,#7a3aab_100%)]"
        >
          <div className="mx-auto max-w-[1180px] px-5 py-20 text-center">
            <h2
              id="entrar-titulo"
              className="mx-auto max-w-[22ch] text-3xl font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl"
            >
              Já tem acesso? O sistema está à sua espera.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/75">
              Entre com o código ou o nome da empresa, o seu e-mail e a
              palavra-passe.
            </p>
            <Link
              href="/entrar"
              className="mt-8 inline-block rounded-[10px] bg-white px-8 py-3.5 text-[15px] font-bold text-[#0b3d91] transition-transform hover:scale-[1.02]"
            >
              Entrar
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-borda bg-superficie">
        <div className="mx-auto max-w-[1180px] px-5 py-12">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-[34ch]">
              <span className="rounded-lg bg-marca px-2.5 py-1 text-xl font-black leading-none tracking-[-1px] text-white">
                SGD
              </span>
              <p className="mt-3.5 text-[13px] leading-relaxed text-texto-suave">
                Software de Gestão Dirigida — ERP de contabilidade para empresas
                em Angola, em conformidade com o PGC-AR.
              </p>
            </div>

            <dl className="grid gap-x-12 gap-y-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="font-semibold">País de operação</dt>
                <dd className="mt-0.5 text-texto-suave">Angola</dd>
              </div>
              <div>
                <dt className="font-semibold">Interface</dt>
                <dd className="mt-0.5 text-texto-suave">
                  Português (Portugal)
                </dd>
              </div>
              {DADOS_INSTITUCIONAIS.filter((d) => d.valor).map((d) => (
                <div key={d.rotulo}>
                  <dt className="font-semibold">{d.rotulo}</dt>
                  <dd className="mt-0.5 text-texto-suave">
                    {d.href ? (
                      <a href={d.href} className="hover:text-marca">
                        {d.valor}
                      </a>
                    ) : (
                      d.valor
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Autoria e contribuição. Ficam no rodapé e nos metadados, das
              mesmas constantes — dois sítios a escrever nomes à mão acabam
              sempre com um deles desactualizado. */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-borda pt-6 text-[13px] text-texto-suave">
            <span>
              © {new Date().getFullYear()} SGD · Desenvolvido por{" "}
              <a
                href={AUTOR.github}
                target="_blank"
                rel="noopener noreferrer me author"
                className="font-semibold text-texto hover:text-marca"
              >
                {AUTOR.nome}
              </a>
              <span className="mx-1.5 opacity-50">·</span>
              {CONTRIBUICAO.papel} de {CONTRIBUICAO.nome}
            </span>
            <nav aria-label="Acesso" className="-my-2 flex gap-5">
              <Link href="/entrar" className="py-2 hover:text-marca">
                Entrar
              </Link>
              <Link href="/activar" className="py-2 hover:text-marca">
                Activar licença
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}

/** Uma secção com o mesmo ritmo em toda a página: etiqueta, título, intro.
 *
 * `aria-labelledby` liga a secção ao seu título — é o que dá a um leitor de
 * ecrã a mesma estrutura que os olhos vêem, e a um motor de busca o mapa da
 * página. */
function Seccao({
  id,
  etiqueta,
  titulo,
  intro,
  fundo,
  children,
}: {
  id: string;
  etiqueta: string;
  titulo: string;
  intro?: string;
  fundo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={`border-b border-borda ${fundo ? "bg-superficie-2" : ""}`}
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 sm:py-20">
        {/* A etiqueta NÃO é azul, e é a decisão de cor desta página. Tudo aqui
            era da mesma família — marca, acento, gráficos — e um produto
            inteiro em azul não dá onde pousar o olho. A segunda cor vem da
            paleta do Piloto, onde já estava declarada e por usar.

            É o MAGENTA e não o rosa, e a razão é medida: o rosa (`#e6007e`)
            sobre branco dá 4,50:1 de contraste — exactamente o mínimo para
            texto normal, e isto é texto pequeno. Ficar a uma casa decimal de
            falhar não é passar. O magenta dá 5,85:1. O rosa continua a servir
            onde o fundo é escuro e sobra contraste: o realce do herói e os
            pontos da constelação. */}
        <p className="text-xs font-bold uppercase tracking-[2.5px] text-magenta">
          {etiqueta}
        </p>
        <h2
          id={`${id}-titulo`}
          className="mt-3 max-w-[24ch] text-3xl font-black leading-tight tracking-[-0.02em] sm:text-[2.4rem]"
        >
          {titulo}
        </h2>
        {intro && (
          <p className="mt-4 max-w-[68ch] text-base leading-relaxed text-texto-suave">
            {intro}
          </p>
        )}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
