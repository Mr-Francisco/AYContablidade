"use client";

import { Power } from "lucide-react";
import { AlertDialog, Switch } from "radix-ui";
import { type FormEvent, useEffect, useState } from "react";
import { ModelosIa } from "@/components/plataforma/ModelosIa";
import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";
import type { ConfigIa } from "@/types";
import { BarraDeAccoes, Grupo, Seccao } from "./Estrutura";

/** Valores que cobrem os casos comuns, para não obrigar a adivinhar um número.
 *  O campo continua livre — isto é um atalho, não a única forma. */
const SUGESTOES = [
  { valor: 400, rotulo: "Curta", nota: "Um parágrafo ou dois" },
  { valor: 800, rotulo: "Normal", nota: "Uma análise com contexto" },
  { valor: 1500, rotulo: "Detalhada", nota: "Conta a conta" },
  { valor: 3000, rotulo: "Longa", nota: "Relatórios extensos" },
];

export function SeccaoAssistente({
  data,
  aoGravar,
}: {
  data: ConfigIa;
  aoGravar: () => void;
}) {
  const [valor, setValor] = useState(String(data.max_tokens_saida));
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    setValor(String(data.max_tokens_saida));
  }, [data]);

  const numero = Number(valor);
  const mudou = numero !== data.max_tokens_saida;
  const valido =
    Number.isInteger(numero) && numero >= data.minimo && numero <= data.maximo;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setGravado(false);
    setAGravar(true);
    try {
      await api.patch("/api/licencas/config-ia", { max_tokens_saida: numero });
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
    <div className="flex flex-col gap-4">
      <Seccao
        titulo="Assistente"
        descricao="O assistente responde a perguntas sobre os dados de cada empresa. Aqui define-se se está disponível e quanto pode gastar por resposta."
      >
        <Interruptor data={data} aoGravar={aoGravar} />

        <form onSubmit={submeter} className="flex flex-col gap-5">
          <Grupo
            titulo="Tamanho máximo das respostas"
            nota="A resposta é a parte cara — custa cerca de quatro vezes mais do que a pergunta — e é a única que se consegue limitar antes de acontecer."
          >
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
                    className={`flex flex-col items-start rounded-xl border px-3.5 py-2.5 transition-colors ${
                      escolhido
                        ? "border-marca bg-marca/[0.07]"
                        : "border-borda hover:border-marca"
                    }`}
                  >
                    <span className="text-[13.5px] font-bold">{s.rotulo}</span>
                    <span className="tabular text-[12px] text-texto-suave">
                      {s.valor} tokens
                    </span>
                  </button>
                );
              })}
            </div>

            <Campo
              rotulo="Ou um valor à medida"
              dica={`Entre ${data.minimo} e ${data.maximo} tokens.`}
              className="max-w-[200px]"
            >
              <Entrada
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                min={data.minimo}
                max={data.maximo}
                step={50}
                className="tabular"
              />
            </Campo>
          </Grupo>

          <Alerta tipo="info">
            Aplica-se a partir da <b>pergunta seguinte</b>, em todas as
            empresas. As respostas nunca ultrapassam este tamanho.
            <br />
            Baixá-lo demais tem um custo escondido: uma resposta que fica a meio
            leva a pessoa a repetir a pergunta, e aí paga-se duas vezes.
          </Alerta>

          {erro && <Alerta tipo="erro">{erro}</Alerta>}

          <BarraDeAccoes
            mudou={mudou}
            valido={valido}
            aGravar={aGravar}
            gravado={gravado}
            aoDesfazer={() => {
              setValor(String(data.max_tokens_saida));
              setErro(null);
            }}
          />
        </form>
      </Seccao>

      <ModelosIa />
    </div>
  );
}

/** Interruptor geral do assistente.
 *
 * Desligar bloqueia toda a gente, incluindo quem ainda tem quota — é o travão
 * para quando algo corre mal e não há tempo para ir licença a licença. Por
 * isso desligar pergunta e ligar não: um lado tem consequências para todos, o
 * outro devolve o normal.
 */
function Interruptor({
  data,
  aoGravar,
}: {
  data: ConfigIa;
  aoGravar: () => void;
}) {
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState(false);

  async function definir(ativa: boolean) {
    setErro(null);
    setAGravar(true);
    try {
      await api.patch("/api/licencas/config-ia", { ia_ativa: ativa });
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível guardar.",
      );
    } finally {
      setAGravar(false);
      setAConfirmar(false);
    }
  }

  return (
    <>
      <div
        className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${
          data.ia_ativa
            ? "border-borda bg-superficie-2/60"
            : "border-perigo/40 bg-perigo/[0.06]"
        }`}
      >
        <span
          className={`flex size-10 flex-none items-center justify-center rounded-[10px] ${
            data.ia_ativa
              ? "bg-sucesso/15 text-sucesso"
              : "bg-perigo/15 text-perigo"
          }`}
        >
          <Power size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">
            {data.ia_ativa ? "Assistente disponível" : "Assistente desligado"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-texto-suave">
            {data.ia_ativa
              ? "Todas as empresas com quota podem fazer perguntas."
              : "Ninguém consegue fazer perguntas, mesmo com quota disponível."}
          </p>
        </div>
        <Switch.Root
          checked={data.ia_ativa}
          disabled={aGravar}
          onCheckedChange={(ligar) =>
            ligar ? definir(true) : setAConfirmar(true)
          }
          aria-label={
            data.ia_ativa ? "Desligar o assistente" : "Ligar o assistente"
          }
          className="relative h-6 w-11 rounded-full bg-borda transition-colors data-[state=checked]:bg-sucesso"
        >
          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <AlertDialog.Root open={aConfirmar} onOpenChange={setAConfirmar}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="text-[17px] font-bold">
              Desligar o assistente?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-texto-suave">
              Nenhuma empresa consegue fazer perguntas enquanto estiver
              desligado, mesmo as que ainda têm quota disponível. Volte a ligar
              aqui quando quiser.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao variante="neutro">Manter ligado</Botao>
              </AlertDialog.Cancel>
              <Botao
                variante="perigo"
                disabled={aGravar}
                onClick={() => definir(false)}
              >
                {aGravar ? "A desligar…" : "Desligar"}
              </Botao>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
