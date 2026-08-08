"use client";

import {
  type ConfigContaCorrente,
  PaginaContasCorrentes,
} from "@/components/contabilidade/ContasCorrentes";

const CONFIG: ConfigContaCorrente = {
  prefixo: "32",
  natureza: "C",
  titulo: "Contas Correntes — Fornecedores",
  descricao:
    "Saldo de cada fornecedor a partir dos movimentos das contas 32. O saldo positivo é dívida da empresa.",
  rotuloSaldo: "A pagar",
  corSaldo: "var(--grafico-4)",
};

export default function Pagina() {
  return <PaginaContasCorrentes config={CONFIG} />;
}
