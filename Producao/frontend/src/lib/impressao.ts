/* ---------------------------------------------------------------------------
   Imprimir, e guardar em PDF com um nome que se reconheça.

   O PROBLEMA, que só se vê depois de guardar o segundo ficheiro: o browser dá
   ao PDF o nome do TÍTULO DA PÁGINA. Guardar dez facturas dava dez ficheiros
   chamados «SGD — Software de Gestão Dirigida.pdf», e a partir do terceiro
   ninguém sabe qual é qual sem os abrir um a um.

   Não há forma de nomear o ficheiro pela janela de impressão — mas o título é
   nosso. Troca-se antes de abrir a janela e repõe-se depois de ela fechar.

   PORQUE NÃO SE GERA O PDF NO SERVIDOR: geraria. Seria melhor para arquivar e
   para enviar por e-mail, e é o caminho quando houver comunicação de documentos
   à AGT. Mas obrigava a redesenhar cada documento em Python, e o que ficasse
   diferente do ecrã só se descobriria com o cliente a olhar para os dois. Esta
   via imprime EXACTAMENTE o que está no ecrã — que é o que foi conferido.
--------------------------------------------------------------------------- */

/** Tira do nome o que um sistema de ficheiros recusa. */
function nomeSeguro(nome: string): string {
  return (
    nome
      // `\ / : * ? " < > |` não podem estar num nome de ficheiro em Windows.
      .replace(/[\\/:*?"<>|]/g, "-")
      // Espaços repetidos vêm de campos vazios pelo meio.
      .replace(/\s+/g, " ")
      .trim()
      // Um nome muito comprido é truncado pelo sistema a meio de uma palavra.
      .slice(0, 120) || "documento"
  );
}

/**
 * Abre a janela de impressão com o título trocado, para o PDF sair com nome.
 *
 * Em «Guardar como PDF» o browser propõe o título como nome do ficheiro. Fica
 * `FT 2026-0001 — AS Imagem, Lda.pdf` em vez do nome da aplicação.
 */
export function imprimirComoPdf(nome: string, aoTerminar?: () => void): void {
  if (typeof window === "undefined") return;

  const original = document.title;
  document.title = nomeSeguro(nome);

  // REPOR O TÍTULO, e por duas vias. O `afterprint` é o sinal certo — dispara
  // quando a janela fecha, quer se tenha guardado quer se tenha cancelado —,
  // mas há browsers que não o disparam de todo. Sem a segunda via, a aplicação
  // ficava com o nome de uma factura no separador até se recarregar a página.
  let reposto = false;
  const repor = () => {
    if (reposto) return;
    reposto = true;
    document.title = original;
    aoTerminar?.();
    window.removeEventListener("afterprint", repor);
  };

  window.addEventListener("afterprint", repor);
  // A rede de segurança. Generosa de propósito: quem está a escolher a pasta
  // onde guardar demora, e repor cedo demais devolvia o nome errado ao
  // ficheiro.
  window.setTimeout(repor, 60_000);

  window.print();
}

/** O nome de um documento comercial: tipo, número e titular. */
export function nomeDoDocumento(
  tipo: string,
  numero: string | null | undefined,
  titular?: string | null,
): string {
  const partes = [tipo, numero ?? "rascunho"].filter(Boolean).join(" ");
  return titular ? `${partes} — ${titular}` : partes;
}

/**
 * Imprime a página inteira — um mapa, um recibo de vencimento — com nome.
 *
 * SEM `nome`, VAI BUSCÁ-LO AO TÍTULO DO ECRÃ. É de propósito: cada mapa já
 * escreve o seu nome no cabeçalho da página («Balancete Geral», «Fluxos de
 * Caixa», «Retenções na Fonte»), e é esse o nome por que a pessoa o conhece.
 * Ir buscá-lo ali evita ter de o repetir em cada uma das dezasseis páginas —
 * e evita que os dois deixem de coincidir quando um deles mudar.
 *
 * Quem quiser um nome mais completo — com o mês, com a conta — passa-o.
 *
 * `deitado` VIRA A FOLHA. Um balancete com «Anterior, Período e Acumulado»
 * são nove colunas de números: em pé não cabem, e o que não cabe o browser
 * corta ou encolhe até não se ler. O Piloto vira a folha em cinco mapas
 * (`body.print-landscape`), e são esses cinco que a passam aqui.
 */
export function imprimirPagina(
  nome?: string | null,
  { deitado = false }: { deitado?: boolean } = {},
): void {
  if (typeof window === "undefined") return;

  const h1 = document.querySelector("h1")?.textContent?.trim();
  if (deitado) document.body.classList.add("imprimir-deitado");

  imprimirComoPdf(nome?.trim() || h1 || document.title, () => {
    document.body.classList.remove("imprimir-deitado");
  });
}

/* ---------------------------------------------------------------------------
   OS DOIS FORMATOS DE UM DOCUMENTO — do Piloto (`assets/js/fatura-doc.js`).

   O Piloto imprimia uma factura de duas maneiras, à escolha na altura de
   imprimir: **A4**, o documento inteiro para arquivo e para o cliente, e
   **talão de 80 mm**, o rolo de uma impressora térmica de balcão. Não é a
   mesma folha mais pequena: no talão só cabem a descrição, a quantidade e o
   total, e tudo se empilha ao centro numa coluna.

   A Produção só tinha o A4, e quem vende ao balcão — a Venda a Dinheiro, a
   Factura Simplificada — não tinha como imprimir no papel que tem à frente.
--------------------------------------------------------------------------- */

export type FormatoDeImpressao = "a4" | "talao";

export const FORMATOS: { valor: FormatoDeImpressao; rotulo: string }[] = [
  { valor: "a4", rotulo: "A4 — documento" },
  { valor: "talao", rotulo: "Talão — 80 mm" },
];

/**
 * Imprime um documento legal — factura, recibo, proforma, talão.
 *
 * MARCA O `body` ENQUANTO IMPRIME, e é isso que separa um documento de um
 * mapa. As regras de impressão dos mapas põem tudo a preto e branco e desenham
 * uma grelha à volta de cada célula, o que num balancete é o que se quer e num
 * documento fiscal o desfigura. Com a marca no `body`, o documento imprime-se
 * com as suas cores e o resto do ecrã sai da folha.
 */
export function imprimirDocumento(
  nome: string,
  formato: FormatoDeImpressao = "a4",
): void {
  if (typeof window === "undefined") return;

  document.body.classList.add("imprimir-documento");
  if (formato === "talao") document.body.classList.add("imprimir-talao");

  imprimirComoPdf(nome, () => {
    document.body.classList.remove("imprimir-documento", "imprimir-talao");
  });
}
