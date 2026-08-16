/**
 * Dados institucionais mostrados na página pública.
 *
 * Vivem aqui, num sítio só, porque são a única parte da apresentação que
 * depende de informação que o código não sabe: contactos, morada, número de
 * contribuinte. Ficam VAZIOS de propósito — a página só mostra as entradas
 * preenchidas, e é preferível não mostrar um contacto a mostrar um inventado.
 *
 * Para os publicar, preencha `valor` (e `href`, quando fizer sentido).
 */
export interface DadoInstitucional {
  rotulo: string;
  valor: string;
  /** Link, quando o dado é accionável: `mailto:`, `tel:`, uma morada. */
  href?: string;
}

export const DADOS_INSTITUCIONAIS: DadoInstitucional[] = [
  { rotulo: "Contacto", valor: "", href: "" },
  { rotulo: "Telefone", valor: "", href: "" },
  { rotulo: "Morada", valor: "" },
  { rotulo: "NIF", valor: "" },
];

/**
 * Endereço público do site, usado nas etiquetas canónicas, no Open Graph, no
 * `sitemap.xml` e no `robots.txt`.
 *
 * Vem do ambiente porque muda entre a máquina de desenvolvimento e a
 * instalação real, e uma etiqueta canónica a apontar para `localhost` tira a
 * página dos resultados de pesquisa.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

/**
 * Quem fez isto.
 *
 * Vive aqui e não espalhado pelos metadados, pelo rodapé e pelos dados
 * estruturados: são três sítios a dizer o mesmo, e três sítios a dizer o mesmo
 * é a garantia de que um dia dizem coisas diferentes.
 */
export const AUTOR = {
  nome: "Francisco André",
  github: "https://github.com/Mr-Francisco",
} as const;

/** Contribuição reconhecida no produto. */
export const CONTRIBUICAO = {
  nome: "Acácio Lemos",
  papel: "Contribuição",
} as const;

/** Nome por extenso do produto, usado em títulos e dados estruturados. */
export const PRODUTO = {
  nome: "SGD",
  nomeCompleto: "SGD — Software de Gestão Dirigida",
  descricaoCurta:
    "ERP de contabilidade para empresas em Angola, em conformidade com o PGC-AR.",
} as const;
