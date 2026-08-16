import type { Metadata } from "next";

/**
 * Metadados de «Entrar».
 *
 * A página é um componente de cliente — tem estado, campos e validação — e um
 * componente de cliente não pode exportar `metadata`. Este `layout` existe só
 * para isso: dar-lhe um título próprio e mantê-la fora dos motores de busca.
 *
 * Sem título próprio, os três ecrãs públicos partilhavam o do site e o
 * histórico do browser ficava com três entradas iguais.
 */
export const metadata: Metadata = {
  title: "Entrar",
  description: "Aceda à sua conta do SGD para continuar.",
  robots: { index: false, follow: false },
};

export default function Envolvente({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
