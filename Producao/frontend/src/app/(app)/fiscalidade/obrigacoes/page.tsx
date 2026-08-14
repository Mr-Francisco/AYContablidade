"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { FaixaPainel } from "@/components/painel";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  Cartao,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import type { CatalogoFiscal, RespostaObrigacoes } from "@/types";

export default function Obrigacoes() {
  const { empresa } = useAuth();

  const { data: catalogo } = useSWR<CatalogoFiscal>(
    "/api/fiscalidade/catalogo",
    buscador,
    { revalidateOnFocus: false },
  );

  const [forma, setForma] = useState("lda");
  const [regimeIva, setRegimeIva] = useState("geral");
  const [regimeIi, setRegimeIi] = useState("geral");
  const [temEmpregados, setTemEmpregados] = useState("sim");
  const [pagaCapitais, setPagaCapitais] = useState("nao");
  const [temImoveis, setTemImoveis] = useState("nao");

  const [resposta, setResposta] = useState<RespostaObrigacoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  // O regime petrolífero SUBSTITUI o Imposto Industrial — escolher um regime
  // de II ao mesmo tempo não faz sentido, por isso o selector desactiva-se.
  const ehPetrolifero = forma === "petrolifero";

  useEffect(() => {
    let cancelado = false;
    setACarregar(true);
    api
      .post<RespostaObrigacoes>("/api/fiscalidade/obrigacoes", {
        forma,
        regime_iva: regimeIva,
        regime_ii: regimeIi,
        tem_empregados: temEmpregados === "sim",
        paga_capitais: pagaCapitais === "sim",
        tem_imoveis_arrend: temImoveis === "sim",
      })
      .then((r) => {
        if (!cancelado) {
          setResposta(r);
          setErro(null);
        }
      })
      .catch((e) => {
        if (!cancelado) {
          setErro(
            e instanceof ErroApi
              ? e.mensagemUtilizador
              : "Não foi possível apurar as obrigações.",
          );
        }
      })
      .finally(() => {
        if (!cancelado) setACarregar(false);
      });
    return () => {
      cancelado = true;
    };
  }, [forma, regimeIva, regimeIi, temEmpregados, pagaCapitais, temImoveis]);

  // Agrupar por imposto, como no Piloto: a lista corrida repete a mesma sigla
  // e esconde quantas obrigações cada imposto realmente traz.
  const grupos = new Map<string, RespostaObrigacoes["obrigacoes"]>();
  for (const o of resposta?.obrigacoes ?? []) {
    const lista = grupos.get(o.imposto);
    if (lista) lista.push(o);
    else grupos.set(o.imposto, [o]);
  }

  return (
    <>
      <FaixaPainel
        sobrenome="Fiscalidade · Obrigações"
        titulo="Obrigações Fiscais por Empresa"
        subtitulo="Indique a forma jurídica e o enquadramento — o sistema lista todas as obrigações declarativas e de pagamento a que a empresa está sujeita."
        valores={[]}
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Forma jurídica"
          valor={forma}
          aoMudar={setForma}
          opcoes={(catalogo?.formas ?? []).map((f) => ({
            valor: f.id,
            rotulo: f.nome,
          }))}
          larguraMinima="18rem"
        />
        <Selector
          rotulo="Regime de IVA"
          valor={regimeIva}
          aoMudar={setRegimeIva}
          opcoes={(catalogo?.regimes_iva ?? []).map((r) => ({
            valor: r.id,
            rotulo: r.nome,
          }))}
          larguraMinima="16rem"
        />
        <Selector
          rotulo="Imposto Industrial"
          valor={ehPetrolifero ? "" : regimeIi}
          aoMudar={setRegimeIi}
          opcoes={
            ehPetrolifero
              ? [{ valor: "", rotulo: "Substituído pelo regime petrolífero" }]
              : (catalogo?.regimes_ii ?? []).map((r) => ({
                  valor: r.id,
                  rotulo: r.nome,
                }))
          }
          larguraMinima="18rem"
        />
        <Selector
          rotulo="Tem empregados"
          valor={temEmpregados}
          aoMudar={setTemEmpregados}
          opcoes={[
            { valor: "sim", rotulo: "Sim" },
            { valor: "nao", rotulo: "Não" },
          ]}
        />
        <Selector
          rotulo="Paga capitais"
          valor={pagaCapitais}
          aoMudar={setPagaCapitais}
          opcoes={[
            { valor: "nao", rotulo: "Não" },
            { valor: "sim", rotulo: "Sim" },
          ]}
        />
        <Selector
          rotulo="Imóveis arrendados"
          valor={temImoveis}
          aoMudar={setTemImoveis}
          opcoes={[
            { valor: "nao", rotulo: "Não" },
            { valor: "sim", rotulo: "Sim" },
          ]}
        />
      </BarraFiltros>

      {aCarregar && !resposta ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : !resposta ? (
        <Cartao>
          <Vazio>Escolha o enquadramento.</Vazio>
        </Cartao>
      ) : (
        <>
          <Cartao className="mb-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-borda pb-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold">{empresa?.nome}</h2>
                <p className="text-sm text-texto-suave">
                  Obrigações fiscais — {resposta.forma.nome}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>
                  IVA: <b>{resposta.regime_iva.nome}</b>
                </p>
                <p className="text-texto-suave">
                  {ehPetrolifero
                    ? "Regime petrolífero especial (Lei 13/04)"
                    : `Imposto Industrial: ${resposta.regime_ii.nome}`}
                </p>
              </div>
            </header>
            <p className="text-sm">
              <b>{resposta.forma.nome}</b> — {resposta.forma.nota}
            </p>
            {ehPetrolifero && (
              <Alerta tipo="info" className="mt-3">
                O regime fiscal petrolífero <b>substitui</b> o Imposto
                Industrial — não se acumula com ele. Por isso o selector de
                Imposto Industrial fica sem efeito nesta escolha.
              </Alerta>
            )}
          </Cartao>

          <div className="flex flex-col gap-4">
            {[...grupos.entries()].map(([imposto, obrigacoes]) => (
              <Cartao key={imposto} className="p-0">
                <TituloCartao
                  className="px-5 pt-5"
                  extra={`${obrigacoes.length} ${obrigacoes.length === 1 ? "obrigação" : "obrigações"}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Selo cor={obrigacoes[0].cor}>{imposto}</Selo>
                  </span>
                </TituloCartao>
                <EnvolveTabela className="rounded-none border-0 border-t">
                  <Tabela>
                    <thead>
                      <tr>
                        <Th>Obrigação</Th>
                        <Th>Periodicidade</Th>
                        <Th>Prazo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {obrigacoes.map((o) => (
                        <Tr key={o.obrigacao}>
                          <Td className="font-semibold">{o.obrigacao}</Td>
                          <Td className="text-texto-suave">
                            {o.periodicidade}
                          </Td>
                          <Td>{o.prazo}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tabela>
                </EnvolveTabela>
              </Cartao>
            ))}
          </div>

          <Alerta tipo="aviso" className="mt-4">
            Esta lista é orientativa e resulta apenas do enquadramento indicado
            acima. Não substitui a confirmação com a AGT nem dispensa a
            verificação de obrigações específicas do sector de actividade.
          </Alerta>
        </>
      )}
    </>
  );
}
