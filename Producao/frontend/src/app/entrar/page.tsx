"use client";

import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { ErroApi } from "@/lib/api";

export default function PaginaEntrar() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}

function Formulario() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { entrar } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEntrar(true);
    try {
      await entrar(email.trim(), password);
      const seguinte = parametros.get("seguinte");
      // Só caminhos internos: um `seguinte` externo seria um redireccionamento
      // aberto, aproveitável para phishing.
      router.push(seguinte?.startsWith("/") ? seguinte : "/");
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível iniciar sessão.",
      );
    } finally {
      setAEntrar(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-[420px]"
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="rounded-xl bg-marca px-3 py-1.5 text-[28px] font-black leading-none tracking-[-1px] text-white">
            SGD
          </span>
          <div className="flex flex-col leading-tight">
            <b className="text-base tracking-[3px] text-acento">SGD</b>
            <span className="text-[9px] tracking-[2px] text-texto-suave">
              SISTEMA DE GESTÃO DISTRIBUÍDO
            </span>
          </div>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-7 shadow-forte">
          <h1 className="mb-1 text-[22px] font-bold tracking-[-0.3px]">
            Iniciar sessão
          </h1>
          <p className="mb-6 text-sm text-texto-suave">
            Introduza as suas credenciais para aceder ao sistema.
          </p>

          <form onSubmit={submeter} className="flex flex-col gap-4">
            <Campo rotulo="E-mail">
              <Entrada
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                autoFocus
                placeholder="nome@empresa.ao"
              />
            </Campo>

            <Campo rotulo="Palavra-passe">
              <Entrada
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <Botao
              type="submit"
              variante="primario"
              bloco
              disabled={aEntrar}
              className="mt-1"
            >
              {aEntrar ? "A entrar…" : "Entrar"}
            </Botao>
          </form>
        </div>

        <p className="mt-5 text-center text-[13px] text-texto-suave">
          Ainda não tem conta?{" "}
          <a
            href="/registar"
            className="font-semibold text-marca hover:underline"
          >
            Registar
          </a>
          {" · "}
          <a
            href="/pedir-licenca"
            className="font-semibold text-marca hover:underline"
          >
            Pedir licença
          </a>
        </p>
      </motion.div>
    </main>
  );
}
