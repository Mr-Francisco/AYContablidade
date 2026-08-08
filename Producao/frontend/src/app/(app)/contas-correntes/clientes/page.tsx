"use client";

import {
  type ConfigContaCorrente,
  PaginaContasCorrentes,
} from "@/components/contabilidade/ContasCorrentes";

const CONFIG: ConfigContaCorrente = {
  prefixo: "31",
  natureza: "D",
  titulo: "Contas Correntes — Clientes",
  descricao:
    "Saldo de cada cliente a partir dos movimentos das contas 31. O saldo positivo é dívida do cliente.",
  rotuloSaldo: "A receber",
  corSaldo: "var(--grafico-6)",
};

export default function Pagina() {
  return <PaginaContasCorrentes config={CONFIG} />;
}
