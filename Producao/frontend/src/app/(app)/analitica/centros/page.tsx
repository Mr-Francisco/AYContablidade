"use client";

import { Plus, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import useSWR from "swr";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  EnvolveTabela,
  Selector,
  Selo,
  Tabela,
  Td,
  Th,
  Tr,
  Vazio,
} from "@/components/ui";
import {
  AccoesDaLinha,
  ConfirmarEliminar,
  DialogoMestre,
} from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataMoeda } from "@/lib/dinheiro";
import { useExercicios } from "@/lib/hooks";
import type { CentroCusto, MapaAnalitico } from "@/types";

const ROTA = "/api/contabilidade/centros";

export default function Centros() {
  const { empresa, pode } = useAuth();
  const moeda = empresa?.moeda ?? "Kz";
  const { activo } = useExercicios();

  const {
    data: centros,
    isLoading,
    mutate,
  } = useSWR<CentroCusto[]>(ROTA, buscador);

  const [procura, setProcura] = useState("");
  const [emEdicao, setEmEdicao] = useState<CentroCusto | null>(null);
  const [aCriar, setACriar] = useState(false);
  const [aApagar, setAApagar] = useState<CentroCusto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podeGerir = pode("contab.plano");

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`${ROTA}/${aApagar.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível eliminar.",
      );
    } finally {
      setOcupado(false);
      setAApagar(null);
    }
  }
  const { data: mapa } = useSWR<MapaAnalitico>(
    `/api/contabilidade/analitica${activo?.id ? `?exercicio_id=${activo.id}` : ""}`,
    buscador,
  );

  // Cruzar a ficha com o movimento: um centro sem movimento nenhum é tão útil
  // de ver como um com movimento — costuma ser sinal de que ninguém o usa.
  const movimento = new Map(
    (mapa?.linhas ?? []).map((l) => [l.codigo, l] as const),
  );

  const filtrados = (centros ?? []).filter((c) => {
    const q = procura.trim().toLowerCase();
    if (!q) return true;
    return (
      c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Centros de Custo"
        descricao="Ficha dos centros e o movimento que cada um acumulou no exercício."
        accoes={
          podeGerir && (
            <Botao variante="primario" onClick={() => setACriar(true)}>
              <Plus size={16} />
              Novo centro
            </Botao>
          )
        }
      />

      {/* Pesquisa por código ou nome. É um catálogo — uma empresa tem uma
          dúzia de centros e não cresce com o tempo —, por isso filtra-se aqui
          e não no servidor: a excepção que a regra das listagens prevê. */}
      <BarraFiltros className="mb-4">
        <Campo rotulo="Pesquisar" className="min-w-[16rem] flex-1">
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código ou nome do centro…"
              className="pl-9"
            />
          </div>
        </Campo>
      </BarraFiltros>

      {erro && (
        <div className="mb-4">
          <Alerta tipo="erro">{erro}</Alerta>
        </div>
      )}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : !filtrados.length ? (
          <Vazio>
            {procura.trim()
              ? "Nenhum centro corresponde à pesquisa."
              : 'Ainda não há centros de custo definidos. Sem centros, todas as linhas das classes 6 e 7 caem em "(Sem centro)" no mapa.'}
          </Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Tipo</Th>
                  <Th>Responsável</Th>
                  <Th numerico>Linhas</Th>
                  <Th numerico>Custos</Th>
                  <Th numerico>Proveitos</Th>
                  <Th>Estado</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const m = movimento.get(c.codigo);
                  return (
                    <Tr key={c.id}>
                      <Td className="tabular font-bold">{c.codigo}</Td>
                      <Td className="max-w-[240px] truncate font-semibold">
                        {c.nome}
                      </Td>
                      <Td className="text-texto-suave">{c.tipo || "—"}</Td>
                      <Td>{c.responsavel || "—"}</Td>
                      <Td numerico className="text-texto-suave">
                        {m?.n ?? 0}
                      </Td>
                      <Td numerico>
                        {m ? (
                          formataMoeda(m.debito, moeda)
                        ) : (
                          <span className="text-texto-suave">
                            sem movimento
                          </span>
                        )}
                      </Td>
                      <Td numerico>
                        {m ? formataMoeda(m.credito, moeda) : "—"}
                      </Td>
                      <Td>
                        <Selo
                          cor={c.estado === "activo" ? "#1a9c5f" : "#8a8a8a"}
                        >
                          {c.estado === "activo" ? "Activo" : "Inactivo"}
                        </Selo>
                      </Td>
                      {podeGerir && (
                        <Td>
                          <AccoesDaLinha
                            nome={`centro ${c.codigo}`}
                            aoEditar={() => setEmEdicao(c)}
                            aoApagar={() => setAApagar(c)}
                            desactivado={ocupado}
                            motivoNaoApagar={
                              m
                                ? "Tem custos imputados — mude-o para inactivo"
                                : undefined
                            }
                          />
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      <Alerta tipo="info" className="mt-4">
        O centro é escolhido na linha do lançamento, não na conta. É por isso
        que a mesma conta de custo pode aparecer repartida por vários centros —
        e que uma linha sem centro atribuído continua a ser um lançamento
        válido, só não entra na análise por centro.
      </Alerta>

      {(aCriar || emEdicao) && (
        <FormularioCentro
          centro={emEdicao}
          aoFechar={() => {
            setACriar(false);
            setEmEdicao(null);
          }}
          aoGravar={() => {
            mutate();
            setACriar(false);
            setEmEdicao(null);
          }}
        />
      )}

      <ConfirmarEliminar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar o centro ${aApagar?.codigo ?? ""}?`}
        aoConfirmar={eliminar}
        ocupado={ocupado}
      >
        Um centro <b>com custos já imputados não pode ser eliminado</b> — o mapa
        de custos passaria a somar menos do que a contabilidade. Nesse caso o
        servidor recusa, e a alternativa é pô-lo inactivo.
      </ConfirmarEliminar>
    </>
  );
}

// ---------------------------------------------------------------------------
const TIPOS = [
  { valor: "custo", rotulo: "Custo" },
  { valor: "proveito", rotulo: "Proveito" },
  { valor: "misto", rotulo: "Misto" },
];

function FormularioCentro({
  centro,
  aoFechar,
  aoGravar,
}: {
  centro: CentroCusto | null;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = centro === null;
  const [campos, setCampos] = useState({
    codigo: centro?.codigo ?? "",
    nome: centro?.nome ?? "",
    tipo: centro?.tipo || "custo",
    responsavel: centro?.responsavel ?? "",
    estado: centro?.estado || "activo",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    const corpo = {
      nome: campos.nome,
      tipo: campos.tipo,
      responsavel: campos.responsavel || null,
      estado: campos.estado,
    };
    try {
      if (novo) {
        await api.post(ROTA, { ...corpo, codigo: campos.codigo });
      } else {
        await api.patch(`${ROTA}/${centro.id}`, corpo);
      }
      aoGravar();
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <DialogoMestre
      titulo={novo ? "Novo centro de custo" : `Alterar centro ${centro.codigo}`}
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
    >
      <Campo
        rotulo="Código"
        dica={
          novo
            ? "É o que fica gravado em cada linha de lançamento."
            : "Não se altera: as linhas de lançamento guardam-no."
        }
      >
        <Entrada
          value={campos.codigo}
          onChange={(e) => alterar("codigo", e.target.value)}
          disabled={!novo}
          required
          maxLength={20}
          className="tabular"
        />
      </Campo>

      <Campo rotulo="Nome">
        <Entrada
          value={campos.nome}
          onChange={(e) => alterar("nome", e.target.value)}
          required
          maxLength={120}
        />
      </Campo>

      <Campo rotulo="Tipo">
        <Selector
          valor={campos.tipo}
          aoMudar={(v) => alterar("tipo", v)}
          opcoes={TIPOS}
        />
      </Campo>

      <Campo rotulo="Estado">
        <Selector
          valor={campos.estado}
          aoMudar={(v) => alterar("estado", v)}
          opcoes={[
            { valor: "activo", rotulo: "Activo" },
            { valor: "inactivo", rotulo: "Inactivo" },
          ]}
        />
      </Campo>

      <Campo rotulo="Responsável" dica="Opcional." className="sm:col-span-2">
        <Entrada
          value={campos.responsavel}
          onChange={(e) => alterar("responsavel", e.target.value)}
          maxLength={120}
        />
      </Campo>
    </DialogoMestre>
  );
}
