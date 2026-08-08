import { type NextRequest, NextResponse } from "next/server";

/**
 * Guarda de rotas (no Next 16 chama-se `proxy`, antes era `middleware`).
 *
 * Verifica apenas a PRESENÇA do cookie de sessão, para não mostrar um instante
 * de página protegida a quem não tem sessão. Não é a fronteira de segurança:
 * o backend valida o token, a versão de sessão, a licença e as permissões em
 * cada pedido. Um cookie forjado aqui não dá acesso a dado nenhum — só evita
 * o redireccionamento.
 */

const COOKIE = "aycontab_access_token";

/** Rotas acessíveis sem sessão. */
const PUBLICAS = ["/entrar", "/registar", "/activar"];

/** Das públicas, aquelas de onde se deve tirar quem JÁ tem sessão.
 *
 *  «Acessível sem sessão» e «só faz sentido sem sessão» não são a mesma coisa.
 *  Entrar e registar pertencem ao segundo grupo — quem já entrou não tem nada
 *  a fazer lá. Activar uma licença não: cria uma empresa NOVA e nada tem que
 *  ver com a sessão aberta, e quem gere várias empresas precisa de lá chegar
 *  sem ter de sair primeiro. */
const SO_SEM_SESSAO = ["/entrar", "/registar"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ehPublica = PUBLICAS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const temSessao = Boolean(request.cookies.get(COOKIE)?.value);

  if (!temSessao && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    // Para voltar à página pretendida depois de entrar.
    url.searchParams.set("seguinte", pathname);
    return NextResponse.redirect(url);
  }

  const soSemSessao = SO_SEM_SESSAO.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (temSessao && soSemSessao) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo excepto ficheiros estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
