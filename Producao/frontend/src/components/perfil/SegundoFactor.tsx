"use client";

import {
  Check,
  Copy,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Selo,
  TituloCartao,
} from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EstadoTotp, InicioTotp } from "@/types";

/** Passos da configuração. `nada` é o estado de repouso. */
type Passo = "nada" | "ler" | "codigos" | "desligar";

function mensagem(e: unknown, alternativa: string) {
  return e instanceof ErroApi ? e.mensagemUtilizador : alternativa;
}

export function SegundoFactor() {
  const { data, isLoading, mutate } = useSWR<EstadoTotp>(
    "/api/auth/2fa",
    buscador,
    { revalidateOnFocus: false },
  );

  const [passo, setPasso] = useState<Passo>("nada");
  const [inicio, setInicio] = useState<InicioTotp | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function fechar() {
    setPasso("nada");
    setInicio(null);
    setCodigos(null);
    setErro(null);
  }

  async function comecar() {
    setErro(null);
    setOcupado(true);
    try {
      setInicio(await api.post<InicioTotp>("/api/auth/2fa/iniciar"));
      setPasso("ler");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível iniciar a configuração."));
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(codigo: string) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await api.post<{ codigos_recuperacao: string[] }>(
        "/api/auth/2fa/confirmar",
        { codigo },
      );
      setCodigos(r.codigos_recuperacao);
      // O segredo deixa de ser preciso e não deve ficar em memória à espera de
      // aparecer num ecrã que já não é o dele.
      setInicio(null);
      setPasso("codigos");
      mutate();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível confirmar o código."));
    } finally {
      setOcupado(false);
    }
  }

  async function desligar(password: string) {
    setErro(null);
    setOcupado(true);
    try {
      await api.post("/api/auth/2fa/desactivar", { password });
      fechar();
      mutate();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível desactivar o segundo factor."));
    } finally {
      setOcupado(false);
    }
  }

  async function novosCodigos(password: string) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await api.post<{ codigos_recuperacao: string[] }>(
        "/api/auth/2fa/codigos",
        { password },
      );
      setCodigos(r.codigos_recuperacao);
      setPasso("codigos");
      mutate();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gerar códigos novos."));
    } finally {
      setOcupado(false);
    }
  }

  if (isLoading || !data) {
    return (
      <Cartao className="min-w-0">
        <ACarregar />
      </Cartao>
    );
  }

  return (
    <Cartao className="min-w-0">
      <TituloCartao
        extra={
          <Selo cor={data.ativo ? "#1a9c5f" : "#62657a"}>
            {data.ativo ? "activo" : "desligado"}
          </Selo>
        }
      >
        Verificação em dois passos
      </TituloCartao>

      {erro && (
        <Alerta tipo="erro" className="mb-3">
          {erro}
        </Alerta>
      )}

      {passo === "ler" && inicio ? (
        <PassoLer
          inicio={inicio}
          ocupado={ocupado}
          aoConfirmar={confirmar}
          aoCancelar={fechar}
        />
      ) : passo === "codigos" && codigos ? (
        <PassoCodigos codigos={codigos} aoFechar={fechar} />
      ) : passo === "desligar" ? (
        <PedirPassword
          titulo="Desactivar a verificação em dois passos"
          aviso="A conta passa a ficar protegida apenas pela palavra-passe. Os códigos de recuperação são apagados."
          rotuloBotao="Desactivar"
          perigo
          ocupado={ocupado}
          aoConfirmar={desligar}
          aoCancelar={fechar}
        />
      ) : data.ativo ? (
        <Activo
          estado={data}
          ocupado={ocupado}
          aoDesligar={() => setPasso("desligar")}
          aoRegenerar={novosCodigos}
        />
      ) : (
        <Desligado ocupado={ocupado} aoComecar={comecar} />
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Estado de repouso
// ---------------------------------------------------------------------------
function Desligado({
  ocupado,
  aoComecar,
}: {
  ocupado: boolean;
  aoComecar: () => void;
}) {
  return (
    <>
      <p className="mb-3 text-sm leading-relaxed text-texto-suave">
        Com a verificação em dois passos, entrar passa a pedir também um código
        de seis dígitos gerado no seu telemóvel. Uma palavra-passe descoberta
        deixa de chegar para entrar na sua conta.
      </p>
      <p className="mb-3 text-sm leading-relaxed text-texto-suave">
        Precisa de uma aplicação autenticadora — Google Authenticator, Microsoft
        Authenticator, Authy ou equivalente.
      </p>
      <Botao variante="primario" onClick={aoComecar} disabled={ocupado}>
        <ShieldCheck size={15} />
        {ocupado ? "A preparar…" : "Activar"}
      </Botao>
    </>
  );
}

function Activo({
  estado,
  ocupado,
  aoDesligar,
  aoRegenerar,
}: {
  estado: EstadoTotp;
  ocupado: boolean;
  aoDesligar: () => void;
  aoRegenerar: (password: string) => void;
}) {
  const [pedirPassword, setPedirPassword] = useState(false);
  const poucos = estado.codigos_por_usar <= 2;

  if (pedirPassword) {
    return (
      <PedirPassword
        titulo="Gerar códigos de recuperação novos"
        aviso="Os códigos actuais deixam de funcionar assim que os novos forem gerados."
        rotuloBotao="Gerar códigos novos"
        ocupado={ocupado}
        aoConfirmar={(pw) => {
          setPedirPassword(false);
          aoRegenerar(pw);
        }}
        aoCancelar={() => setPedirPassword(false)}
      />
    );
  }

  return (
    <>
      <Alerta tipo="sucesso" className="mb-3">
        A entrada nesta conta pede um código da aplicação autenticadora
        {estado.ativado_em && (
          <>
            {" "}
            desde{" "}
            {new Date(estado.ativado_em).toLocaleDateString("pt-PT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </>
        )}
        .
      </Alerta>

      <dl className="mb-3 flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3 border-b border-borda/60 pb-1.5">
          <dt className="shrink-0 text-texto-suave">
            Códigos de recuperação por usar
          </dt>
          <dd
            className={cn(
              "font-semibold tabular",
              poucos && "text-[var(--color-aviso)]",
            )}
          >
            {estado.codigos_por_usar}
          </dd>
        </div>
      </dl>

      {poucos && (
        <Alerta tipo="aviso" className="mb-3">
          Restam-lhe poucos códigos de recuperação. Se ficar sem nenhum e perder
          o telemóvel, deixa de conseguir entrar sem ajuda do administrador.
        </Alerta>
      )}

      <div className="flex flex-wrap gap-2">
        <Botao
          variante="neutro"
          onClick={() => setPedirPassword(true)}
          disabled={ocupado}
        >
          Gerar códigos novos
        </Botao>
        {estado.obrigatorio ? (
          <p className="flex items-center gap-1.5 text-xs text-texto-suave">
            <ShieldCheck size={14} />
            Obrigatório neste perfil — não pode ser desactivado.
          </p>
        ) : (
          <Botao variante="perigo" onClick={aoDesligar} disabled={ocupado}>
            <ShieldOff size={15} />
            Desactivar
          </Botao>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Passos da configuração
// ---------------------------------------------------------------------------
function PassoLer({
  inicio,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  inicio: InicioTotp;
  ocupado: boolean;
  aoConfirmar: (codigo: string) => void;
  aoCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [verSegredo, setVerSegredo] = useState(false);

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        aoConfirmar(codigo);
      }}
      className="flex flex-col gap-3"
    >
      <ol className="flex flex-col gap-1 text-sm text-texto-suave">
        <li>1. Abra a aplicação autenticadora no telemóvel.</li>
        <li>2. Leia este código QR.</li>
        <li>3. Escreva abaixo os seis dígitos que ela mostrar.</li>
      </ol>

      {/* Fundo branco fixo: o QR é preto sobre branco e num tema escuro
          ficaria ilegível se herdasse as cores da página. */}
      <div className="flex justify-center rounded-xl border border-borda bg-white p-3">
        {/* O SVG vem do nosso backend, não de conteúdo introduzido por
            utilizadores. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG gerado pelo backend */}
        <div dangerouslySetInnerHTML={{ __html: inicio.qr_svg }} />
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setVerSegredo((v) => !v)}
          className="text-xs font-semibold text-marca hover:underline"
        >
          {verSegredo ? "Esconder a chave" : "Não consigo ler o código QR"}
        </button>
        {verSegredo && (
          <div className="mt-2">
            <p className="mb-1 text-xs text-texto-suave">
              Introduza esta chave manualmente na aplicação:
            </p>
            <ParaCopiar texto={inicio.segredo} />
          </div>
        )}
      </div>

      <Campo rotulo="Código da aplicação">
        <Entrada
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="tabular text-center text-lg tracking-[0.3em]"
          required
        />
      </Campo>

      <div className="flex gap-2">
        <Botao
          type="submit"
          variante="primario"
          disabled={ocupado || codigo.length < 6}
        >
          {ocupado ? "A confirmar…" : "Confirmar e activar"}
        </Botao>
        <Botao type="button" variante="neutro" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

function PassoCodigos({
  codigos,
  aoFechar,
}: {
  codigos: string[];
  aoFechar: () => void;
}) {
  const [confirmado, setConfirmado] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Alerta tipo="aviso">
        <b>Guarde estes códigos agora.</b> São a única forma de entrar se perder
        o telemóvel, cada um serve uma só vez, e esta é a única vez que aparecem
        — ficam guardados cifrados e nem nós os conseguimos mostrar outra vez.
      </Alerta>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-borda bg-superficie-2 p-3">
        {codigos.map((c) => (
          <code
            key={c}
            className="tabular text-center text-sm font-semibold tracking-wider"
          >
            {c}
          </code>
        ))}
      </div>

      <ParaCopiar texto={codigos.join("\n")} rotulo="Copiar todos" />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          className="mt-0.5 accent-[var(--color-marca)]"
        />
        <span>Guardei os códigos num sítio seguro.</span>
      </label>

      <div>
        <Botao variante="primario" onClick={aoFechar} disabled={!confirmado}>
          <Check size={15} />
          Concluir
        </Botao>
      </div>
    </div>
  );
}

function PedirPassword({
  titulo,
  aviso,
  rotuloBotao,
  perigo,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string;
  aviso: string;
  rotuloBotao: string;
  perigo?: boolean;
  ocupado: boolean;
  aoConfirmar: (password: string) => void;
  aoCancelar: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        aoConfirmar(password);
      }}
      className="flex flex-col gap-3"
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        {titulo}
      </p>
      <Alerta tipo="aviso">{aviso}</Alerta>
      <Campo rotulo="Confirme com a sua palavra-passe">
        <Entrada
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Campo>
      <div className="flex gap-2">
        <Botao
          type="submit"
          variante={perigo ? "perigo" : "primario"}
          disabled={ocupado || !password}
        >
          {ocupado ? "A processar…" : rotuloBotao}
        </Botao>
        <Botao type="button" variante="neutro" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
function ParaCopiar({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência (http, ou o utilizador negou).
      // O texto está visível e pode ser copiado à mão — não vale um erro.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex items-center gap-2 rounded-lg border border-borda px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-superficie-2"
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
      {copiado ? "Copiado" : (rotulo ?? texto)}
    </button>
  );
}
