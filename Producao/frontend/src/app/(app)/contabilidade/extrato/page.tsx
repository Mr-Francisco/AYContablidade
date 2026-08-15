"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { CampoConta } from "@/components/contabilidade/CampoConta";
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
import { useExercicios } from "@/lib/hooks";

interface LinhaExtrato {
  lancamento_id: string;
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

interface Extrato {
  codigo: string;
  linhas: LinhaExtrato[];
  total_debito: string;
  total_credito: string;
  saldo_final: string;
  natureza: "D" | "C";
}

export default function PaginaExtrato() {
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

  const [conta, setConta] = useState(parametros.get("conta") ?? "");
  const [entidade, setEntidade] = useState(parametros.get("entidade") ?? "");
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  // Ligado por omissão: o extracto de uma conta corrente agregadora só faz
  // sentido com as subcontas de cada entidade incluídas. Desliga-se para ver
  // só a própria conta, como o `fSub` do Piloto permite.
  const [incluirSubcontas, setIncluirSubcontas] = useState(true);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (entidade.trim()) p.set("entidade", entidade.trim());
  if (incluirSubcontas) p.set("incluir_subcontas", "true");

  const { data, isLoading, error } = useSWR<Extrato>(
    conta ? `/api/contabilidade/razao/${conta}?${p}` : null,
    buscador,
  );

  // A lista cresce com o exercício; o rodapé diz quantos são.
  const historico = useHistorico(data?.linhas);

  return (
    <>
      <CabecalhoPagina
        titulo="Extratos"
        descricao="Movimentos de uma conta e das suas subcontas, com filtro por entidade."
        accoes={<AccoesDoMapa />}
      />

      {/* A ORDEM É A DO PILOTO: conta, datas, entidade, subcontas. Aqui
          estavam a entidade e o exercício no meio, entre a conta e as datas —
          quem faz um extracto escolhe a conta e a seguir o período, e tinha de
          saltar dois campos pelo caminho. O exercício fica à frente porque é o
          contexto, como em todos os outros mapas da Produção. */}
      <BarraFiltros className="mb-4">
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
        <Campo
          rotulo="Conta"
          dica="F4 ou duplo clique procura no plano de contas."
          className="min-w-[16rem] flex-1"
        >
          <CampoConta
            valor={conta}
            aoMudar={setConta}
            placeholder="Código da conta · F4 procura"
          />
        </Campo>
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
        <Campo rotulo="Entidade" className="min-w-[180px]">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={entidade}
              onChange={(e) => setEntidade(e.target.value)}
              placeholder="Nome da entidade…"
              className="pl-9"
            />
          </div>
        </Campo>
        <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm">
          <input
            type="checkbox"
            checked={incluirSubcontas}
            onChange={(e) => setIncluirSubcontas(e.target.checked)}
            className="size-4 accent-[var(--color-marca)]"
          />
          Incluir subcontas
        </label>
      </BarraFiltros>

      {!conta ? (
        <Alerta tipo="info">
          Escolha uma conta para ver o extracto. As contas de terceiros
          (clientes 31…, fornecedores 32…) aparecem no topo da lista.
        </Alerta>
      ) : isLoading ? (
        <ACarregar />
      ) : !data ? (
        <FalhaAoCarregar erro={error} oQue="o extracto" />
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
                rotulo="Saldo"
                valor={formataCompacto(data.saldo_final, moeda)}
                detalhe={
                  entidade.trim()
                    ? `Filtrado por «${entidade.trim()}»`
                    : `Conta ${conta} e subcontas`
                }
                cor="var(--grafico-2)"
              />
            </div>
          </div>

          <Cartao className="p-0">
            {data.linhas.length === 0 ? (
              <Vazio>
                {entidade.trim()
                  ? `Sem movimentos desta entidade na conta ${conta}.`
                  : "Sem movimentos no período."}
              </Vazio>
            ) : (
              <>
                <EnvolveTabela className="rounded-none border-0">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Data</Th>
                        <Th>Nº Operação</Th>
                        <Th>Doc.</Th>
                        <Th>Referência</Th>
                        <Th>Entidade</Th>
                        <Th>Descrição</Th>
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
                          <Td className="tabular">{l.documento}</Td>
                          <Td className="text-texto-suave">
                            {l.documento_ref || "—"}
                          </Td>
                          <Td className="max-w-[180px] truncate font-semibold">
                            {l.entidade || "—"}
                          </Td>
                          <Td className="max-w-[240px] truncate">
                            <span title={l.descricao ?? ""}>
                              {l.descricao || "—"}
                            </span>
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
                        <Td colSpan={7}>TOTAIS</Td>
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
