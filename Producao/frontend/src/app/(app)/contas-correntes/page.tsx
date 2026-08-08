"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Kpi,
  Selector,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import {
  compara,
  formataCompacto,
  formataMoeda,
  subtrai,
} from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { ContasCorrentes } from "@/types";

export default function PainelContasCorrentes() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();
  const [exercicioId, setExercicioId] = useState("");

  const exId = exercicioId || activo?.id || "";
  const sufixo = exId ? `&exercicio_id=${exId}` : "";

  const { data: clientes, isLoading } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=31&natureza=D${sufixo}`,
    buscador,
  );
  const { data: fornecedores } = useSWR<ContasCorrentes>(
    `/api/contabilidade/contas-correntes?prefixo=32&natureza=C${sufixo}`,
    buscador,
  );

  const aReceber = clientes?.totais.saldo ?? "0";
  const aPagar = fornecedores?.totais.saldo ?? "0";
  // A posição líquida não é tesouraria: é o que sobra se tudo o que está em
  // dívida for recebido e pago. Diz o sentido, não o dinheiro disponível.
  const posicao = subtrai(aReceber, aPagar);

  return (
    <>
      <CabecalhoPagina
        titulo="Contas Correntes"
        descricao="Posição de clientes e fornecedores, a partir dos movimentos das contas 31 e 32."
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Exercício"
          valor={exId}
          aoMudar={setExercicioId}
          opcoes={[
            { valor: "", rotulo: "Todos os exercícios" },
            ...exercicios.map((e) => ({ valor: e.id, rotulo: e.nome })),
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      {isLoading ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="A receber de clientes"
                valor={formataCompacto(aReceber, moeda)}
                detalhe={`${plural(clientes?.com_saldo ?? 0, "conta")} com saldo`}
                cor="var(--grafico-6)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="A pagar a fornecedores"
                valor={formataCompacto(aPagar, moeda)}
                detalhe={`${plural(fornecedores?.com_saldo ?? 0, "conta")} com saldo`}
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Posição líquida"
                valor={formataCompacto(posicao, moeda)}
                detalhe={
                  posicao.gte(0) ? "A favor da empresa" : "Contra a empresa"
                }
                cor={
                  posicao.gte(0) ? "var(--grafico-2)" : "var(--color-perigo)"
                }
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Contas movimentadas"
                valor={String(
                  (clientes?.linhas.length ?? 0) +
                    (fornecedores?.linhas.length ?? 0),
                )}
                detalhe="Clientes e fornecedores"
                cor="var(--grafico-1)"
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Resumo
              titulo="Maiores saldos de clientes"
              rotuloSaldo="A receber"
              href="/contas-correntes/clientes"
              dados={clientes}
              moeda={moeda}
            />
            <Resumo
              titulo="Maiores saldos de fornecedores"
              rotuloSaldo="A pagar"
              href="/contas-correntes/fornecedores"
              dados={fornecedores}
              moeda={moeda}
            />
          </div>

          <Alerta tipo="info" className="mt-4">
            A posição líquida é a diferença entre o que há a receber e a pagar —
            não é saldo de tesouraria. Um valor a favor da empresa não quer
            dizer dinheiro disponível, apenas que se deve menos do que se tem a
            receber.
          </Alerta>
        </>
      )}
    </>
  );
}

function Resumo({
  titulo,
  rotuloSaldo,
  href,
  dados,
  moeda,
}: {
  titulo: string;
  rotuloSaldo: string;
  href: string;
  dados?: ContasCorrentes;
  moeda: string;
}) {
  const linhas = [...(dados?.linhas ?? [])]
    .filter((l) => Math.abs(Number(l.saldo)) > 0.005)
    .sort((a, b) => compara(b.saldo, a.saldo))
    .slice(0, 8);

  return (
    <Cartao className="min-w-0 p-0">
      <TituloCartao
        className="px-5 pt-5"
        extra={
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-marca hover:underline"
          >
            Ver todas
            <ArrowRight size={13} aria-hidden />
          </Link>
        }
      >
        {titulo}
      </TituloCartao>
      {!linhas.length ? (
        <Vazio>Nenhuma conta com saldo.</Vazio>
      ) : (
        <EnvolveTabela className="rounded-none border-0 border-t">
          <Tabela>
            <thead>
              <tr>
                <Th>Conta</Th>
                <Th>Designação</Th>
                <Th numerico>{rotuloSaldo}</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Tr key={l.codigo}>
                  <Td className="tabular font-bold">
                    <a
                      href={`/contabilidade/extrato?conta=${l.codigo}`}
                      className="text-marca hover:underline"
                    >
                      {l.codigo}
                    </a>
                  </Td>
                  <Td className="max-w-[220px] truncate">{l.nome}</Td>
                  <Td
                    numerico
                    className={`font-semibold ${Number(l.saldo) < 0 ? "text-perigo" : ""}`}
                  >
                    {formataMoeda(l.saldo, moeda)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </EnvolveTabela>
      )}
    </Cartao>
  );
}
