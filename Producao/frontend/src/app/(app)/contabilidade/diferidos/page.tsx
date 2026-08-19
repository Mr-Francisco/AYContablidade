"use client";

import { CheckCircle2, Info, Waves } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  ACarregar,
  Alerta,
  CabecalhoPagina,
  Cartao,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  BarraPaginacao,
  CaixaHistorico,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { plural } from "@/lib/texto";

/* ---------------------------------------------------------------------------
   Diferidos — movimentos automáticos à espera do fluxo de caixa.

   Cada factura, recebimento ou recibo gera o movimento automaticamente, e isso
   não muda. O que este ecrã resolve é o passo que fica a faltar: a linha que
   passa por caixa ou por banco nasce SEM rubrica de fluxo, e o sistema não a
   pode inventar — o mesmo recebimento pode ser actividade operacional ou de
   financiamento conforme o que está por trás, e quem decide é quem faz a
   contabilidade.

   PORQUE É QUE ISTO IMPORTA, e não é arrumação: a Demonstração de Fluxos de
   Caixa é construída a partir dessa rubrica. Uma linha sem ela não desaparece
   do balancete — o dinheiro está lá — mas desaparece da demonstração. O mapa
   fecha com um total que não bate com a tesouraria real, e quem o lê não tem
   como saber o que ficou de fora.
--------------------------------------------------------------------------- */

interface LinhaDiferida {
  lancamento_id: string;
  linha_id: string;
  numero_op: string | null;
  numero: number;
  data: string;
  mes: string;
  diario_codigo: string;
  descricao: string | null;
  documento_ref: string | null;
  origem: string;
  conta_codigo: string;
  conta_nome: string | null;
  debito: string;
  credito: string;
  fluxo_codigo: string;
}

interface Pagina {
  total: number;
  offset: number;
  limite: number;
  linhas: LinhaDiferida[];
}

interface Fluxo {
  codigo: string;
  descricao: string;
  tipo: string;
}

const ORIGEM: Record<string, string> = {
  comercial: "Vendas",
  logistica: "Logística",
  rh: "Salários",
  imobilizado: "Imobilizados",
};

export default function Diferidos() {
  const { empresa } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";

  const p = usePaginacao();
  const { data, isLoading, mutate } = useSWR<Pagina>(
    `/api/contabilidade/diferidos?${p.query}`,
    buscador,
  );
  const { data: fluxos } = useSWR<Fluxo[]>(
    "/api/contabilidade/fluxos",
    buscador,
    {
      revalidateOnFocus: false,
    },
  );

  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);

  // Só rubricas de MOVIMENTO. As intermédias e de raiz agregam outras, e
  // imputar-lhes um movimento fazia o mapa somar duas vezes o mesmo valor.
  const opcoes = (fluxos ?? [])
    .filter((f) => (f.tipo || "M") === "M")
    .map((f) => ({ valor: f.codigo, rotulo: `${f.codigo} · ${f.descricao}` }));

  async function indicar(linha: LinhaDiferida, codigo: string) {
    if (!codigo) return;
    setErro(null);
    setAGravar(linha.linha_id);
    try {
      await api.post("/api/contabilidade/diferidos/indicar", {
        linha_id: linha.linha_id,
        fluxo_codigo: codigo,
      });
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível indicar a rubrica.",
      );
    } finally {
      setAGravar(null);
    }
  }

  const total = data?.total ?? 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Diferidos"
        descricao="Movimentos gerados automaticamente que ainda não têm a rubrica de fluxo de caixa indicada."
      />

      {erro && (
        <Alerta tipo="erro" className="mb-4">
          {erro}
        </Alerta>
      )}

      {isLoading ? (
        <ACarregar />
      ) : total === 0 ? (
        <Cartao>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 size={34} className="text-sucesso" aria-hidden />
            <div>
              <p className="text-[15px] font-bold">Não há nada por indicar</p>
              <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-texto-suave">
                Todos os movimentos que passam por caixa ou por banco têm a
                rubrica de fluxo indicada. A Demonstração de Fluxos de Caixa
                está completa.
              </p>
            </div>
          </div>
        </Cartao>
      ) : (
        <>
          <Alerta tipo="aviso" className="mb-4">
            <span className="flex gap-2">
              <Waves size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Há <b>{plural(total, "movimento")}</b> à espera da rubrica de
                fluxo de caixa. Enquanto não a tiverem,{" "}
                <b>não aparecem na Demonstração de Fluxos de Caixa</b> — o mapa
                fecha com um total que não bate com a tesouraria real.
                <br />
                Os valores continuam no balancete e nas contas correntes: o que
                falta é só dizer a que actividade pertencem.
              </span>
            </span>
          </Alerta>

          <Cartao className="p-0">
            {/* O SCROLL É DO COMPONENTE, não da página: a lista cresce com
                cada recebimento e a página não pode crescer com ela. */}
            <CaixaHistorico altura={420}>
              <EnvolveTabela className="rounded-none border-0">
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Nº Operação</Th>
                      <Th>Origem</Th>
                      <Th>Documento</Th>
                      <Th>Conta</Th>
                      <Th numerico>Valor</Th>
                      <Th>Rubrica de fluxo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.linhas ?? []).map((l) => (
                      <Tr key={l.linha_id}>
                        <Td className="tabular">
                          {new Date(l.data).toLocaleDateString("pt-PT")}
                        </Td>
                        <Td className="tabular font-semibold">
                          {l.numero_op ?? l.numero}
                        </Td>
                        <Td>
                          <Selo cor="#3d7fe0">
                            {ORIGEM[l.origem] ?? l.origem}
                          </Selo>
                        </Td>
                        <Td className="max-w-[200px] truncate text-texto-suave">
                          {l.documento_ref ?? l.descricao ?? "—"}
                        </Td>
                        <Td className="tabular">
                          {l.conta_codigo}
                          {l.conta_nome && (
                            <span className="ml-1.5 text-[12px] text-texto-suave">
                              {l.conta_nome}
                            </span>
                          )}
                        </Td>
                        <Td numerico className="font-semibold">
                          {formataMoeda(
                            Number(l.debito) > 0 ? l.debito : l.credito,
                            moeda,
                          )}
                          <span className="ml-1 text-[11px] text-texto-suave">
                            {Number(l.debito) > 0 ? "entrada" : "saída"}
                          </span>
                        </Td>
                        <Td>
                          {/* Escolher AQUI, na linha. Obrigar a abrir o
                              movimento para classificar uma linha era mandar a
                              pessoa a outro ecrã e trazê-la de volta, vezes sem
                              conta. */}
                          <Selector
                            valor=""
                            aoMudar={(v) => indicar(l, v)}
                            opcoes={opcoes}
                            placeholder={
                              aGravar === l.linha_id
                                ? "A guardar…"
                                : "Escolher rubrica"
                            }
                            larguraMinima="15rem"
                          />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </EnvolveTabela>
            </CaixaHistorico>
            <BarraPaginacao pagina={data} {...p.controlos} nome="movimentos" />
          </Cartao>

          <Cartao className="mt-4">
            <div className="flex gap-3">
              <Info
                size={17}
                className="mt-0.5 shrink-0 text-texto-suave"
                aria-hidden
              />
              <div className="text-[13px] leading-relaxed text-texto-suave">
                <p>
                  Aparecem aqui os movimentos criados a partir de vendas,
                  compras, salários e imobilizados — os que o sistema lança sem
                  passar por quem faz a contabilidade.
                </p>
                <p className="mt-1.5">
                  Lançamentos escritos à mão não entram nesta lista: quem os
                  escreveu já indicou a rubrica, ou decidiu que não era preciso.
                </p>
              </div>
            </div>
          </Cartao>
        </>
      )}
    </>
  );
}
