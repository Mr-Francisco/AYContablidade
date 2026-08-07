/**
 * Cliente da API.
 *
 * O token vai no cabeçalho `Authorization: Bearer`. É guardado no
 * `localStorage` e espelhado num cookie — o cookie serve APENAS para o
 * `proxy.ts` poder decidir se mostra a página ou redirecciona para o login,
 * evitando o flash de conteúdo protegido. Não é a fronteira de segurança: essa
 * está no backend, que valida o token e a versão de sessão em cada pedido.
 *
 * O nome do cookie é próprio da aplicação. Em `localhost`, os cookies são
 * partilhados entre PORTAS: um nome genérico como `access_token` colide com
 * outra aplicação na mesma máquina e provoca logout sem qualquer 401 nos
 * registos.
 */

export const COOKIE_SESSAO = "aycontab_access_token";
const CHAVE_TOKEN = "aycontab_token";
const CHAVE_EXPIRA = "aycontab_expira_absoluto";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8001";

export class ErroApi extends Error {
  constructor(
    public estado: number,
    mensagem: string,
    public detalhe?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }

  /** Sessão inválida ou expirada — a interface deve mandar fazer login. */
  get precisaLogin() {
    return this.estado === 401;
  }
  /** Sem permissão para esta operação. */
  get semPermissao() {
    return this.estado === 403;
  }
  /** Licença inactiva ou limite do plano atingido. */
  get problemaLicenca() {
    return this.estado === 402;
  }
  /** Regra de negócio violada — a mensagem é para mostrar ao utilizador. */
  get regraViolada() {
    return this.estado === 422;
  }

  /**
   * Mensagem pronta a mostrar.
   *
   * O backend escreve mensagens em português pensadas para o utilizador (as
   * regras contabilísticas, sobretudo) — essas passam tal como estão. Só os
   * casos genéricos, onde a mensagem do servidor não ajudaria, são
   * substituídos.
   */
  get mensagemUtilizador(): string {
    if (this.estado === 0) {
      return "Não foi possível contactar o servidor. Verifique a ligação.";
    }
    if (this.estado === 500) {
      return "Ocorreu um erro no servidor. Tente novamente.";
    }
    return this.message;
  }
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
export function guardarToken(token: string, expiraAbsoluto?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAVE_TOKEN, token);
  if (expiraAbsoluto) localStorage.setItem(CHAVE_EXPIRA, expiraAbsoluto);
  // `Lax` chega: os pedidos à API são feitos por JS com o cabeçalho, não por
  // navegação entre sítios.
  // biome-ignore lint/suspicious/noDocumentCookie: a CookieStore API ainda nao tem suporte no Safari nem no Firefox estavel; este cookie e so a pista que o proxy.ts le para redireccionar.
  document.cookie = `${COOKIE_SESSAO}=${token}; path=/; SameSite=Lax; max-age=43200`;
}

export function lerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHAVE_TOKEN);
}

export function lerExpiraAbsoluto(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHAVE_EXPIRA);
}

export function limparSessao() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_EXPIRA);
  // biome-ignore lint/suspicious/noDocumentCookie: ver a nota em guardarToken.
  document.cookie = `${COOKIE_SESSAO}=; path=/; SameSite=Lax; max-age=0`;
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
type Opcoes = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Não anexa o token — só para as rotas públicas. */
  publico?: boolean;
};

async function pedido<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { body, publico, headers, ...resto } = opcoes;

  const cabecalhos: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };
  if (body !== undefined) cabecalhos["Content-Type"] = "application/json";

  if (!publico) {
    const token = lerToken();
    if (token) cabecalhos.Authorization = `Bearer ${token}`;
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...resto,
      headers: cabecalhos,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ErroApi(
      0,
      "Não foi possível contactar o servidor. Verifique a ligação.",
    );
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  let dados: unknown = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = texto;
    }
  }

  if (!resposta.ok) {
    const detalhe = (dados as { detail?: unknown })?.detail;
    const mensagem =
      typeof detalhe === "string"
        ? detalhe
        : Array.isArray(detalhe)
          ? // Erros de validação do Pydantic vêm como lista de objectos.
            detalhe
              .map((d: { loc?: string[]; msg?: string }) =>
                d.loc?.length ? `${d.loc.at(-1)}: ${d.msg}` : d.msg,
              )
              .filter(Boolean)
              .join("; ")
          : `Erro ${resposta.status}`;
    throw new ErroApi(resposta.status, mensagem, dados);
  }

  return dados as T;
}

export const api = {
  get: <T>(caminho: string, opcoes?: Opcoes) =>
    pedido<T>(caminho, { ...opcoes, method: "GET" }),
  post: <T>(caminho: string, body?: unknown, opcoes?: Opcoes) =>
    pedido<T>(caminho, { ...opcoes, method: "POST", body }),
  put: <T>(caminho: string, body?: unknown, opcoes?: Opcoes) =>
    pedido<T>(caminho, { ...opcoes, method: "PUT", body }),
  patch: <T>(caminho: string, body?: unknown, opcoes?: Opcoes) =>
    pedido<T>(caminho, { ...opcoes, method: "PATCH", body }),
  delete: <T>(caminho: string, opcoes?: Opcoes) =>
    pedido<T>(caminho, { ...opcoes, method: "DELETE" }),
};

/** Buscador para o SWR. */
export const buscador = <T>(caminho: string) => api.get<T>(caminho);
