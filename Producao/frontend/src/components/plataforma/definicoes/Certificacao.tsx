"use client";

import { BadgeCheck, Building2, ShieldAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import useSWR from "swr";
import { Alerta, Campo, Entrada } from "@/components/ui";
import { api, buscador, ErroApi } from "@/lib/api";
import { BarraDeAccoes, Grupo, Seccao } from "./Estrutura";

/* ---------------------------------------------------------------------------
   A certificação da AGT que vale por omissão.

   Quem certifica é a AGT e o que ela certifica é o PROGRAMA — que é o mesmo
   para todos os clientes. É por isso que o número normal é um só, e é aqui que
   se escreve uma vez em vez de o repetir empresa a empresa.

   Uma empresa continua a poder ter o seu, para os casos em que exista um. Este
   é o que vale para as outras — e é resolvido no momento de gerar cada
   ficheiro, não copiado quando a empresa é criada: no dia em que a certificação
   for renovada, muda-se aqui e todas as empresas sem caso próprio passam a
   declarar o número novo.
--------------------------------------------------------------------------- */

const FORMATO = /^\d+\/AGT\/\d{4}$/;

export interface CertificacaoPlataforma {
  numero: string;
  empresas_a_herdar: number;
  empresas_com_numero_proprio: number;
}

export function SeccaoCertificacao({ aoMudar }: { aoMudar?: () => void }) {
  const { data, mutate } = useSWR<CertificacaoPlataforma>(
    "/api/licencas/certificacao",
    buscador,
    { revalidateOnFocus: false },
  );

  const actual = data?.numero ?? "";
  const [numero, setNumero] = useState(actual);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    if (data) setNumero(data.numero);
  }, [data]);

  const limpo = numero.trim();
  const aRemover = limpo === "";
  const formatoErrado = !aRemover && !FORMATO.test(limpo);
  const mudou = Boolean(data) && limpo !== actual;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setGravado(false);
    setAGravar(true);
    try {
      await api.patch("/api/licencas/certificacao", {
        numero: limpo,
        motivo: motivo.trim() || null,
      });
      setGravado(true);
      setMotivo("");
      mutate();
      aoMudar?.();
      setTimeout(() => setGravado(false), 5000);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível guardar o número de certificação.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Seccao
      titulo="Certificação da AGT"
      descricao="O número que a AGT atribuiu ao programa. É impresso em cada documento fiscal e vai no cabeçalho dos ficheiros SAF-T de todas as empresas que não tenham um número próprio."
    >
      <form onSubmit={submeter} className="flex flex-col gap-5">
        <Grupo
          titulo="Número por omissão"
          nota="Vale para todas as empresas, excepto as que tenham um número atribuído individualmente."
        >
          <Campo
            rotulo="Número de certificação"
            dica="No formato 141/AGT/2026. Deixe em branco enquanto o programa não estiver certificado."
            className="max-w-[22rem]"
          >
            <Entrada
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="141/AGT/2026"
              className="tabular text-lg tracking-[1px]"
            />
          </Campo>

          {formatoErrado && (
            <Alerta tipo="aviso">
              O número deve ter o formato 141/AGT/2026. Confirme-o no
              certificado emitido pela AGT.
            </Alerta>
          )}
        </Grupo>

        {data && <Alcance data={data} aRemover={aRemover} mudou={mudou} />}

        {mudou && (
          <Campo
            rotulo="Motivo"
            dica="Fica no registo de auditoria. Ajuda a saber mais tarde porque é que o número mudou."
            className="max-w-[30rem]"
          >
            <Entrada
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: certificação renovada para 2027"
            />
          </Campo>
        )}

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <BarraDeAccoes
          mudou={mudou}
          valido={!formatoErrado}
          aGravar={aGravar}
          gravado={gravado}
          aoDesfazer={() => {
            setNumero(actual);
            setMotivo("");
            setErro(null);
          }}
        />
      </form>
    </Seccao>
  );
}

/** Quantas empresas isto afecta — dito ANTES de se guardar.
 *
 *  Alterar este campo muda o que dezenas de empresas declaram à AGT de uma
 *  vez. Quem o altera tem de saber o alcance sem ter de o ir contar. */
function Alcance({
  data,
  aRemover,
  mudou,
}: {
  data: CertificacaoPlataforma;
  aRemover: boolean;
  mudou: boolean;
}) {
  const herdam = data.empresas_a_herdar;
  const proprias = data.empresas_com_numero_proprio;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Ficha
          icone={<Building2 size={16} />}
          numero={herdam}
          rotulo={
            herdam === 1
              ? "empresa usa este número"
              : "empresas usam este número"
          }
          nota="Não têm número próprio."
        />
        <Ficha
          icone={<BadgeCheck size={16} />}
          numero={proprias}
          rotulo={
            proprias === 1
              ? "empresa tem número próprio"
              : "empresas têm número próprio"
          }
          nota="Não são afectadas por esta alteração."
        />
      </div>

      {mudou && herdam > 0 && !aRemover && (
        <Alerta tipo="info">
          Ao guardar,{" "}
          {herdam === 1 ? "1 empresa passa" : `${herdam} empresas passam`} a
          declarar este número à AGT nos documentos e ficheiros seguintes.
        </Alerta>
      )}

      {mudou && aRemover && herdam > 0 && (
        <Alerta tipo="aviso">
          <span className="flex gap-2">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Ao remover o número,{" "}
              {herdam === 1 ? "1 empresa passa" : `${herdam} empresas passam`} a
              indicar que o programa não está certificado. Faça isto apenas se a
              certificação tiver deixado de ser válida.
            </span>
          </span>
        </Alerta>
      )}
    </div>
  );
}

function Ficha({
  icone,
  numero,
  rotulo,
  nota,
}: {
  icone: React.ReactNode;
  numero: number;
  rotulo: string;
  nota: string;
}) {
  return (
    <div className="rounded-xl border border-borda bg-superficie-2/60 p-4">
      <span className="flex items-center gap-2 text-texto-suave">{icone}</span>
      <p className="mt-1.5">
        <b className="tabular text-2xl font-black leading-none">{numero}</b>{" "}
        <span className="text-[13px] text-texto-suave">{rotulo}</span>
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-texto-suave">
        {nota}
      </p>
    </div>
  );
}
