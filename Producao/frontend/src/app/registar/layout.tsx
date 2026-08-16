import type { Metadata } from "next";

/**
 * Metadados de «Registar numa empresa».
 *
 * A página é um componente de cliente — tem estado, campos e validação — e um
 * componente de cliente não pode exportar `metadata`. Este `layout` existe só
 * para isso: dar-lhe um título próprio e mantê-la fora dos motores de busca.
 *
 * Sem título próprio, os três ecrãs públicos partilhavam o do site e o
 * histórico do browser ficava com três entradas iguais.
 */
export const metadata: Metadata = {
  title: "Registar numa empresa",
  description: "Peça acesso a uma empresa que já usa o SGD.",
  robots: { index: false, follow: false },
};

export default function Envolvente({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
