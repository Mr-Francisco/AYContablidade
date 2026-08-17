"use client";

import { api, guardarToken, lerExpiraAbsoluto, lerToken } from "@/lib/api";

/**
 * Renovação da sessão — a metade que faltava.
 *
 * O desenho sempre foi: o token dura pouco (30 minutos) e **renova-se enquanto
 * a pessoa trabalha**, sem nunca passar do limite absoluto contado desde a
 * entrada (12 horas). O servidor tem a rota há muito — `POST /auth/refresh`,
 * que reaproveita a expiração absoluta e por isso não prolonga nada. O cliente
 * nunca a chamou.
 *
 * O que se via: passados 30 minutos a sessão morria a meio do trabalho, sem
 * aviso, e descobria-se ao gravar. Não era uma decisão de segurança — era uma
 * peça que faltava.
 *
 * O QUE ISTO **NÃO** TOCA: os cortes deliberados de sessão. Mudar a
 * palavra-passe, um administrador mudar o perfil de alguém, bloquear uma conta
 * ou o superadministrador suspender a empresa continuam a expulsar quem está
 * dentro, na hora. Esses cortes são o que faz «desactivar» significar alguma
 * coisa, e renovar não os contorna: o servidor compara a versão do token e
 * recusa a renovação na mesma.
 */

/** Renova quando falta menos do que isto para o token expirar. */
const MARGEM_MS = 5 * 60 * 1000;

/** Quanto antes do limite absoluto se avisa quem está a trabalhar. */
export const AVISO_ANTES_MS = 5 * 60 * 1000;

/** Lê o `exp` do token sem verificar a assinatura — só para saber quando renovar. */
export function expiraEm(token: string | null): number | null {
  if (!token) return null;
  try {
    const corpo = JSON.parse(atob(token.split(".")[1]));
    return typeof corpo.exp === "number" ? corpo.exp * 1000 : null;
  } catch {
    // Um token que não se consegue ler é tratado como expirado: quem decide
    // é o servidor, e o pior que acontece é uma renovação a mais.
    return null;
  }
}

/** Milissegundos até ao limite absoluto da sessão, ou `null` se não houver. */
export function faltaParaOLimite(): number | null {
  const absoluto = lerExpiraAbsoluto();
  if (!absoluto) return null;
  const fim = new Date(absoluto).getTime();
  return Number.isNaN(fim) ? null : fim - Date.now();
}

/**
 * Renova o token se estiver perto do fim. Devolve `true` se renovou.
 *
 * Silenciosa de propósito: uma renovação bem sucedida não é notícia. Se
 * falhar, não faz nada — o próximo pedido apanha o 401 e a aplicação trata
 * disso como sempre tratou.
 */
export async function renovarSePreciso(): Promise<boolean> {
  const token = lerToken();
  if (!token) return false;

  const expira = expiraEm(token);
  if (expira !== null && expira - Date.now() > MARGEM_MS) return false;

  // Já passou do limite absoluto: renovar não serve, e insistir só gera 401
  // em série.
  const falta = faltaParaOLimite();
  if (falta !== null && falta <= 0) return false;

  try {
    const r = await api.post<{
      access_token: string;
      expira_absoluto?: string;
    }>("/api/auth/refresh", {});
    guardarToken(r.access_token, r.expira_absoluto);
    return true;
  } catch {
    return false;
  }
}
