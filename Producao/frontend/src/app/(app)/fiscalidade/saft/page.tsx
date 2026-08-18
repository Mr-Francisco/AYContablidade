"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { SelectorPeriodo } from "@/components/contabilidade/SelectorPeriodo";
import {
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
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { API_URL, buscador, ErroApi, lerToken } from "@/lib/api";
import { formataInteiro } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";

/**
 * SAF-T (AO) — o ficheiro que se entrega à AGT até ao dia 20.
 *
 * DUAS COISAS QUE ESTE ECRÃ FAZ E QUE NÃO SÃO ÓBVIAS:
 *
 * 1. **Verifica antes de descarregar.** Um ficheiro recusado pela AGT
 *    descobre-se tarde, e o prazo não pára. O botão «Verificar» gera o
 *    ficheiro, valida-o contra o esquema oficial e diz o que está errado —
 *    sem gastar nada.
 * 2. **Não deixa descarregar um ficheiro inválido.** Seria deixar alguém
 *    tentar entregar e ser recusado do lado da AGT.
 */

/** Um problema do ficheiro, já dito em português de quem trabalha.
 *  O `detalhe` é o texto do validador, guardado para quem der apoio. */
interface ProblemaSaft {
  mensagem: string;
  detalhe: string;
  ocorrencias: number;
}

interface Previsao {
  valido: boolean;
  erros: ProblemaSaft[];
  bytes: number;
  documentos: number;
  periodo: { de: string; ate: string };
}

interface Serie {
  id: string;
  codigo: string;
  tipo_doc: string;
  ano: number;
  sequencia: number;
  estado: string;
  proximo: string;
  registada_na_agt: boolean;
}

/** O período a exportar.

    Os dois ficheiros mensais levam um mês; o de contabilidade leva o
    EXERCÍCIO INTEIRO, porque é isso que a AGT pede uma vez por ano. Pedir o
    mês num ficheiro anual daria um ficheiro certo com um ano errado lá dentro
    — e é o género de engano que só se descobre do lado de lá. */
function limitesDoPeriodo(ano: number, mes: string, tipo: string) {
  const anual = tipo === "contabilidade";
  const de = new Date(Date.UTC(ano, anual ? 0 : Number(mes || "1") - 1, 1));
  const ate = anual
    ? new Date(Date.UTC(ano, 11, 31))
    : new Date(Date.UTC(ano, Number(mes || "1"), 0));
  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
  };
}

/** O tamanho do ficheiro como uma pessoa o diz.
 *
 *  Mostrava-se «702030 bytes». Ninguém pensa em bytes ao conferir uma entrega
 *  à AGT — pensa em «isto é grande ou pequeno?», e 686 KB responde a isso. */
function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** O mesmo nome que o servidor põe no cabeçalho da resposta.
 *
 *  Está nos dois sítios porque o descarregamento é feito a partir de um
 *  `blob` e o nome do cabeçalho perde-se pelo caminho. Se um mudar, o outro
 *  tem de mudar — ver `saft_router.exportar`. */
function nomeDoFicheiro(tipo: string, nif: string, de: string) {
  const marca =
    tipo === "compras" ? "AQ" : tipo === "contabilidade" ? "CT" : "FT";
  const quando =
    tipo === "contabilidade" ? de.slice(0, 4) : de.slice(0, 7).replace("-", "");
  return `SAFT_${marca}_${nif}_${quando}.xml`;
}

export default function Saft() {
  const { empresa } = useAuth();
  const { activo } = useExercicios();

  const ano = activo
    ? Number(activo.inicio.slice(0, 4))
    : new Date().getFullYear();
  const [mes, setMes] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  /** Os três ficheiros da AGT: dois mensais e o de contabilidade, anual. */
  const [tipo, setTipo] = useState("facturacao");
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: series } = useSWR<Serie[]>("/api/saft/series", buscador);
  /** O número de certificação, para MOSTRAR. Quem o define é a plataforma. */
  const { data: config } = useSWR<{ certificacao_agt?: string }>(
    "/api/comercial/config",
    buscador,
  );
  const certificacao = config?.certificacao_agt ?? "";

  const periodo = limitesDoPeriodo(ano, mes, tipo);

  async function pedir(caminho: string) {
    const r = await fetch(`${API_URL}${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lerToken() ?? ""}`,
      },
      body: JSON.stringify({ ...periodo, tipo }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      throw new ErroApi(
        r.status,
        corpo.detail ?? "Não foi possível gerar o ficheiro.",
      );
    }
    return r;
  }

  async function verificar() {
    setErro(null);
    setPrevisao(null);
    setOcupado(true);
    try {
      setPrevisao((await (await pedir("/api/saft/prever")).json()) as Previsao);
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.mensagemUtilizador : "Falhou a verificação.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function descarregar() {
    setErro(null);
    setOcupado(true);
    try {
      const r = await pedir("/api/saft/exportar");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoFicheiro(tipo, empresa?.nif ?? "", periodo.de);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(
        e instanceof ErroApi ? e.mensagemUtilizador : "Falhou a exportação.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="SAF-T (AO)"
        descricao={
          tipo === "contabilidade"
            ? "Ficheiro de contabilidade para a AGT — entrega-se até 10 de Abril do ano seguinte."
            : "Ficheiro mensal para a AGT — entrega-se até ao dia 20 do mês seguinte."
        }
      />

      <Alerta tipo="info" className="mb-4">
        {tipo === "compras" ? (
          <>
            O ficheiro de <b>aquisição de bens e serviços</b> declara as compras
            do período: fornecedor, data e totais. Não leva a discriminação das
            linhas — essa é a declaração de quem vendeu.
          </>
        ) : tipo === "contabilidade" ? (
          <>
            O ficheiro de <b>contabilidade</b> leva o plano de contas inteiro e
            os lançamentos do exercício — não só as contas movimentadas. É
            anual, e o período é o exercício completo.
          </>
        ) : (
          <>
            O ficheiro é gerado a partir dos documentos <b>emitidos</b> do
            período e validado contra o esquema oficial{" "}
            <code>SAFTAO1.01_01.xsd</code> antes de sair daqui. Pró-formas e
            guias de remessa não entram: não são documentos fiscais de
            facturação.
          </>
        )}
      </Alerta>

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Ficheiro"
          valor={tipo}
          aoMudar={(v) => {
            setTipo(v);
            // A verificação anterior era do outro ficheiro: mantê-la no ecrã
            // faria alguém descarregar a pensar que estava conferido.
            setPrevisao(null);
          }}
          opcoes={[
            { valor: "facturacao", rotulo: "Facturação" },
            { valor: "compras", rotulo: "Aquisição de bens e serviços" },
            { valor: "contabilidade", rotulo: "Contabilidade (anual)" },
          ]}
          larguraMinima="17rem"
        />
        {tipo === "contabilidade" ? (
          <Campo
            rotulo="Período"
            dica="O exercício inteiro — é o que a AGT pede uma vez por ano."
          >
            <Entrada value={`${ano} — exercício completo`} readOnly disabled />
          </Campo>
        ) : (
          <SelectorPeriodo
            rotulo="Mês"
            valor={mes}
            aoMudar={setMes}
            rotuloTodos={null}
            larguraMinima="14rem"
          />
        )}
        {/* SÓ DE LEITURA. Era um campo escrito à mão a cada exportação, e
            era o pior dos dois buracos: nem sequer era preciso gravar nada —
            bastava escrever aqui o número de outra empresa e o ficheiro saía
            com ele. O pedido já nem tem onde o receber; o número vem da ficha
            da empresa e é a plataforma que o define. */}
        <Campo
          rotulo="Nº de certificação do software"
          dica="Atribuído pela AGT e definido pelo fornecedor da plataforma."
          className="min-w-[16rem]"
        >
          <Entrada
            value={certificacao || "Sem certificação atribuída"}
            readOnly
            disabled
            className={certificacao ? "tabular" : undefined}
          />
        </Campo>
        <span className="flex-1" />
        <Botao onClick={verificar} disabled={ocupado}>
          <FileSearch size={16} />
          {ocupado ? "A verificar…" : "Verificar"}
        </Botao>
        <Botao
          variante="primario"
          onClick={descarregar}
          disabled={ocupado || previsao?.valido === false}
          motivoBloqueio={
            previsao?.valido === false
              ? "O ficheiro não passa no esquema da AGT — seria recusado na entrega. Corrija o que está assinalado."
              : ocupado
                ? "A trabalhar — aguarde."
                : undefined
          }
        >
          <Download size={16} />
          Descarregar
        </Botao>
      </BarraFiltros>

      {erro && (
        <Alerta tipo="erro" className="mb-4">
          {erro}
        </Alerta>
      )}

      {previsao && (
        <Cartao className="mb-4">
          <div className="flex items-start gap-3">
            <span
              className={
                previsao.valido ? "mt-0.5 text-sucesso" : "mt-0.5 text-perigo"
              }
            >
              {previsao.valido ? (
                <CheckCircle2 size={20} />
              ) : (
                <AlertTriangle size={20} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">
                {previsao.valido
                  ? "O ficheiro passa no esquema oficial."
                  : "O ficheiro não passa no esquema oficial."}
              </p>
              <p className="mt-0.5 text-sm text-texto-suave">
                {formataInteiro(previsao.documentos)} documento(s) ·{" "}
                {tamanho(previsao.bytes)} · {previsao.periodo.de} a{" "}
                {previsao.periodo.ate}
              </p>
              {!previsao.valido && (
                <ul className="mt-3 flex flex-col gap-2.5 text-[13px]">
                  {previsao.erros.slice(0, 8).map((p) => (
                    <li key={p.mensagem}>
                      <span className="text-perigo">{p.mensagem}</span>
                      {p.ocorrencias > 1 && (
                        <span className="ml-1 text-texto-suave">
                          (em {p.ocorrencias} sítios)
                        </span>
                      )}
                      {/* O texto do validador fica AQUI, fechado. Não
                          desaparece — quem der apoio precisa dele —, mas
                          também não é o que se lê primeiro. */}
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-[11.5px] text-texto-suave">
                          Detalhe técnico
                        </summary>
                        <code className="mt-1 block break-all rounded-lg bg-superficie-2 p-2 text-[11px] text-texto-suave">
                          {p.detalhe}
                        </code>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Cartao>
      )}

      <Cartao className="p-0">
        <div className="border-b border-borda px-5 py-3">
          <h2 className="text-[15px] font-bold">Séries de numeração</h2>
          <p className="mt-0.5 text-[12.5px] text-texto-suave">
            Uma série por tipo de documento e por ano, como a lei exige. Nascem
            com a primeira factura do ano.
          </p>
        </div>
        {!series?.length ? (
          <Vazio>
            Ainda não há séries. A primeira nasce quando emitir o primeiro
            documento do ano.
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Série</Th>
                  <Th>Tipo</Th>
                  <Th>Ano</Th>
                  <Th numerico>Emitidos</Th>
                  <Th>Próximo número</Th>
                  <Th>Estado</Th>
                  <Th>AGT</Th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <Tr key={s.id}>
                    <Td className="tabular font-bold">{s.codigo}</Td>
                    <Td>{s.tipo_doc}</Td>
                    <Td className="tabular">{s.ano}</Td>
                    <Td numerico>{formataInteiro(s.sequencia)}</Td>
                    <Td className="tabular text-texto-suave">{s.proximo}</Td>
                    <Td>
                      <Selo cor={s.estado === "activa" ? "#1a9c5f" : "#8a8a8a"}>
                        {s.estado}
                      </Selo>
                    </Td>
                    <Td>
                      {s.registada_na_agt ? (
                        <Selo cor="#1e5fcc">registada</Selo>
                      ) : (
                        <span className="text-[12.5px] text-texto-suave">
                          por registar
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>
    </>
  );
}
