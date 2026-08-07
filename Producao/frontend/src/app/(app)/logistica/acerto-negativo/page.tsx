"use client";

import {
  type ConfigMovimento,
  PaginaMovimento,
} from "@/components/logistica/MovimentoStock";

const CONFIG: ConfigMovimento = {
  tipo: "ajuste",
  titulo: "Acerto Negativo",
  descricao:
    "Correcção de inventário para menos — quebras, perdas ou diferenças de contagem.",
  sinal: -1,
  custoEditavel: true,
  custoPadrao: "cump",
  efeito:
    "Debita a conta de regularização e credita a conta de existências. O acerto não pode ser maior do que o stock disponível.",
};

export default function Pagina() {
  return <PaginaMovimento config={CONFIG} />;
}
