"use client";

import { Hammer, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useMemo, useState } from "react";
import useSWR from "swr";

import {
  BarraProgresso,
  FichaAtivo,
} from "@/components/imobilizados/FichaAtivo";
import { ObraEmCurso } from "@/components/imobilizados/ObraEmCurso";
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
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import type { Ativo } from "@/types";

/* ---------------------------------------------------------------------------
   Imobilizados em Curso — o separador próprio, pedido pelo cliente.

   O QUE UMA OBRA EM CURSO É, e porque merece um ecrã só para si: um bem que
   ainda não existe. Compra-se o terreno, paga-se a licença, contrata-se a
   empreitada, acrescenta-se a instalação eléctrica — e só quando tudo isso
   acaba é que há um edifício. Até lá não há património a desgastar-se, e por
   isso **não amortiza**.

   ESTAVA ESCONDIDO. A obra existia, com os seus itens e o seu fecho, mas só se
   lá chegava a partir de uma linha da Ficha de Ativos, carregando num botão
   pequeno que só aparecia nas fichas em curso. Quem quisesse saber quantas
   obras tinha a decorrer e quanto já lá ia investido não tinha por onde
   começar.

   A FICHA DE ATIVOS CONTINUA A MOSTRÁ-LAS, e é de propósito: é o registo
   completo do imobilizado, e uma obra em curso é uma ficha como as outras.
   O que muda é que agora há também a porta certa para quem vem tratar de
   obras — com o acumulado, o número de despesas e o fecho à mão.
--------------------------------------------------------------------------- */

export default function EmCurso() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [procura, setProcura] = useState("");
  const [obra, setObra] = useState<Ativo | null>(null);
  const [aEditar, setAEditar] = useState<Ativo | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [aEliminar, setAEliminar] = useState<Ativo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data, isLoading, mutate } = useSWR<Ativo[]>(
    "/api/imobilizados/ativos",
    buscador,
  );

  const obras = useMemo(() => {
    const t = procura.trim().toLowerCase();
    return (data ?? [])
      .filter((a) => a.em_curso)
      .filter(
        (a) =>
          !t ||
          a.designacao.toLowerCase().includes(t) ||
          a.codigo.toLowerCase().includes(t) ||
          (a.fornecedor ?? "").toLowerCase().includes(t),
      );
  }, [data, procura]);

  /** As que já fecharam este exercício — servem de contexto ao que falta. */
  const fechadas = useMemo(
    () => (data ?? []).filter((a) => !a.em_curso && a.fechado_em),
    [data],
  );

  const investido = useMemo(
    () => soma(...obras.map((a) => a.valor_acumulado ?? "0")),
    [obras],
  );
  const despesas = useMemo(
    () => obras.reduce((t, a) => t + (a.itens ?? 0), 0),
    [obras],
  );

  async function eliminar(a: Ativo) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/imobilizados/ativos/${a.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar esta obra.",
      );
    } finally {
      setOcupado(false);
      setAEliminar(null);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Imobilizados em Curso"
        descricao="Obras e bens em construção. Somam custos enquanto decorrem e só passam a imobilizado — e a amortizar — quando fecham."
        accoes={
          pode("imob.gerir") && (
            <Botao variante="primario" onClick={() => setNovaAberta(true)}>
              <Plus size={16} />
              Nova obra
            </Botao>
          )
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Investido em curso"
            valor={formataCompacto(investido, moeda)}
            detalhe="Ainda não amortiza"
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Obras a decorrer"
            valor={String(obras.length)}
            detalhe={obras.length === 1 ? "uma obra" : "em construção"}
            cor="var(--grafico-4)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Despesas lançadas"
            valor={String(despesas)}
            detalhe="Itens que formam o custo"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Já transferidas"
            valor={String(fechadas.length)}
            detalhe="Passaram a imobilizado"
            cor="var(--grafico-2)"
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[240px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Designação, código ou fornecedor…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !obras.length ? (
          <Vazio>
            {procura.trim()
              ? "Nenhuma obra corresponde ao que procurou."
              : "Não há obras em curso. Quando começar uma construção ou uma montagem que se pague por partes, registe-a aqui — os custos vão-se somando e a obra só passa a imobilizado quando fechar."}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Designação</Th>
                  <Th>Início</Th>
                  <Th>Fornecedor</Th>
                  <Th>Conta em curso</Th>
                  <Th numerico>Despesas</Th>
                  <Th numerico>Já custou</Th>
                  <Th>Estado</Th>
                  {pode("imob.gerir") && <Th />}
                </tr>
              </thead>
              <tbody>
                {obras.map((a) => (
                  <Tr key={a.id}>
                    <Td className="tabular font-bold">{a.codigo}</Td>
                    <Td className="max-w-[260px] truncate font-semibold">
                      {a.designacao}
                    </Td>
                    <Td className="tabular">
                      {a.data_aquisicao
                        ? new Date(a.data_aquisicao).toLocaleDateString("pt-PT")
                        : "—"}
                    </Td>
                    <Td className="max-w-[180px] truncate text-texto-suave">
                      {a.fornecedor || "—"}
                    </Td>
                    {/* A CONTA DA OBRA, que é dela e de mais nenhuma: cada
                        ficha em curso tem a sua subconta da 14. É por aí que
                        se concilia o que está no ecrã com o balancete. */}
                    <Td className="tabular">{a.conta_imob || "—"}</Td>
                    <Td numerico>{a.itens ?? 0}</Td>
                    <Td numerico className="font-semibold">
                      {formataMoeda(a.valor_acumulado ?? "0", moeda)}
                    </Td>
                    <Td>
                      <Selo cor="#c98a10">Em curso</Selo>
                    </Td>
                    {pode("imob.gerir") && (
                      <Td numerico>
                        <div className="flex justify-end gap-1.5">
                          <Botao
                            tamanho="pequeno"
                            variante="neutro"
                            onClick={() => setObra(a)}
                            aria-label={`Custos da obra ${a.designacao}`}
                            title="Custos da obra, e fecho"
                          >
                            <Hammer size={13} />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            onClick={() => setAEditar(a)}
                            aria-label={`Editar ${a.designacao}`}
                          >
                            <Pencil size={13} />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            variante="perigo"
                            onClick={() => setAEliminar(a)}
                            aria-label={`Eliminar ${a.designacao}`}
                          >
                            <Trash2 size={13} />
                          </Botao>
                        </div>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {/* AS QUE JÁ FECHARAM, em baixo e discretas. Servem para conferir que a
          transferência aconteceu e para onde foi — e para lá chegar sem ter de
          ir procurar à Ficha de Ativos, entre bens que nunca foram obras. */}
      {!!fechadas.length && (
        <Cartao className="mt-4 p-0">
          <div className="border-b border-borda px-4 py-3">
            <b className="text-[13.5px]">Obras já transferidas</b>
            <p className="mt-0.5 text-[12.5px] text-texto-suave">
              Fecharam e passaram a imobilizado. A partir do fecho amortizam
              como qualquer outro bem.
            </p>
          </div>
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Designação</Th>
                  <Th>Fechada em</Th>
                  <Th>Conta de destino</Th>
                  <Th numerico>Valor transferido</Th>
                  <Th>Amortizado</Th>
                </tr>
              </thead>
              <tbody>
                {fechadas.map((a) => (
                  <Tr key={a.id}>
                    <Td className="tabular font-bold">{a.codigo}</Td>
                    <Td className="max-w-[260px] truncate">{a.designacao}</Td>
                    <Td className="tabular">
                      {a.fechado_em
                        ? new Date(a.fechado_em).toLocaleDateString("pt-PT")
                        : "—"}
                    </Td>
                    <Td className="tabular">{a.conta_destino || "—"}</Td>
                    <Td numerico>{formataMoeda(a.valor_aquisicao, moeda)}</Td>
                    <Td>
                      <BarraProgresso valor={a.percent_amortizado} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        </Cartao>
      )}

      {obra && (
        <ObraEmCurso
          ativo={obra}
          moeda={moeda}
          podeGerir={pode("imob.gerir")}
          aoFechar={() => setObra(null)}
          aoMudar={() => {
            setObra(null);
            mutate();
          }}
        />
      )}

      {(novaAberta || aEditar) && (
        <FichaAtivo
          ativo={aEditar}
          nasceEmCurso
          aoFechar={() => {
            setNovaAberta(false);
            setAEditar(null);
          }}
          aoGravar={() => {
            setNovaAberta(false);
            setAEditar(null);
            mutate();
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aEliminar}
        onOpenChange={(a) => !a && setAEliminar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Eliminar a obra {aEliminar?.designacao}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              A ficha desaparece com todas as despesas que lhe somou. Os
              lançamentos que essas despesas já fizeram na contabilidade ficam —
              são documentos de períodos que podem estar fechados. Se a obra foi
              abandonada, o correcto é fechá-la pelo valor gasto: o histórico
              mantém-se legível e a conta fica saldada.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => aEliminar && eliminar(aEliminar)}
                >
                  Eliminar mesmo assim
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
