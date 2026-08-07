"use client";

import {
  type ConfigMovimento,
  PaginaMovimento,
} from "@/components/logistica/MovimentoStock";

const CONFIG: ConfigMovimento = {
  tipo: "transferencia",
  titulo: "Transferência",
  descricao: "Movimentação de stock entre armazéns da mesma empresa.",
  custoEditavel: false,
  pedeDestino: true,
  efeito:
    "Não gera lançamento contabilístico: a mercadoria continua a ser da empresa e o património não muda. Só o armazém onde está é que muda.",
};

export default function Pagina() {
  return <PaginaMovimento config={CONFIG} />;
}
