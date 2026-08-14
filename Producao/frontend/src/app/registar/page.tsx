"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";

/** Os perfis que uma pessoa pode escolher ao registar-se.
 *
 *  «Administrador» não está aqui de propósito: o administrador de uma empresa
 *  nasce da activação da licença, e os seguintes são criados por quem já é
 *  administrador. Se fosse auto-atribuível, qualquer pessoa que soubesse o
 *  código da empresa pedia acesso total e esperava que a aprovação passasse
 *  distraída. */
const PERFIS = [
  { valor: "contabilista", rotulo: "Contabilista" },
  { valor: "financeiro", rotulo: "Tesouraria" },
  { valor: "comercial", rotulo: "Comercial" },
  { valor: "logistica", rotulo: "Logística" },
  { valor: "rh", rotulo: "Recursos Humanos" },
  { valor: "consulta", rotulo: "Consulta" },
];

export default function Registar() {
  const router = useRouter();

  const [campos, setCampos] = useState({
    empresa: "",
    nome: "",
    email: "",
    password: "",
    telefone: "",
    perfil: "consulta",
  });
  const [confirmar, setConfirmar] = useState("");
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aRegistar, setARegistar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (campos.password !== confirmar) {
      return setErro("As palavras-passe não coincidem.");
    }
    setARegistar(true);
    try {
      await api.post(
        "/api/auth/registar",
        { ...campos, telefone: campos.telefone.trim() || null },
        { publico: true },
      );
      setFeito(true);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível criar a conta.",
      );
    } finally {
      setARegistar(false);
    }
  }

  return (
    <Envolvente>
      {feito ? (
        <div className="rounded-[14px] border border-borda bg-superficie p-7 shadow-forte">
          <div className="mb-4 flex items-center gap-3">
            <CheckCircle2 size={28} className="text-sucesso" aria-hidden />
            <h1 className="text-[22px] font-bold tracking-[-0.3px]">
              Conta criada
            </h1>
          </div>
          <Alerta tipo="info" className="mb-4">
            A conta fica <b>por aprovar</b> até um administrador da empresa a
            validar. Até lá não consegue entrar — é essa a barreira que impede
            que quem descubra o código da empresa se junte a ela sem
            autorização.
          </Alerta>
          <Botao
            variante="primario"
            bloco
            onClick={() => router.push("/entrar")}
          >
            Voltar ao início de sessão
          </Botao>
        </div>
      ) : (
        <div className="rounded-[14px] border border-borda bg-superficie p-7 shadow-forte">
          <h1 className="mb-1 text-[22px] font-bold tracking-[-0.3px]">
            Criar conta
          </h1>
          <p className="mb-6 text-sm text-texto-suave">
            Registe-se numa empresa que já use o sistema. A conta só fica activa
            depois de um administrador a aprovar.
          </p>

          <form onSubmit={submeter} className="flex flex-col gap-4">
            <Campo
              rotulo="Empresa"
              dica="Código da empresa (ex.: BE001) ou o NIF."
            >
              <Entrada
                value={campos.empresa}
                onChange={(e) => alterar("empresa", e.target.value)}
                required
                autoFocus
                placeholder="BE001"
                className="uppercase placeholder:normal-case"
              />
            </Campo>

            <Campo rotulo="Nome completo">
              <Entrada
                value={campos.nome}
                onChange={(e) => alterar("nome", e.target.value)}
                required
              />
            </Campo>

            <Campo rotulo="E-mail">
              <Entrada
                type="email"
                value={campos.email}
                onChange={(e) => alterar("email", e.target.value)}
                required
                autoComplete="username"
              />
            </Campo>

            <Campo rotulo="Telefone">
              <Entrada
                value={campos.telefone}
                onChange={(e) => alterar("telefone", e.target.value)}
                className="tabular"
              />
            </Campo>

            <Selector
              rotulo="Função"
              valor={campos.perfil}
              aoMudar={(v) => alterar("perfil", v)}
              opcoes={PERFIS}
              larguraMinima="100%"
            />

            <Campo rotulo="Palavra-passe" dica="Mínimo 8 caracteres.">
              <Entrada
                type="password"
                value={campos.password}
                onChange={(e) => alterar("password", e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Campo>

            <Campo rotulo="Confirmar palavra-passe">
              <Entrada
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <Botao type="submit" variante="primario" bloco disabled={aRegistar}>
              {aRegistar ? "A criar…" : "Criar conta"}
            </Botao>
          </form>
        </div>
      )}

      <p className="mt-5 text-center text-[13px] text-texto-suave">
        Já tem conta?{" "}
        <a href="/entrar" className="font-semibold text-marca hover:underline">
          Iniciar sessão
        </a>
        {" · "}
        <a href="/activar" className="font-semibold text-marca hover:underline">
          Activar licença
        </a>
      </p>
    </Envolvente>
  );
}

function Envolvente({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-[460px]"
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="rounded-xl bg-marca px-3 py-1.5 text-[28px] font-black leading-none tracking-[-1px] text-white">
            SGD
          </span>
          <div className="flex flex-col leading-tight">
            <b className="text-base tracking-[3px] text-acento">SGD</b>
            <span className="text-[9px] tracking-[2px] text-texto-suave">
              SOFTWARE DE GESTÃO DIRIGIDA
            </span>
          </div>
        </div>
        {children}
      </motion.div>
    </main>
  );
}
