"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import {
  ESTADOS_MES,
  mesActual,
  mesPorExtenso,
  ultimosMeses,
} from "@/components/rh/mes";
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
import { formataMoeda, soma } from "@/lib/dinheiro";
import type { AlteracaoMensal, Colaborador } from "@/types";

interface Rubrica {
  chave: string;
  desc: string;
  valor: string;
}

function nova(): Rubrica {
  return { chave: crypto.randomUUID(), desc: "", valor: "0" };
}

export default function Alteracoes() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const [mes, setMes] = useState(mesActual());
  const [escolhido, setEscolhido] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const { data: colaboradores } = useSWR<Colaborador[]>(
    "/api/rh/colaboradores?so_ativos=true",
    buscador,
  );
  const {
    data: alteracoes,
    isLoading,
    mutate,
  } = useSWR<AlteracaoMensal[]>(`/api/rh/alteracoes?mes=${mes}`, buscador);
  const { data: estado } = useSWR<{ estado: string }>(
    `/api/rh/estado?mes=${mes}`,
    buscador,
  );

  const estadoMes = estado?.estado ?? "por_processar";
  const trancado = estadoMes !== "por_processar";
  const info = ESTADOS_MES[estadoMes] ?? ESTADOS_MES.por_processar;

  const [faltas, setFaltas] = useState("0");
  const [abonos, setAbonos] = useState<Rubrica[]>([]);
  const [descontos, setDescontos] = useState<Rubrica[]>([]);

  const actual = useMemo(
    () => alteracoes?.find((a) => a.colaborador_id === escolhido),
    [alteracoes, escolhido],
  );

  // Carregar o registo do colaborador escolhido para o formulário. As rubricas
  // recebem chave própria aqui: sem ela, apagar a linha do meio faria as
  // seguintes herdar os valores da que saiu.
  useEffect(() => {
    setFaltas(actual?.faltas ?? "0");
    setAbonos(
      (actual?.abonos ?? []).map((a) => ({
        chave: crypto.randomUUID(),
        desc: a.desc ?? "",
        valor: a.valor ?? "0",
      })),
    );
    setDescontos(
      (actual?.descontos ?? []).map((d) => ({
        chave: crypto.randomUUID(),
        desc: d.desc ?? "",
        valor: d.valor ?? "0",
      })),
    );
  }, [actual]);

  const porColaborador = useMemo(() => {
    const m = new Map<string, AlteracaoMensal>();
    for (const a of alteracoes ?? []) m.set(a.colaborador_id, a);
    return m;
  }, [alteracoes]);

  async function gravar() {
    setErro(null);
    setAviso(null);
    if (!escolhido) return setErro("Escolha o colaborador.");
    setAGravar(true);
    try {
      await api.put(`/api/rh/alteracoes/${escolhido}`, {
        mes,
        faltas: faltas || "0",
        abonos: abonos
          .filter((a) => a.desc.trim() || Number(a.valor))
          .map((a) => ({ desc: a.desc.trim(), valor: a.valor || "0" })),
        descontos: descontos
          .filter((d) => d.desc.trim() || Number(d.valor))
          .map((d) => ({ desc: d.desc.trim(), valor: d.valor || "0" })),
      });
      setAviso("Alterações gravadas.");
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Alterações Mensais"
        descricao="Faltas, abonos e descontos que só valem para um mês. Entram no processamento desse mês."
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

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
        <div className="flex items-end pb-0.5">
          <Selo cor={info.cor}>{info.rotulo}</Selo>
        </div>
      </BarraFiltros>

      {trancado && (
        <Alerta tipo="aviso" className="mb-4">
          {mesPorExtenso(mes)} já foi processado. Alterar as rubricas agora não
          muda a folha que já foi lançada — só teria efeito num processamento
          que não vai voltar a acontecer.
        </Alerta>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Cartao className="min-w-0 p-0">
          <TituloCartao className="px-5 pt-5" extra={mesPorExtenso(mes)}>
            Colaboradores
          </TituloCartao>
          {isLoading ? (
            <ACarregar />
          ) : !colaboradores?.length ? (
            <Vazio>Não há colaboradores activos.</Vazio>
          ) : (
            <EnvolveTabela className="rounded-none border-0 border-t">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nº</Th>
                    <Th>Nome</Th>
                    <Th numerico>Faltas</Th>
                    <Th numerico>Abonos</Th>
                    <Th numerico>Descontos</Th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map((c) => {
                    const a = porColaborador.get(c.id);
                    const totalAbonos = soma(
                      ...(a?.abonos ?? []).map((x) => x.valor ?? "0"),
                    );
                    const totalDesc = soma(
                      ...(a?.descontos ?? []).map((x) => x.valor ?? "0"),
                    );
                    return (
                      <Tr
                        key={c.id}
                        onClick={() => setEscolhido(c.id)}
                        className={
                          escolhido === c.id
                            ? "cursor-pointer bg-marca/8"
                            : "cursor-pointer"
                        }
                      >
                        <Td className="tabular font-bold">{c.numero}</Td>
                        <Td className="max-w-[200px] truncate font-semibold">
                          {c.nome}
                        </Td>
                        <Td
                          numerico
                          className={
                            a && a.faltas !== "0"
                              ? "font-semibold text-perigo"
                              : ""
                          }
                        >
                          {a?.faltas && a.faltas !== "0" ? a.faltas : "—"}
                        </Td>
                        <Td numerico>
                          {totalAbonos.eq(0)
                            ? "—"
                            : formataMoeda(totalAbonos, moeda)}
                        </Td>
                        <Td numerico>
                          {totalDesc.eq(0)
                            ? "—"
                            : formataMoeda(totalDesc, moeda)}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Tabela>
            </EnvolveTabela>
          )}
        </Cartao>

        <Cartao className="min-w-0">
          <TituloCartao>
            {escolhido
              ? `Alterações de ${colaboradores?.find((c) => c.id === escolhido)?.nome ?? ""}`
              : "Escolha um colaborador"}
          </TituloCartao>

          {!escolhido ? (
            <Vazio>
              Escolha um colaborador na lista para registar faltas, abonos ou
              descontos do mês.
            </Vazio>
          ) : (
            <div className="flex flex-col gap-4">
              <Campo
                rotulo="Faltas (dias)"
                dica="O desconto usa base 30 dias, qualquer que seja o mês."
              >
                <Entrada
                  type="number"
                  step="0.5"
                  min="0"
                  value={faltas}
                  onChange={(e) => setFaltas(e.target.value)}
                  disabled={!pode("rh.gerir")}
                  className="text-right tabular"
                />
              </Campo>

              <ListaRubricas
                titulo="Abonos"
                nota="Somam ao bruto e à matéria colectável do IRT."
                itens={abonos}
                aoMudar={setAbonos}
                editavel={pode("rh.gerir")}
              />
              <ListaRubricas
                titulo="Descontos"
                nota="Descontam ao líquido, depois do IRT."
                itens={descontos}
                aoMudar={setDescontos}
                editavel={pode("rh.gerir")}
              />

              {pode("rh.gerir") && (
                <div className="flex justify-end">
                  <Botao
                    variante="primario"
                    onClick={gravar}
                    disabled={aGravar}
                  >
                    {aGravar ? "A gravar…" : "Gravar alterações"}
                  </Botao>
                </div>
              )}
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}

function ListaRubricas({
  titulo,
  nota,
  itens,
  aoMudar,
  editavel,
}: {
  titulo: string;
  nota: string;
  itens: Rubrica[];
  aoMudar: (r: Rubrica[]) => void;
  editavel: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-bold">{titulo}</h3>
        <span className="text-xs text-texto-suave">{nota}</span>
      </div>

      {!itens.length ? (
        <p className="mb-2 text-sm text-texto-suave">
          Sem {titulo.toLowerCase()}.
        </p>
      ) : (
        <div className="mb-2 flex flex-col gap-2">
          {itens.map((r) => (
            <div key={r.chave} className="flex gap-2">
              <Entrada
                value={r.desc}
                placeholder="Descrição"
                disabled={!editavel}
                onChange={(e) =>
                  aoMudar(
                    itens.map((x) =>
                      x.chave === r.chave ? { ...x, desc: e.target.value } : x,
                    ),
                  )
                }
              />
              <Entrada
                type="number"
                step="0.01"
                value={r.valor}
                disabled={!editavel}
                className="w-36 text-right tabular"
                onChange={(e) =>
                  aoMudar(
                    itens.map((x) =>
                      x.chave === r.chave ? { ...x, valor: e.target.value } : x,
                    ),
                  )
                }
              />
              {editavel && (
                <Botao
                  tamanho="pequeno"
                  variante="perigo"
                  aria-label={`Remover ${titulo.toLowerCase()}`}
                  onClick={() =>
                    aoMudar(itens.filter((x) => x.chave !== r.chave))
                  }
                >
                  <Trash2 size={13} />
                </Botao>
              )}
            </div>
          ))}
        </div>
      )}

      {editavel && (
        <Botao tamanho="pequeno" onClick={() => aoMudar([...itens, nova()])}>
          <Plus size={14} />
          Adicionar
        </Botao>
      )}
    </div>
  );
}
