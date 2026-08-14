"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Moon, ShieldCheck, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTema } from "@/contexts/TemaContext";
import { ErroApi } from "@/lib/api";
import type { Utilizador } from "@/types";

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
  const menosMovimento = useReducedMotion();

  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  // Enquanto houver desafio não há sessão nenhuma: é só a prova de que o
  // primeiro passo foi submetido, e sozinho não abre porta nenhuma.
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  function concluir(u: Utilizador) {
    const seguinte = parametros.get("seguinte");
    // Só caminhos internos: um `seguinte` externo seria um redireccionamento
    // aberto, aproveitável para phishing.
    if (seguinte?.startsWith("/")) {
      router.push(seguinte);
      return;
    }
    // Uma conta de administração da plataforma não pertence a nenhuma empresa.
    // Largá-la no painel da contabilidade dava-lhe um ecrã vazio construído a
    // partir de meia dúzia de pedidos que respondem todos 400.
    router.push(u.empresa_id ? "/painel" : "/plataforma");
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
      if ("requer_2fa" in d) setDesafio(d.desafio);
      else concluir(d);
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
      concluir(await entrarCom2Fa(desafio, codigo));
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

  // Só transform e opacity, como manda a regra de movimento.
  //
  // Sem `AnimatePresence`: com `mode="wait"` o nó de saída ficava preso e o
  // segundo passo nunca chegava a montar — o formulário de credenciais ficava
  // no ecrã com o botão em «A entrar…» para sempre. Uma chave que muda basta
  // para o painel remontar e correr a entrada, e não há saída nenhuma pela
  // qual esperar.
  const entrada = menosMovimento
    ? {}
    : {
        initial: { opacity: 0, x: 14 },
        animate: { opacity: 1, x: 0 },
        transition: { duration: 0.22, ease: "easeOut" as const },
      };

  return (
    // A `.auth` do Piloto: duas colunas, 1.05fr para a faixa de marca e 0.95fr
    // para o formulário, e abaixo de 860px passa a uma coluna só.
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr] min-[860px]:grid-cols-[1.05fr_0.95fr] min-[860px]:grid-rows-1">
      <Faixa />

      <section className="relative flex items-center justify-center bg-fundo px-5 pb-11 pt-[30px] min-[860px]:px-7 min-[860px]:py-11">
        <BotaoTema />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-[400px]"
        >
          {/* `layout` faz a altura acompanhar a troca de passo em vez de saltar.
              A diferença entre os dois formulários é de dezenas de píxeis, e sem
              isto o cartão encolhia de repente e a coluna re-centrava-se. */}
          <motion.div
            layout={!menosMovimento}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <motion.div key={desafio ? "2fa" : "credenciais"} {...entrada}>
              {desafio ? (
                <PassoDois
                  email={email}
                  codigo={codigo}
                  setCodigo={setCodigo}
                  erro={erro}
                  aEntrar={aEntrar}
                  aoSubmeter={submeterCodigo}
                  aoVoltar={recomecar}
                />
              ) : (
                <PassoUm
                  empresa={empresa}
                  setEmpresa={setEmpresa}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  erro={erro}
                  aEntrar={aEntrar}
                  aoSubmeter={submeter}
                />
              )}
            </motion.div>
          </motion.div>

          <p className="mt-3.5 text-center text-sm">
            {desafio ? (
              <span className="text-texto-suave">
                Perdeu o telemóvel? Use um dos <b>códigos de recuperação</b> que
                guardou ao activar a verificação.
              </span>
            ) : (
              <>
                Ainda não tem conta?{" "}
                <a href="/registar" className="font-bold text-marca">
                  Registar numa empresa
                </a>
                {" · "}
                <a href="/activar" className="font-bold text-marca">
                  Activar licença
                </a>
              </>
            )}
          </p>
        </motion.div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
/**
 * A faixa de marca do Piloto (`.auth-hero`): gradiente, logótipo, promessa e
 * os três módulos. Os dois círculos são pseudo-elementos no Piloto — aqui são
 * dois `span` absolutos, porque o Tailwind não dá jeito para `::before` com
 * geometria própria e o resultado no ecrã é o mesmo.
 */
function Faixa() {
  return (
    <section className="gradiente-marca relative flex flex-col justify-between overflow-hidden px-[22px] py-[26px] text-white min-[860px]:px-12 min-[860px]:py-[52px]">
      <span
        aria-hidden
        className="absolute -right-[130px] -top-[150px] size-[440px] rounded-full bg-white/[0.08]"
      />
      <span
        aria-hidden
        className="absolute -bottom-[130px] -left-[90px] size-[320px] rounded-full bg-black/10"
      />

      <div className="relative z-[1] flex items-center gap-3">
        <span className="rounded-xl bg-black/30 px-3.5 py-1.5 text-[30px] font-black leading-none tracking-[-1px]">
          SGD
        </span>
        <span className="flex flex-col leading-[1.05]">
          <b className="text-[15px] tracking-[4px]">SGD</b>
          <span className="text-[9.5px] tracking-[2px] opacity-85">
            SOFTWARE DE GESTÃO DIRIGIDA
          </span>
        </span>
      </div>

      <div className="relative z-[1] my-4 min-[860px]:my-0">
        <h2 className="mb-3 text-2xl font-extrabold leading-[1.15] min-[860px]:text-[34px]">
          Toda a empresa,
          <br />
          num só sistema.
        </h2>
        <p className="max-w-[430px] text-[15px] leading-[1.55] opacity-90">
          Contabilidade, contas correntes, logística, imobilizados, comercial e
          RH — módulos ligados entre si.
        </p>
        <ul className="mt-7 hidden list-none flex-col gap-[13px] p-0 min-[860px]:flex">
          {[
            ["📒", "Contabilidade geral (PGC Angola) e analítica"],
            ["💳", "Contas correntes, tesouraria e imobilizados"],
            ["👥", "Comercial, logística e recursos humanos"],
          ].map(([icone, texto]) => (
            <li
              key={texto}
              className="flex items-center gap-3 text-[14.5px] font-medium"
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-white/[0.18] text-lg">
                {icone}
              </span>
              {texto}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-[1] hidden text-[12.5px] opacity-80 min-[860px]:block">
        © {new Date().getFullYear()} SGD · Software de Gestão Dirigida
      </div>
    </section>
  );
}

/** O `#themeBtn` do Piloto, no canto do painel. */
function BotaoTema() {
  const { tema, alternar } = useTema();
  return (
    <button
      type="button"
      onClick={alternar}
      title="Alternar tema"
      aria-label={
        tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"
      }
      className="absolute right-[18px] top-[18px] flex size-[38px] items-center justify-center rounded-[10px] border border-borda bg-superficie-2 text-texto transition-colors hover:border-acento"
    >
      {tema === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
function PassoUm({
  empresa,
  setEmpresa,
  email,
  setEmail,
  password,
  setPassword,
  erro,
  aEntrar,
  aoSubmeter,
}: {
  empresa: string;
  setEmpresa: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  erro: string | null;
  aEntrar: boolean;
  aoSubmeter: (e: FormEvent) => void;
}) {
  const [aVer, setAVer] = useState(false);

  return (
    <>
      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.3px]">Entrar</h1>
      <p className="mb-5 text-[13.5px] text-texto-suave">
        Aceda com a sua conta para continuar.
      </p>

      <form onSubmit={aoSubmeter} className="flex flex-col gap-4">
        {/* Sem `required`: o superadministrador da plataforma não pertence a
            nenhuma empresa e não teria o que escrever aqui. Marcá-lo como
            obrigatório impedia-o de entrar — o browser bloqueava a submissão
            antes de o servidor sequer ser contactado. É o backend que decide se
            falta, porque só ele sabe de que conta se trata. */}
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

        {/* O olho do Piloto (`.toggle-eye`): quem escreve uma palavra-passe
            longa num teclado de telemóvel precisa de a poder ver.

            SEM `Campo` aqui, e de propósito: o `Campo` envolve tudo num
            `<label>`, e um botão dentro de um rótulo fica dependente da
            activação implícita do campo associado. O Piloto tem o `<label>` à
            parte e o `.input-wrap` a seguir; é a mesma estrutura. */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-[13px] font-bold text-texto"
          >
            Palavra-passe
          </label>
          <div className="relative">
            <Entrada
              id="password"
              type={aVer ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setAVer(!aVer)}
              title="Mostrar/ocultar"
              aria-label={
                aVer ? "Ocultar palavra-passe" : "Mostrar palavra-passe"
              }
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1.5 text-texto-suave hover:bg-superficie-2"
            >
              {aVer ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

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
    </>
  );
}

// ---------------------------------------------------------------------------
function PassoDois({
  email,
  codigo,
  setCodigo,
  erro,
  aEntrar,
  aoSubmeter,
  aoVoltar,
}: {
  email: string;
  codigo: string;
  setCodigo: (v: string) => void;
  erro: string | null;
  aEntrar: boolean;
  aoSubmeter: (e: FormEvent) => void;
  aoVoltar: () => void;
}) {
  return (
    <>
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-marca/10 text-marca">
          <ShieldCheck size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold leading-tight tracking-[-0.3px]">
            Verificação em dois passos
          </h1>
          {/* O e-mail dá continuidade: sem ele, este ecrã aparecia do nada e
              não se percebia de que conta se tratava. */}
          <p className="mt-0.5 truncate text-[13px] text-texto-suave">
            {email || "A confirmar a sua identidade"}
          </p>
        </div>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-texto-suave">
        Abra a aplicação autenticadora e introduza o código de seis dígitos.
      </p>

      <form onSubmit={aoSubmeter} className="flex flex-col gap-4">
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
            className="tabular text-center text-[19px] tracking-[0.35em]"
            required
          />
        </Campo>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex flex-col gap-2">
          <Botao
            type="submit"
            variante="primario"
            bloco
            disabled={aEntrar || codigo.trim().length < 6}
          >
            {aEntrar ? "A verificar…" : "Confirmar"}
          </Botao>
          <Botao
            type="button"
            variante="neutro"
            bloco
            onClick={aoVoltar}
            disabled={aEntrar}
          >
            <ArrowLeft size={15} />
            Usar outra conta
          </Botao>
        </div>
      </form>
    </>
  );
}
