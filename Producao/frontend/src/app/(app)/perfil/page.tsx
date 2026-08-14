"use client";

import { KeyRound, LogOut } from "lucide-react";
import { type FormEvent, useState } from "react";
import useSWR from "swr";
import { SegundoFactor } from "@/components/perfil/SegundoFactor";
import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Selo,
  TituloCartao,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { plural } from "@/lib/texto";
import type { MetadadosAcesso } from "@/types";

export default function Perfil() {
  const { utilizador, empresa, sair } = useAuth();
  const { data: meta } = useSWR<MetadadosAcesso>(
    "/api/users/metadados",
    buscador,
    { revalidateOnFocus: false },
  );

  if (!utilizador) {
    return (
      <Cartao>
        <ACarregar />
      </Cartao>
    );
  }

  const perfil = meta?.perfis.find((p) => p.id === utilizador.perfil);

  return (
    <>
      <CabecalhoPagina
        titulo="O Meu Perfil"
        descricao="A sua conta e o acesso que ela tem."
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Cartao className="min-w-0">
          <TituloCartao
            extra={
              <Selo cor={perfil?.cor ?? "#62657a"}>
                {perfil?.nome ?? utilizador.perfil}
              </Selo>
            }
          >
            Conta
          </TituloCartao>

          {/* O cartão do Piloto abre com a fotografia da conta: iniciais na
              cor do perfil, nome, e-mail e perfil por baixo. É o que dá a
              quem entra a confirmação imediata de que está na conta certa. */}
          <div className="mb-4 flex items-center gap-3.5">
            <span
              className="flex size-[52px] shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white"
              style={{ background: perfil?.cor ?? "#62657a" }}
            >
              {iniciais(utilizador.nome)}
            </span>
            <div className="min-w-0">
              <b className="block truncate text-lg">{utilizador.nome}</b>
              <span className="block truncate text-[13px] text-texto-suave">
                {utilizador.email} · {perfil?.nome ?? utilizador.perfil}
              </span>
            </div>
          </div>

          <dl className="flex flex-col gap-2 text-sm">
            <Par rotulo="Nome" valor={utilizador.nome} />
            <Par rotulo="E-mail" valor={utilizador.email} />
            <Par rotulo="Telefone" valor={utilizador.telefone || "—"} />
            <Par rotulo="Empresa" valor={empresa?.nome ?? "—"} />
            <Par
              rotulo="Estado"
              valor={
                !utilizador.aprovado
                  ? "Por aprovar"
                  : utilizador.ativo
                    ? "Activa"
                    : "Inactiva"
              }
            />
            <Par
              rotulo="Último acesso"
              valor={
                utilizador.ultimo_login
                  ? new Date(utilizador.ultimo_login).toLocaleString("pt-PT", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"
              }
            />
          </dl>

          <Alerta tipo="info" className="mt-3">
            O <b>perfil de acesso</b> e o <b>estado da conta</b> são geridos
            pelo administrador da empresa e não se alteram aqui — se pudesse
            mudar o seu próprio perfil, o controlo de acessos não seria controlo
            nenhum. Para alterar o nome ou o telefone, peça ao administrador.
          </Alerta>
        </Cartao>

        <div className="flex min-w-0 flex-col gap-4">
          <Cartao className="min-w-0">
            <TituloCartao>Acesso</TituloCartao>
            <dl className="flex flex-col gap-2 text-sm">
              <Par
                rotulo="Módulos"
                valor={
                  utilizador.modulos_permitidos === null
                    ? "Todos os do perfil"
                    : utilizador.modulos_permitidos.length === 0
                      ? "Nenhum"
                      : utilizador.modulos_permitidos.join(", ")
                }
              />
              <Par
                rotulo="Capacidades"
                valor={
                  perfil?.capacidades.includes("*")
                    ? "Acesso total"
                    : plural(perfil?.capacidades.length ?? 0, "capacidade")
                }
              />
            </dl>
            {perfil && !perfil.capacidades.includes("*") && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-borda pt-3">
                {perfil.capacidades.map((c) => (
                  <Selo key={c} cor="#62657a">
                    {c}
                  </Selo>
                ))}
              </div>
            )}
          </Cartao>

          <SegundoFactor />
          <AlterarPassword aoTerminar={sair} />

          {/* O «Terminar sessão» do Piloto, no fim do cartão de perfil. Está
              também no menu do cabeçalho; aqui é onde quem veio ver a conta o
              procura. */}
          <Cartao>
            <Botao variante="neutro" bloco onClick={sair}>
              <LogOut size={15} />
              Terminar sessão
            </Botao>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borda/60 pb-1.5">
      <dt className="shrink-0 text-texto-suave">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right font-semibold">{valor}</dd>
    </div>
  );
}

function AlterarPassword({ aoTerminar }: { aoTerminar: () => void }) {
  const [actual, setActual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova !== confirmar) return setErro("As palavras-passe não coincidem.");
    setAGravar(true);
    try {
      await api.post("/api/auth/password", {
        password_atual: actual,
        password_nova: nova,
      });
      setFeito(true);
      // A alteração revoga TODAS as sessões, incluindo esta — o token que
      // temos em mão já não vale. Sair é o único desfecho honesto; deixar a
      // página aberta daria 401 no pedido seguinte, sem explicação.
      setTimeout(aoTerminar, 2500);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível alterar a palavra-passe.",
      );
    } finally {
      setAGravar(false);
    }
  }

  if (feito) {
    return (
      <Cartao className="min-w-0">
        <Alerta tipo="sucesso">
          Palavra-passe alterada. Todas as sessões foram terminadas, incluindo
          esta — vai ser levado ao ecrã de entrada para voltar a iniciar sessão.
        </Alerta>
      </Cartao>
    );
  }

  return (
    <Cartao className="min-w-0">
      <TituloCartao>Alterar palavra-passe</TituloCartao>
      <form onSubmit={submeter} className="flex flex-col gap-3">
        <Campo rotulo="Palavra-passe actual">
          <Entrada
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Campo>
        <Campo rotulo="Nova palavra-passe" dica="Mínimo 8 caracteres.">
          <Entrada
            type="password"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Campo>
        <Campo rotulo="Confirmar nova palavra-passe">
          <Entrada
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Campo>

        <Alerta tipo="aviso">
          Alterar a palavra-passe <b>termina todas as sessões abertas</b>,
          incluindo esta. É o comportamento pretendido: uma palavra-passe mudada
          por suspeita de acesso indevido não serve de nada se a sessão antiga
          continuar válida.
        </Alerta>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="flex justify-end">
          <Botao type="submit" variante="primario" disabled={aGravar}>
            <KeyRound size={16} />
            {aGravar ? "A alterar…" : "Alterar palavra-passe"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

/** «Carlos Contabilista» → «CC». Duas letras, como no Piloto. */
function iniciais(nome: string): string {
  return nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
