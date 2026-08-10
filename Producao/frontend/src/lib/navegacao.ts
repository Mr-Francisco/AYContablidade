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
  /** Área da plataforma, não de uma empresa. É o único grupo que faz sentido
   *  para uma conta sem empresa — todos os outros consultam dados de negócio
   *  e respondem 400 a quem não pertence a nenhuma. */
  daPlataforma?: boolean;
}

const NAV_COMPLETO: GrupoNav[] = [
  { rotulo: "Painel", href: "/painel" },

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
        href: "/contabilidade/explorador",
        rotulo: "Explorador",
        seccao: "Contabilidade",
        cap: "contab.ver",
        icone: "explorador",
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
      {
        href: "/contabilidade/exercicios",
        rotulo: "Exercícios",
        seccao: "Tabelas",
        cap: "contab.ver",
        icone: "calendario",
      },
    ],
  },

  {
    rotulo: "Analítica",
    modulo: "analitica",
    filhos: [
      {
        href: "/analitica",
        rotulo: "Painel",
        seccao: "Painel",
        cap: "analitica.ver",
        icone: "dashboard",
      },
      {
        href: "/analitica/mapa",
        rotulo: "Mapa de Custos",
        seccao: "Analítica",
        cap: "analitica.ver",
        icone: "balancete",
      },
      {
        href: "/analitica/centros",
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
        rotulo: "Painel",
        seccao: "Painel",
        cap: "financeiro.ver",
        icone: "dashboard",
      },
      {
        href: "/contas-correntes/clientes",
        rotulo: "Clientes",
        seccao: "Contas Correntes",
        cap: "financeiro.ver",
        icone: "users",
      },
      {
        href: "/contas-correntes/fornecedores",
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
        rotulo: "Painel",
        seccao: "Painel",
        cap: "comercial.ver",
        icone: "dashboard",
      },
      {
        href: "/comercial/vendas",
        rotulo: "Vendas",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "cart",
      },
      {
        href: "/comercial/consulta-faturas",
        rotulo: "Consulta de Faturas",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "consultaFatura",
      },
      {
        href: "/comercial/clientes",
        rotulo: "Clientes",
        seccao: "Comercial",
        cap: "comercial.ver",
        icone: "users",
      },
      {
        href: "/comercial/vendedores",
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
        rotulo: "Artigos",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "package",
      },
      {
        href: "/logistica/compras",
        rotulo: "Compras",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "cart",
      },
      {
        href: "/logistica/rececao",
        rotulo: "Receção",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "arrowIn",
      },
      {
        href: "/logistica/expedicao",
        rotulo: "Expedição",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "arrowOut",
      },
      {
        href: "/logistica/transferencia",
        rotulo: "Transferência",
        seccao: "Inventário",
        cap: "logistica.ver",
        icone: "fluxos",
      },
      {
        href: "/logistica/acerto-positivo",
        rotulo: "Acerto Positivo",
        seccao: "Operações Logísticas",
        cap: "logistica.ver",
        icone: "clipboard",
      },
      {
        href: "/logistica/acerto-negativo",
        rotulo: "Acerto Negativo",
        seccao: "Operações Logísticas",
        cap: "logistica.ver",
        icone: "trendingDown",
      },
      {
        href: "/logistica/existencias",
        rotulo: "Existências",
        seccao: "Exploração",
        cap: "logistica.ver",
        icone: "caixa",
      },
      {
        href: "/logistica/armazens",
        rotulo: "Armazéns",
        seccao: "Recursos",
        cap: "logistica.ver",
        icone: "warehouse",
      },
      {
        href: "/logistica/fornecedores",
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
        rotulo: "Painel",
        seccao: "Painel",
        cap: "imob.ver",
        icone: "dashboard",
      },
      {
        href: "/imobilizados/ativos",
        rotulo: "Ficha de Ativos",
        seccao: "Imobilizado",
        cap: "imob.ver",
        icone: "imob",
      },
      {
        href: "/imobilizados/amortizacoes",
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
        rotulo: "Painel",
        seccao: "Painel",
        cap: "rh.ver",
        icone: "dashboard",
      },
      {
        href: "/rh/funcionarios",
        rotulo: "Funcionários",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "users",
      },
      {
        href: "/rh/alteracoes",
        rotulo: "Alterações Mensais",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "calendarEdit",
      },
      {
        href: "/rh/processamento",
        rotulo: "Processamento",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "cog",
      },
      {
        href: "/rh/pagamentos",
        rotulo: "Pagamentos",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "banknote",
      },
      {
        href: "/rh/recibos",
        rotulo: "Recibos",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "receipt",
      },
      {
        href: "/rh/simulacao",
        rotulo: "Simulação",
        seccao: "Salários",
        cap: "rh.ver",
        icone: "calculator",
      },
      {
        href: "/rh/independentes",
        rotulo: "Independentes",
        seccao: "Honorários",
        cap: "rh.ver",
        icone: "tie",
      },
      {
        href: "/rh/tabelas",
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
        rotulo: "Impostos",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "fiscalidade",
      },
      {
        href: "/fiscalidade/regimes-iva",
        rotulo: "Regimes de IVA",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "balancete",
      },
      {
        href: "/fiscalidade/obrigacoes",
        rotulo: "Obrigações",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "notas",
      },
      {
        href: "/fiscalidade/calendario",
        rotulo: "Calendário Fiscal",
        seccao: "Fiscalidade",
        cap: "contab.ver",
        icone: "diarios",
      },
      {
        href: "/fiscalidade/mapa-remuneracoes",
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
        rotulo: "Perguntas e Respostas",
        seccao: "Assistente",
        cap: "contab.ver",
        icone: "sparkles",
      },
      {
        href: "/assistente/diagnostico",
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
        rotulo: "Utilizadores",
        seccao: "Sistema",
        perfis: ["admin"],
        icone: "users",
      },
      {
        href: "/gestao/auditoria",
        rotulo: "Auditoria",
        seccao: "Sistema",
        perfis: ["admin"],
        icone: "shield",
      },
    ],
  },

  // Área da PLATAFORMA, não de uma empresa. Só o superadministrador a vê, e é
  // por isso que `perfis` traz apenas «superadmin»: o filtro do cabeçalho deixa
  // o superadmin passar onde diga «admin», mas o inverso não acontece — um
  // administrador de empresa nunca vê isto.
  {
    rotulo: "Plataforma",
    daPlataforma: true,
    filhos: [
      {
        href: "/plataforma",
        rotulo: "Empresas",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "empresa",
      },
      {
        href: "/plataforma/licencas",
        rotulo: "Licenças",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "award",
      },
      {
        href: "/plataforma/consumo-ia",
        rotulo: "Consumo de IA",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "sparkles",
      },
      {
        href: "/plataforma/contas",
        rotulo: "Contas",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "utilizadores",
      },
      {
        href: "/plataforma/auditoria",
        rotulo: "Auditoria",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "shield",
      },
      {
        href: "/plataforma/configuracoes",
        rotulo: "Configurações",
        seccao: "Plataforma",
        perfis: ["superadmin"],
        icone: "cog",
      },
    ],
  },

  {
    rotulo: "Configurações",
    href: "/configuracoes",
    perfis: ["admin"],
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
