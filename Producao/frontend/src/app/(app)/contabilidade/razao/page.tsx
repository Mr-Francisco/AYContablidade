"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Kpi,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { AccoesDoMapa } from "@/components/ui/AccoesDoMapa";
import { FalhaAoCarregar } from "@/components/ui/FalhaAoCarregar";
import { RodapeHistorico, useHistorico } from "@/components/ui/Historico";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useContas, useExercicios } from "@/lib/hooks";

interface LinhaRazao {
  lancamento_id: string;
  numero: number;
  numero_op: string;
  data: string;
  diario: string;
  documento: string;
  documento_ref: string;
  descricao: string | null;
  entidade: string;
  contraparte: string;
  debito: string;
  credito: string;
  saldo: string;
}

interface Razao {
  codigo: string;
  linhas: LinhaRazao[];
  total_debito: string;
  total_credito: string;
  saldo_final: string;
  natureza: "D" | "C";
}

export default function PaginaRazao() {
  return (
    <Suspense fallback={<ACarregar />}>
      <Conteudo />
    </Suspense>
  );
}

function Conteudo() {
  const parametros = useSearchParams();
  const { empresa } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { contas } = useContas();

  const [conta, setConta] = useState(parametros.get("conta") ?? "");
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [incluirSubcontas, setIncluirSubcontas] = useState(false);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  // TODAS as contas activas, de movimento E de integração — é o que o Piloto
  // põe na caixa. Uma integradora sem subcontas ligadas não mostra nada, mas
  // com «incluir subcontas» é exactamente como se vê o razão de um grupo
  // inteiro, e era um uso que aqui não existia.
  const opcoesConta = useMemo(
    () =>
      contas
        .filter((c) => c.ativa)
        .slice(0, 2000)
        .map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} — ${c.nome}` })),
    [contas],
  );

  // ABRE JÁ NUMA CONTA, como o Piloto. Lá a caixa é um `<select>` com as
  // opções todas, e um `<select>` nasce com a primeira escolhida — abrir o
  // razão mostra logo um razão. Aqui ficava «Escolha uma conta» e não se
  // carregava nada, o que faz o ecrã parecer avariado a quem vem do Piloto.
  //
  // O `?conta=` do endereço continua a mandar: é por aí que o balancete abre a
  // conta em que se fez duplo clique.
  useEffect(() => {
    if (!conta && opcoesConta.length > 0) setConta(opcoesConta[0].valor);
  }, [conta, opcoesConta]);

  const nomeConta = contas.find((c) => c.codigo === conta)?.nome;

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (incluirSubcontas) p.set("incluir_subcontas", "true");

  const { data, isLoading, error } = useSWR<Razao>(
    conta ? `/api/contabilidade/razao/${conta}?${p}` : null,
    buscador,
  );

  // A lista cresce com o exercício; o rodapé diz quantos são.
  const historico = useHistorico(data?.linhas);

  return (
    <>
      <CabecalhoPagina
        titulo="Razão"
        descricao="Movimentos de uma conta, com saldo corrido."
        accoes={
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <Selo cor={data.natureza === "D" ? "#1e5fcc" : "#7a3aab"}>
                Conta {data.natureza === "D" ? "devedora" : "credora"}
              </Selo>
            )}
            <AccoesDoMapa />
          </div>
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Conta"
          valor={conta}
          aoMudar={setConta}
          opcoes={opcoesConta}
          placeholder="Escolher conta…"
          larguraMinima="20rem"
          className="flex-1"
        />
        <Selector
          rotulo="Exercício"
          valor={exId ?? ""}
          aoMudar={setExercicioId}
          opcoes={exercicios.map((e) => ({
            valor: e.id,
            rotulo: `${e.nome}${e.ativo ? " · activo" : ""}`,
          }))}
          larguraMinima="13rem"
        />
        <Campo rotulo="De">
          <Entrada
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Até">
          <Entrada
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </Campo>
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-[13px] text-texto-suave">
          <input
            type="checkbox"
            checked={incluirSubcontas}
            onChange={(e) => setIncluirSubcontas(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-marca)]"
          />
          Incluir subcontas
        </label>
      </BarraFiltros>

      {!conta ? (
        <Alerta tipo="info">Escolha uma conta para ver o razão.</Alerta>
      ) : isLoading ? (
        <ACarregar />
      ) : !data ? (
        <FalhaAoCarregar erro={error} oQue="o razão" />
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <Kpi
                rotulo="Total débito"
                valor={formataCompacto(data.total_debito, moeda)}
                cor="var(--grafico-4)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Total crédito"
                valor={formataCompacto(data.total_credito, moeda)}
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Saldo final"
                valor={formataCompacto(data.saldo_final, moeda)}
                detalhe={`${conta}${nomeConta ? ` · ${nomeConta}` : ""}`}
                cor="var(--grafico-2)"
              />
            </div>
          </div>

          <Cartao className="p-0">
            {data.linhas.length === 0 ? (
              <Vazio>Esta conta não tem movimentos no período.</Vazio>
            ) : (
              <>
                <EnvolveTabela className="rounded-none border-0">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Data</Th>
                        <Th>Nº Operação</Th>
                        <Th>Dia.</Th>
                        <Th>Doc.</Th>
                        <Th>Referência</Th>
                        <Th>Descrição</Th>
                        <Th>Entidade</Th>
                        <Th>Contrapartida</Th>
                        <Th numerico>Débito</Th>
                        <Th numerico>Crédito</Th>
                        <Th numerico>Saldo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.visiveis.map((l) => (
                        <Tr
                          key={`${l.lancamento_id}-${l.numero_op}-${l.saldo}`}
                        >
                          <Td className="tabular">
                            {new Date(l.data).toLocaleDateString("pt-PT")}
                          </Td>
                          <Td className="tabular font-semibold">
                            {l.numero_op}
                          </Td>
                          <Td className="tabular">{l.diario}</Td>
                          <Td className="tabular">{l.documento}</Td>
                          <Td className="text-texto-suave">
                            {l.documento_ref || "—"}
                          </Td>
                          <Td className="max-w-[260px] truncate">
                            <span title={l.descricao ?? ""}>
                              {l.descricao || "—"}
                            </span>
                          </Td>
                          <Td className="max-w-[160px] truncate">
                            {l.entidade || "—"}
                          </Td>
                          <Td className="tabular text-texto-suave">
                            {l.contraparte || "—"}
                          </Td>
                          <Td numerico>
                            {l.debito === "0.00"
                              ? ""
                              : formataMoeda(l.debito, moeda)}
                          </Td>
                          <Td numerico>
                            {l.credito === "0.00"
                              ? ""
                              : formataMoeda(l.credito, moeda)}
                          </Td>
                          <Td numerico className="font-semibold">
                            {formataMoeda(l.saldo, moeda)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-superficie-2 font-extrabold">
                        <Td colSpan={8}>TOTAIS</Td>
                        <Td numerico>
                          {formataMoeda(data.total_debito, moeda)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(data.total_credito, moeda)}
                        </Td>
                        <Td numerico>
                          {formataMoeda(data.saldo_final, moeda)}
                        </Td>
                      </tr>
                    </tfoot>
                  </Tabela>
                </EnvolveTabela>
                <RodapeHistorico {...historico} nome="movimentos" />
              </>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
