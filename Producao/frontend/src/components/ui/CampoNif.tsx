"use client";

import { BadgeCheck, Loader2, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Campo, Entrada } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Campo de NIF com confirmação na AGT.
 *
 * O NIF é o único campo de uma ficha que pode ser CONFIRMADO contra uma fonte
 * externa — o serviço de contribuintes da AGT. Quem preenche escreve o número
 * e carrega no botão ao lado; o que vier preenche o resto e fica dito de onde
 * veio.
 *
 * TRÊS COISAS QUE A AGT NÃO DEVOLVE: morada, telefone e e-mail. Prometer um
 * formulário inteiro preenchido faria com que o resultado — nome, estado e
 * regime — parecesse uma avaria. O que se preenche é o que existe.
 *
 * SEM A AGT CONFIGURADA o botão continua a servir: valida o formato, diz se é
 * pessoa singular ou colectiva, e diz claramente que não foi confirmado por
 * ninguém. É a diferença entre «não sei» e «não perguntei».
 */

export interface RespostaNif {
  fonte: "agt" | "formato";
  valido: boolean;
  encontrado: boolean;
  nif: string;
  nome?: string;
  tipo: string;
  tipo_rotulo: string;
  estado?: string;
  estado_rotulo?: string;
  restrito?: boolean;
  regime_iva?: string;
  regime_rotulo?: string;
  regime_na_ficha?: string;
  nao_residente?: boolean;
  mensagem: string;
  aviso_agt?: string;
}

export function CampoNif({
  valor,
  aoMudar,
  aoConfirmar,
  rotulo = "NIF",
  dica,
  className,
  autoFocus,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  /**
   * O que a AGT respondeu. Cada ficha decide o que fazer com isto — a de
   * cliente preenche o nome e o regime de IVA, a do colaborador só o nome.
   */
  aoConfirmar?: (r: RespostaNif) => void;
  rotulo?: string;
  dica?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [resposta, setResposta] = useState<RespostaNif | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const vazio = !valor.trim();

  async function confirmar() {
    if (vazio || ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      const r = await api.get<RespostaNif>(
        `/api/nif?numero=${encodeURIComponent(valor.trim())}`,
      );
      setResposta(r);
      // Só se preenche a ficha com o que foi mesmo confirmado. Preencher com
      // uma validação de formato seria escrever suposições nos campos.
      if (r.encontrado) aoConfirmar?.(r);
    } catch (e) {
      setResposta(null);
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível consultar o NIF.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Campo rotulo={rotulo} dica={resposta || erro ? undefined : dica}>
        <div className="flex items-stretch gap-1.5">
          <Entrada
            value={valor}
            autoFocus={autoFocus}
            onChange={(e) => {
              aoMudar(e.target.value);
              // O resultado é do número que foi consultado. Mudar o número e
              // deixar lá o cartão anterior seria afirmar uma coisa sobre
              // outra.
              if (resposta || erro) {
                setResposta(null);
                setErro(null);
              }
            }}
            onKeyDown={(e) => {
              // Enter confirma sem submeter o formulário à volta: num
              // formulário longo, submeter a meio perdia o preenchimento.
              if (e.key === "Enter") {
                e.preventDefault();
                confirmar();
              }
            }}
            className="tabular min-w-0 flex-1 uppercase"
            placeholder="5000000000"
          />
          <button
            type="button"
            onClick={confirmar}
            disabled={vazio || ocupado}
            title={
              vazio
                ? "Escreva o NIF primeiro"
                : "Confirmar na AGT — preenche o que vier"
            }
            aria-label="Confirmar NIF na AGT"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-bold transition-colors",
              vazio || ocupado
                ? "cursor-not-allowed border-borda text-texto-suave opacity-60"
                : "border-marca text-marca hover:bg-marca hover:text-white",
            )}
          >
            {ocupado ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Search size={14} aria-hidden />
            )}
            <span className="hidden sm:inline">
              {ocupado ? "A consultar…" : "Confirmar"}
            </span>
          </button>
        </div>
      </Campo>

      {erro && <Cartao tom="erro">{erro}</Cartao>}

      {resposta && !erro && <Resultado r={resposta} />}
    </div>
  );
}

/** O que se sabe do contribuinte, dito com a origem à frente. */
function Resultado({ r }: { r: RespostaNif }) {
  if (!r.valido) return <Cartao tom="erro">{r.mensagem}</Cartao>;

  // Confirmado pela AGT e com restrições legais: é o caso que tem de saltar à
  // vista. Um contribuinte cessado ou suspenso não pode emitir facturas, e
  // quem o está a registar tem de saber antes e não no dia da recusa.
  if (r.encontrado && r.restrito) {
    return (
      <Cartao tom="erro" icone={<ShieldAlert size={14} />}>
        <b>{r.nome}</b> — contribuinte <b>{r.estado_rotulo?.toLowerCase()}</b>.
        Não pode emitir facturas nem operar normalmente. Confirme antes de
        continuar.
      </Cartao>
    );
  }

  if (r.encontrado) {
    return (
      <Cartao tom="sucesso" icone={<BadgeCheck size={14} />}>
        <b>{r.nome}</b>
        <span className="text-texto-suave">
          {" · "}
          {r.tipo_rotulo}
          {r.regime_rotulo ? ` · ${r.regime_rotulo}` : ""}
          {r.nao_residente ? " · não residente" : ""}
        </span>
        <span className="mt-0.5 block text-[11px] text-texto-suave">
          Confirmado na AGT. A morada e os contactos não vêm daqui — escreva-os
          abaixo.
        </span>
      </Cartao>
    );
  }

  // Válido mas não confirmado: dizer que a consulta não foi feita, e não que o
  // contribuinte não existe.
  return (
    <Cartao tom="aviso">
      {r.aviso_agt ?? r.mensagem}
      <span className="mt-0.5 block text-[11px] text-texto-suave">
        Número com formato de {r.tipo_rotulo.toLowerCase()}.
      </span>
    </Cartao>
  );
}

function Cartao({
  tom,
  icone,
  children,
}: {
  tom: "sucesso" | "aviso" | "erro";
  icone?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cores = {
    sucesso:
      "border-[var(--color-sucesso)]/40 bg-[var(--color-sucesso)]/10 text-texto",
    aviso:
      "border-[var(--color-aviso)]/40 bg-[var(--color-aviso)]/10 text-texto",
    erro: "border-perigo/40 bg-perigo/10 text-texto",
  }[tom];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] leading-relaxed",
        cores,
      )}
    >
      {icone && <span className="mt-0.5 shrink-0">{icone}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
