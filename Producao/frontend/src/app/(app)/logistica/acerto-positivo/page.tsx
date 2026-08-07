"use client";

import {
  type ConfigMovimento,
  PaginaMovimento,
} from "@/components/logistica/MovimentoStock";

const CONFIG: ConfigMovimento = {
  tipo: "ajuste",
  titulo: "Acerto Positivo",
  descricao:
    "Correcção de inventário para mais — sobras encontradas na contagem física.",
  sinal: 1,
  custoEditavel: true,
  custoPadrao: "compra",
  efeito:
    "Debita a conta de existências e credita a conta de regularização. Use quando a contagem física dá mais do que o sistema tem registado.",
};

export default function Pagina() {
  return <PaginaMovimento config={CONFIG} />;
}
