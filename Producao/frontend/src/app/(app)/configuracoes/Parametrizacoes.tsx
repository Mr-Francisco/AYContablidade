"use client";

import { type FormEvent, useEffect, useState } from "react";
import useSWR from "swr";

import { CampoConta } from "@/components/contabilidade/CampoConta";
import {
  Alerta,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Selector,
  TituloCartao,
} from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";

/**
 * Parametrizações — Logística e Vendas (CMVMC).
 *
 * O separador existia no Piloto e não na Produção. O modelo já cá estava
 * (`ConfigEmpresa.parametrizacoes`, lido pelos serviços de logística e
 * comercial): o que faltava era o ecrã, e sem ele estas contas só se mudavam
 * pela API.
 *
 * São as contas por onde passa a baixa automática de stock nas vendas. Mudá-las
 * a meio de um exercício faz os lançamentos novos irem para outro sítio e o
 * mapa de custos deixa de comparar com o que já lá está — por isso o aviso, e
 * por isso a alteração fica no registo de auditoria do servidor.
 */
interface CfgLog {
  auto_baixa_venda?: boolean;
  conta_existencia?: string;
  conta_custo?: string;
  conta_regulariza?: string;
  conta_ganho_existencias?: string;
  conta_quebra_existencias?: string;
  diario_saida?: string;
  doc_saida?: string;
  armazem_venda_id?: string;
  /** Nº de validação do software atribuído pela AGT (`141/AGT/2026`), ou `0`. */
  software_validacao?: string;
}

interface Armazem {
  id: string;
  codigo: string;
  nome: string;
}

export function Parametrizacoes({
  aoGravar,
  aoFalhar,
}: {
  aoGravar: (mensagem: string) => void;
  aoFalhar: (erro: string) => void;
}) {
  const { data, mutate } = useSWR<CfgLog>("/api/logistica/config", buscador);
  const { data: armazens } = useSWR<Armazem[]>(
    "/api/logistica/armazens",
    buscador,
    { revalidateOnFocus: false },
  );

  const [campos, setCampos] = useState<CfgLog>({});
  const [aGravar, setAGravar] = useState(false);

  // O formulário parte do que está gravado, e só depois é do utilizador.
  useEffect(() => {
    if (data) setCampos(data);
  }, [data]);

  function alterar<K extends keyof CfgLog>(campo: K, valor: CfgLog[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setAGravar(true);
    try {
      await api.put("/api/logistica/config", campos);
      aoGravar("Parametrizações guardadas.");
      mutate();
    } catch (err) {
      aoFalhar(
        err instanceof ErroApi
          ? err.mensagemUtilizador
          : "Não foi possível guardar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Cartao>
      <TituloCartao>Parametrizações — Logística e Vendas (CMVMC)</TituloCartao>
      <p className="mb-2.5 text-[13px] text-texto-suave">
        Contas e documentos usados na <b>baixa automática de stock</b> ao emitir
        vendas de mercadorias. O custo sai a <b>custo médio</b>: débito{" "}
        <b>Custo das Mercadorias Vendidas (CMVMC)</b> / crédito{" "}
        <b>Existências</b> (mercadoria).
      </p>

      <form onSubmit={submeter}>
        {/* ---- Certificação do software pela AGT ----
            Fica aqui, no topo e à parte, porque é o único campo desta página
            que vem DE FORA: é a AGT que o atribui ao certificar o software, e
            entra em cada factura impressa (DP 71/25, art. 10.º j) e no
            cabeçalho de cada SAF-T. Sem ele, os ficheiros saem com «0», que a
            norma aceita e quer dizer «ainda não certificado». */}
        <div className="mb-4 rounded-xl border border-borda bg-superficie-2 p-3.5">
          <Campo
            rotulo="Nº de validação do software (AGT)"
            dica="No formato 141/AGT/2026, tal como a AGT o atribui. Enquanto não houver certificação, «0» — que é o que a norma prevê e não uma falha."
            className="max-w-[22rem]"
          >
            <Entrada
              value={campos.software_validacao ?? ""}
              onChange={(e) => alterar("software_validacao", e.target.value)}
              placeholder="141/AGT/2026"
              className="tabular"
            />
          </Campo>
          <p className="mt-2 text-[12px] leading-relaxed text-texto-suave">
            Vai impresso em cada documento fiscal e no cabeçalho de cada
            ficheiro SAF-T entregue à AGT.
          </p>
        </div>

        <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={campos.auto_baixa_venda !== false}
            onChange={(e) => alterar("auto_baixa_venda", e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-marca)]"
          />
          Gerar automaticamente a saída de stock e o lançamento do CMVMC ao
          emitir vendas de mercadorias
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Conta de mercadoria / existências (crédito)">
            <CampoConta
              valor={campos.conta_existencia ?? ""}
              aoMudar={(v) => alterar("conta_existencia", v)}
              placeholder="2611"
            />
          </Campo>
          <Campo rotulo="Conta de custo — CMVMC (débito)">
            <CampoConta
              valor={campos.conta_custo ?? ""}
              aoMudar={(v) => alterar("conta_custo", v)}
              placeholder="7111"
            />
          </Campo>
          <Selector
            rotulo="Armazém de saída"
            valor={campos.armazem_venda_id ?? ""}
            aoMudar={(v) => alterar("armazem_venda_id", v)}
            opcoes={(armazens ?? []).map((a) => ({
              valor: a.id,
              rotulo: `${a.codigo} · ${a.nome}`,
            }))}
            placeholder="(sem armazéns)"
            larguraMinima="100%"
          />
          <Campo rotulo="Conta de regularização (ajustes — omissão)">
            <CampoConta
              valor={campos.conta_regulariza ?? ""}
              aoMudar={(v) => alterar("conta_regulariza", v)}
              placeholder="7111"
            />
          </Campo>
          <Campo rotulo="Diário da saída de stock">
            <Entrada
              value={campos.diario_saida ?? ""}
              onChange={(e) => alterar("diario_saida", e.target.value)}
              placeholder="90"
            />
          </Campo>
          <Campo rotulo="Documento da saída de stock">
            <Entrada
              value={campos.doc_saida ?? ""}
              onChange={(e) => alterar("doc_saida", e.target.value)}
              placeholder="901"
            />
          </Campo>
        </div>

        <p className="mb-2 mt-4 text-[11.5px] font-bold uppercase tracking-[0.5px] text-texto-suave">
          Acertos de Stock — documentos 903 (positivo) / 904 (negativo)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Conta de ganho em existências (acerto positivo)">
            <CampoConta
              valor={campos.conta_ganho_existencias ?? ""}
              aoMudar={(v) => alterar("conta_ganho_existencias", v)}
              placeholder="6804"
            />
          </Campo>
          <Campo rotulo="Conta de quebras/perdas (acerto negativo)">
            <CampoConta
              valor={campos.conta_quebra_existencias ?? ""}
              aoMudar={(v) => alterar("conta_quebra_existencias", v)}
              placeholder="78041"
            />
          </Campo>
        </div>

        <Alerta tipo="aviso" className="mt-3">
          Mudar estas contas a meio de um exercício faz os lançamentos novos
          irem para outro sítio — os que já estão lançados não se movem, e o
          mapa de custos deixa de comparar o mesmo. Se for mesmo preciso, convém
          que aconteça no início de um período.
        </Alerta>

        <div className="mt-4 flex justify-end">
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A guardar…" : "Guardar parametrizações"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
