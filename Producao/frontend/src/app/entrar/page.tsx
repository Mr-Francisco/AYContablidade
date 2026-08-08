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
  const { entrar, entrarCom2Fa } = useAuth();

  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  // Enquanto houver desafio não há sessão nenhuma: é só a prova de que o
  // primeiro passo foi submetido, e sozinho não abre porta nenhuma.
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  function concluir() {
    const seguinte = parametros.get("seguinte");
    // Só caminhos internos: um `seguinte` externo seria um redireccionamento
    // aberto, aproveitável para phishing.
    router.push(seguinte?.startsWith("/") ? seguinte : "/");
  }

  function falhou(e: unknown) {
    setErro(
      e instanceof ErroApi
        ? e.mensagemUtilizador
        : "Não foi possível iniciar sessão.",
    );
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEntrar(true);
    try {
      const d = await entrar(email.trim(), password, empresa);
      if (d) setDesafio(d.desafio);
      else concluir();
    } catch (e2) {
      falhou(e2);
    } finally {
      setAEntrar(false);
    }
  }

  async function submeterCodigo(e: FormEvent) {
    e.preventDefault();
    if (!desafio) return;
    setErro(null);
    setAEntrar(true);
    try {
      await entrarCom2Fa(desafio, codigo);
      concluir();
    } catch (e2) {
      // O servidor não distingue palavra-passe errada de código errado — de
      // propósito, para que este ecrã não sirva para confirmar palavras-passe.
      // Por isso a mensagem manda verificar tudo, e não só o código.
      falhou(e2);
      setCodigo("");
    } finally {
      setAEntrar(false);
    }
  }

  function recomecar() {
    setDesafio(null);
    setCodigo("");
    setPassword("");
    setErro(null);
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
            {desafio ? "Verificação em dois passos" : "Iniciar sessão"}
          </h1>
          <p className="mb-6 text-sm text-texto-suave">
            {desafio
              ? "Abra a aplicação autenticadora e introduza o código de seis dígitos."
              : "Introduza as suas credenciais para aceder ao sistema."}
          </p>

          {desafio ? (
            <form onSubmit={submeterCodigo} className="flex flex-col gap-4">
              <Campo
                rotulo="Código"
                dica="Seis dígitos da aplicação, ou um código de recuperação."
              >
                <Entrada
                  value={codigo}
                  onChange={(ev) => setCodigo(ev.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={16}
                  placeholder="000000"
                  className="tabular text-center text-lg tracking-[0.3em]"
                  required
                />
              </Campo>

              {erro && <Alerta tipo="erro">{erro}</Alerta>}

              <Botao
                type="submit"
                variante="primario"
                bloco
                disabled={aEntrar || codigo.trim().length < 6}
                className="mt-1"
              >
                {aEntrar ? "A verificar…" : "Confirmar"}
              </Botao>

              <button
                type="button"
                onClick={recomecar}
                className="text-[13px] font-semibold text-texto-suave hover:text-marca hover:underline"
              >
                Voltar
              </button>
            </form>
          ) : (
            <form onSubmit={submeter} className="flex flex-col gap-4">
              {/* Sem `required`: o superadministrador da plataforma não
                  pertence a nenhuma empresa e não teria o que escrever aqui.
                  Marcá-lo como obrigatório impedia-o de entrar — o browser
                  bloqueava a submissão antes de o servidor sequer ser
                  contactado. É o backend que decide se falta, porque só ele
                  sabe de que conta se trata. */}
              <Campo
                rotulo="Empresa"
                dica="Código (ex.: BE001) ou nome. Contas da plataforma deixam em branco."
              >
                <Entrada
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  autoComplete="organization"
                  autoFocus
                  placeholder="BE001"
                  className="uppercase placeholder:normal-case"
                />
              </Campo>

              <Campo rotulo="E-mail">
                <Entrada
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
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
          )}
        </div>

        {!desafio && (
          <p className="mt-5 text-center text-[13px] text-texto-suave">
            Ainda não tem conta?{" "}
            <a
              href="/registar"
              className="font-semibold text-marca hover:underline"
            >
              Registar numa empresa
            </a>
            {" · "}
            <a
              href="/activar"
              className="font-semibold text-marca hover:underline"
            >
              Activar licença
            </a>
          </p>
        )}
      </motion.div>
    </main>
  );
}
