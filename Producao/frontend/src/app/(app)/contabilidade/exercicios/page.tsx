"use client";

import { Exercicios } from "@/components/contabilidade/Exercicios";
import { CabecalhoPagina } from "@/components/ui";

/**
 * Exercícios económicos.
 *
 * Vive em Contabilidade e não em Configurações — que é o que o Piloto fazia —
 * porque em Produção Configurações é uma página de administrador, e quem tem
 * `contab.fechar` é o contabilista. Pôr o painel lá deixava o dono da
 * capacidade sem ecrã para a usar.
 *
 * Fica ao lado de Diários de propósito: são os dois travões de lançamento, o
 * grosso e o fino. O exercício fecha tudo; o fecho mensal fecha um diário num
 * mês.
 */
export default function PaginaExercicios() {
  return (
    <>
      <CabecalhoPagina
        titulo="Exercícios Económicos"
        descricao="Abrir, fechar e reabrir exercícios. Um exercício fechado não aceita lançamentos em nenhum diário."
      />
      <Exercicios />
    </>
  );
}
