"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Cartao,
  Selector,
  Selo,
  Th,
  Vazio,
} from "@/components/ui";
import { Confirmar } from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { useContas } from "@/lib/hooks";
import {
  CLASSES,
  construirArvore,
  ehMovimento,
  NATUREZAS,
  visiveisComFiltros,
} from "@/lib/plano";
import { cn } from "@/lib/utils";
import type { Conta } from "@/types";

import { FichaConta } from "./FichaConta";
import { ImportarPlano } from "./ImportarPlano";

/**
 * Plano de Contas — a árvore do Piloto.
 *
 * Era uma lista plana de mil e seiscentas linhas. O plano é hierárquico por
 * natureza: classes, integradoras, subcontas. Vê-lo achatado é vê-lo sem a
 * informação que o organiza — não se percebe o que agrega o quê nem onde uma
 * conta nova vai cair.
 *
 * Tudo aberto por omissão, como no Piloto, com os dois botões de expandir e
 * colapsar tudo para as duas pontas.
 * Filtrar por texto, natureza ou tipo abre a árvore toda e mostra os resultados
 * **com os seus ascendentes** — senão apareciam pendurados fora do ramo.
 *
 * Duplo clique numa linha abre a ficha, como lá.
 */
export default function PlanoDeContas() {
  const { contas, isLoading, mutate } = useContas();
  const { pode } = useAuth();
  const podeGerir = pode("contab.plano");

  const [procura, setProcura] = useState("");
  const [classe, setClasse] = useState("");
  const [natureza, setNatureza] = useState("");
  const [tipo, setTipo] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [tudoFechado, setTudoFechado] = useState(false);

  const [aEditar, setAEditar] = useState<Conta | null>(null);
  const [aCriar, setACriar] = useState<string | null>(null);
  /** Conta-mãe quando se veio pelo «＋ Sub» — para a ficha o poder dizer. */
  const [pai, setPai] = useState<Conta | null>(null);
  const [aImportar, setAImportar] = useState(false);
  const [aApagar, setAApagar] = useState<Conta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const arvore = useMemo(() => construirArvore(contas), [contas]);
  const visiveis = useMemo(
    () => visiveisComFiltros(contas, arvore, { procura, natureza, tipo }),
    [contas, arvore, procura, natureza, tipo],
  );

  // A filtrar, está tudo aberto: um resultado escondido num ramo fechado é um
  // resultado que não se encontrou.
  const aFiltrar = visiveis !== null;
  const aberto = useCallback(
    (chave: string) => aFiltrar || (!tudoFechado && !fechados.has(chave)),
    [aFiltrar, tudoFechado, fechados],
  );

  function alternar(chave: string) {
    setFechados((f) => {
      const novo = new Set(f);
      if (tudoFechado) {
        // Vinha de «colapsar tudo»: abrir um nó passa a lista para «tudo aberto
        // menos os outros», que é o que o utilizador espera do clique seguinte.
        setTudoFechado(false);
        for (const c of contas) novo.add(c.codigo);
        for (const cl of Object.keys(CLASSES)) novo.add(`cls-${cl}`);
      }
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  const linhas = useMemo(() => {
    const saida: {
      tipo: "classe" | "conta";
      classe?: string;
      quantas?: number;
      conta?: Conta;
      nivel: number;
      temFilhos: boolean;
      movimento: boolean;
    }[] = [];

    function descer(c: Conta, nivel: number) {
      if (visiveis && !visiveis.has(c.codigo)) return;
      const filhos = arvore.filhos.get(c.codigo) ?? [];
      saida.push({
        tipo: "conta",
        conta: c,
        nivel,
        temFilhos: filhos.length > 0,
        movimento: ehMovimento(c, contas),
      });
      if (filhos.length && aberto(c.codigo))
        for (const f of filhos) descer(f, nivel + 1);
    }

    for (const cl of Object.keys(CLASSES)) {
      if (classe && cl !== classe) continue;
      const raizes = (arvore.raizesPorClasse[cl] ?? []).filter(
        (c) => !visiveis || visiveis.has(c.codigo),
      );
      if (raizes.length === 0) continue;
      saida.push({
        tipo: "classe",
        classe: cl,
        quantas: contas.filter((c) => c.codigo[0] === cl).length,
        nivel: 0,
        temFilhos: true,
        movimento: false,
      });
      // Escolher uma classe força-a aberta: pediu-se para a ver.
      if (aberto(`cls-${cl}`) || classe === cl)
        for (const r of raizes) descer(r, 0);
    }
    return saida;
  }, [contas, arvore, visiveis, classe, aberto]);

  async function eliminar() {
    if (!aApagar) return;
    setErro(null);
    setOcupado(true);
    try {
      await api.delete(`/api/contabilidade/contas/${aApagar.id}`);
      await mutate();
      setAviso(`Conta ${aApagar.codigo} eliminada.`);
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

  return (
    <>
      <CabecalhoPagina
        titulo="Plano de Contas"
        descricao="PGC Angola — contas de razão e de movimento. Pesquisa por código ou nome."
        accoes={<Selo cor="#3d7fe0">{contas.length} contas</Selo>}
      />

      <BarraFiltros className="mb-4">
        <input
          type="search"
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Pesquisar conta (código ou nome)…"
          className="min-w-[16rem] flex-1 rounded-[9px] border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento"
        />
        <Selector
          valor={classe}
          aoMudar={setClasse}
          opcoes={[
            { valor: "", rotulo: "Todas as classes" },
            ...Object.entries(CLASSES).map(([k, v]) => ({
              valor: k,
              rotulo: `${k} · ${v}`,
            })),
          ]}
          larguraMinima="14rem"
        />
        <Selector
          valor={natureza}
          aoMudar={setNatureza}
          opcoes={[
            { valor: "", rotulo: "Toda a natureza" },
            { valor: "D", rotulo: "Devedora" },
            { valor: "C", rotulo: "Credora" },
            { valor: "M", rotulo: "Mista" },
          ]}
          larguraMinima="11rem"
        />
        <Selector
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: "", rotulo: "Todos os tipos" },
            { valor: "M", rotulo: "Movimento" },
            { valor: "I", rotulo: "Integração" },
          ]}
          larguraMinima="11rem"
        />

        <Botao
          variante="contorno"
          tamanho="pequeno"
          title="Expandir tudo"
          onClick={() => {
            setFechados(new Set());
            setTudoFechado(false);
          }}
        >
          <ChevronsUpDown size={15} />
        </Botao>
        <Botao
          variante="contorno"
          tamanho="pequeno"
          title="Colapsar tudo"
          onClick={() => {
            setFechados(new Set());
            setTudoFechado(true);
          }}
        >
          <ChevronsDownUp size={15} />
        </Botao>

        {podeGerir && (
          <>
            <Botao variante="neutro" onClick={() => setAImportar(true)}>
              <Upload size={15} />
              Importar (Primavera)
            </Botao>
            <Botao
              variante="acento"
              onClick={() => {
                setPai(null);
                setACriar("");
              }}
            >
              <Plus size={16} />
              Nova conta
            </Botao>
          </>
        )}
      </BarraFiltros>

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : linhas.length === 0 ? (
          <Vazio>Sem contas para o filtro.</Vazio>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {/* Larguras do Piloto: código 30%, e as três colunas de
                  classificação fixas para não dançarem entre páginas. */}
              <thead>
                <tr>
                  <Th className="w-[30%]">Código</Th>
                  <Th>Designação</Th>
                  <Th className="w-[110px]">Cl. IVA</Th>
                  <Th className="w-[110px]">Natureza</Th>
                  <Th className="w-[120px]">Tipo</Th>
                  {podeGerir && <Th className="w-[150px]"> </Th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) =>
                  l.tipo === "classe" ? (
                    <tr
                      key={`cls-${l.classe}`}
                      onClick={() => alternar(`cls-${l.classe}`)}
                      className="cursor-pointer border-b border-borda bg-[color-mix(in_srgb,var(--color-indigo)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-indigo)_18%,transparent)]"
                    >
                      <td colSpan={podeGerir ? 6 : 5} className="px-3.5 py-2">
                        <span className="mr-1 inline-block w-3 text-texto-suave">
                          {aberto(`cls-${l.classe}`) ? "▾" : "▸"}
                        </span>
                        <b>
                          {l.classe} · {CLASSES[l.classe ?? ""]}
                        </b>{" "}
                        <span className="text-[12.5px] text-texto-suave">
                          — {l.quantas} conta(s)
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <LinhaConta
                      key={l.conta?.id}
                      conta={l.conta as Conta}
                      nivel={l.nivel}
                      temFilhos={l.temFilhos}
                      aberto={aberto((l.conta as Conta).codigo)}
                      movimento={l.movimento}
                      podeGerir={podeGerir}
                      aoAlternar={() => alternar((l.conta as Conta).codigo)}
                      aoEditar={() => setAEditar(l.conta as Conta)}
                      aoSubconta={() => {
                        setPai(l.conta as Conta);
                        setACriar(`${(l.conta as Conta).codigo}001`);
                      }}
                      aoApagar={() => setAApagar(l.conta as Conta)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {(aEditar || aCriar !== null) && (
        <FichaConta
          conta={aEditar}
          codigoSugerido={aCriar ?? ""}
          paiCodigo={pai?.codigo}
          // Só vira integradora se ainda não tiver filhos; se já os tem, é só
          // mais uma conta de movimento debaixo dela.
          paiVaiVirarIntegradora={
            pai != null &&
            !contas.some(
              (c) => c.codigo !== pai.codigo && c.codigo.startsWith(pai.codigo),
            )
          }
          aoFechar={() => {
            setAEditar(null);
            setACriar(null);
            setPai(null);
          }}
          aoGravar={(msg) => {
            setAviso(msg);
            setErro(null);
            setAEditar(null);
            setACriar(null);
            setPai(null);
          }}
        />
      )}

      {aImportar && (
        <ImportarPlano
          aoFechar={() => setAImportar(false)}
          aoImportar={(msg) => {
            setAviso(msg);
            setAImportar(false);
            mutate();
          }}
        />
      )}

      <Confirmar
        aberto={aApagar !== null}
        aoMudar={(a) => !a && setAApagar(null)}
        titulo={`Eliminar a conta ${aApagar?.codigo ?? ""}?`}
        rotuloConfirmar="Eliminar"
        rotuloOcupado="A eliminar…"
        ocupado={ocupado}
        aoConfirmar={eliminar}
      >
        Uma conta <b>com movimentos não pode ser eliminada</b> — nesse caso o
        servidor recusa, e a alternativa é pô-la inactiva, que a tira das
        escolhas sem tocar no histórico.
      </Confirmar>
    </>
  );
}

// ---------------------------------------------------------------------------
function LinhaConta({
  conta,
  nivel,
  temFilhos,
  aberto,
  movimento,
  podeGerir,
  aoAlternar,
  aoEditar,
  aoSubconta,
  aoApagar,
}: {
  conta: Conta;
  nivel: number;
  temFilhos: boolean;
  aberto: boolean;
  movimento: boolean;
  podeGerir: boolean;
  aoAlternar: () => void;
  aoEditar: () => void;
  aoSubconta: () => void;
  aoApagar: () => void;
}) {
  const nat = NATUREZAS[conta.natureza] ?? NATUREZAS.M;
  return (
    <tr
      className={cn(
        "border-b border-borda hover:bg-superficie-2",
        !conta.ativa && "opacity-55",
      )}
      // Duplo clique abre a ficha, como no Piloto — mas não quando o clique é
      // num botão da linha.
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (podeGerir) aoEditar();
      }}
    >
      <td className="px-3.5 py-1.5">
        <span
          className="tabular inline-flex items-center gap-1.5"
          style={{ paddingLeft: `${nivel * 16}px` }}
        >
          {temFilhos ? (
            <button
              type="button"
              onClick={aoAlternar}
              aria-label={aberto ? "Fechar" : "Abrir"}
              className="text-texto-suave hover:text-texto"
            >
              {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-3.5 text-center text-texto-suave">·</span>
          )}
          {temFilhos ? <b>{conta.codigo}</b> : conta.codigo}
        </span>
      </td>
      <td className="px-3.5 py-1.5">
        {temFilhos ? <b>{conta.nome}</b> : conta.nome}
        {!conta.ativa && (
          <Selo cor="#8a8a8a" className="ml-2">
            Inactiva
          </Selo>
        )}
      </td>
      {/* Em branco quando não há: o Piloto só desenha a etiqueta se a conta
          tiver classe de IVA, e uma coluna de travessões não diz nada. */}
      <td className="px-3.5 py-1.5">
        {conta.classe_iva ? (
          <Selo cor="#62657a">{conta.classe_iva}</Selo>
        ) : null}
      </td>
      <td className="px-3.5 py-1.5">
        <Selo cor={nat.cor}>{nat.rotulo}</Selo>
      </td>
      <td className="px-3.5 py-1.5">
        <Selo cor={movimento ? "#2980b9" : "#8a8a8a"}>
          {movimento ? "Movimento" : "Integração"}
        </Selo>
      </td>
      {podeGerir && (
        <td className="px-3.5 py-1.5">
          <div className="flex items-center justify-end gap-1">
            {/* Só nas contas de movimento, como no Piloto: criar uma
                subconta de uma integradora não muda nada — ela já o é. */}
            {movimento && (
              <button
                type="button"
                onClick={aoSubconta}
                title="Criar uma subconta desta"
                className="rounded-md border border-borda px-2 py-1 text-[11.5px] font-semibold text-texto-suave hover:border-marca hover:text-marca"
              >
                ＋ Sub
              </button>
            )}
            <button
              type="button"
              onClick={aoEditar}
              title="Alterar a ficha"
              className="rounded-md border border-borda px-2 py-1 text-[11.5px] font-semibold text-texto-suave hover:border-acento"
            >
              <Pencil size={12} className="mr-1 inline" />
              Editar
            </button>
            <button
              type="button"
              onClick={aoApagar}
              title="Eliminar"
              aria-label={`Eliminar a conta ${conta.codigo}`}
              className="rounded-md border border-borda px-2 py-1 text-texto-suave hover:border-perigo hover:text-perigo"
            >
              <X size={12} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
