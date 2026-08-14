"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, ErroApi, guardarToken, lerToken, limparSessao } from "@/lib/api";
import type {
  Desafio2Fa,
  Empresa,
  Modulo,
  Perfil,
  RespostaLogin,
  Utilizador,
} from "@/types";

/** Matriz de capacidades por perfil — a mesma do backend e do Piloto. */
const CAPS: Record<Perfil, readonly string[]> = {
  superadmin: ["*"],
  admin: ["*"],
  contabilista: [
    "contab.ver",
    "contab.lancar",
    "contab.plano",
    "contab.fechar",
    "financeiro.ver",
    "imob.ver",
    "imob.gerir",
    "analitica.ver",
    "analitica.gerir",
    "empresa.ver",
  ],
  financeiro: [
    "financeiro.ver",
    "financeiro.gerir",
    "contab.ver",
    "comercial.ver",
    "logistica.ver",
  ],
  comercial: ["comercial.ver", "comercial.gerir", "financeiro.ver"],
  logistica: ["logistica.ver", "logistica.gerir", "imob.ver"],
  rh: ["rh.ver", "rh.gerir"],
  consulta: [
    "contab.ver",
    "financeiro.ver",
    "comercial.ver",
    "logistica.ver",
    "imob.ver",
    "analitica.ver",
    "rh.ver",
    "empresa.ver",
  ],
};

interface AuthContexto {
  utilizador: Utilizador | null;
  empresa: Empresa | null;
  aCarregar: boolean;
  /** Devolve o desafio quando falta o segundo factor, ou o utilizador que
   *  entrou — quem chama tem de saber para onde o levar. */
  entrar: (
    email: string,
    password: string,
    empresa?: string,
  ) => Promise<Desafio2Fa | Utilizador>;
  /** Segundo passo do login, com o código da aplicação ou de recuperação. */
  entrarCom2Fa: (desafio: string, codigo: string) => Promise<Utilizador>;
  sair: () => void;
  /** Capacidade da matriz CAPS, ex.: `pode("contab.lancar")`. */
  pode: (acao: string) => boolean;
  /** Módulo visível para este utilizador. */
  moduloAtivo: (modulo: Modulo) => boolean;
  ehAdmin: boolean;
}

const Ctx = createContext<AuthContexto | null>(null);

/**
 * A empresa do utilizador, com a ficha completa se ele lá chegar.
 *
 * A ficha inteira (`/api/empresa`) é do administrador. Os outros perfis ficam
 * pelo cartão — nome, NIF, código, moeda e regime —, que é o que todo o mapa
 * precisa para levar cabeçalho e mostrar os valores na moeda certa. Sem isto,
 * um contabilista imprimia o balancete sem nome de empresa e com «Kz» por
 * omissão, mesmo numa empresa que trabalha noutra moeda.
 */
async function carregarEmpresa(): Promise<Empresa | null> {
  try {
    return await api.get<Empresa>("/api/empresa");
  } catch {
    try {
      return await api.get<Empresa>("/api/empresa/cartao");
    } catch {
      return null; // não impede trabalhar; só o cabeçalho fica sem nome
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [utilizador, setUtilizador] = useState<Utilizador | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  // Repõe a sessão a partir do token guardado.
  useEffect(() => {
    let cancelado = false;

    async function repor() {
      if (!lerToken()) {
        setACarregar(false);
        return;
      }
      try {
        const u = await api.get<Utilizador>("/api/auth/me");
        if (cancelado) return;
        setUtilizador(u);
        // O superadmin da plataforma não tem empresa — o 400 é esperado.
        if (u.empresa_id) setEmpresa(await carregarEmpresa());
      } catch (e) {
        if (e instanceof ErroApi && e.precisaLogin) limparSessao();
      } finally {
        if (!cancelado) setACarregar(false);
      }
    }

    repor();
    return () => {
      cancelado = true;
    };
  }, []);

  // `empresa` é o código («BE001») ou o nome. Obrigatório para todos menos o
  // superadministrador da plataforma, que não pertence a nenhuma — por isso
  // vai opcional e é o backend que decide se falta.
  const abrirSessao = useCallback(async (r: RespostaLogin) => {
    guardarToken(r.access_token, r.expira_absoluto);
    setUtilizador(r.utilizador);
    if (r.utilizador.empresa_id) setEmpresa(await carregarEmpresa());
  }, []);

  // Devolve `null` quando a sessão ficou aberta, ou o desafio quando falta o
  // segundo factor. Aqui não fica estado nenhum a meio: enquanto houver
  // desafio não há sessão, e o desafio não abre porta nenhuma sozinho.
  const entrar = useCallback(
    async (
      email: string,
      password: string,
      empresa?: string,
      // Devolve o desafio quando falta o segundo factor, e o utilizador
      // quando a sessão ficou aberta. Quem chama precisa de saber quem
      // entrou: uma conta da plataforma não tem empresa e não pode ser
      // largada no painel da contabilidade.
    ): Promise<Desafio2Fa | Utilizador> => {
      const r = await api.post<RespostaLogin | Desafio2Fa>(
        "/api/auth/login",
        { email, password, empresa: empresa?.trim() || null },
        { publico: true },
      );
      if ("requer_2fa" in r) return r;
      await abrirSessao(r);
      return r.utilizador;
    },
    [abrirSessao],
  );

  const entrarCom2Fa = useCallback(
    async (desafio: string, codigo: string): Promise<Utilizador> => {
      const r = await api.post<RespostaLogin>(
        "/api/auth/login/2fa",
        { desafio, codigo: codigo.trim() },
        { publico: true },
      );
      await abrirSessao(r);
      return r.utilizador;
    },
    [abrirSessao],
  );

  const sair = useCallback(() => {
    limparSessao();
    setUtilizador(null);
    setEmpresa(null);
    router.push("/entrar");
  }, [router]);

  const pode = useCallback(
    (acao: string) => {
      if (!utilizador?.ativo || !utilizador.aprovado) return false;
      const caps = [
        ...(CAPS[utilizador.perfil] ?? []),
        ...(utilizador.permissoes_extra ?? []),
      ];
      return caps.includes("*") || caps.includes(acao);
    },
    [utilizador],
  );

  const moduloAtivo = useCallback(
    (modulo: Modulo) => {
      if (!utilizador) return false;
      if (utilizador.perfil === "superadmin") return true;
      // `null` = sem restrição pessoal; lista vazia = nenhum módulo. Não é o
      // mesmo, e tratá-los da mesma forma daria acesso a quem foi restringido.
      const lista = utilizador.modulos_permitidos;
      if (lista !== null && lista !== undefined) return lista.includes(modulo);
      return true;
    },
    [utilizador],
  );

  const valor = useMemo<AuthContexto>(
    () => ({
      utilizador,
      empresa,
      aCarregar,
      entrar,
      entrarCom2Fa,
      sair,
      pode,
      moduloAtivo,
      ehAdmin:
        utilizador?.perfil === "admin" || utilizador?.perfil === "superadmin",
    }),
    [
      utilizador,
      empresa,
      aCarregar,
      entrar,
      entrarCom2Fa,
      sair,
      pode,
      moduloAtivo,
    ],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth tem de estar dentro de <AuthProvider>.");
  return ctx;
}
