"use client";

import {
  type ConfigMovimento,
  PaginaMovimento,
} from "@/components/logistica/MovimentoStock";

const CONFIG: ConfigMovimento = {
  tipo: "entrada",
  titulo: "Receção",
  descricao:
    "Entrada de mercadoria em armazém. Aumenta o stock e recalcula o Custo Médio Ponderado.",
  custoEditavel: true,
  custoPadrao: "compra",
  pedeEntidade: true,
  pedeIva: true,
  efeito:
    "Debita a conta de existências do artigo e credita a conta do fornecedor. Se indicar IVA, a parte dedutível vai para a conta de IVA suportado.",
};

export default function Pagina() {
  return <PaginaMovimento config={CONFIG} />;
}
