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
export function imprimirComoPdf(nome: string): void {
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
 */
export function imprimirPagina(nome?: string | null): void {
  if (typeof window === "undefined") return;
  const h1 = document.querySelector("h1")?.textContent?.trim();
  imprimirComoPdf(nome?.trim() || h1 || document.title);
}
