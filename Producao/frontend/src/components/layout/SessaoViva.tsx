"use client";

import { Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Botao } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  AVISO_ANTES_MS,
  faltaParaOLimite,
  renovarSePreciso,
} from "@/lib/sessao";

/**
 * Mantém a sessão viva enquanto se trabalha, e avisa antes de ela acabar.
 *
 * DUAS COISAS, e não uma:
 *
 * 1. **Renovar.** De minuto a minuto vê se o token está perto do fim e, se
 *    estiver, renova-o. Silencioso: uma renovação que corre bem não é notícia.
 *    Isto acabou com a sessão a morrer aos 30 minutos a meio de um lançamento.
 *
 * 2. **Avisar.** A renovação nunca ultrapassa o limite absoluto da sessão —
 *    é essa a razão de ele existir. Cinco minutos antes desse limite aparece
 *    um aviso, para dar tempo de gravar o que está aberto. Sem ele, a sessão
 *    acabava na mesma, só que sem ninguém saber.
 *
 * O QUE ISTO NÃO FAZ: contornar um corte deliberado. Se a palavra-passe mudou,
 * o perfil foi alterado, a conta foi bloqueada ou a empresa suspensa, o
 * servidor recusa a renovação — e é assim que tem de ser.
 *
 * Não desenha nada enquanto não houver o que dizer: noventa e nove por cento
 * do tempo, este componente é uma linha de código a correr em silêncio.
 */
export function SessaoViva() {
  const { utilizador } = useAuth();
  const [faltaMs, setFaltaMs] = useState<number | null>(null);
  const [dispensado, setDispensado] = useState(false);

  const verificar = useCallback(async () => {
    await renovarSePreciso();
    const falta = faltaParaOLimite();
    setFaltaMs(falta);
    // Voltou a haver folga (nova entrada, por exemplo): o aviso dispensado
    // volta a poder aparecer no fim da sessão seguinte.
    if (falta !== null && falta > AVISO_ANTES_MS) setDispensado(false);
  }, []);

  useEffect(() => {
    if (!utilizador) return;
    verificar();
    // Um minuto: é folgado para uma margem de cinco, e não pesa nada.
    const relogio = setInterval(verificar, 60_000);
    return () => clearInterval(relogio);
  }, [utilizador, verificar]);

  if (!utilizador || dispensado || faltaMs === null) return null;
  if (faltaMs > AVISO_ANTES_MS || faltaMs <= 0) return null;

  const minutos = Math.max(1, Math.round(faltaMs / 60_000));

  return (
    <output
      // Acima da barra dos módulos, como o botão de acesso rápido.
      className="sem-imprimir fixed bottom-[calc(var(--altura-modulos,0px)+1.5rem)] left-1/2 z-50 flex w-[min(30rem,92vw)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-[var(--color-aviso)]/40 bg-superficie px-4 py-3 shadow-forte"
    >
      <span className="mt-0.5 shrink-0 text-[var(--color-aviso)]">
        <Clock size={18} />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <b>
          A sessão termina daqui a {minutos}{" "}
          {minutos === 1 ? "minuto" : "minutos"}.
        </b>{" "}
        É o limite máximo de uma sessão, e não se prolonga — grave o que tiver
        aberto. Voltar a entrar leva dez segundos e continua onde estava.
      </div>
      <Botao
        tamanho="pequeno"
        onClick={() => setDispensado(true)}
        aria-label="Dispensar o aviso"
      >
        Entendido
      </Botao>
    </output>
  );
}
