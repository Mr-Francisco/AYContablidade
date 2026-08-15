"use client";

import { Plus, Receipt, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { mesActual, mesPorExtenso, ultimosMeses } from "@/components/rh/mes";
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
import { CaixaHistorico } from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { big, formataCompacto, formataMoeda, soma } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { Honorario, Independente } from "@/types";

export default function Independentes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [novoAberto, setNovoAberto] = useState(false);
  const [honorarioAberto, setHonorarioAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: independentes, mutate } = useSWR<Independente[]>(
    "/api/rh/independentes",
    buscador,
  );
  const {
    data: honorarios,
    isLoading,
    mutate: mutateHon,
  } = useSWR<Honorario[]>(`/api/rh/honorarios?mes=${mes}`, buscador);

  const totais = useMemo(() => {
    const lista = honorarios ?? [];
    return {
      bruto: soma(...lista.map((h) => h.bruto)),
      retencao: soma(...lista.map((h) => h.retencao)),
      liquido: soma(...lista.map((h) => h.liquido)),
    };
  }, [honorarios]);

  return (
    <>
      <CabecalhoPagina
        titulo="Independentes"
        descricao="Prestadores de serviços e honorários com retenção de IRT na fonte."
        accoes={
          pode("rh.gerir") && (
            <div className="flex gap-2">
              <Botao onClick={() => setNovoAberto(true)}>
                <Plus size={16} />
                Novo independente
              </Botao>
              <Botao
                variante="primario"
                onClick={() => setHonorarioAberto(true)}
                disabled={!independentes?.length}
              >
                <Receipt size={16} />
                Registar honorário
              </Botao>
            </div>
          )
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Honorários do mês"
            valor={formataCompacto(totais.bruto, moeda)}
            detalhe={`${honorarios?.length ?? 0} registos`}
            cor="var(--grafico-1)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Retenção na fonte"
            valor={formataCompacto(totais.retencao, moeda)}
            detalhe="IRT a entregar ao Estado"
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Líquido pago"
            valor={formataCompacto(totais.liquido, moeda)}
            detalhe="Depois da retenção"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Independentes"
            valor={String(independentes?.length ?? 0)}
            detalhe={`${(independentes ?? []).filter((i) => i.estado === "activo").length} activos`}
            cor="var(--grafico-4)"
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          opcoes={ultimosMeses().map((m) => ({
            valor: m,
            rotulo: mesPorExtenso(m),
          }))}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5">Independentes</TituloCartao>
          {!independentes?.length ? (
            <Vazio>Ainda não há independentes registados.</Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>NIF</Th>
                    <Th>Actividade</Th>
                    <Th numerico>Retenção</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {independentes.map((i) => (
                    <Tr key={i.id}>
                      <Td className="max-w-[180px] truncate font-semibold">
                        {i.nome}
                      </Td>
                      <Td className="tabular">{i.nif || "—"}</Td>
                      <Td className="text-texto-suave">{i.atividade || "—"}</Td>
                      <Td numerico>{i.taxa_ret} %</Td>
                      <Td>
                        <Selo
                          cor={i.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {i.estado === "activo" ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          )}
        </Cartao>

        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5" extra={mesPorExtenso(mes)}>
            Honorários
          </TituloCartao>
          {isLoading ? (
            <ACarregar />
          ) : !honorarios?.length ? (
            <Vazio>Sem honorários registados neste mês.</Vazio>
          ) : (
            // O pedido já está limitado ao mês escolhido; o que faltava era o
            // scroll ser DESTA caixa e não da página.
            <CaixaHistorico altura={420}>
              <EnvolveTabela className="rounded-none border-0 border-t">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Prestador</Th>
                      <Th>Descrição</Th>
                      <Th numerico>Bruto</Th>
                      <Th numerico>Retenção</Th>
                      <Th numerico>Líquido</Th>
                      <Th>Nº Op.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(honorarios ?? []).map((h) => (
                      <Tr key={h.id}>
                        <Td className="tabular">
                          {new Date(h.data).toLocaleDateString("pt-PT")}
                        </Td>
                        <Td className="max-w-[160px] truncate font-semibold">
                          {h.nome}
                        </Td>
                        <Td className="max-w-[180px] truncate text-texto-suave">
                          {h.descricao || "—"}
                        </Td>
                        <Td numerico>{formataMoeda(h.bruto, moeda)}</Td>
                        <Td numerico>
                          {formataMoeda(h.retencao, moeda)}
                          <span className="ml-1 text-xs text-texto-suave">
                            ({h.taxa} %)
                          </span>
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(h.liquido, moeda)}
                        </Td>
                        <Td className="tabular text-texto-suave">
                          {h.numero_op || "—"}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
            </CaixaHistorico>
          )}
        </Cartao>
      </div>

      {novoAberto && (
        <FormularioIndependente
          aoFechar={() => setNovoAberto(false)}
          aoGravar={() => {
            setNovoAberto(false);
            mutate();
          }}
        />
      )}

      {honorarioAberto && (
        <FormularioHonorario
          independentes={independentes ?? []}
          mes={mes}
          moeda={moeda}
          aoFechar={() => setHonorarioAberto(false)}
          aoGravar={(msg) => {
            setHonorarioAberto(false);
            setAviso(msg);
            mutateHon();
          }}
        />
      )}
    </>
  );
}

function FormularioIndependente({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [campos, setCampos] = useState({
    nome: "",
    nif: "",
    atividade: "",
    taxa_ret: "6.5",
    estado: "activo",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.post("/api/rh/independentes", {
        ...campos,
        nome: campos.nome.trim(),
        nif: campos.nif.trim() || null,
        atividade: campos.atividade.trim() || null,
      });
      aoGravar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal titulo="Novo independente" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Campo rotulo="Nome">
          <Entrada
            value={campos.nome}
            onChange={(e) => setCampos((c) => ({ ...c, nome: e.target.value }))}
            required
            autoFocus
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="NIF">
            <Entrada
              value={campos.nif}
              onChange={(e) =>
                setCampos((c) => ({ ...c, nif: e.target.value }))
              }
              className="tabular"
            />
          </Campo>
          <Campo
            rotulo="Taxa de retenção (%)"
            dica="6,5% é a taxa corrente para prestação de serviços."
          >
            <Entrada
              type="number"
              step="0.01"
              min="0"
              value={campos.taxa_ret}
              onChange={(e) =>
                setCampos((c) => ({ ...c, taxa_ret: e.target.value }))
              }
              className="text-right tabular"
            />
          </Campo>
        </div>
        <Campo rotulo="Actividade">
          <Entrada
            value={campos.atividade}
            onChange={(e) =>
              setCampos((c) => ({ ...c, atividade: e.target.value }))
            }
          />
        </Campo>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A gravar…" : "Gravar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormularioHonorario({
  independentes,
  mes,
  moeda,
  aoFechar,
  aoGravar,
}: {
  independentes: Independente[];
  mes: string;
  moeda: string;
  aoFechar: () => void;
  aoGravar: (mensagem: string) => void;
}) {
  const { activo } = useExercicios();
  const [independenteId, setIndependenteId] = useState("");
  const [valor, setValor] = useState("0");
  const [data, setData] = useState(`${mes}-01`);
  const [descricao, setDescricao] = useState("");
  const [ref, setRef] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const escolhido = independentes.find((i) => i.id === independenteId);
  // Pré-visualização com a taxa da ficha — o valor definitivo é o que o
  // backend calcular, mas mostrar antes evita a surpresa no líquido.
  const previsao = useMemo(() => {
    if (!escolhido) return null;
    const bruto = big(valor || "0");
    const retencao = bruto.times(big(escolhido.taxa_ret)).div(100).round(2);
    return { bruto, retencao, liquido: bruto.minus(retencao) };
  }, [escolhido, valor]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!independenteId) return setErro("Escolha o prestador.");
    if (!Number(valor)) return setErro("Indique o valor do honorário.");
    setAGravar(true);
    try {
      const r = await api.post<{ liquido: string; numero_op?: string }>(
        "/api/rh/honorarios",
        {
          independente_id: independenteId,
          valor,
          data,
          mes,
          descricao: descricao.trim() || null,
          ref: ref.trim() || null,
          exercicio_id: activo?.id,
        },
      );
      aoGravar(
        `Honorário registado — líquido de ${formataMoeda(r.liquido, moeda)}${r.numero_op ? ` (operação ${r.numero_op})` : ""}.`,
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível registar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Modal titulo="Registar honorário" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Selector
          rotulo="Prestador"
          valor={independenteId}
          aoMudar={setIndependenteId}
          opcoes={independentes.map((i) => ({
            valor: i.id,
            rotulo: `${i.nome} (${i.taxa_ret} %)`,
          }))}
          placeholder="Escolher prestador…"
          larguraMinima="100%"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor bruto">
            <Entrada
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Data">
            <Entrada
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <Entrada
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Referência do documento">
          <Entrada value={ref} onChange={(e) => setRef(e.target.value)} />
        </Campo>

        {previsao && (
          <dl className="rounded-xl border border-borda bg-fundo p-3 text-sm">
            <div className="flex justify-between py-0.5">
              <dt className="text-texto-suave">Bruto</dt>
              <dd className="tabular">{formataMoeda(previsao.bruto, moeda)}</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-texto-suave">
                Retenção ({escolhido?.taxa_ret} %)
              </dt>
              <dd className="tabular text-perigo">
                {formataMoeda(previsao.retencao, moeda)}
              </dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-borda pt-1.5 font-bold">
              <dt>Líquido a pagar</dt>
              <dd className="tabular">
                {formataMoeda(previsao.liquido, moeda)}
              </dd>
            </div>
          </dl>
        )}

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A registar…" : "Registar e lançar"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte">
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
