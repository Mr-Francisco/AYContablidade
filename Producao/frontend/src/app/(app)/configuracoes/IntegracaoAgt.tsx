"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Alerta, Botao, Cartao, Selector, TituloCartao } from "@/components/ui";
import { api, ErroApi } from "@/lib/api";

/**
 * Integração AGT — consulta de contribuinte (NIF).
 *
 * AQUI NÃO HÁ CREDENCIAIS, E É DE PROPÓSITO. O Piloto tem neste ecrã o
 * endpoint, o proxy, o utilizador e a palavra-passe da AGT — guardados no
 * `localStorage` do browser, porque é uma aplicação estática e não tinha
 * outro sítio onde os pôr.
 *
 * Na Produção há servidor. As credenciais vivem em `AGT_*` no ambiente
 * (Regra 6), onde nem o administrador da empresa lhes chega, e o endpoint é
 * do servidor e não de cada empresa. O que sobra para o cliente decidir é o
 * que está aqui: se a consulta está ligada, e contra que ambiente.
 *
 * Um campo de palavra-passe num formulário do lado do cliente seria pôr a
 * credencial no browser de quem quer que abra este ecrã, e no registo de
 * qualquer proxy pelo caminho. Não vale a fidelidade.
 */
interface ConfigAgt {
  ativo?: boolean;
  ambiente?: string;
}

export function IntegracaoAgt({
  agt,
  aoGravar,
  aoFalhar,
}: {
  agt: ConfigAgt | undefined;
  aoGravar: (mensagem: string) => void;
  aoFalhar: (erro: string) => void;
}) {
  const [campos, setCampos] = useState<ConfigAgt>({
    ativo: false,
    ambiente: "homologacao",
  });
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    if (agt)
      setCampos({
        ativo: !!agt.ativo,
        ambiente: agt.ambiente ?? "homologacao",
      });
  }, [agt]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setAGravar(true);
    try {
      await api.patch("/api/empresa/config", { agt: campos });
      aoGravar("Integração AGT guardada.");
    } catch (err) {
      aoFalhar(
        err instanceof ErroApi
          ? err.mensagemUtilizador
          : "Não foi possível guardar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Cartao>
      <TituloCartao>
        Integração AGT — Consulta de Contribuinte (NIF)
      </TituloCartao>
      <p className="mb-3 text-[13px] text-texto-suave">
        Serviço oficial <b>DS-120 «Consultar Dados de Contribuinte» v5</b>
        (AGT/SIGT). Ligada, consulta o nome e o regime de um NIF ao criar
        clientes, fornecedores ou facturas.
      </p>

      <form onSubmit={submeter}>
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!campos.ativo}
            onChange={(e) => setCampos({ ...campos, ativo: e.target.checked })}
            className="size-4 accent-[var(--color-marca)]"
          />
          Activar consulta online à AGT
        </label>

        <div className="max-w-[24rem]">
          <Selector
            rotulo="Ambiente"
            valor={campos.ambiente ?? "homologacao"}
            aoMudar={(v) => setCampos({ ...campos, ambiente: v })}
            opcoes={[
              { valor: "homologacao", rotulo: "Homologação (testes)" },
              { valor: "producao", rotulo: "Produção" },
            ]}
            larguraMinima="100%"
          />
        </div>

        <Alerta tipo="info" className="mt-3">
          O acesso ao serviço da AGT é configurado pelo fornecedor da plataforma
          e não pode ser alterado aqui. Se a consulta de NIF deixar de
          funcionar, contacte o fornecedor da plataforma.
        </Alerta>

        <div className="mt-4 flex justify-end">
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A guardar…" : "Guardar integração"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
