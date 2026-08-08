"use client";

import { motion } from "framer-motion";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";

interface Activada {
  empresa_id: string;
  empresa_nome: string;
  codigo_empresa: string;
  plano: string;
  validade: string | null;
}

export default function Activar() {
  const router = useRouter();

  const [campos, setCampos] = useState({
    chave: "",
    nif: "",
    nome_empresa: "",
    telefone: "",
    admin_nome: "",
    admin_email: "",
    admin_password: "",
  });
  const [confirmar, setConfirmar] = useState("");
  const [feito, setFeito] = useState<Activada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aActivar, setAActivar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (campos.admin_password !== confirmar) {
      return setErro("As palavras-passe não coincidem.");
    }
    setAActivar(true);
    try {
      setFeito(
        await api.post<Activada>(
          "/api/licencas/activar",
          {
            ...campos,
            nome_empresa: campos.nome_empresa.trim() || null,
            telefone: campos.telefone.trim() || null,
          },
          { publico: true },
        ),
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível activar a licença.",
      );
    } finally {
      setAActivar(false);
    }
  }

  if (feito) {
    return (
      <Envolvente>
        <div className="rounded-[14px] border border-borda bg-superficie p-7 shadow-forte">
          <div className="mb-4 flex items-center gap-3">
            <CheckCircle2 size={28} className="text-sucesso" aria-hidden />
            <h1 className="text-[22px] font-bold tracking-[-0.3px]">
              Empresa activada
            </h1>
          </div>

          <p className="mb-4 text-sm">
            <b>{feito.empresa_nome}</b> está criada com o plano{" "}
            <b>{feito.plano}</b>
            {feito.validade
              ? `, válido até ${new Date(feito.validade).toLocaleDateString("pt-PT")}`
              : ""}
            .
          </p>

          <div className="mb-4 rounded-xl border border-borda bg-fundo p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
              Código da empresa
            </p>
            <p className="tabular mt-1 text-3xl font-black tracking-[2px] text-marca">
              {feito.codigo_empresa}
            </p>
          </div>

          <Alerta tipo="aviso" className="mb-4">
            <b>Guarde este código.</b> Todas as pessoas da empresa precisam dele
            para entrar — o e-mail e a palavra-passe sozinhos não bastam. Também
            o pode encontrar depois nas Configurações.
          </Alerta>

          <Botao
            variante="primario"
            bloco
            onClick={() => router.push("/entrar")}
          >
            Iniciar sessão
          </Botao>
        </div>
      </Envolvente>
    );
  }

  return (
    <Envolvente>
      <div className="rounded-[14px] border border-borda bg-superficie p-7 shadow-forte">
        <div className="mb-1 flex items-center gap-2">
          <KeyRound size={20} className="text-marca" aria-hidden />
          <h1 className="text-[22px] font-bold tracking-[-0.3px]">
            Activar licença
          </h1>
        </div>
        <p className="mb-6 text-sm text-texto-suave">
          Introduza a chave que recebeu e os dados da empresa. A activação cria
          a empresa e a sua conta de administrador.
        </p>

        <form onSubmit={submeter} className="flex flex-col gap-4">
          <Campo
            rotulo="Chave de licença"
            dica="No formato SGD-XXXX-XXXX-XXXX. Válida durante 7 dias após ter sido emitida."
          >
            <Entrada
              value={campos.chave}
              onChange={(e) => alterar("chave", e.target.value)}
              required
              autoFocus
              placeholder="SGD-XXXX-XXXX-XXXX"
              className="tabular uppercase tracking-[1px] placeholder:normal-case"
            />
          </Campo>

          <Campo
            rotulo="NIF da empresa"
            dica="Tem de ser o mesmo NIF para o qual a licença foi emitida."
          >
            <Entrada
              value={campos.nif}
              onChange={(e) => alterar("nif", e.target.value)}
              required
              className="tabular"
            />
          </Campo>

          <Campo
            rotulo="Nome da empresa"
            dica="Em branco usa o nome com que a licença foi emitida."
          >
            <Entrada
              value={campos.nome_empresa}
              onChange={(e) => alterar("nome_empresa", e.target.value)}
            />
          </Campo>

          <Campo rotulo="Telefone">
            <Entrada
              value={campos.telefone}
              onChange={(e) => alterar("telefone", e.target.value)}
              className="tabular"
            />
          </Campo>

          <hr className="border-borda" />
          <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
            Conta de administrador
          </p>

          <Campo rotulo="Nome completo">
            <Entrada
              value={campos.admin_nome}
              onChange={(e) => alterar("admin_nome", e.target.value)}
              required
            />
          </Campo>

          <Campo rotulo="E-mail">
            <Entrada
              type="email"
              value={campos.admin_email}
              onChange={(e) => alterar("admin_email", e.target.value)}
              required
              autoComplete="username"
            />
          </Campo>

          <Campo rotulo="Palavra-passe" dica="Mínimo 8 caracteres.">
            <Entrada
              type="password"
              value={campos.admin_password}
              onChange={(e) => alterar("admin_password", e.target.value)}
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

          <Botao type="submit" variante="primario" bloco disabled={aActivar}>
            {aActivar ? "A activar…" : "Activar empresa"}
          </Botao>
        </form>
      </div>

      <p className="mt-5 text-center text-[13px] text-texto-suave">
        Já tem conta?{" "}
        <a href="/entrar" className="font-semibold text-marca hover:underline">
          Iniciar sessão
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
              SISTEMA DE GESTÃO DISTRIBUÍDO
            </span>
          </div>
        </div>
        {children}
      </motion.div>
    </main>
  );
}
