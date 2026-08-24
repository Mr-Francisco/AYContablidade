"use client";

import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoDoMapa,
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
import { useAuth } from "@/contexts/AuthContext";
import { buscador } from "@/lib/api";
import { formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import { plural } from "@/lib/texto";
import type { MapaAnalitico } from "@/types";

/** O código que o servidor usa para as linhas sem centro atribuído. */
const SEM_CENTRO = "—";

/**
 * «1 752 000,00 C» — o saldo com a natureza à frente, como no Piloto.
 *
 * Num mapa analítico o sinal sozinho não diz nada a quem lê: o «C» diz que o
 * centro gerou mais proveito do que consumiu, e é essa a leitura que se faz.
 */
function saldoDC(valor: string, moeda: string): string {
  const negativo = valor.trim().startsWith("-");
  const absoluto = negativo ? valor.trim().slice(1) : valor;
  return `${formataMoeda(absoluto, moeda)} ${negativo ? "C" : "D"}`;
}

interface LinhaDetalhe {
  lancamento_id: string;
  data: string;
  diario: string;
  conta: string;
  conta_nome: string;
  descricao: string | null;
  debito: string;
  credito: string;
  documento: string | null;
  numero_op: string | null;
}

interface DetalheCentro {
  linhas: LinhaDetalhe[];
  total_debito: string;
  total_credito: string;
  saldo: string;
}

export default function MapaCustos() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { exercicios, activo } = useExercicios();

  const [exercicioId, setExercicioId] = useState("");
  const [centroAberto, setCentroAberto] = useState<string | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const exId = exercicioId || activo?.id || "";
  const params = new URLSearchParams();
  if (exId) params.set("exercicio_id", exId);
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);

  const { data, isLoading } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${params.size ? `?${params}` : ""}`,
    buscador,
  );

  const exercicioNome = exercicios.find((e) => e.id === exId)?.nome ?? "";

  // O detalhe leva os MESMOS filtros do mapa: se levasse outros, somava outra
  // coisa e o ecrã contradizia-se a si próprio.
  const { data: detalhe } = useSWR<DetalheCentro>(
    centroAberto
      ? `/api/contabilidade/analitica/${encodeURIComponent(centroAberto)}${params.size ? `?${params}` : ""}`
      : null,
    buscador,
  );

  const semCentro = data?.linhas.find((l) => l.codigo === SEM_CENTRO);
  const totalMovimentos = (data?.linhas ?? []).reduce((s, l) => s + l.n, 0);
  const porClassificar = semCentro?.n ?? 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa de Custos por Centro"
        descricao="Contabilidade Analítica — custos e proveitos (classes 6/7) imputados por centro de responsabilidade. Duplo clique num centro mostra o detalhe."
        accoes={<AccoesDoMapa deitado />}
      />

      {data && (
        <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0">
            <Kpi
              rotulo="Custos (classe 6)"
              valor={formataCompacto(data.totais.debito, moeda)}
              detalhe="Total a débito"
              cor="var(--grafico-4)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Proveitos (classe 7)"
              valor={formataCompacto(data.totais.credito, moeda)}
              detalhe="Total a crédito"
              cor="var(--grafico-6)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Resultado analítico"
              valor={formataCompacto(data.totais.saldo, moeda)}
              detalhe={
                Number(data.totais.saldo) < 0
                  ? "Proveitos acima dos custos"
                  : "Custos acima dos proveitos"
              }
              cor="var(--grafico-1)"
            />
          </div>
          <div className="min-w-0">
            <Kpi
              rotulo="Por classificar"
              valor={String(porClassificar)}
              detalhe={`de ${plural(totalMovimentos, "linha")}`}
              cor={
                porClassificar > 0 ? "var(--color-aviso)" : "var(--grafico-2)"
              }
            />
          </div>
        </div>
      )}

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

      <CabecalhoDoMapa
        titulo="Mapa de Custos por Centro"
        exercicioId={exId}
        periodo={
          de || ate ? `Período ${de || "início"} a ${ate || "fim"}` : undefined
        }
      />

      {porClassificar > 0 && (
        <Alerta tipo="aviso" className="mb-4">
          Há <b>{porClassificar}</b> linhas de custo ou proveito sem centro
          atribuído. Aparecem na linha <b>(Sem centro)</b> em vez de
          desaparecerem — é assim que se vê o que falta classificar. Enquanto lá
          estiverem, o mapa por centro não conta a história toda.
        </Alerta>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !data?.linhas.length ? (
          <Vazio>
            Ainda não há movimentos nas classes 6 e 7 para este período.
          </Vazio>
        ) : (
          <>
            {/* O cabeçalho do mapa, como em todos os mapas do Piloto: quem é a
                empresa, que mapa é, de que exercício, e em que moeda. Um mapa
                que se imprime sem isto não se sabe de quem é. */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-borda px-4 py-3">
              <div>
                <b>{empresa?.nome}</b>
                <br />
                <span className="text-[12.5px] text-texto-suave">
                  Mapa de Custos por Centro
                  {exercicioNome ? ` — ${exercicioNome}` : ""}
                </span>
              </div>
              <span className="text-[12.5px] text-texto-suave">
                Valores em {moeda}
              </span>
            </div>
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Centro</Th>
                    <Th>Designação</Th>
                    <Th numerico>Débito</Th>
                    <Th numerico>Crédito</Th>
                    <Th numerico>Saldo</Th>
                    <Th numerico>Lanç.</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.map((l) => {
                    const semCentroEsta = l.codigo === SEM_CENTRO;
                    return (
                      <Tr
                        key={l.codigo}
                        title={
                          semCentroEsta
                            ? undefined
                            : "Duplo clique: ver detalhe"
                        }
                        onDoubleClick={
                          semCentroEsta
                            ? undefined
                            : () => setCentroAberto(l.codigo)
                        }
                        className={
                          semCentroEsta ? "bg-aviso/6" : "cursor-pointer"
                        }
                      >
                        <Td className="tabular font-bold">
                          {semCentroEsta ? <i>—</i> : l.codigo}
                        </Td>
                        <Td className="max-w-[280px] truncate font-semibold">
                          {semCentroEsta ? <i>{l.nome}</i> : l.nome}
                        </Td>
                        <Td numerico>{formataMoeda(l.debito, moeda)}</Td>
                        <Td numerico>{formataMoeda(l.credito, moeda)}</Td>
                        <Td numerico className="font-bold">
                          {saldoDC(l.saldo, moeda)}
                        </Td>
                        <Td numerico className="text-texto-suave">
                          {l.n}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="linha-total border-t-2 border-borda font-bold">
                    <Td colSpan={2}>TOTAL</Td>
                    <Td numerico>{formataMoeda(data.totais.debito, moeda)}</Td>
                    <Td numerico>{formataMoeda(data.totais.credito, moeda)}</Td>
                    <Td numerico>{saldoDC(data.totais.saldo, moeda)}</Td>
                    <Td />
                  </tr>
                </tfoot>
              </Tabela>
            </EnvolveTabela>
          </>
        )}
      </Cartao>

      {/* O detalhe do centro, como no Piloto: abre por baixo do mapa, com os
          lançamentos que compõem o saldo, e clicar numa linha vai ao
          movimento. É a resposta à pergunta que o mapa levanta — «de onde vem
          este número?». */}
      {centroAberto && (
        <Cartao className="mt-4 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
            <b>
              Detalhe — {centroAberto} ·{" "}
              {data?.linhas.find((l) => l.codigo === centroAberto)?.nome ?? ""}
            </b>
            <Botao
              variante="neutro"
              tamanho="pequeno"
              onClick={() => setCentroAberto(null)}
            >
              Fechar
            </Botao>
          </div>
          {!detalhe ? (
            <ACarregar />
          ) : detalhe.linhas.length === 0 ? (
            <Vazio>Sem lançamentos neste centro para o período.</Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Diário</Th>
                    <Th>Conta</Th>
                    <Th>Descrição</Th>
                    <Th numerico>Débito</Th>
                    <Th numerico>Crédito</Th>
                    <Th>Doc.</Th>
                    <Th>Lanç.</Th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.linhas.map((x, i) => (
                    <Tr
                      key={`${x.lancamento_id}-${x.conta}-${i}`}
                      className="cursor-pointer"
                      onClick={() => {
                        window.location.href = `/contabilidade/movimentos?id=${x.lancamento_id}`;
                      }}
                    >
                      <Td className="tabular">
                        {new Date(x.data).toLocaleDateString("pt-PT")}
                      </Td>
                      <Td className="tabular text-texto-suave">{x.diario}</Td>
                      <Td>
                        <b className="tabular">{x.conta}</b>{" "}
                        <span className="text-[12px] text-texto-suave">
                          {x.conta_nome}
                        </span>
                      </Td>
                      <Td className="max-w-[260px] truncate">
                        {x.descricao || "—"}
                      </Td>
                      <Td numerico>
                        {Number(x.debito) ? formataMoeda(x.debito, moeda) : ""}
                      </Td>
                      <Td numerico>
                        {Number(x.credito)
                          ? formataMoeda(x.credito, moeda)
                          : ""}
                      </Td>
                      <Td className="text-texto-suave">{x.documento || ""}</Td>
                      <Td className="tabular text-texto-suave">
                        {x.numero_op || ""}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="linha-total border-t-2 border-borda font-bold">
                    <Td colSpan={4}>TOTAIS / SALDO</Td>
                    <Td numerico>
                      {formataMoeda(detalhe.total_debito, moeda)}
                    </Td>
                    <Td numerico>
                      {formataMoeda(detalhe.total_credito, moeda)}
                    </Td>
                    <Td colSpan={2} numerico>
                      {saldoDC(detalhe.saldo, moeda)}
                    </Td>
                  </tr>
                </tfoot>
              </Tabela>
            </EnvolveTabela>
          )}
        </Cartao>
      )}

      <Alerta tipo="info" className="mt-4">
        O resultado por centro é <b>custos menos proveitos</b>, pelo que um
        valor negativo é um centro que gerou mais proveito do que consumiu.
        Centros de estrutura mostram sempre um valor positivo — não têm proveito
        próprio.
      </Alerta>
    </>
  );
}
