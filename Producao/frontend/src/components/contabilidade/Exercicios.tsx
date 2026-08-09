"use client";

import { Lock, LockOpen, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  ACarregar,
  Alerta,
  Botao,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selo,
  Tabela,
  Td,
  Th,
  TituloCartao,
  Tr,
  Vazio,
} from "@/components/ui";
import { Confirmar, DialogoMestre } from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { useExercicios } from "@/lib/hooks";
import type { Exercicio } from "@/types";

const ROTA = "/api/contabilidade/exercicios";

/**
 * Exercícios económicos — abrir, fechar, reabrir, activar.
 *
 * A REGRA VIVE NO BACKEND e não aqui: `gravar_lancamento` lê o `estado` e
 * recusa lançar num exercício fechado. Esta página só mostra esse estado e
 * deixa mudá-lo — desactivar um botão é uma cortesia para quem não tem a
 * capacidade, não a barreira. Quem chamar a API à mão leva 403 na mesma.
 *
 * `ativo` e `estado` são independentes, como no Piloto: vários exercícios
 * podem estar activos ao mesmo tempo na transição de ano, e «activo» só diz
 * qual é o proposto por omissão nos ecrãs.
 */
export function Exercicios() {
  const { exercicios, isLoading, mutate } = useExercicios();
  const { pode } = useAuth();

  const [aCriar, setACriar] = useState(false);
  const [aFechar, setAFechar] = useState<Exercicio | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const podeFechar = pode("contab.fechar");

  async function alterar(
    ex: Exercicio,
    dados: Partial<Exercicio>,
    msg: string,
  ) {
    setErro(null);
    setAviso(null);
    setOcupado(ex.id);
    try {
      await api.patch(`${ROTA}/${ex.id}`, dados);
      // Relê antes de dar a mensagem: o estado que se mostra é o que o
      // servidor gravou, não o que o clique presumiu.
      await mutate();
      setAviso(msg);
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setOcupado(null);
      setAFechar(null);
    }
  }

  return (
    <Cartao className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-borda px-5 py-4">
        <TituloCartao className="mb-0">Exercícios Económicos</TituloCartao>
        <Selo cor="#3d7fe0">{exercicios.length}</Selo>
        {podeFechar && (
          <Botao
            variante="primario"
            tamanho="pequeno"
            onClick={() => setACriar(true)}
            className="ml-auto"
          >
            <Plus size={15} />
            Novo exercício
          </Botao>
        )}
      </div>

      <div className="px-5 pt-4">
        <p className="text-sm leading-relaxed text-texto-suave">
          Um exercício <b>fechado</b> deixa de aceitar lançamentos até ser
          reaberto — e reabre-se a qualquer momento. <b>Activo</b> é um
          interruptor à parte: diz qual é o exercício proposto por omissão nos
          ecrãs, e vários podem estar activos ao mesmo tempo na transição de
          ano.
        </p>
        {!podeFechar && (
          <p className="mt-2 text-[13px] text-texto-suave">
            O seu perfil vê os exercícios mas não os altera.
          </p>
        )}
        {aviso && (
          <div className="mt-3">
            <Alerta tipo="sucesso">{aviso}</Alerta>
          </div>
        )}
        {erro && (
          <div className="mt-3">
            <Alerta tipo="erro">{erro}</Alerta>
          </div>
        )}
      </div>

      {isLoading ? (
        <ACarregar />
      ) : exercicios.length === 0 ? (
        <Vazio>
          Ainda não há exercícios. Crie o primeiro para começar a lançar por
          período.
        </Vazio>
      ) : (
        <div className="mt-4">
          <EnvolveTabela className="rounded-none border-0 border-t">
            <Tabela>
              <thead>
                <tr>
                  <Th>Exercício</Th>
                  <Th>Início</Th>
                  <Th>Fim</Th>
                  <Th>Estado</Th>
                  <Th>Por omissão</Th>
                  {podeFechar && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {exercicios.map((ex) => {
                  const fechado = ex.estado === "fechado";
                  const aTrabalhar = ocupado === ex.id;
                  return (
                    <Tr key={ex.id}>
                      <Td className="font-semibold">{ex.nome}</Td>
                      <Td className="tabular">{ex.inicio}</Td>
                      <Td className="tabular">{ex.fim}</Td>
                      <Td>
                        <Selo cor={fechado ? "#8a8a8a" : "#1a9c5f"}>
                          {fechado ? "Fechado" : "Aberto"}
                        </Selo>
                      </Td>
                      <Td>
                        {ex.ativo ? (
                          <Selo cor="#3d7fe0">Activo</Selo>
                        ) : (
                          <span className="text-[13px] text-texto-suave">
                            —
                          </span>
                        )}
                      </Td>
                      {podeFechar && (
                        <Td>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Botao
                              variante="neutro"
                              tamanho="pequeno"
                              disabled={aTrabalhar}
                              onClick={() =>
                                alterar(
                                  ex,
                                  { ativo: !ex.ativo },
                                  ex.ativo
                                    ? `${ex.nome} deixou de ser o exercício por omissão.`
                                    : `${ex.nome} passou a ser proposto por omissão.`,
                                )
                              }
                            >
                              {ex.ativo ? "Desactivar" : "Activar"}
                            </Botao>
                            {fechado ? (
                              <Botao
                                variante="contorno"
                                tamanho="pequeno"
                                disabled={aTrabalhar}
                                onClick={() =>
                                  alterar(
                                    ex,
                                    { estado: "aberto" },
                                    `${ex.nome} reaberto — volta a aceitar lançamentos.`,
                                  )
                                }
                              >
                                <LockOpen size={14} />
                                Reabrir
                              </Botao>
                            ) : (
                              <Botao
                                variante="perigo"
                                tamanho="pequeno"
                                disabled={aTrabalhar}
                                onClick={() => setAFechar(ex)}
                              >
                                <Lock size={14} />
                                Fechar
                              </Botao>
                            )}
                          </div>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        </div>
      )}

      {aCriar && (
        <FormularioExercicio
          aoFechar={() => setACriar(false)}
          aoGravar={async (nome) => {
            await mutate();
            setACriar(false);
            setErro(null);
            setAviso(`${nome} criado, aberto e pronto a receber lançamentos.`);
          }}
        />
      )}

      <Confirmar
        aberto={aFechar !== null}
        aoMudar={(a) => !a && setAFechar(null)}
        titulo={`Fechar o ${aFechar?.nome ?? "exercício"}?`}
        rotuloConfirmar="Fechar exercício"
        rotuloOcupado="A fechar…"
        ocupado={ocupado !== null}
        aoConfirmar={() =>
          aFechar &&
          alterar(
            aFechar,
            { estado: "fechado" },
            `${aFechar.nome} fechado — deixa de aceitar lançamentos.`,
          )
        }
      >
        Deixa de aceitar lançamentos novos em <b>todos os diários</b> deste
        exercício. O que já está lançado não se altera, e os mapas continuam a
        ler-se.
        <br />
        <br />
        Reabre-se a qualquer momento, aqui mesmo.
      </Confirmar>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
function FormularioExercicio({
  aoFechar,
  aoGravar,
}: {
  aoFechar: () => void;
  aoGravar: (nome: string) => void;
}) {
  const ano = new Date().getFullYear();
  const [campos, setCampos] = useState({
    nome: `Exercício ${ano}`,
    inicio: `${ano}-01-01`,
    fim: `${ano}-12-31`,
    ativo: true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.post(ROTA, campos);
      aoGravar(campos.nome);
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
      titulo="Novo exercício"
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
      rotuloGravar="Criar exercício"
    >
      <Campo
        rotulo="Designação"
        dica="É por aqui que se escolhe o exercício nos ecrãs."
        className="sm:col-span-2"
      >
        <Entrada
          value={campos.nome}
          onChange={(e) => setCampos((c) => ({ ...c, nome: e.target.value }))}
          required
          maxLength={80}
        />
      </Campo>

      <Campo rotulo="Início">
        <Entrada
          type="date"
          value={campos.inicio}
          onChange={(e) => setCampos((c) => ({ ...c, inicio: e.target.value }))}
          required
          className="tabular"
        />
      </Campo>

      <Campo rotulo="Fim">
        <Entrada
          type="date"
          value={campos.fim}
          onChange={(e) => setCampos((c) => ({ ...c, fim: e.target.value }))}
          required
          className="tabular"
        />
      </Campo>

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={campos.ativo}
          onChange={(e) =>
            setCampos((c) => ({ ...c, ativo: e.target.checked }))
          }
          className="size-4 accent-[var(--color-marca)]"
        />
        Propor este exercício por omissão nos ecrãs.
      </label>
    </DialogoMestre>
  );
}
