"use client";

import Link from "next/link";

import { Alerta, Cartao, Selo, TituloCartao } from "@/components/ui";

/**
 * Permissões e Políticas.
 *
 * O Piloto tem aqui UM interruptor: «restringir a alteração das condições de
 * comissão a perfis autorizados». Na Produção esse interruptor não existe — e
 * não por esquecimento.
 *
 * A rota que altera um vendedor (`PATCH /api/comercial/vendedores/{id}`) já
 * exige `comercial.gerir`, no servidor, sempre. A restrição que o Piloto deixa
 * ligar e desligar está cá permanentemente ligada, e não há como a desligar
 * sem abrir a edição de vendedores a quem não a devia ter.
 *
 * Pôr aqui uma caixa que não muda nada seria pior do que não a ter: quem a
 * desligasse ficaria convencido de que tinha aberto uma permissão que continua
 * fechada. O ecrã diz então o que a regra É, que é a mesma informação sem a
 * mentira.
 */
export function Permissoes() {
  return (
    <>
      <Cartao className="mb-4">
        <TituloCartao>Permissões e Políticas</TituloCartao>

        <div className="flex flex-col divide-y divide-borda">
          <Linha
            politica="Condições de comissão dos vendedores"
            estado="Sempre restrita"
            detalhe="Alterar a percentagem ou o tipo de comissão exige comercial.gerir. Quem vende não altera a percentagem com que é pago."
          />
          <Linha
            politica="Perfis de acesso"
            estado="Fixos no sistema"
            detalhe="O que cada perfil pode fazer não é editável — é isso que garante que um perfil de consulta nunca lança documentos. Para mudar o perfil de uma pessoa, vá a Gestão → Utilizadores."
          />
          <Linha
            politica="Módulos por utilizador"
            estado="Por utilizador"
            detalhe="Um utilizador pode ser limitado a alguns módulos. A limitação vale para todo o acesso, e não apenas para o que aparece no menu."
          />
        </div>

        <Alerta tipo="info" className="mt-4">
          Esta política não pode ser desligada. Só quem tem permissão para gerir
          vendedores os consegue alterar, e essa verificação é sempre feita —
          independentemente do que esteja visível no ecrã.
        </Alerta>
      </Cartao>

      <Cartao>
        <TituloCartao>Gerir quem acede</TituloCartao>
        <p className="text-[13px] text-texto-suave">
          Perfis, módulos permitidos, estado da conta e verificação em dois
          passos são geridos por utilizador, em{" "}
          <Link
            href="/gestao/utilizadores"
            className="font-semibold text-marca hover:underline"
          >
            Gestão → Utilizadores
          </Link>
          .
        </p>
      </Cartao>
    </>
  );
}

function Linha({
  politica,
  estado,
  detalhe,
}: {
  politica: string;
  estado: string;
  detalhe: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-[16rem] flex-1">
        <b className="text-[13.5px]">{politica}</b>
        <p className="mt-0.5 text-[12.5px] text-texto-suave">{detalhe}</p>
      </div>
      <Selo cor="#1a9c5f">{estado}</Selo>
    </div>
  );
}
