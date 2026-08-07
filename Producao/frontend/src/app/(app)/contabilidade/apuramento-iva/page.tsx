"use client";

import { AlertDialog } from "radix-ui";
import { useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
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
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataCompacto, formataMoeda } from "@/lib/dinheiro";
import { useExercicios, usePeriodos } from "@/lib/hooks";

interface LinhaIVA {
  codigo: string;
  nome: string;
  valor: string;
}

interface ApuramentoIVA {
  mes: string | null;
  liquidado: string;
  dedutivel: string;
  regulariz: string;
  resultado: string;
  a_pagar: string;
  a_recuperar: string;
  liquidado_linhas: LinhaIVA[];
  dedutivel_linhas: LinhaIVA[];
  regulariz_linhas: LinhaIVA[];
}

export default function ApuramentoIva() {
  const { empresa, pode } = useAuth();
  const { exercicios, activo } = useExercicios();
  const { periodos } = usePeriodos();

  const hoje = new Date();
  const [exercicioId, setExercicioId] = useState<string | undefined>();
  const [mes, setMes] = useState(String(hoje.getMonth() + 1).padStart(2, "0"));
  const [data, setData] = useState(hoje.toISOString().slice(0, 10));
  const [confirmar, setConfirmar] = useState(false);
  const [resultadoAccao, setResultadoAccao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const exId = exercicioId ?? activo?.id;
  const moeda = empresa?.moeda ?? "Kz";

  const p = new URLSearchParams();
  if (exId) p.set("exercicio_id", exId);
  if (mes) p.set("mes", mes);

  const {
    data: ap,
    isLoading,
    mutate,
  } = useSWR<ApuramentoIVA>(`/api/apuramentos/iva?${p}`, buscador);

  const semMovimento =
    ap &&
    big(ap.liquidado).eq(0) &&
    big(ap.dedutivel).eq(0) &&
    big(ap.regulariz).eq(0);

  async function apurar() {
    setOcupado(true);
    setErro(null);
    setResultadoAccao(null);
    try {
      const r = await api.post<{ numero_op?: string }>("/api/apuramentos/iva", {
        mes,
        exercicio_id: exId,
        data,
      });
      setResultadoAccao(
        `Apuramento gerado — lançamento ${r.numero_op ?? ""}. As contas de IVA do período ficaram a zero.`,
      );
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível apurar.",
      );
    } finally {
      setOcupado(false);
      setConfirmar(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Apuramento do IVA"
        descricao="IVA liquidado menos dedutível, por período. Declaração mensal até ao último dia útil do mês seguinte."
        accoes={
          ap &&
          !semMovimento && (
            <Selo cor={big(ap.resultado).gt(0) ? "#e0284f" : "#1a9c5f"}>
              {big(ap.resultado).gt(0)
                ? `A pagar: ${formataMoeda(ap.a_pagar, moeda)}`
                : `A recuperar: ${formataMoeda(ap.a_recuperar, moeda)}`}
            </Selo>
          )
        }
      />

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
        <Selector
          rotulo="Período"
          valor={mes}
          aoMudar={setMes}
          opcoes={periodos
            .filter((x) => x.codigo >= "01" && x.codigo <= "12")
            .map((x) => ({
              valor: x.codigo,
              rotulo: `${x.codigo} — ${x.nome}`,
            }))}
          larguraMinima="14rem"
        />
        {pode("contab.fechar") && (
          <>
            <Campo rotulo="Data do lançamento">
              <Entrada
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </Campo>
            <div className="pb-0.5">
              <Botao
                variante="primario"
                onClick={() => setConfirmar(true)}
                disabled={ocupado || semMovimento}
              >
                Apurar período
              </Botao>
            </div>
          </>
        )}
      </BarraFiltros>

      {resultadoAccao && <Alerta tipo="sucesso">{resultadoAccao}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {isLoading ? (
        <ACarregar />
      ) : !ap ? (
        <Alerta tipo="erro">Não foi possível carregar o apuramento.</Alerta>
      ) : semMovimento ? (
        <Alerta tipo="info">
          Sem IVA no período seleccionado — nada a apurar.
        </Alerta>
      ) : (
        <>
          <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <Kpi
                rotulo="IVA liquidado"
                valor={formataCompacto(ap.liquidado, moeda)}
                detalhe="Sobre vendas"
                cor="var(--grafico-1)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="IVA dedutível"
                valor={formataCompacto(ap.dedutivel, moeda)}
                detalhe="Sobre compras"
                cor="var(--grafico-6)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo="Regularizações"
                valor={formataCompacto(ap.regulariz, moeda)}
                cor="var(--grafico-7)"
              />
            </div>
            <div className="min-w-0">
              <Kpi
                rotulo={
                  big(ap.resultado).gt(0) ? "IVA a pagar" : "IVA a recuperar"
                }
                valor={formataCompacto(
                  big(ap.resultado).gt(0) ? ap.a_pagar : ap.a_recuperar,
                  moeda,
                )}
                detalhe="Liquidado + regularizações − dedutível"
                tendencia={big(ap.resultado).gt(0) ? "desce" : "sobe"}
                cor={
                  big(ap.resultado).gt(0)
                    ? "var(--grafico-1)"
                    : "var(--grafico-6)"
                }
              />
            </div>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <BlocoContas
              titulo="IVA liquidado"
              linhas={ap.liquidado_linhas}
              moeda={moeda}
            />
            <BlocoContas
              titulo="IVA dedutível"
              linhas={ap.dedutivel_linhas}
              moeda={moeda}
            />
            {ap.regulariz_linhas.length > 0 && (
              <BlocoContas
                titulo="Regularizações"
                linhas={ap.regulariz_linhas}
                moeda={moeda}
              />
            )}
          </div>
        </>
      )}

      <AlertDialog.Root open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Apurar o IVA do período {mes}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              Vai ser gerado um lançamento que zera as contas de IVA do período
              e transfere o saldo para IVA a pagar ou a recuperar. A operação
              fica registada na contabilidade e só se desfaz eliminando o
              lançamento.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao variante="primario" onClick={apurar} disabled={ocupado}>
                  {ocupado ? "A apurar…" : "Apurar"}
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function BlocoContas({
  titulo,
  linhas,
  moeda,
}: {
  titulo: string;
  linhas: LinhaIVA[];
  moeda: string;
}) {
  return (
    <Cartao className="min-w-0 p-0">
      <TituloCartao className="px-5 pt-5">{titulo}</TituloCartao>
      {linhas.length === 0 ? (
        <Vazio>Sem movimentos nestas contas.</Vazio>
      ) : (
        <EnvolveTabela className="rounded-none border-0 border-t">
          <Tabela>
            <thead>
              <tr>
                <Th>Conta</Th>
                <Th>Designação</Th>
                <Th numerico>Valor</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Tr key={l.codigo}>
                  <Td className="tabular font-semibold">{l.codigo}</Td>
                  <Td className="max-w-[280px] truncate">
                    <span title={l.nome}>{l.nome}</span>
                  </Td>
                  <Td numerico>{formataMoeda(l.valor, moeda)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        </EnvolveTabela>
      )}
    </Cartao>
  );
}
