import { iconeNav } from "@/components/layout/iconesNav";
import { cn } from "@/lib/utils";

/**
 * Um ícone do nosso conjunto, desenhado a traço.
 *
 * Os traçados vivem em `iconesNav.ts`, portados do `ICO` do Piloto: todos na
 * mesma grelha de 24 e com a mesma espessura. Este componente existe para que
 * não haja duas maneiras de os desenhar — o ribbon fazia-o de um jeito, os
 * cartões do explorador de outro, e a espessura acabava por divergir.
 *
 * `currentColor` de propósito: o ícone toma a cor do texto à volta, e é assim
 * que se mantém legível em tema claro, escuro e na impressão a preto.
 */
export function IconeDeLinha({
  nome,
  tamanho = 18,
  className,
}: {
  nome: string;
  tamanho?: number;
  className?: string;
}) {
  const traco = iconeNav(nome);
  if (!traco) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      focusable="false"
      className={cn(
        "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]",
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: traçado constante do nosso próprio iconesNav.ts — não há entrada de utilizador neste caminho.
      dangerouslySetInnerHTML={{ __html: traco }}
    />
  );
}
