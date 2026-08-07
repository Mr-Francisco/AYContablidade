import type { Modulo } from "@/types";

/**
 * Estrutura de navegação — transposta do `NAV` de `Piloto/assets/js/app.js`.
 *
 * A organização é a mesma: barra de topo com os módulos, e um "ribbon" por
 * baixo com as páginas do módulo activo, agrupadas por secção. Um módulo só
 * aparece se tiver pelo menos um item visível para o utilizador.
 */

export interface ItemNav {
  href: string;
  rotulo: string;
  seccao: string;
  /** Capacidade exigida (matriz CAPS). */
  cap?: string;
  /** Perfis com acesso, quando não há capacidade específica. */
  perfis?: string[];
  icone?: string;
  /**
   * Página ainda por construir. Fica aqui para a estrutura de destino estar
   * documentada num só sítio, mas é filtrada da navegação — um link para uma
   * rota inexistente dá 404 e parece avaria.
   */
  pendente?: boolean;
}

export interface GrupoNav {
  rotulo: string;
  href?: string;
  modulo?: Modulo;
  perfis?: string[];
  filhos?: ItemNav[];
  /** Grupo de nível superior ainda por construir — ver ItemNav.pendente. */
  pendente?: boolean;
}

const NAV_COMPLETO: GrupoNav[] = [
  { rotulo: "Painel", href: "/" },

  {
    rotulo: "Contabilidade",
    modulo: "contabilidade",
    filhos: [
      {
        href: "/contabilidade",
        rotulo: "Painel",
        seccao: "Painel",
        cap: "contab.ver",
        icone: "dashboard",
      },
      {
        href: "/contabilidade/movimentos",
        rotulo: "Movimentos",
        seccao: "Contabilidade",
        cap: "contab.ver",
        icone: "movimentos",
      },
      {
        href: "/contabilidade/plano-contas",
        rotulo: "Plano de Contas",
        seccao: "Contabilidade",
        cap: "contab.ver",
        icone: "plano",
      },
      {
        href: "/contabilidade/balancete",
        rotulo: "Balancete Geral",
        seccao: "Balancetes",
        cap: "contab.ver",
        icone: "balancete",
      },
      {
        href: "/contabilidade/balancete-razao",
        rotulo: "Balancete do Razão",
        seccao: "Balancetes",
        cap: "contab.ver",
        icone: "livro",
      },
      {
        href: "/contabilidade/balanco",
        rotulo: "Balanço",
        seccao: "Demonstrações",
        cap: "contab.ver",
        icone: "balanco",
      },
      {
        href: "/contabilidade/resultados",
        rotulo: "Result. e Outros",
        seccao: "Demonstrações",
        cap: "contab.ver",
        icone: "resultados",
      },
      {
        href: "/contabilidade/notas",
        rotulo: "Notas",
        seccao: "Demonstrações",
        cap: "contab.ver",
        icone: "notas",
      },
      {
        href: "/contabilidade/fluxos-caixa",
        rotulo: "Fluxos de Caixa",
        seccao: "Demonstrações",
        cap: "contab.ver",
        icone: "fluxos",
      },
      {
        href: "/contabilidade/apuramento-iva",
        rotulo: "Apuramento do IVA",
        seccao: "Apuramentos",
        cap: "contab.ver",
        icone: "balancete",
      },
      {
        href: "/contabilidade/retencoes",
        rotulo: "Retenções na Fonte",
        seccao: "Apuramentos",
        cap: "contab.ver",
        icone: "fiscalidade",
      },
      {
        href: "/contabilidade/extrato",
        rotulo: "Extratos",
        seccao: "Exploração",
        cap: "contab.ver",
        icone: "extratos",
      },
      {
        href: "/contabilidade/razao",
        rotulo: "Razão",
        seccao: "Exploração",
        cap: "contab.ver",
        icone: "livro",
      },
      {
        href: "/contabilidade/diarios",
        rotulo: "Diários",
        seccao: "Tabelas",
        cap: "contab.ver",
        icone: "diarios",
      },
      {
        href: "/contabilidade/documentos",
        rotulo: "Documentos",
        seccao: "Tabelas",
        cap: "contab.ver",
        icone: "documentos",
      },
    ],
  },

  {
    rotulo: "Analítica",
    modulo: "analitica",
    filhos: [
      {
        href: "/analitica",
        pendente: true,
        rotulo: "Painel",
        seccao: "Painel",
        cap: "analitica.ver",
        icone: "dashboard",
      },
      {
        href: "/analitica/mapa",
        pendente: true,
        rotulo: "Mapa de Custos",
        seccao: "Analítica",
        cap: "analitica.ver",
        icone: "balancete",
      },
      {
        href: "/analitica/centros",
        pendente: true,
        rotulo: "Centros de Custo",
        seccao: "Analítica",
        cap: "analitica.ver",
        icone: "package",
      },
    ],
  },

  {
    rotulo: "Contas Correntes",
    modulo: "contasCorrentes",
    filhos: [
      {
        href: "/contas-correntes",
        pendente: true,
        rotulo: "Painel",
        seccao: "Painel",
        cap: "financeiro.ver",
        icone: "dashboard",
      },
      {
        href: "/contas-correntes/clientes",
        pendente: true,
        rotulo: "Clientes",
        seccao: "Contas Correntes",
        cap: "financeiro.ver",
        icone: "users",
      },
      {
        href: "/contas-correntes/fornecedores",
        pendente: true,
        rotulo: "Fornecedores",
        seccao: "Contas Correntes",
        cap: "financeiro.ver",
        icone: "truck",
      },
    ],
  },

  {
    rotulo: "Comercial",
    modulo: "comercial",
    filhos: [
      {
        href: "/comercial",
        pendente: true,
        rotulo: "Painel",
        seccao: "Painel",
        cap: "comercial.ver",
        icone: "dashboard",
      },
      {
        href: "/comercial/vendas",
        pendente: true,
        rotulo: "Vendas",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "cart",
      },
      {
        href: "/comercial/consulta-faturas",
        pendente: true,
        rotulo: "Consulta de Faturas",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "consultaFatura",
      },
      {
        href: "/comercial/clientes",
        pendente: true,
        rotulo: "Clientes",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "users",
      },
      {
        href: "/comercial/vendedores",
        pendente: true,
        rotulo: "Vendedores",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "tie",
      },
    ],
  },

  {
    rotulo: "Logística",
    modulo: "logistica",
    filhos: [
      {
        href: "/logistica/artigos",
        pendente: true,
        rotulo: "Artigos",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "package",
      },
      {
        href: "/logistica/compras",
        pendente: true,
        rotulo: "Compras",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "cart",
      },
      {
        href: "/logistica/rececao",
        pendente: true,
        rotulo: "Receção",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "arrowIn",
      },
      {
        href: "/logistica/expedicao",
        pendente: true,
        rotulo: "Expedição",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "arrowOut",
      },
      {
        href: "/logistica/transferencia",
        pendente: true,
        rotulo: "Transferência",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "fluxos",
      },
      {
        href: "/logistica/acerto-positivo",
        pendente: true,
        rotulo: "Acerto Positivo",
        seccao: "Operações Logísticas",
        cap: "logistica.ver",
        icone: "clipboard",
      },
      {
        href: "/logistica/acerto-negativo",
        pendente: true,
        rotulo: "Acerto Negativo",
        seccao: "Operações Logísticas",
        cap: "logistica.ver",
        icone: "trendingDown",
      },
      {
        href: "/logistica/existencias",
        pendente: true,
        rotulo: "Existências",
        seccao: "Exploração",
        cap: "logistica.ver",
        icone: "caixa",
      },
      {
        href: "/logistica/armazens",
        pendente: true,
        rotulo: "Armazéns",
        seccao: "Recursos",
        cap: "logistica.ver",
        icone: "warehouse",
      },
      {
        href: "/logistica/fornecedores",
        pendente: true,
        rotulo: "Fornecedores",
        seccao: "Recursos",
        cap: "logistica.ver",
        icone: "users",
      },
    ],
  },

  {
    rotulo: "Imobilizados",
    modulo: "imobilizados",
    filhos: [
      {
        href: "/imobilizados",
        pendente: true,
        rotulo: "Painel",
        seccao: "Painel",
        cap: "imob.ver",
        icone: "dashboard",
      },
      {
        href: "/imobilizados/ativos",
        pendente: true,
        rotulo: "Ficha de Ativos",
        seccao: "Imobilizado",
        cap: "imob.ver",
        icone: "imob",
      },
      {
        href: "/imobilizados/amortizacoes",
        pendente: true,
        rotulo: "Amortizações",
        seccao: "Imobilizado",
        cap: "imob.ver",
        icone: "trendingDown",
      },
    ],
  },

  {
    rotulo: "RH",
    modulo: "rh",
    filhos: [
      {
        href: "/rh",
        pendente: true,
        rotulo: "Painel",
        seccao: "Painel",
        cap: "rh.ver",
        icone: "dashboard",
      },
      {
        href: "/rh/funcionarios",
        pendente: true,
        rotulo: "Funcionários",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "users",
      },
      {
        href: "/rh/alteracoes",
        pendente: true,
        rotulo: "Alterações Mensais",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "calendarEdit",
      },
      {
        href: "/rh/processamento",
        pendente: true,
        rotulo: "Processamento",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "cog",
      },
      {
        href: "/rh/pagamentos",
        pendente: true,
        rotulo: "Pagamentos",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "banknote",
      },
      {
        href: "/rh/recibos",
        pendente: true,
        rotulo: "Recibos",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "receipt",
      },
      {
        href: "/rh/simulacao",
        pendente: true,
        rotulo: "Simulação",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "calculator",
      },
      {
        href: "/rh/independentes",
        pendente: true,
        rotulo: "Independentes",
        seccao: "Honorários",
        cap: "rh.ver",
        icone: "tie",
      },
      {
        href: "/rh/tabelas",
        pendente: true,
        rotulo: "Tabelas",
        seccao: "Recursos",
        cap: "rh.ver",
        icone: "award",
      },
    ],
  },

  {
    rotulo: "Fiscalidade",
    modulo: "fiscalidade",
    filhos: [
      {
        href: "/fiscalidade",
        pendente: true,
        rotulo: "Impostos",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "fiscalidade",
      },
      {
        href: "/fiscalidade/regimes-iva",
        pendente: true,
        rotulo: "Regimes de IVA",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "balancete",
      },
      {
        href: "/fiscalidade/obrigacoes",
        pendente: true,
        rotulo: "Obrigações",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "notas",
      },
      {
        href: "/fiscalidade/calendario",
        pendente: true,
        rotulo: "Calendário Fiscal",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "diarios",
      },
      {
        href: "/fiscalidade/mapa-remuneracoes",
        pendente: true,
        rotulo: "Mapa de Remunerações",
        seccao: "Declarações",
        cap: "rh.ver",
        icone: "receipt",
      },
    ],
  },

  // Módulo novo na Produção — não existe no Piloto.
  {
    rotulo: "Assistente",
    filhos: [
      {
        href: "/assistente",
        pendente: true,
        rotulo: "Perguntas e Respostas",
        seccao: "Assistente",
        cap: "contab.ver",
        icone: "sparkles",
      },
      {
        href: "/assistente/diagnostico",
        pendente: true,
        rotulo: "Diagnóstico",
        seccao: "Assistente",
        cap: "contab.ver",
        icone: "shield",
      },
    ],
  },

  {
    rotulo: "Gestão",
    filhos: [
      {
        href: "/gestao/utilizadores",
        pendente: true,
        rotulo: "Utilizadores",
        seccao: "Sistema",
        perfis: ["admin"],
        icone: "users",
      },
    ],
  },

  {
    rotulo: "Configurações",
    href: "/configuracoes",
    perfis: ["admin"],
    pendente: true,
  },
];

/**
 * Navegação visível: só o que já existe. À medida que as páginas forem sendo
 * construídas, basta tirar-lhes o `pendente` em NAV_COMPLETO.
 */
export const NAV: GrupoNav[] = NAV_COMPLETO.filter((g) => !g.pendente)
  .map((g) => ({ ...g, filhos: g.filhos?.filter((f) => !f.pendente) }))
  // Um grupo cujos filhos estejam todos por construir desaparece da barra.
  .filter((g) => !g.filhos || g.filhos.length > 0);

/** O grupo a que uma rota pertence — decide o ribbon a mostrar. */
export function grupoDaRota(caminho: string): GrupoNav | null {
  // Mais específico primeiro: /contabilidade/movimentos antes de /contabilidade.
  let melhor: GrupoNav | null = null;
  let melhorTamanho = -1;
  for (const g of NAV) {
    for (const f of g.filhos ?? []) {
      if (
        (caminho === f.href || caminho.startsWith(`${f.href}/`)) &&
        f.href.length > melhorTamanho
      ) {
        melhor = g;
        melhorTamanho = f.href.length;
      }
    }
  }
  return melhor;
}

export function itemActivo(caminho: string, href: string): boolean {
  if (href === "/") return caminho === "/";
  return caminho === href || caminho.startsWith(`${href}/`);
}
