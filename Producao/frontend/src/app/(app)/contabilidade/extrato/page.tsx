"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
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
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useContas, useExercicios } from "@/lib/hooks";

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
  const { contas } = useContas();

  const [conta, setConta] = useState(parametros.get("conta") ?? "");
  const [entidade, setEntidade] = useState(parametros.get("entidade") ?? "");
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  // As contas correntes de terceiros são o uso típico do extracto, por isso
  // ficam à cabeça da lista.
  const opcoesConta = useMemo(() => {
    const movimento = contas.filter((c) => c.tipo === "M" && c.ativa);
    const terceiros = movimento.filter((c) => c.codigo.startsWith("3"));
    const resto = movimento.filter((c) => !c.codigo.startsWith("3"));
    return [...terceiros, ...resto]
      .slice(0, 2000)
      .map((c) => ({ valor: c.codigo, rotulo: `${c.codigo} — ${c.nome}` }));
  }, [contas]);

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (entidade.trim()) p.set("entidade", entidade.trim());
  // O extracto de uma conta corrente agregadora só faz sentido com as
  // subcontas de cada entidade incluídas.
  p.set("incluir_subcontas", "true");

  const { data, isLoading } = useSWR<Extrato>(
    conta ? `/api/contabilidade/razao/${conta}?${p}` : null,
    buscador,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Extratos"
        descricao="Movimentos de uma conta e das suas subcontas, com filtro por entidade."
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
      </BarraFiltros>

      {!conta ? (
        <Alerta tipo="info">
          Escolha uma conta para ver o extracto. As contas de terceiros
          (clientes 31…, fornecedores 32…) aparecem no topo da lista.
        </Alerta>
      ) : isLoading ? (
        <ACarregar />
      ) : !data ? (
        <Alerta tipo="erro">Não foi possível carregar o extracto.</Alerta>
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
                    {data.linhas.map((l) => (
                      <Tr key={`${l.lancamento_id}-${l.numero_op}-${l.saldo}`}>
                        <Td className="tabular">
                          {new Date(l.data).toLocaleDateString("pt-PT")}
                        </Td>
                        <Td className="tabular font-semibold">{l.numero_op}</Td>
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
                      <Td numerico>{formataMoeda(data.total_debito, moeda)}</Td>
                      <Td numerico>
                        {formataMoeda(data.total_credito, moeda)}
                      </Td>
                      <Td numerico>{formataMoeda(data.saldo_final, moeda)}</Td>
                    </tr>
                  </tfoot>
                </Tabela>
              </EnvolveTabela>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}
