import type { Metadata } from "next";
import Link from "next/link";

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
   SERVIDOR sem uma linha de JavaScript no cliente: nada aqui precisa de estado,
   e o que se ganha é a página a chegar pronta, o que conta para quem a
   encontra numa pesquisa e para quem a abre com rede fraca.

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

const PROBLEMAS = [
  {
    titulo: "Os números vivem em sítios diferentes",
    texto:
      "A facturação num lado, os salários noutro, o stock numa folha de cálculo. " +
      "No fim do mês alguém passa dias a juntar tudo — e o que se decide já é " +
      "história.",
  },
  {
    titulo: "O fecho consome a equipa",
    texto:
      "Balancetes conferidos à mão, IVA apurado a partir de listagens, " +
      "retenções procuradas documento a documento. Trabalho que se repete " +
      "todos os meses e onde um engano passa despercebido.",
  },
  {
    titulo: "Perguntar simples custa caro",
    texto:
      "«Quanto gastámos neste centro de custo?» devia ser uma pergunta de um " +
      "minuto. Costuma ser um pedido a alguém, uma exportação e meia tarde.",
  },
];

const PASSOS = [
  {
    numero: "01",
    titulo: "Activa a licença",
    texto:
      "A empresa entra com a chave que recebeu. O plano de contas em PGC-AR, os " +
      "diários e os documentos ficam prontos no momento — não há configuração " +
      "de semanas antes de poder lançar o primeiro movimento.",
  },
  {
    numero: "02",
    titulo: "Lança e o resto acompanha",
    texto:
      "Uma venda, uma compra ou uma folha de salários dá origem aos lançamentos " +
      "certos. Balancetes, balanço, resultados, IVA e retenções actualizam-se a " +
      "partir do mesmo movimento, sem segunda digitação.",
  },
  {
    numero: "03",
    titulo: "Pergunta em vez de exportar",
    texto:
      "O assistente responde sobre os dados da empresa em linguagem corrente, e " +
      "o diagnóstico aponta o que está por fechar — períodos de IVA por apurar, " +
      "linhas sem centro de custo, contas por conciliar.",
  },
];

const MODULOS = [
  {
    nome: "Contabilidade",
    texto:
      "Movimentos, plano de contas, balancetes geral e do razão, balanço, " +
      "demonstração de resultados, notas, fluxos de caixa, extractos e razão.",
  },
  {
    nome: "Fiscalidade",
    texto:
      "Apuramento de IVA, retenções na fonte, regimes, obrigações, calendário " +
      "fiscal e mapa de remunerações.",
  },
  {
    nome: "Recursos humanos",
    texto:
      "Funcionários, alterações mensais, processamento com IRT e INSS, " +
      "pagamentos, recibos, simulação e prestadores independentes.",
  },
  {
    nome: "Comercial",
    texto:
      "Vendas, consulta de facturas, clientes e vendedores, com o lançamento " +
      "contabilístico a sair do próprio documento.",
  },
  {
    nome: "Logística",
    texto:
      "Artigos, compras, recepção, expedição, transferências, acertos, " +
      "existências e armazéns.",
  },
  {
    nome: "Contas correntes",
    texto:
      "Posição de clientes e de fornecedores, saldos e antiguidade, a partir " +
      "dos mesmos lançamentos.",
  },
  {
    nome: "Imobilizados",
    texto:
      "Ficha de activos e amortizações, com o efeito contabilístico feito.",
  },
  {
    nome: "Analítica",
    texto:
      "Centros de custo e mapa de custos, para saber onde o dinheiro é gasto e " +
      "não apenas quanto.",
  },
];

const BENEFICIOS = [
  {
    titulo: "O fecho deixa de ser um evento",
    texto:
      "Os mapas saem do que já foi lançado. Não há reconstrução no fim do mês, " +
      "há conferência — e sobra tempo para olhar para os números em vez de os " +
      "montar.",
  },
  {
    titulo: "Decidir com o mês a correr",
    texto:
      "O painel mostra a posição actual e o diagnóstico aponta o que falta " +
      "fechar. Corrige-se enquanto ainda dá para corrigir, não na véspera da " +
      "entrega.",
  },
  {
    titulo: "Menos digitação, menos engano",
    texto:
      "Um documento dá origem aos seus lançamentos. O que não se escreve duas " +
      "vezes também não diverge entre os dois sítios.",
  },
  {
    titulo: "Cada pessoa vê o que lhe compete",
    texto:
      "Perfis e permissões por módulo e por acção, verificados no servidor. " +
      "Quem processa salários não precisa de ver a facturação para fazer o seu " +
      "trabalho.",
  },
];

const SEGURANCA = [
  {
    titulo: "Uma empresa nunca vê outra",
    texto:
      "Todos os dados de negócio estão marcados com a empresa a que pertencem, " +
      "e o servidor confirma essa pertença em cada pedido — a separação não " +
      "depende do que o ecrã esconde.",
  },
  {
    titulo: "Verificação em dois passos",
    texto:
      "Autenticação TOTP com a aplicação que já usa, códigos de recuperação e " +
      "bloqueio ao fim de tentativas falhadas. Obrigatória para quem administra " +
      "a plataforma.",
  },
  {
    titulo: "Registo de auditoria",
    texto:
      "As acções de administração ficam registadas com autor, momento e o que " +
      "mudou. Uma alteração de contrato ou de acesso tem sempre a quem " +
      "perguntar.",
  },
  {
    titulo: "Períodos que fecham a sério",
    texto:
      "Um exercício fechado deixa de aceitar lançamentos, e a verificação está " +
      "no servidor. O que já foi entregue não muda por engano.",
  },
];

const IA_FAZ = [
  "Responde sobre os dados da empresa em linguagem corrente",
  "Explica saldos, variações e o que está por conciliar",
  "Diagnostica o que falta fechar, por regras, sem sair do servidor",
];

const IA_NAO_FAZ = [
  "Não envia nomes nem identificadores pessoais para fora",
  "Não executa SQL nem altera dados do sistema",
  "Não decide por si — o registo contabilístico continua a ser de quem o faz",
];

const PARA_QUEM = [
  {
    titulo: "Gabinetes de contabilidade",
    texto:
      "Várias empresas na mesma instalação, cada uma com os seus dados, o seu " +
      "plano de contas e os seus utilizadores.",
  },
  {
    titulo: "Empresas com contabilidade própria",
    texto:
      "Um sistema só, do documento ao balancete, sem passar por folhas de " +
      "cálculo pelo meio.",
  },
  {
    titulo: "Direcções financeiras",
    texto:
      "A posição actual sem esperar pelo fecho, e o custo por centro sem " +
      "montar o mapa à mão.",
  },
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
        <section className="relative overflow-hidden border-b border-borda bg-superficie">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-acento/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-[1180px] px-5 py-20 sm:py-28">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-borda bg-superficie-2 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-texto-suave">
              <span className="size-1.5 rounded-full bg-sucesso" />
              Feito para o PGC-AR e para a fiscalidade angolana
            </p>

            <h1 className="max-w-[19ch] text-4xl font-black leading-[1.06] tracking-[-0.02em] sm:text-[3.6rem]">
              A contabilidade da sua empresa,{" "}
              <span className="text-marca">fechada a tempo</span>.
            </h1>

            <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-texto-suave">
              O SGD junta contabilidade, IVA, salários, facturação, stocks e
              imobilizados num só sistema. Lança-se uma vez e os mapas saem
              feitos — sem exportações, sem folhas de cálculo pelo meio e sem
              esperar pelo fecho para saber onde a empresa está.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/entrar"
                className="rounded-[10px] bg-marca px-7 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-marca-escuro hover:shadow-[0_8px_24px_rgba(11,61,145,0.35)] dark:text-[#0c1220]"
              >
                Entrar na aplicação
              </Link>
              <a
                href="#modulos"
                className="-my-2 py-2 text-[15px] font-semibold text-marca transition-colors hover:text-acento"
              >
                Ver o que inclui →
              </a>
            </div>

            <dl className="mt-14 grid max-w-[54rem] grid-cols-2 gap-x-8 gap-y-6 border-t border-borda pt-8 sm:grid-cols-4">
              {[
                ["PGC-AR", "Plano de contas angolano"],
                ["IRT e INSS", "Salários com as tabelas em vigor"],
                ["Multiempresa", "Dados separados por empresa"],
                ["Dois passos", "Autenticação TOTP e auditoria"],
              ].map(([forte, fraco]) => (
                <div key={forte}>
                  <dt className="text-base font-bold text-texto">{forte}</dt>
                  <dd className="mt-1 text-[13px] leading-snug text-texto-suave">
                    {fraco}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="problema"
          etiqueta="O problema"
          titulo="O trabalho não é lançar. É juntar tudo outra vez."
          intro="Em quase todas as empresas com que isto se parece, o mês fecha-se duas vezes: uma no sistema, outra numa folha de cálculo."
        >
          <div className="grid gap-5 md:grid-cols-3">
            {PROBLEMAS.map((p) => (
              <article
                key={p.titulo}
                className="rounded-[14px] border border-borda bg-superficie p-6"
              >
                <h3 className="text-[17px] font-bold leading-snug">
                  {p.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {p.texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="como-funciona"
          etiqueta="Como funciona"
          titulo="Três passos, e o sistema passa a trabalhar para si"
          fundo
        >
          <ol className="grid gap-5 md:grid-cols-3">
            {PASSOS.map((p) => (
              <li
                key={p.numero}
                className="rounded-[14px] border border-borda bg-superficie p-6"
              >
                <span className="tabular text-[13px] font-black tracking-[2px] text-acento">
                  {p.numero}
                </span>
                <h3 className="mt-2 text-[17px] font-bold leading-snug">
                  {p.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {p.texto}
                </p>
              </li>
            ))}
          </ol>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="modulos"
          etiqueta="Funcionalidades"
          titulo="Um sistema, do documento ao balancete"
          intro="Os módulos partilham os mesmos dados. Um documento comercial dá origem aos seus lançamentos, e esses lançamentos são os que aparecem no balancete, no IVA e nas contas correntes."
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map((m) => (
              <article
                key={m.nome}
                className="rounded-[14px] border border-borda bg-superficie p-6 transition-colors hover:border-acento"
              >
                <h3 className="text-[15px] font-bold">{m.nome}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-texto-suave">
                  {m.texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="beneficios"
          etiqueta="O que muda"
          titulo="O ganho não é ter mais ecrãs. É deixar de repetir trabalho."
          fundo
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {BENEFICIOS.map((b) => (
              <article
                key={b.titulo}
                className="rounded-[14px] border border-borda bg-superficie p-6"
              >
                <h3 className="text-[17px] font-bold leading-snug">
                  {b.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {b.texto}
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
          intro="O assistente responde sobre a contabilidade da empresa em linguagem corrente. O que sai da máquina vai sem nomes e sem identificadores, e é verificado antes de sair."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[14px] border border-borda bg-superficie p-7">
              <h3 className="text-[17px] font-bold">O que faz</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {IA_FAZ.map((t) => (
                  <li key={t} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sucesso"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[14px] border border-borda bg-superficie p-7">
              <h3 className="text-[17px] font-bold">O que nunca faz</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {IA_NAO_FAZ.map((t) => (
                  <li key={t} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-perigo"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <p className="mt-5 max-w-[76ch] text-sm leading-relaxed text-texto-suave">
            O diagnóstico é um caso à parte: corre inteiramente no servidor, por
            regras, e nunca contacta nenhum serviço externo. Continua a
            funcionar mesmo com o assistente desligado.
          </p>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="seguranca"
          etiqueta="Segurança"
          titulo="Controlo dos dados, verificado no servidor"
          intro="Nada aqui depende do que a interface mostra ou esconde. Cada uma destas garantias é uma verificação que o servidor faz a cada pedido."
          fundo
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {SEGURANCA.map((s) => (
              <article
                key={s.titulo}
                className="rounded-[14px] border border-borda bg-superficie p-6"
              >
                <h3 className="text-[17px] font-bold leading-snug">
                  {s.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {s.texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <Seccao
          id="para-quem"
          etiqueta="Para quem"
          titulo="Pensado para quem fecha contas todos os meses"
        >
          <div className="grid gap-5 md:grid-cols-3">
            {PARA_QUEM.map((p) => (
              <article
                key={p.titulo}
                className="rounded-[14px] border border-borda bg-superficie p-6"
              >
                <h3 className="text-[17px] font-bold leading-snug">
                  {p.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-texto-suave">
                  {p.texto}
                </p>
              </article>
            ))}
          </div>
        </Seccao>

        {/* --------------------------------------------------------------- */}
        <section
          aria-labelledby="entrar-titulo"
          className="border-t border-borda bg-marca"
        >
          <div className="mx-auto max-w-[1180px] px-5 py-20 text-center">
            <h2
              id="entrar-titulo"
              className="mx-auto max-w-[22ch] text-3xl font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl dark:text-[#0c1220]"
            >
              Já tem acesso? O sistema está à sua espera.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/75 dark:text-[#0c1220]/80">
              Entre com o código ou o nome da empresa, o seu e-mail e a
              palavra-passe.
            </p>
            <Link
              href="/entrar"
              className="mt-8 inline-block rounded-[10px] bg-white px-8 py-3.5 text-[15px] font-bold text-marca transition-transform hover:scale-[1.02] dark:bg-[#0c1220] dark:text-marca"
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
        <p className="text-xs font-bold uppercase tracking-[2.5px] text-acento">
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
