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
import { useCallback, useDeferredValue, useMemo, useState } from "react";

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
import { CampoFiltroColuna, MenuDaColuna } from "@/components/ui/Grelha";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { useContas } from "@/lib/hooks";
import {
  CLASSES,
  construirArvore,
  ehMovimento,
  maeDe,
  NATUREZAS,
  visiveisComFiltros,
} from "@/lib/plano";
import { cn } from "@/lib/utils";
import type { Conta } from "@/types";

import { FichaConta } from "./FichaConta";
import { ImportarPlano } from "./ImportarPlano";

/** O que se devolve quando o que foi escrito na coluna não corresponde a nada.
 *
 *  Tem de ser um valor que NENHUMA conta tenha: devolver vazio fazia o filtro
 *  ignorar-se a si próprio e mostrar tudo — escrever «xpto» na Natureza dava a
 *  lista completa, como se não se tivesse escrito nada. */
const SEM_CORRESPONDENCIA = "(nada)";

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
  const [procuraCodigo, setProcuraCodigo] = useState("");
  const [classe, setClasse] = useState("");
  const [natureza, setNatureza] = useState("");
  const [tipo, setTipo] = useState("");

  // OS FILTROS DE COLUNA, o padrão do Primavera que as outras tabelas já têm.
  // Vivem à parte dos selectores da barra de cima de propósito: aqueles são
  // escolhas fechadas, estes são o que se escreve na coluna.
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroIva, setFiltroIva] = useState("");
  const [filtroNatureza, setFiltroNatureza] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [ordem, setOrdem] = useState<{
    chave: string;
    ascendente: boolean;
  } | null>(null);

  // A CÉLULA DO CÓDIGO, ao gesto do Windows Forms: um clique selecciona, o
  // seguinte abre para escrita. Guarda-se o código da conta, não o índice da
  // linha — as linhas mudam de sítio quando se filtra, os códigos não.
  const [celulaSel, setCelulaSel] = useState<string | null>(null);
  const [celulaEdit, setCelulaEdit] = useState<string | null>(null);
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

  // O QUE SE ESCREVE APARECE JÁ; a árvore alcança a seguir.
  //
  // MEDIDO, não suposto: com as 1631 contas no ecrã, cada tecla custava 410 ms
  // de trabalho — o cursor prendia-se e as letras chegavam aos saltos. O plano
  // de contas é a maior tabela do sistema e é onde isto mais se nota.
  //
  // `useDeferredValue` separa as duas coisas: o campo responde à tecla de
  // imediato, e a lista volta a desenhar-se logo a seguir, com a prioridade
  // mais baixa. É o mesmo que a `Grelha` faz nas outras tabelas.
  const procuraAdiada = useDeferredValue(procura);
  const procuraCodigoAdiada = useDeferredValue(procuraCodigo);
  const filtroNomeAdiado = useDeferredValue(filtroNome);
  const filtroIvaAdiado = useDeferredValue(filtroIva);

  // O QUE SE ESCREVE NA COLUNA vale o que se lê na coluna: escrever «dev» na
  // Natureza tem de encontrar as devedoras, e não obrigar a saber que por
  // dentro isso é um `D`. O mesmo para «movimento» e «integração».
  const codigoDoRotulo = (texto: string, pares: [string, string][]) => {
    const t = texto.trim().toLowerCase();
    if (!t) return "";
    const achado = pares.find(([, rotulo]) =>
      rotulo.toLowerCase().startsWith(t),
    );
    // Sem correspondência devolve-se um valor impossível, para o filtro dar
    // vazio em vez de se ignorar a si próprio e mostrar tudo.
    return achado ? achado[0] : SEM_CORRESPONDENCIA;
  };
  const naturezaFiltrada =
    filtroNatureza.trim() === ""
      ? natureza
      : codigoDoRotulo(filtroNatureza, [
          ["D", "Devedora"],
          ["C", "Credora"],
          ["M", "Mista"],
        ]);
  const tipoFiltrado =
    filtroTipo.trim() === ""
      ? tipo
      : codigoDoRotulo(filtroTipo, [
          ["M", "Movimento"],
          ["I", "Integração"],
        ]);

  const visiveis = useMemo(() => {
    const conjunto = visiveisComFiltros(contas, arvore, {
      procura: procuraAdiada,
      codigo: procuraCodigoAdiada,
      nome: filtroNomeAdiado,
      iva: filtroIvaAdiado,
      natureza: naturezaFiltrada,
      tipo: tipoFiltrado,
    });
    // A LINHA QUE ESTÁ A SER ESCRITA FICA. Sem isto, escrever mais um dígito
    // no código tirava a linha do ecrã, o campo saía com ela e perdia-se o que
    // se estava a escrever a meio da palavra. Ela e as mães, senão aparecia
    // pendurada fora do ramo.
    if (conjunto && celulaEdit) {
      let actual: Conta | null = arvore.porCodigo.get(celulaEdit) ?? null;
      while (actual) {
        conjunto.add(actual.codigo);
        actual = maeDe(actual.codigo, arvore.porCodigo);
      }
    }
    return conjunto;
  }, [
    contas,
    arvore,
    procuraAdiada,
    procuraCodigoAdiada,
    filtroNomeAdiado,
    filtroIvaAdiado,
    naturezaFiltrada,
    tipoFiltrado,
    celulaEdit,
  ]);

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

    // ORDENAR DESFAZ A ÁRVORE, e não há como não desfazer: pôr as contas por
    // designação é dizer que a ordem alfabética importa mais do que o ramo
    // onde a conta vive. Passa a lista simples, e o ecrã avisa — assim quem
    // ordenou percebe porque é que a hierarquia desapareceu, e como a trazer
    // de volta.
    if (ordem) {
      const rotuloNatureza: Record<string, string> = {
        D: "Devedora",
        C: "Credora",
        M: "Mista",
      };
      const chaveDe = (c: Conta): string => {
        switch (ordem.chave) {
          case "nome":
            return c.nome;
          case "iva":
            return c.classe_iva ?? "";
          case "natureza":
            return rotuloNatureza[c.natureza || "D"] ?? "";
          case "tipo":
            return ehMovimento(c, contas) ? "Movimento" : "Integração";
          default:
            return c.codigo;
        }
      };
      const sinal = ordem.ascendente ? 1 : -1;
      const lista = contas
        .filter((c) => !visiveis || visiveis.has(c.codigo))
        .filter((c) => !classe || c.codigo[0] === classe)
        // As integradoras que só entraram por serem mães de um resultado não
        // fazem sentido numa lista ordenada: aqui não há ramo para sustentar.
        .sort((a, b) => {
          const va = chaveDe(a);
          const vb = chaveDe(b);
          if (!va && !vb) return 0;
          if (!va) return 1;
          if (!vb) return -1;
          return (
            va.localeCompare(vb, "pt", {
              numeric: true,
              sensitivity: "base",
            }) * sinal
          );
        });
      for (const c of lista) {
        saida.push({
          tipo: "conta",
          conta: c,
          nivel: 0,
          temFilhos: false,
          movimento: ehMovimento(c, contas),
        });
      }
      return saida;
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
  }, [contas, arvore, visiveis, classe, aberto, ordem]);

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

      {/* ORDENAR TIRA A HIERARQUIA DO ECRÃ. Sem este aviso, quem clicasse num
          título via a árvore desaparecer e não tinha como saber que foi o
          clique — nem como a trazer de volta. */}
      {ordem && (
        <Alerta tipo="info" className="mb-4">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              As contas estão em lista, ordenadas por{" "}
              <b>
                {ordem.chave === "nome"
                  ? "designação"
                  : ordem.chave === "iva"
                    ? "classe de IVA"
                    : ordem.chave === "natureza"
                      ? "natureza"
                      : ordem.chave === "tipo"
                        ? "tipo"
                        : "código"}
              </b>
              . Enquanto assim estiverem, não se vê a que ramo pertencem.
            </span>
            <button
              type="button"
              onClick={() => setOrdem(null)}
              className="font-semibold text-marca hover:underline"
            >
              Voltar à árvore
            </button>
          </span>
        </Alerta>
      )}

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
              {/* A GRELHA DO PRIMAVERA, aqui também: uma linha de filtros por
                  baixo dos títulos e o menu de ordenação em cada título.

                  A DIFERENÇA PARA AS OUTRAS TABELAS, e é o que torna esta
                  especial: filtrar NÃO achata a árvore. As contas que passam o
                  filtro aparecem no seu ramo, com as mães por cima — é assim
                  que se sabe onde a conta vive. Só a ORDENAÇÃO desfaz a
                  hierarquia, porque ordenar uma árvore por designação não quer
                  dizer nada; nesse caso passa a lista e o ecrã di-lo. */}
              <thead>
                <tr>
                  <Th className="w-[30%]">
                    <MenuDaColuna
                      titulo="Código"
                      ordem={ordem?.chave === "codigo" ? ordem : null}
                      aoOrdenar={(asc) =>
                        setOrdem({ chave: "codigo", ascendente: asc })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(procuraCodigo.trim())}
                      aoLimparFiltro={() => setProcuraCodigo("")}
                    />
                  </Th>
                  <Th>
                    <MenuDaColuna
                      titulo="Designação"
                      ordem={ordem?.chave === "nome" ? ordem : null}
                      aoOrdenar={(asc) =>
                        setOrdem({ chave: "nome", ascendente: asc })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(filtroNome.trim())}
                      aoLimparFiltro={() => setFiltroNome("")}
                    />
                  </Th>
                  <Th className="w-[110px]">
                    <MenuDaColuna
                      titulo="Cl. IVA"
                      ordem={ordem?.chave === "iva" ? ordem : null}
                      aoOrdenar={(asc) =>
                        setOrdem({ chave: "iva", ascendente: asc })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(filtroIva.trim())}
                      aoLimparFiltro={() => setFiltroIva("")}
                    />
                  </Th>
                  <Th className="w-[110px]">
                    <MenuDaColuna
                      titulo="Natureza"
                      ordem={ordem?.chave === "natureza" ? ordem : null}
                      aoOrdenar={(asc) =>
                        setOrdem({ chave: "natureza", ascendente: asc })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(filtroNatureza.trim())}
                      aoLimparFiltro={() => setFiltroNatureza("")}
                    />
                  </Th>
                  <Th className="w-[120px]">
                    <MenuDaColuna
                      titulo="Tipo"
                      ordem={ordem?.chave === "tipo" ? ordem : null}
                      aoOrdenar={(asc) =>
                        setOrdem({ chave: "tipo", ascendente: asc })
                      }
                      aoLimparOrdem={() => setOrdem(null)}
                      temFiltro={Boolean(filtroTipo.trim())}
                      aoLimparFiltro={() => setFiltroTipo("")}
                    />
                  </Th>
                  {podeGerir && <Th className="w-[150px]"> </Th>}
                </tr>

                {/* A linha dos filtros, sempre à vista — como nas restantes
                    grelhas. Escondê-la atrás de um ícone poupa trinta pixels e
                    custa um clique em cada utilização. */}
                <tr>
                  <th className="border-b border-borda bg-superficie p-1">
                    <CampoFiltroColuna
                      valor={procuraCodigo}
                      aoMudar={setProcuraCodigo}
                      titulo="Código"
                    />
                  </th>
                  <th className="border-b border-borda bg-superficie p-1">
                    <CampoFiltroColuna
                      valor={filtroNome}
                      aoMudar={setFiltroNome}
                      titulo="Designação"
                    />
                  </th>
                  <th className="border-b border-borda bg-superficie p-1">
                    <CampoFiltroColuna
                      valor={filtroIva}
                      aoMudar={setFiltroIva}
                      titulo="Cl. IVA"
                    />
                  </th>
                  <th className="border-b border-borda bg-superficie p-1">
                    <CampoFiltroColuna
                      valor={filtroNatureza}
                      aoMudar={setFiltroNatureza}
                      titulo="Natureza"
                    />
                  </th>
                  <th className="border-b border-borda bg-superficie p-1">
                    <CampoFiltroColuna
                      valor={filtroTipo}
                      aoMudar={setFiltroTipo}
                      titulo="Tipo"
                    />
                  </th>
                  {podeGerir && (
                    <th className="border-b border-borda bg-superficie p-1" />
                  )}
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
                      celula={{
                        seleccionada:
                          celulaSel === (l.conta as Conta).codigo &&
                          celulaEdit !== (l.conta as Conta).codigo,
                        emEdicao: celulaEdit === (l.conta as Conta).codigo,
                        aoSeleccionar: () =>
                          setCelulaSel((l.conta as Conta).codigo),
                        aoAbrirEscrita: () => {
                          // Começa com o código da própria linha: é a partir
                          // dele que se quer subir ou descer no ramo.
                          setProcuraCodigo((l.conta as Conta).codigo);
                          setCelulaEdit((l.conta as Conta).codigo);
                        },
                        valor: procuraCodigo,
                        aoMudar: setProcuraCodigo,
                        aoTerminar: () => setCelulaEdit(null),
                      }}
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
/* ---------------------------------------------------------------------------
   A CÉLULA DO CÓDIGO — o gesto da grelha do Windows Forms.

   Um clique SELECCIONA. O clique seguinte, na célula já seleccionada, ABRE
   PARA ESCRITA, e o que se escreve filtra a tabela imediatamente. É o gesto do
   DataGridView, e o que o distingue de um campo de texto normal é não precisar
   de janela nenhuma: aponta-se ao código que se tem à frente e começa-se a
   escrever a partir dele.

   PORQUE É QUE COMEÇA COM O CÓDIGO DA LINHA e não em branco: chega-se aqui
   com uma conta à vista e o que se quer quase sempre é o RAMO dela — clicar na
   `1201` e apagar o `1` deixa o `120`, que é o ramo acima. Começar em branco
   obrigava a escrever tudo outra vez.

   A LINHA EM EDIÇÃO NÃO DESAPARECE, mesmo que o filtro deixe de a apanhar.
   Sem isso, escrever mais um dígito tirava a linha do ecrã, o campo saía com
   ela e perdia-se o que se estava a escrever a meio da palavra.
--------------------------------------------------------------------------- */
function CelulaCodigo({
  conta,
  temFilhos,
  seleccionada,
  emEdicao,
  aoSeleccionar,
  aoAbrirEscrita,
  valor,
  aoMudar,
  aoTerminar,
}: {
  conta: Conta;
  temFilhos: boolean;
  seleccionada: boolean;
  emEdicao: boolean;
  aoSeleccionar: () => void;
  aoAbrirEscrita: () => void;
  valor: string;
  aoMudar: (v: string) => void;
  aoTerminar: () => void;
}) {
  if (emEdicao) {
    return (
      <input
        // `autoFocus` é o ponto todo do gesto: se depois do segundo clique
        // fosse preciso clicar uma terceira vez para escrever, não se tinha
        // poupado nada.
        // biome-ignore lint/a11y/noAutofocus: é o segundo clique do utilizador
        autoFocus
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            aoTerminar();
          }
        }}
        onBlur={aoTerminar}
        aria-label={`Filtrar por código, a partir de ${conta.codigo}`}
        className="tabular w-full rounded-md border border-acento bg-superficie px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      // Primeiro clique selecciona, segundo abre para escrita — como na
      // grelha do Windows Forms.
      onClick={() => (seleccionada ? aoAbrirEscrita() : aoSeleccionar())}
      onKeyDown={(e) => {
        // F2 é a tecla de editar da grelha do Windows; Enter faz o mesmo para
        // quem não a conhece.
        if (e.key === "F2" || e.key === "Enter") {
          e.preventDefault();
          aoAbrirEscrita();
        }
      }}
      title="Clique para seleccionar, clique de novo para filtrar a partir deste código"
      className={cn(
        "tabular -mx-1 w-full rounded px-1 text-left",
        seleccionada && "bg-marca/15 ring-1 ring-marca",
      )}
    >
      {temFilhos ? <b>{conta.codigo}</b> : conta.codigo}
    </button>
  );
}

function LinhaConta({
  conta,
  temFilhos,
  aberto,
  movimento,
  podeGerir,
  aoAlternar,
  aoEditar,
  aoSubconta,
  aoApagar,
  celula,
}: {
  conta: Conta;
  temFilhos: boolean;
  aberto: boolean;
  movimento: boolean;
  podeGerir: boolean;
  aoAlternar: () => void;
  aoEditar: () => void;
  aoSubconta: () => void;
  aoApagar: () => void;
  /** O estado e os gestos da célula do código. */
  celula: {
    seleccionada: boolean;
    emEdicao: boolean;
    aoSeleccionar: () => void;
    aoAbrirEscrita: () => void;
    valor: string;
    aoMudar: (v: string) => void;
    aoTerminar: () => void;
  };
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
        {/* SEM INDENTAÇÃO POR NÍVEL.
            Cada nível deslocado 16 px punha as contas de quarto grau a
            começar a meio da coluna, e a olhar para a lista não se
            comparavam códigos — comparavam-se margens. A hierarquia continua
            a ler-se onde sempre se leu: no próprio código (11 → 111 → 1111) e
            no negrito de quem tem filhos. Os códigos ficam todos à esquerda,
            alinhados como no Balancete Geral. */}
        <span className="tabular inline-flex items-center gap-1.5">
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
          <CelulaCodigo conta={conta} temFilhos={temFilhos} {...celula} />
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
