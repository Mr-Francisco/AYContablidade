"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { MolduraPublica, Passos } from "@/components/publico/Moldura";
import { Alerta, Botao, Campo, Entrada } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";

/* ---------------------------------------------------------------------------
   Activar uma licença — o primeiro contacto de um cliente com o produto.

   AQUI A PALAVRA-PASSE FAZ SENTIDO, ao contrário do ecrã de pedir acesso: quem
   activa está a criar a conta de administrador da própria empresa, e não há
   ninguém acima para a aprovar nem para lhe entregar credenciais. É a única
   conta do sistema que nasce a poder entrar de imediato.

   O formulário são nove campos e estava tudo empilhado numa coluna só. Passa a
   TRÊS PASSOS: a licença, a empresa, e a conta de administrador. Não é
   enfeite — nove campos seguidos num ecrã de primeiro contacto fazem desistir,
   e o primeiro passo é o único que pode falhar por a chave estar errada.
--------------------------------------------------------------------------- */

interface Activada {
  empresa_id: string;
  empresa_nome: string;
  codigo_empresa: string;
  plano: string;
  validade: string | null;
}

const PONTOS = [
  { icone: "shield", texto: "A chave confirma o NIF da sua empresa" },
  {
    icone: "empresa",
    texto: "A empresa é criada com o plano de contas pronto",
  },
  { icone: "users", texto: "Fica com a conta de administrador" },
];

const ROTULOS = ["Licença", "Empresa", "Administrador"];

export default function Activar() {
  const router = useRouter();

  const [passo, setPasso] = useState(1);
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

  const podeAvancar =
    passo === 1
      ? campos.chave.trim().length > 0 && campos.nif.trim().length > 0
      : true;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    // Os passos 1 e 2 não submetem nada — avançam. Só o último activa.
    if (passo < 3) {
      setPasso(passo + 1);
      return;
    }

    if (campos.admin_password !== confirmar) {
      return setErro(
        "As palavras-passe não coincidem. Escreva a mesma nos dois campos.",
      );
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
          : "Não foi possível activar a licença. Tente de novo dentro de momentos.",
      );
      // Uma chave recusada resolve-se no primeiro passo, e é para lá que a
      // pessoa tem de voltar — deixá-la no último a olhar para a mensagem
      // obrigava-a a descobrir sozinha onde é que se corrige.
      if (
        e2 instanceof ErroApi &&
        /chave|licen|NIF/i.test(e2.mensagemUtilizador)
      ) {
        setPasso(1);
      }
    } finally {
      setAActivar(false);
    }
  }

  if (feito) {
    return (
      <MolduraPublica
        titulo={<>Empresa activada.</>}
        subtitulo="Está tudo criado. Guarde o código da empresa — é com ele que toda a gente entra."
        pontos={PONTOS}
      >
        <Activou dados={feito} aoEntrar={() => router.push("/entrar")} />
      </MolduraPublica>
    );
  }

  return (
    <MolduraPublica
      titulo={
        <>
          Active a licença
          <br />
          da sua empresa.
        </>
      }
      subtitulo="Com a chave que recebeu, a empresa fica criada e pronta a lançar — com o plano de contas em PGC-AR já feito."
      pontos={PONTOS}
    >
      <div className="rounded-[16px] border border-borda bg-superficie p-7 shadow-suave">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-marca/10 text-marca">
            <KeyRound size={22} aria-hidden />
          </span>
          <div>
            <h1 className="text-[24px] font-extrabold tracking-[-0.4px]">
              Activar licença
            </h1>
            <p className="text-[13px] text-texto-suave">
              Passo {passo} de 3 · {ROTULOS[passo - 1]}
            </p>
          </div>
        </div>

        <Passos actual={passo} total={3} rotulos={ROTULOS} />

        <form onSubmit={submeter} className="flex flex-col gap-4">
          {passo === 1 && (
            <>
              <Campo
                rotulo="Chave de licença"
                dica="No formato SGD-XXXX-XXXX-XXXX. É válida durante 7 dias depois de emitida."
              >
                <Entrada
                  value={campos.chave}
                  onChange={(e) =>
                    alterar("chave", e.target.value.toUpperCase())
                  }
                  placeholder="SGD-XXXX-XXXX-XXXX"
                  className="tabular text-center text-lg tracking-[2px]"
                  required
                  autoFocus
                />
              </Campo>

              <Campo
                rotulo="NIF da empresa"
                dica="Tem de ser o mesmo NIF para o qual a licença foi emitida."
              >
                <Entrada
                  value={campos.nif}
                  onChange={(e) => alterar("nif", e.target.value)}
                  placeholder="5000000000"
                  className="tabular"
                  required
                />
              </Campo>
            </>
          )}

          {passo === 2 && (
            <>
              <Campo
                rotulo="Nome da empresa"
                dica="Deixe em branco para usar o nome com que a licença foi emitida."
              >
                <Entrada
                  value={campos.nome_empresa}
                  onChange={(e) => alterar("nome_empresa", e.target.value)}
                  placeholder="Empresa, Lda."
                  autoFocus
                />
              </Campo>

              <Campo rotulo="Telefone" dica="Opcional.">
                <Entrada
                  value={campos.telefone}
                  onChange={(e) => alterar("telefone", e.target.value)}
                  placeholder="+244 900 000 000"
                />
              </Campo>
            </>
          )}

          {passo === 3 && (
            <>
              <Alerta tipo="info">
                Esta é a <b>conta de administrador</b> da empresa. É com ela que
                vai aceitar os pedidos de acesso das outras pessoas.
              </Alerta>

              <Campo rotulo="Nome completo">
                <Entrada
                  value={campos.admin_nome}
                  onChange={(e) => alterar("admin_nome", e.target.value)}
                  placeholder="Ana Maria dos Santos"
                  required
                  autoFocus
                />
              </Campo>

              <Campo rotulo="E-mail">
                <Entrada
                  type="email"
                  value={campos.admin_email}
                  onChange={(e) => alterar("admin_email", e.target.value)}
                  placeholder="nome@empresa.ao"
                  required
                />
              </Campo>

              <Campo
                rotulo="Palavra-passe"
                dica="No mínimo 8 caracteres. Se for curta demais, é indicado no momento."
              >
                <Entrada
                  type="password"
                  value={campos.admin_password}
                  onChange={(e) => alterar("admin_password", e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Campo>

              <Campo rotulo="Confirmar palavra-passe">
                <Entrada
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Campo>
            </>
          )}

          {erro && <Alerta tipo="erro">{erro}</Alerta>}

          <div className="mt-1 flex gap-2">
            {passo > 1 && (
              <Botao
                type="button"
                variante="contorno"
                onClick={() => {
                  setErro(null);
                  setPasso(passo - 1);
                }}
              >
                <ArrowLeft size={16} />
                Voltar
              </Botao>
            )}
            <Botao
              type="submit"
              variante="primario"
              bloco
              disabled={aActivar || !podeAvancar}
              motivoBloqueio={
                !podeAvancar
                  ? "Preencha a chave e o NIF para continuar."
                  : aActivar
                    ? "A activar — aguarde."
                    : undefined
              }
            >
              {aActivar
                ? "A activar…"
                : passo < 3
                  ? "Continuar"
                  : "Activar empresa"}
              {!aActivar && <ArrowRight size={16} />}
            </Botao>
          </div>
        </form>

        <p className="mt-6 border-t border-borda pt-4 text-center text-[13px] text-texto-suave">
          Já tem acesso?{" "}
          <Link
            href="/entrar"
            className="font-semibold text-marca hover:underline"
          >
            Entrar
          </Link>
          <span className="mx-1.5">·</span>
          Sem chave?{" "}
          <Link
            href="/registar"
            className="font-semibold text-marca hover:underline"
          >
            Pedir acesso a uma empresa
          </Link>
        </p>
      </div>
    </MolduraPublica>
  );
}

function Activou({
  dados,
  aoEntrar,
}: {
  dados: Activada;
  aoEntrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="rounded-[16px] border border-borda bg-superficie p-7 shadow-suave">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={30} className="mt-0.5 text-sucesso" aria-hidden />
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.4px]">
            Empresa activada
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
            <b className="text-texto">{dados.empresa_nome}</b> está criada com o
            plano <b className="text-texto">{dados.plano}</b>
            {dados.validade
              ? `, válido até ${new Date(dados.validade).toLocaleDateString("pt-PT")}`
              : ""}
            .
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border-2 border-dashed border-marca bg-fundo p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
          Código da empresa
        </p>
        <p className="tabular mt-1 text-[34px] font-black leading-none tracking-[3px] text-marca">
          {dados.codigo_empresa}
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(dados.codigo_empresa);
            setCopiado(true);
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-borda px-3 py-1.5 text-xs font-semibold transition-colors hover:border-marca hover:text-marca"
        >
          <Copy size={13} />
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      <Alerta tipo="aviso" className="mt-5">
        <b>Guarde este código.</b> Toda a gente da empresa precisa dele para
        entrar — o e-mail e a palavra-passe sozinhos não bastam. Também o
        encontra depois nas Configurações.
      </Alerta>

      <Botao variante="primario" bloco className="mt-6" onClick={aoEntrar}>
        Entrar na aplicação
        <ArrowRight size={16} />
      </Botao>
    </div>
  );
}
