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
  entrar: (email: string, password: string) => Promise<void>;
  sair: () => void;
  /** Capacidade da matriz CAPS, ex.: `pode("contab.lancar")`. */
  pode: (acao: string) => boolean;
  /** Módulo visível para este utilizador. */
  moduloAtivo: (modulo: Modulo) => boolean;
  ehAdmin: boolean;
}

const Ctx = createContext<AuthContexto | null>(null);

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
        if (u.empresa_id) {
          try {
            setEmpresa(await api.get<Empresa>("/api/empresa"));
          } catch {
            /* perfis sem acesso a /api/empresa continuam a funcionar */
          }
        }
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

  const entrar = useCallback(async (email: string, password: string) => {
    const r = await api.post<RespostaLogin>(
      "/api/auth/login",
      { email, password },
      { publico: true },
    );
    guardarToken(r.access_token, r.expira_absoluto);
    setUtilizador(r.utilizador);
    if (r.utilizador.empresa_id) {
      try {
        setEmpresa(await api.get<Empresa>("/api/empresa"));
      } catch {
        /* sem acesso à ficha da empresa — não impede entrar */
      }
    }
  }, []);

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
      sair,
      pode,
      moduloAtivo,
      ehAdmin:
        utilizador?.perfil === "admin" || utilizador?.perfil === "superadmin",
    }),
    [utilizador, empresa, aCarregar, entrar, sair, pode, moduloAtivo],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth tem de estar dentro de <AuthProvider>.");
  return ctx;
}
