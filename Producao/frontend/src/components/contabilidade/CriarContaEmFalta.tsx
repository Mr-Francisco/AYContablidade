"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Alerta, Campo, Entrada, Selector } from "@/components/ui";
import { DialogoMestre } from "@/components/ui/CrudMestre";
import { api, ErroApi } from "@/lib/api";
import { useContas } from "@/lib/hooks";
import { construirArvore, ehMovimento, maeDe } from "@/lib/plano";

/**
 * Criar a conta que falta, sem sair do lançamento.
 *
 * É o diálogo «Criar conta 32121001» do Piloto. Quem está a meio de um
 * lançamento e descobre que a conta não existe não devia ter de abandonar o
 * trabalho, ir ao Plano de Contas, criá-la e recomeçar — perdia o que já tinha
 * escrito.
 *
 * O AVISO DA MÃE não é decoração. Se o código estende uma conta de MOVIMENTO
 * que já tem lançamentos, essa mãe passa a integradora e os movimentos dela
 * migram para a conta nova. É o comportamento correcto — uma integradora com
 * movimentos seria contada duas vezes no balancete — mas quem carrega no botão
 * tem de saber que vai acontecer.
 */
export function CriarContaEmFalta({
  codigo,
  aoFechar,
  aoCriar,
}: {
  codigo: string;
  aoFechar: () => void;
  /** Recebe o código criado, para o campo o poder assumir. */
  aoCriar: (codigo: string) => void;
}) {
  const { contas, mutate } = useContas();
  const [nome, setNome] = useState("");
  const [natureza, setNatureza] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const campoNome = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoNome.current?.focus();
  }, []);

  // O que vai acontecer à mãe, calculado com a mesma regra do servidor.
  const consequencia = useMemo(() => {
    const arvore = construirArvore(contas);
    const mae = maeDe(codigo, arvore.porCodigo);
    if (!mae) return null;
    if (!ehMovimento(mae, contas)) return { mae, viraIntegradora: false };
    return { mae, viraIntegradora: true };
  }, [codigo, contas]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      const resposta = await api.post<{
        codigo: string;
        tornou_integradora: boolean;
        movidos: number;
      }>("/api/contabilidade/contas", {
        codigo,
        nome,
        ...(natureza ? { natureza } : {}),
      });
      await mutate();
      aoCriar(resposta.codigo);
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível criar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <DialogoMestre
      titulo={`Criar conta ${codigo}`}
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
      rotuloGravar="Criar e continuar"
      aviso={
        consequencia?.viraIntegradora ? (
          <Alerta tipo="aviso">
            Será criada como subconta de <b>{consequencia.mae.codigo}</b>, que{" "}
            <b>passa a integradora</b> — deixa de receber lançamentos directos,
            e os movimentos que já tem migram para esta conta nova.
          </Alerta>
        ) : consequencia ? (
          <Alerta tipo="info">
            Fica como subconta de <b>{consequencia.mae.codigo}</b> ·{" "}
            {consequencia.mae.nome}.
          </Alerta>
        ) : null
      }
    >
      <Campo
        rotulo="Código"
        dica="Não se altera depois — os movimentos guardam-no."
      >
        <Entrada value={codigo} disabled className="tabular" />
      </Campo>

      <Campo
        rotulo="Natureza"
        dica="Em branco, é deduzida da classe do código."
      >
        <Selector
          valor={natureza}
          aoMudar={setNatureza}
          opcoes={[
            { valor: "", rotulo: "Deduzir do código" },
            { valor: "D", rotulo: "Devedora" },
            { valor: "C", rotulo: "Credora" },
            { valor: "M", rotulo: "Mista" },
          ]}
        />
      </Campo>

      <Campo rotulo="Designação" className="sm:col-span-2">
        {/* O foco vem para aqui: o código já está preenchido e bloqueado, e a
            designação é o único campo por escrever. */}
        <Entrada
          ref={campoNome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          maxLength={200}
          placeholder="Nome da conta"
        />
      </Campo>
    </DialogoMestre>
  );
}
