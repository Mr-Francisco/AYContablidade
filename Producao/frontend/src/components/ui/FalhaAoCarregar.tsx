"use client";

import { AlertTriangle, Inbox, LogIn, ShieldOff, WifiOff } from "lucide-react";
import Link from "next/link";

import { Alerta, Botao } from "@/components/ui";
import { ErroApi } from "@/lib/api";

/**
 * O que se mostra quando um mapa não vem — e PORQUÊ não veio.
 *
 * Estava tudo a dizer a mesma coisa: «Não foi possível carregar o balancete»,
 * «…a demonstração», «…as retenções». Dez ecrãs, uma frase que não explica
 * nada e que, na maioria dos casos, era FALSA — o servidor tinha respondido, e
 * tinha dito exactamente qual era o problema:
 *
 *   - a sessão expirou (401);
 *   - a conta é da plataforma e não pertence a nenhuma empresa (400);
 *   - o perfil não tem permissão para aquele mapa (403);
 *   - a licença da empresa caducou (402).
 *
 * Nenhuma dessas é «não foi possível carregar». Quem lê aquela frase vai
 * procurar uma avaria que não existe — foi o que aconteceu, em oito ecrãs ao
 * mesmo tempo.
 *
 * E o caso mais comum de todos NÃO É UM ERRO: uma empresa nova, ou um período
 * sem movimentos, não tem mapa nenhum para mostrar. Isso é um estado vazio, e
 * um estado vazio pintado de vermelho faz o utilizador duvidar do sistema logo
 * no primeiro dia.
 */
export function FalhaAoCarregar({
  erro,
  oQue,
  vazio,
}: {
  /** O erro do SWR. `undefined` significa que o pedido correu bem. */
  erro?: unknown;
  /** Como se chama o que falhou: «o balancete», «as retenções». */
  oQue: string;
  /** Texto do estado vazio. Por omissão, uma frase sobre o período. */
  vazio?: string;
}) {
  // Sem erro nenhum: veio resposta e não há o que mostrar. Não é avaria.
  if (!erro) {
    return (
      <Alerta tipo="info">
        <Inbox size={16} />
        {vazio ?? `Sem dados para ${oQue} no período seleccionado.`}
      </Alerta>
    );
  }

  if (!(erro instanceof ErroApi)) {
    return (
      <Alerta tipo="erro">
        <AlertTriangle size={16} />
        Não foi possível carregar {oQue}.
      </Alerta>
    );
  }

  // Sessão caída. É o caso que mais se parece com uma avaria e não é nenhuma —
  // e a acção certa é uma só, por isso vai já aqui um botão.
  if (erro.estado === 401) {
    return (
      <Alerta tipo="aviso">
        <div className="flex flex-wrap items-center gap-3">
          <span>A sessão expirou. Volte a entrar para ver {oQue}.</span>
          <Botao comoFilho variante="contorno" tamanho="pequeno">
            <Link href="/entrar">
              <LogIn size={14} />
              Entrar
            </Link>
          </Botao>
        </div>
      </Alerta>
    );
  }

  if (erro.estado === 0) {
    return (
      <Alerta tipo="erro">
        <WifiOff size={16} />
        Não foi possível contactar o servidor. Verifique a ligação e tente
        novamente.
      </Alerta>
    );
  }

  // 400, 402 e 403 trazem do servidor uma frase escrita para quem a lê — a
  // conta de plataforma sem empresa, a licença caducada, a falta de permissão.
  // Passa tal como está: é mais precisa do que qualquer coisa que se
  // inventasse aqui.
  const tipo = erro.estado === 403 || erro.estado === 402 ? "aviso" : "erro";
  return (
    <Alerta tipo={tipo}>
      {erro.estado === 403 ? (
        <ShieldOff size={16} />
      ) : (
        <AlertTriangle size={16} />
      )}
      {erro.mensagemUtilizador}
    </Alerta>
  );
}
