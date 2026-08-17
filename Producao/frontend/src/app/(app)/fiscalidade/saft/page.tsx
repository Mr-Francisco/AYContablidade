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

interface Previsao {
  valido: boolean;
  erros: string[];
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

/** Primeiro e último dia de um mês do exercício. */
function limitesDoMes(ano: number, mes: string) {
  const m = Number(mes || "1");
  const de = new Date(Date.UTC(ano, m - 1, 1));
  const ate = new Date(Date.UTC(ano, m, 0));
  return {
    de: de.toISOString().slice(0, 10),
    ate: ate.toISOString().slice(0, 10),
  };
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
  const [validacao, setValidacao] = useState("0");
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: series } = useSWR<Serie[]>("/api/saft/series", buscador);

  const periodo = limitesDoMes(ano, mes);

  async function pedir(caminho: string) {
    const r = await fetch(`${API_URL}${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lerToken() ?? ""}`,
      },
      body: JSON.stringify({ ...periodo, numero_validacao: validacao.trim() }),
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
      a.download = `SAFT_${empresa?.nif ?? ""}_${periodo.de.slice(0, 7).replace("-", "")}.xml`;
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
        descricao="Ficheiro de facturação para a AGT — entrega-se até ao dia 20 do mês seguinte."
      />

      <Alerta tipo="info" className="mb-4">
        O ficheiro é gerado a partir dos documentos <b>emitidos</b> do período e
        validado contra o esquema oficial <code>SAFTAO1.01_01.xsd</code> antes
        de sair daqui. Pró-formas e guias de remessa não entram: não são
        documentos fiscais de facturação.
      </Alerta>

      <BarraFiltros className="mb-4">
        <SelectorPeriodo
          rotulo="Mês"
          valor={mes}
          aoMudar={setMes}
          rotuloTodos={null}
          larguraMinima="14rem"
        />
        <Campo
          rotulo="Nº de validação do software"
          dica="Atribuído pela AGT (141/AGT/2026). Enquanto não houver certificação, «0»."
          className="min-w-[16rem]"
        >
          <Entrada
            value={validacao}
            onChange={(e) => setValidacao(e.target.value)}
            placeholder="141/AGT/2026"
            className="tabular"
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
                {formataInteiro(previsao.bytes)} bytes · {previsao.periodo.de} a{" "}
                {previsao.periodo.ate}
              </p>
              {!previsao.valido && (
                <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-perigo">
                  {previsao.erros.slice(0, 8).map((e) => (
                    <li key={e}>{e}</li>
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
