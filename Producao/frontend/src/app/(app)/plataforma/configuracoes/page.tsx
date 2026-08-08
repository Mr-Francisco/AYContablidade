"use client";

import { Check, Sparkles, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import useSWR from "swr";

import { PrecosIa } from "@/components/plataforma/PrecosIa";
import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  TituloCartao,
} from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import type { ConfigIa } from "@/types";

/** Valores que cobrem os casos comuns, para não obrigar a adivinhar um número.
 *  O campo continua livre — isto é um atalho, não a única forma. */
const SUGESTOES = [
  { valor: 400, rotulo: "Curta", nota: "Um parágrafo ou dois" },
  { valor: 800, rotulo: "Normal", nota: "Uma análise com contexto" },
  { valor: 1500, rotulo: "Detalhada", nota: "Conta a conta" },
  { valor: 3000, rotulo: "Longa", nota: "Relatórios extensos" },
];

export default function ConfiguracoesDaPlataforma() {
  const { data, isLoading, mutate } = useSWR<ConfigIa>(
    "/api/licencas/config-ia",
    buscador,
    { revalidateOnFocus: false },
  );

  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    if (data) setValor(String(data.max_tokens_saida));
  }, [data]);

  const numero = Number(valor);
  const mudou = Boolean(data) && numero !== data?.max_tokens_saida;
  const valido =
    Number.isInteger(numero) &&
    Boolean(data) &&
    numero >= (data?.minimo ?? 0) &&
    numero <= (data?.maximo ?? 0);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setGravado(false);
    setAGravar(true);
    try {
      await api.patch("/api/licencas/config-ia", { max_tokens_saida: numero });
      setGravado(true);
      mutate();
      setTimeout(() => setGravado(false), 4000);
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
    <>
      <CabecalhoPagina
        titulo="Configurações da plataforma"
        descricao="Definições que valem para todas as empresas."
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Cartao className="min-w-0">
          <TituloCartao
            extra={
              <span className="inline-flex items-center gap-1.5 text-xs text-texto-suave">
                <Sparkles size={13} />
                Assistente
              </span>
            }
          >
            Tamanho máximo das respostas
          </TituloCartao>

          {isLoading || !data ? (
            <ACarregar />
          ) : (
            <form onSubmit={submeter} className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-texto-suave">
                Quantos tokens, no máximo, cada resposta do assistente pode ter.
                A resposta é a parte cara — custa cerca de{" "}
                <b>quatro vezes mais</b> do que a pergunta — e é a única que se
                consegue limitar antes de acontecer.
              </p>

              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => {
                  const escolhido = numero === s.valor;
                  return (
                    <button
                      key={s.valor}
                      type="button"
                      onClick={() => setValor(String(s.valor))}
                      title={s.nota}
                      aria-pressed={escolhido}
                      className={`flex flex-col items-start rounded-xl border px-3 py-2 transition-colors ${
                        escolhido
                          ? "border-marca bg-marca/5"
                          : "border-borda hover:border-marca"
                      }`}
                    >
                      <span className="text-sm font-semibold">{s.rotulo}</span>
                      <span className="tabular text-xs text-texto-suave">
                        {s.valor} tokens
                      </span>
                    </button>
                  );
                })}
              </div>

              <Campo
                rotulo="Ou um valor à medida"
                dica={`Entre ${data.minimo} e ${data.maximo} tokens.`}
              >
                <Entrada
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  min={data.minimo}
                  max={data.maximo}
                  step={50}
                  className="tabular max-w-[180px]"
                />
              </Campo>

              <Alerta tipo="info">
                Vale a partir da <b>pergunta seguinte</b>, em todas as empresas
                — não é preciso reiniciar nada. O limite é imposto pelo servidor
                no pedido à API, e não apenas sugerido ao modelo: uma resposta
                nunca passa deste tamanho.
              </Alerta>

              {erro && <Alerta tipo="erro">{erro}</Alerta>}
              {gravado && (
                <Alerta tipo="sucesso">
                  Gravado. As perguntas seguintes já usam este limite.
                </Alerta>
              )}

              <div>
                <Botao
                  type="submit"
                  variante="primario"
                  disabled={aGravar || !mudou || !valido}
                >
                  {aGravar ? (
                    "A gravar…"
                  ) : (
                    <>
                      <Check size={15} />
                      Gravar
                    </>
                  )}
                </Botao>
              </div>
            </form>
          )}
        </Cartao>

        <div className="flex min-w-0 flex-col gap-4">
          {data && <Retencao data={data} aoGravar={mutate} />}

          <Cartao className="min-w-0">
            <TituloCartao>Como isto controla o custo</TituloCartao>
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-texto-suave">
              <p>
                Este limite é <b>geral</b>: encurta o que cada pergunta gasta,
                em qualquer empresa. Não substitui os limites por empresa —
                trabalha com eles.
              </p>
              <p>
                Os <b>limites mensais de tokens e de custo</b> continuam a ser
                definidos na licença de cada empresa, e o consumo real —
                entrada, saída e custo estimado — continua a ser registado por
                empresa em <b>Consumo de IA</b>.
              </p>
              <p>
                Baixá-lo demais tem um custo escondido: uma resposta que fica a
                meio leva a pessoa a repetir a pergunta, e aí paga-se duas
                vezes.
              </p>
            </div>
          </Cartao>

          <Cartao className="min-w-0">
            <TituloCartao>Preços aplicados</TituloCartao>
            <PrecosIa />
          </Cartao>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
/** Prazos de retenção do histórico do assistente.
 *
 * São DOIS porque são coisas diferentes, e confundi-las custa caro nos dois
 * sentidos: descartar o pacote enviado liberta quase todo o espaço sem perder
 * nada de contas; apagar a consulta apaga também o consumo daquele período.
 */
function Retencao({
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
      setTimeout(() => setGravado(false), 4000);
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
    <Cartao className="min-w-0">
      <TituloCartao
        extra={
          <span className="inline-flex items-center gap-1.5 text-xs text-texto-suave">
            <Trash2 size={13} />
            Limpeza
          </span>
        }
      >
        Histórico do assistente
      </TituloCartao>

      <form onSubmit={submeter} className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-texto-suave">
          O histórico é limpo sozinho, à medida que se fazem perguntas — não é
          preciso agendar nada.
        </p>

        <Campo
          rotulo="Descartar o pacote enviado ao fim de"
          dica={`Entre ${data.dias_pacote_min} e ${data.dias_pacote_max} dias. É o que ocupa espaço: cerca de 3 kB por pergunta. A pergunta, a resposta e os números ficam.`}
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

        <Campo
          rotulo="Apagar a consulta ao fim de"
          dica={`Entre ${data.dias_historico_min} e ${data.dias_historico_max} dias. Aqui perde-se também o consumo desse período — por isso o mínimo é largo.`}
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

        {nPacote > nHistorico && (
          <Alerta tipo="aviso">
            O pacote não pode durar mais do que a consulta — a essa altura já
            teria sido apagada.
          </Alerta>
        )}

        <Alerta tipo="info">
          As consultas do <b>mês corrente nunca são apagadas</b>, seja qual for
          o prazo: é delas que saem os totais de consumo que travam quem passa
          da quota.
        </Alerta>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {gravado && <Alerta tipo="sucesso">Prazos gravados.</Alerta>}

        <div>
          <Botao
            type="submit"
            variante="primario"
            disabled={aGravar || !mudou || !valido}
          >
            {aGravar ? "A gravar…" : "Gravar prazos"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
