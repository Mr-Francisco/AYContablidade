"use client";

import { ArrowRight, CheckCircle2, Clock, Info } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { MolduraPublica } from "@/components/publico/Moldura";
import { Alerta, Botao, Campo, Entrada, Selector } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";

/* ---------------------------------------------------------------------------
   Pedir acesso a uma empresa.

   NÃO PEDE PALAVRA-PASSE, e é a diferença que importa. Pedia — e não fazia
   sentido: a pessoa escolhia uma credencial para uma conta que a empresa ainda
   não tinha aceite, e que podia nunca vir a existir. Quem desistia a meio
   deixava para trás uma palavra-passe a proteger nada; quem era recusado tinha
   escolhido uma em vão.

   O que aqui se faz é um PEDIDO. Diz-se quem se é e a que empresa; se a
   empresa aceitar, é ela que entrega a palavra-passe de entrada. É por isso
   que o ecrã deixou de se chamar «Criar conta».
--------------------------------------------------------------------------- */

/** As funções que se podem pedir.
 *
 *  «Administrador» não está aqui de propósito: o administrador de uma empresa
 *  nasce da activação da licença, e os seguintes são criados por quem já é
 *  administrador. Se fosse pedível, qualquer pessoa que soubesse o código da
 *  empresa pedia acesso total e esperava que a aprovação passasse distraída. */
const FUNCOES = [
  { valor: "consulta", rotulo: "Consulta — só ver" },
  { valor: "contabilista", rotulo: "Contabilidade" },
  { valor: "financeiro", rotulo: "Tesouraria" },
  { valor: "comercial", rotulo: "Comercial" },
  { valor: "logistica", rotulo: "Logística" },
  { valor: "rh", rotulo: "Recursos Humanos" },
];

const PONTOS = [
  { icone: "empresa", texto: "Indique a empresa onde vai trabalhar" },
  { icone: "users", texto: "Um administrador da empresa recebe o pedido" },
  { icone: "shield", texto: "Se aceitar, entrega-lhe a palavra-passe" },
];

export default function PedirAcesso() {
  const [campos, setCampos] = useState({
    empresa: "",
    nome: "",
    email: "",
    telefone: "",
    perfil: "consulta",
  });
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEnviar(true);
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
          : "Não foi possível enviar o pedido. Tente de novo dentro de momentos.",
      );
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <MolduraPublica
      titulo={
        <>
          Peça acesso
          <br />à sua empresa.
        </>
      }
      subtitulo="Preencha quem é e a que empresa pertence. Quem administra a empresa recebe o pedido e decide."
      pontos={PONTOS}
    >
      {feito ? (
        <Enviado email={campos.email} />
      ) : (
        <Cartao>
          <h1 className="text-[26px] font-extrabold tracking-[-0.4px]">
            Pedir acesso
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
            Já usa uma empresa que trabalha com o SGD? Peça-lhe acesso aqui.
          </p>

          <Alerta tipo="info" className="mt-5">
            <span className="flex gap-2">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <b>Não escolhe palavra-passe agora.</b> Se a empresa aceitar o
                seu pedido, é ela que lhe entrega a palavra-passe de entrada — e
                pode trocá-la assim que entrar.
              </span>
            </span>
          </Alerta>

          <form onSubmit={submeter} className="mt-5 flex flex-col gap-4">
            <Campo
              rotulo="Empresa"
              dica="O código da empresa (ex.: BE001) ou o NIF. Se não souber, pergunte a quem já lá trabalha."
            >
              <Entrada
                value={campos.empresa}
                onChange={(e) => alterar("empresa", e.target.value)}
                placeholder="BE001 ou 5000000000"
                required
                autoFocus
              />
            </Campo>

            <Campo rotulo="Nome completo">
              <Entrada
                value={campos.nome}
                onChange={(e) => alterar("nome", e.target.value)}
                placeholder="Ana Maria dos Santos"
                required
              />
            </Campo>

            <Campo
              rotulo="E-mail"
              dica="É com este e-mail que vai entrar no sistema."
            >
              <Entrada
                type="email"
                value={campos.email}
                onChange={(e) => alterar("email", e.target.value)}
                placeholder="nome@empresa.ao"
                required
              />
            </Campo>

            <Campo
              rotulo="Telefone"
              dica="Opcional. Ajuda a empresa a confirmar que o pedido é seu."
            >
              <Entrada
                value={campos.telefone}
                onChange={(e) => alterar("telefone", e.target.value)}
                placeholder="+244 900 000 000"
              />
            </Campo>

            <Campo
              rotulo="Função"
              dica="O que faz na empresa. Quem aceitar o pedido pode ajustar."
            >
              <Selector
                valor={campos.perfil}
                aoMudar={(v) => alterar("perfil", v)}
                opcoes={FUNCOES}
              />
            </Campo>

            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <Botao
              type="submit"
              variante="primario"
              bloco
              disabled={aEnviar}
              motivoBloqueio={aEnviar ? "A enviar — aguarde." : undefined}
            >
              {aEnviar ? "A enviar…" : "Enviar pedido"}
              {!aEnviar && <ArrowRight size={16} />}
            </Botao>
          </form>

          <Rodape />
        </Cartao>
      )}
    </MolduraPublica>
  );
}

function Enviado({ email }: { email: string }) {
  return (
    <Cartao>
      <div className="flex items-start gap-3">
        <CheckCircle2 size={30} className="mt-0.5 text-sucesso" aria-hidden />
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.4px]">
            Pedido enviado
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-texto-suave">
            Guardámos o seu pedido para <b className="text-texto">{email}</b>.
          </p>
        </div>
      </div>

      <ol className="mt-6 flex flex-col gap-4">
        {[
          {
            icone: <CheckCircle2 size={17} className="text-sucesso" />,
            titulo: "Pedido enviado",
            texto: "Já está na lista de quem administra a empresa.",
            feito: true,
          },
          {
            icone: <Clock size={17} className="text-aviso" />,
            titulo: "À espera de resposta",
            texto:
              "Um administrador vê o pedido e decide. Se demorar, fale com ele directamente.",
            feito: false,
          },
          {
            icone: <Info size={17} className="text-texto-suave" />,
            titulo: "Recebe a palavra-passe",
            texto:
              "Se o pedido for aceite, o administrador entrega-lhe a palavra-passe de entrada. Troque-a assim que entrar.",
            feito: false,
          },
        ].map((p) => (
          <li key={p.titulo} className="flex gap-3">
            <span className="mt-0.5 shrink-0">{p.icone}</span>
            <span>
              <b className="text-[14px]">{p.titulo}</b>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-texto-suave">
                {p.texto}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <Botao
        variante="primario"
        bloco
        className="mt-7"
        onClick={() => {
          window.location.href = "/entrar";
        }}
      >
        Ir para o início de sessão
      </Botao>
    </Cartao>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-borda bg-superficie p-7 shadow-suave">
      {children}
    </div>
  );
}

function Rodape() {
  return (
    <p className="mt-6 border-t border-borda pt-4 text-center text-[13px] text-texto-suave">
      Já tem acesso?{" "}
      <Link href="/entrar" className="font-semibold text-marca hover:underline">
        Entrar
      </Link>
      <span className="mx-1.5">·</span>
      Tem uma chave de licença?{" "}
      <Link
        href="/activar"
        className="font-semibold text-marca hover:underline"
      >
        Activar
      </Link>
    </p>
  );
}
