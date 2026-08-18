import type { Metadata } from "next";

/**
 * Metadados de «Pedir acesso».
 *
 * A página é um componente de cliente — tem estado, campos e validação — e um
 * componente de cliente não pode exportar `metadata`. Este `layout` existe só
 * para isso: dar-lhe um título próprio e mantê-la fora dos motores de busca.
 *
 * Sem título próprio, os três ecrãs públicos partilhavam o do site e o
 * histórico do browser ficava com três entradas iguais.
 */
export const metadata: Metadata = {
  title: "Pedir acesso a uma empresa",
  description:
    "Peça acesso a uma empresa que já usa o SGD. Não precisa de escolher palavra-passe: se o pedido for aceite, a empresa entrega-lha.",
  robots: { index: false, follow: false },
};

export default function Envolvente({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
