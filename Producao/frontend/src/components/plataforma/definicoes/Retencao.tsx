"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Alerta, Campo, Entrada } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";
import type { ConfigIa } from "@/types";
import { BarraDeAccoes, Grupo, Seccao } from "./Estrutura";

/* ---------------------------------------------------------------------------
   Prazos de limpeza do histórico do assistente.

   São DOIS porque são coisas diferentes, e confundi-los custa caro nos dois
   sentidos: descartar o pacote enviado liberta quase todo o espaço sem perder
   nada de contas; apagar a consulta apaga também o consumo daquele período.
--------------------------------------------------------------------------- */

export function SeccaoRetencao({
  data,
  aoGravar,
}: {
  data: ConfigIa;
  aoGravar: () => void;
}) {
  const [pacote, setPacote] = useState(String(data.ia_dias_pacote));
  const [historico, setHistorico] = useState(String(data.ia_dias_historico));
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    setPacote(String(data.ia_dias_pacote));
    setHistorico(String(data.ia_dias_historico));
  }, [data]);

  const nPacote = Number(pacote);
  const nHistorico = Number(historico);
  const mudou =
    nPacote !== data.ia_dias_pacote || nHistorico !== data.ia_dias_historico;
  const valido =
    Number.isInteger(nPacote) &&
    Number.isInteger(nHistorico) &&
    nPacote >= data.dias_pacote_min &&
    nPacote <= data.dias_pacote_max &&
    nHistorico >= data.dias_historico_min &&
    nHistorico <= data.dias_historico_max &&
    nPacote <= nHistorico;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setGravado(false);
    setAGravar(true);
    try {
      await api.patch("/api/licencas/config-ia", {
        ia_dias_pacote: nPacote,
        ia_dias_historico: nHistorico,
      });
      setGravado(true);
      aoGravar();
      setTimeout(() => setGravado(false), 5000);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível guardar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Seccao
      titulo="Dados guardados"
      descricao="Durante quanto tempo se guarda o histórico das perguntas feitas ao assistente. A limpeza acontece sozinha, à medida que se fazem perguntas."
    >
      <form onSubmit={submeter} className="flex flex-col gap-5">
        <Grupo
          titulo="Pacote enviado"
          nota="É o que ocupa espaço a sério: cerca de 3 kB por pergunta. Descartá-lo não perde nada de contas — a pergunta, a resposta e os números ficam."
        >
          <Campo
            rotulo="Descartar ao fim de"
            dica={`Entre ${data.dias_pacote_min} e ${data.dias_pacote_max} dias.`}
            className="max-w-[240px]"
          >
            <div className="flex items-center gap-2">
              <Entrada
                type="number"
                value={pacote}
                onChange={(e) => setPacote(e.target.value)}
                min={data.dias_pacote_min}
                max={data.dias_pacote_max}
                className="tabular max-w-[110px]"
              />
              <span className="text-sm text-texto-suave">dias</span>
            </div>
          </Campo>
        </Grupo>

        <Grupo
          titulo="Consulta"
          nota="Aqui perde-se também o consumo desse período — os totais mensais são calculados a partir destas linhas. Por isso o mínimo é largo."
        >
          <Campo
            rotulo="Apagar ao fim de"
            dica={`Entre ${data.dias_historico_min} e ${data.dias_historico_max} dias.`}
            className="max-w-[240px]"
          >
            <div className="flex items-center gap-2">
              <Entrada
                type="number"
                value={historico}
                onChange={(e) => setHistorico(e.target.value)}
                min={data.dias_historico_min}
                max={data.dias_historico_max}
                className="tabular max-w-[110px]"
              />
              <span className="text-sm text-texto-suave">dias</span>
            </div>
          </Campo>
        </Grupo>

        {nPacote > nHistorico && (
          <Alerta tipo="aviso">
            O pacote não pode durar mais do que a consulta — a essa altura já
            teria sido apagada. Baixe o primeiro prazo ou suba o segundo.
          </Alerta>
        )}

        <Alerta tipo="info">
          As consultas do <b>mês corrente nunca são apagadas</b>, seja qual for
          o prazo: é delas que saem os totais de consumo que travam quem passa
          da quota.
        </Alerta>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <BarraDeAccoes
          mudou={mudou}
          valido={valido}
          aGravar={aGravar}
          gravado={gravado}
          aoDesfazer={() => {
            setPacote(String(data.ia_dias_pacote));
            setHistorico(String(data.ia_dias_historico));
            setErro(null);
          }}
        />
      </form>
    </Seccao>
  );
}
