"use client";

import {
  type ConfigMovimento,
  PaginaMovimento,
} from "@/components/logistica/MovimentoStock";

const CONFIG: ConfigMovimento = {
  tipo: "saida",
  titulo: "Expedição",
  descricao:
    "Saída de mercadoria do armazém, valorizada ao Custo Médio Ponderado corrente.",
  custoEditavel: false,
  efeito:
    "Debita a conta de custo das existências vendidas e credita a conta de existências. Não é possível expedir mais do que o stock disponível.",
};

export default function Pagina() {
  return <PaginaMovimento config={CONFIG} />;
}
