"use client";

import { Ban, Copy, KeyRound, Pencil, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { type FormEvent, useEffect, useState } from "react";
import useSWR from "swr";
import {
  EscolherModulos,
  EscolherPlano,
  type PlanoCatalogo,
  usePlanos,
} from "@/components/plataforma/EscolherPlano";
import {
  ACarregar,
  Alerta,
  BarraFiltros,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Kpi,
  Selector,
  Selo,
} from "@/components/ui";
import { CampoNif } from "@/components/ui/CampoNif";
import { type Coluna, Grelha } from "@/components/ui/Grelha";
import {
  BarraPaginacao,
  type Pagina,
  usePaginacao,
} from "@/components/ui/Paginacao";
import { api, buscador, ErroApi } from "@/lib/api";
import { formataInteiro } from "@/lib/dinheiro";
import { plural } from "@/lib/texto";
import type { LicencaGerada, LicencaPlataforma } from "@/types";

/** A resposta da listagem: uma página, e a contagem por estado de todas. */
interface PaginaLicencas extends Pagina<LicencaPlataforma> {
  por_estado: Record<string, number>;
}

const CORES: Record<string, string> = {
  pendente: "#c98a10",
  activa: "#1a9c5f",
  expirada: "#8a8a8a",
  suspensa: "#c98a10",
  cancelada: "#c62828",
};

/** O prazo da licença numa frase — uma coisa antes de ser activada, outra
 *  depois. Está numa função porque a coluna precisa dela duas vezes: para
 *  mostrar e para filtrar. */
function prazoEmTexto(l: LicencaPlataforma): string {
  const data = (d: string) => new Date(d).toLocaleDateString("pt-PT");
  if (!l.activada_em) return `activar até ${data(l.expira_activacao)}`;
  return l.validade ? `até ${data(l.validade)}` : "sem termo";
}

export default function Licencas() {
  const [estado, setEstado] = useState("todos");
  /** Procura por NIF, nome ou início da chave. Não havia nenhuma — com
   *  cinquenta licenças, encontrar a de um cliente era percorrer páginas. */
  const [procura, setProcura] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [aEditar, setAEditar] = useState<LicencaPlataforma | null>(null);
  const [aRevogar, setARevogar] = useState<LicencaPlataforma | null>(null);
  const [gerada, setGerada] = useState<LicencaGerada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = usePaginacao();
  const { data, isLoading, mutate } = useSWR<PaginaLicencas>(
    `/api/licencas?${p.query}${estado !== "todos" ? `&estado=${estado}` : ""}`,
    buscador,
  );

  const linhas = data?.linhas ?? [];
  // Filtra a PÁGINA que está no ecrã. É um atalho honesto e diz-se ao lado:
  // procurar no servidor obriga a mexer na rota, e a maior parte do trabalho
  // aqui é sobre a página que já se está a ver.
  const termo = procura.trim().toLowerCase();
  const todas = !termo
    ? linhas
    : linhas.filter(
        (l) =>
          l.nome_previsto.toLowerCase().includes(termo) ||
          l.nif_previsto.includes(termo) ||
          l.chave_prefixo.toLowerCase().includes(termo),
      );
  // Do servidor e sobre TODAS as licenças: com o filtro em «activas», contar
  // as pendentes da página dava sempre zero — uma afirmação falsa sobre a
  // plataforma, e não só um número em falta.
  const porEstado = (e: string) => data?.por_estado[e] ?? 0;

  async function revogar(l: LicencaPlataforma) {
    setOcupado(true);
    setErro(null);
    try {
      await api.delete(`/api/licencas/${l.id}`);
      mutate();
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível revogar.",
      );
    } finally {
      setOcupado(false);
      setARevogar(null);
    }
  }

  const colunas: Coluna<LicencaPlataforma>[] = [
    {
      chave: "chave",
      titulo: "Chave",
      valor: (l) => l.chave_prefixo,
      largura: "150px",
      celula: (l) => (
        <span className="tabular font-bold">{l.chave_prefixo}…</span>
      ),
    },
    {
      chave: "empresa",
      titulo: "Empresa",
      valor: (l) => l.nome_previsto,
      celula: (l) => (
        <span className="block max-w-[220px] truncate font-semibold">
          {l.nome_previsto}
        </span>
      ),
    },
    {
      chave: "nif",
      titulo: "NIF",
      valor: (l) => l.nif_previsto,
      largura: "130px",
      celula: (l) => <span className="tabular">{l.nif_previsto}</span>,
    },
    {
      chave: "plano",
      titulo: "Plano",
      valor: (l) => l.plano,
      largura: "150px",
      celula: (l) => <PlanoNaLinha licenca={l} />,
    },
    {
      chave: "estado",
      titulo: "Estado",
      valor: (l) => l.estado,
      largura: "120px",
      celula: (l) => <Selo cor={CORES[l.estado] ?? "#62657a"}>{l.estado}</Selo>,
    },
    {
      chave: "prazo",
      titulo: "Prazo / Validade",
      // Filtra-se pelo que está escrito: «activar» deixa à vista as que ainda
      // não foram activadas, que é a pergunta que se faz a este ecrã.
      valor: (l) => prazoEmTexto(l),
      // Ordena-se pela data verdadeira, não pela frase.
      ordem: (l) => l.validade ?? l.expira_activacao,
      largura: "185px",
      celula: (l) => (
        <span className="tabular text-texto-suave">{prazoEmTexto(l)}</span>
      ),
    },
    {
      chave: "contas",
      titulo: "Contas",
      tipo: "numero",
      // O que se lê é «∞» quando não há limite; é por isso que o filtro
      // trabalha sobre o texto e a ordenação sobre o número.
      valor: (l) => l.limite_utilizadores ?? "∞",
      ordem: (l) => l.limite_utilizadores,
      largura: "100px",
      celula: (l) =>
        l.limite_utilizadores ?? (
          <span className="text-texto-suave" title="Sem limite de contas">
            ∞
          </span>
        ),
    },
    {
      chave: "ia",
      titulo: "IA / mês",
      tipo: "numero",
      valor: (l) =>
        l.limite_tokens_mes ? formataInteiro(l.limite_tokens_mes) : "∞",
      ordem: (l) => l.limite_tokens_mes,
      largura: "120px",
      celula: (l) =>
        l.limite_tokens_mes ? (
          formataInteiro(l.limite_tokens_mes)
        ) : (
          <span className="text-texto-suave" title="Assistente sem tecto">
            ∞
          </span>
        ),
    },
    {
      chave: "accoes",
      titulo: " ",
      // Sem `valor`: uma coluna de acções não filtra nem ordena.
      largura: "110px",
      celula: (l) => (
        <div className="flex justify-end gap-1.5">
          <Botao
            tamanho="pequeno"
            onClick={() => setAEditar(l)}
            aria-label={`Editar licença de ${l.nome_previsto}`}
          >
            <Pencil size={13} />
          </Botao>
          <Botao
            tamanho="pequeno"
            variante="perigo"
            onClick={() => setARevogar(l)}
            aria-label={`Revogar licença de ${l.nome_previsto}`}
          >
            <Ban size={13} />
          </Botao>
        </div>
      ),
    },
  ];

  return (
    <>
      <CabecalhoPagina
        titulo="Licenças"
        descricao="Licenças da plataforma. A chave é mostrada uma única vez, no momento em que é gerada."
        accoes={
          <Botao variante="primario" onClick={() => setNovaAberta(true)}>
            <KeyRound size={16} />
            Gerar licença
          </Botao>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="revelar-grelha mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0">
          <Kpi
            rotulo="Activas"
            valor={String(porEstado("activa"))}
            detalhe="Empresas a usar o sistema"
            cor="var(--grafico-6)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Por activar"
            valor={String(porEstado("pendente"))}
            detalhe="Dentro do prazo de 7 dias"
            cor="var(--color-aviso)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Expiradas"
            valor={String(porEstado("expirada"))}
            detalhe="Prazo de activação ultrapassado"
            cor="var(--grafico-2)"
          />
        </div>
        <div className="min-w-0">
          <Kpi
            rotulo="Total"
            valor={String(todas.length)}
            detalhe="Emitidas desde sempre"
            cor="var(--grafico-1)"
          />
        </div>
      </div>

      <BarraFiltros className="mb-4">
        <Campo rotulo="Procurar" className="min-w-[240px] flex-1">
          <Entrada
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
            placeholder="Nome, NIF ou início da chave"
          />
        </Campo>
        <Selector
          rotulo="Estado"
          valor={estado}
          aoMudar={(v) => {
            setEstado(v);
            p.reiniciar();
          }}
          opcoes={[
            { valor: "todos", rotulo: "Todos" },
            { valor: "pendente", rotulo: "Por activar" },
            { valor: "activa", rotulo: "Activas" },
            { valor: "expirada", rotulo: "Expiradas" },
            { valor: "cancelada", rotulo: "Canceladas" },
          ]}
          larguraMinima="14rem"
        />
      </BarraFiltros>

      <Cartao className="p-0">
        {isLoading ? (
          <ACarregar />
        ) : (
          <>
            <Grelha
              linhas={todas}
              colunas={colunas}
              chaveDaLinha={(l) => l.id}
              aoAbrir={(l) => setAEditar(l)}
              altura={520}
              // Tal como a pesquisa em cima, a grelha procura na página que
              // está no ecrã — e di-lo, para ninguém concluir que uma licença
              // se perdeu.
              soEstaPagina
              vazio={
                procura.trim()
                  ? "Nenhuma licença corresponde à pesquisa."
                  : "Ainda não foi gerada nenhuma licença."
              }
            />
            {todas.length > 0 && (
              <BarraPaginacao pagina={data} {...p.controlos} nome="licenças" />
            )}
          </>
        )}
      </Cartao>

      {novaAberta && (
        <FormularioLicenca
          aoFechar={() => setNovaAberta(false)}
          aoGerar={(g) => {
            setNovaAberta(false);
            setGerada(g);
            mutate();
          }}
        />
      )}

      {gerada && (
        <ModalChave licenca={gerada} aoFechar={() => setGerada(null)} />
      )}

      {aEditar && (
        <FormularioAlteracao
          licenca={aEditar}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => {
            setAEditar(null);
            mutate();
          }}
        />
      )}

      <AlertDialog.Root
        open={!!aRevogar}
        onOpenChange={(a) => !a && setARevogar(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(540px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borda bg-superficie p-6 shadow-forte">
            <AlertDialog.Title className="mb-2 text-base font-bold">
              Revogar a licença de {aRevogar?.nome_previsto}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-5 text-sm text-texto-suave">
              {aRevogar?.empresa_id ? (
                <>
                  Esta licença <b>já foi activada</b>, por isso passa a
                  cancelada e fica no registo — apagá-la deixaria a empresa sem
                  vestígio do contrato que a criou. A empresa deixa de conseguir
                  entrar.
                </>
              ) : (
                <>
                  Esta licença <b>ainda não foi activada</b> e é apagada. A
                  chave deixa de servir. Se foi enviada a alguém, avise — vai
                  receber «chave inválida».
                </>
              )}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Botao>Cancelar</Botao>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Botao
                  variante="perigo"
                  disabled={ocupado}
                  onClick={() => aRevogar && revogar(aRevogar)}
                >
                  Revogar
                </Botao>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function ModalChave({
  licenca,
  aoFechar,
}: {
  licenca: LicencaGerada;
  aoFechar: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  return (
    <Modal titulo="Licença gerada" aoFechar={aoFechar} largura="560px">
      <div className="flex flex-col gap-4 p-5">
        <Alerta tipo="aviso">
          <b>Esta chave não volta a ser mostrada.</b> Por segurança, não fica
          guardada de forma legível. Copie-a agora e entregue-a ao cliente. Se a
          perder, gere uma licença nova.
        </Alerta>

        <div className="rounded-xl border-2 border-dashed border-marca bg-fundo p-5 text-center">
          <p className="tabular text-2xl font-black tracking-[2px] text-marca">
            {licenca.chave}
          </p>
        </div>

        <Botao
          variante={copiada ? "primario" : undefined}
          bloco
          onClick={() => {
            navigator.clipboard?.writeText(licenca.chave);
            setCopiada(true);
          }}
        >
          <Copy size={16} />
          {copiada ? "Copiada" : "Copiar chave"}
        </Botao>

        <dl className="rounded-xl border border-borda bg-fundo p-3 text-sm">
          <Par rotulo="Empresa" valor={licenca.nome_previsto} />
          <Par rotulo="NIF" valor={licenca.nif_previsto} />
          <Par rotulo="Plano" valor={licenca.plano} />
          <Par
            rotulo="Activar até"
            valor={`${new Date(licenca.expira_activacao).toLocaleDateString("pt-PT")} (${plural(licenca.dias_para_activar, "dia")})`}
          />
        </dl>

        <div className="flex justify-end">
          <Botao onClick={aoFechar}>Fechar</Botao>
        </div>
      </div>
    </Modal>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-borda/60 py-1 last:border-0">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}

/** O plano na linha da tabela, com o que ele significa por baixo.
 *
 *  Mostrava-se só o texto do campo — «Base», «Enterprise» — que não dizia
 *  nada porque não decidia nada. Agora mostra o nome e quantos módulos a
 *  licença inclui, que é a informação pela qual se olha esta coluna. */
function PlanoNaLinha({ licenca }: { licenca: LicencaPlataforma }) {
  const { data: planos } = usePlanos();
  const p = planos?.find(
    (x) =>
      x.codigo === licenca.plano ||
      x.nome.toLowerCase() === (licenca.plano ?? "").toLowerCase(),
  );
  const n = licenca.modulos_incluidos?.length ?? 0;

  return (
    <span className="flex flex-col leading-tight">
      <b className="text-[13.5px]">{p?.nome ?? licenca.plano}</b>
      <span className="text-[11.5px] text-texto-suave">
        {n === 0 ? "todos os módulos" : plural(n, "módulo")}
      </span>
    </span>
  );
}

function FormularioLicenca({
  aoFechar,
  aoGerar,
}: {
  aoFechar: () => void;
  aoGerar: (g: LicencaGerada) => void;
}) {
  const [campos, setCampos] = useState({
    nif: "",
    nome_empresa: "",
    titular: "",
    plano: "gestao",
    duracao_meses: "12",
    limite_utilizadores: "",
    limite_tokens_mes: "",
    limite_custo_mes: "",
    notas: "",
  });
  /** Os módulos da licença. Começam nos do plano e podem ser ajustados —
   *  o plano preenche, não tranca. */
  const [modulos, setModulos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState(false);
  const { data: planos } = usePlanos();
  const planoEscolhido = planos?.find((p) => p.codigo === campos.plano);

  // Os módulos do plano por omissão, assim que o catálogo chega. Só enquanto
  // ninguém tocou neles: a partir daí a escolha é de quem está a criar.
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    if (!tocado && planoEscolhido) setModulos([...planoEscolhido.modulos]);
  }, [planoEscolhido, tocado]);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  function escolherPlano(codigo: string, p: PlanoCatalogo) {
    alterar("plano", codigo);
    // Escolher um plano REPÕE os módulos e os limites desse plano. Ajustes
    // feitos antes perdem-se de propósito: escolher outro plano é escolher
    // outro conjunto, e manter ajustes do anterior daria uma mistura que
    // ninguém pediu.
    setModulos([...p.modulos]);
    setTocado(false);
    setCampos((c) => ({
      ...c,
      limite_utilizadores:
        p.utilizadores === null ? "" : String(p.utilizadores),
      limite_tokens_mes: p.tokens_mes === null ? "" : String(p.tokens_mes),
      limite_custo_mes: p.custo_mes === null ? "" : p.custo_mes,
    }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGerar(true);
    try {
      aoGerar(
        await api.post<LicencaGerada>("/api/licencas", {
          nif: campos.nif.trim(),
          nome_empresa: campos.nome_empresa.trim(),
          titular: campos.titular.trim() || null,
          plano: campos.plano,
          modulos_incluidos: modulos,
          duracao_meses: Number(campos.duracao_meses) || null,
          limite_utilizadores: campos.limite_utilizadores
            ? Number(campos.limite_utilizadores)
            : null,
          limite_tokens_mes: campos.limite_tokens_mes
            ? Number(campos.limite_tokens_mes)
            : null,
          limite_custo_mes: campos.limite_custo_mes || null,
          notas: campos.notas.trim() || null,
        }),
      );
    } catch (e2) {
      setErro(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gerar a licença.",
      );
    } finally {
      setAGerar(false);
    }
  }

  return (
    <Modal titulo="Gerar licença" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="info">
          O NIF e o nome ficam <b>gravados na licença</b> e são confirmados na
          activação: é o que impede que uma chave interceptada sirva para
          registar outra empresa.
        </Alerta>

        <EscolherPlano
          valor={campos.plano}
          aoMudar={escolherPlano}
          planos={planos}
        />

        <EscolherModulos
          valor={modulos}
          aoMudar={(m) => {
            setModulos(m);
            setTocado(true);
          }}
          planoEscolhido={planoEscolhido}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Confirmar aqui é o sítio que mais rende: o NIF e o nome ficam
              GRAVADOS na licença e são conferidos na activação. Um nome
              escrito à mão com um erro obriga a emitir a licença outra vez. */}
          <CampoNif
            rotulo="NIF da empresa"
            valor={campos.nif}
            autoFocus
            aoMudar={(v) => alterar("nif", v)}
            aoConfirmar={(r) => {
              if (r.nome && !campos.nome_empresa.trim())
                alterar("nome_empresa", r.nome);
              alterar("nif", r.nif);
            }}
            className="sm:col-span-2"
            dica="Confirme na AGT — traz o nome com que a empresa está registada."
          />
          <Campo rotulo="Nome da empresa">
            <Entrada
              value={campos.nome_empresa}
              onChange={(e) => alterar("nome_empresa", e.target.value)}
              required
            />
          </Campo>
          <Campo rotulo="Titular do contrato" dica="Em branco usa o nome.">
            <Entrada
              value={campos.titular}
              onChange={(e) => alterar("titular", e.target.value)}
            />
          </Campo>
          <Campo
            rotulo="Duração (meses)"
            dica="Contada a partir da activação, não da emissão."
          >
            <Entrada
              type="number"
              min="1"
              max="120"
              value={campos.duracao_meses}
              onChange={(e) => alterar("duracao_meses", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Limite de utilizadores" dica="Em branco = sem limite.">
            <Entrada
              type="number"
              min="1"
              value={campos.limite_utilizadores}
              onChange={(e) => alterar("limite_utilizadores", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Tokens de IA por mês" dica="Em branco = sem limite.">
            <Entrada
              type="number"
              min="0"
              step="100000"
              value={campos.limite_tokens_mes}
              onChange={(e) => alterar("limite_tokens_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo
            rotulo="Custo de IA por mês (USD)"
            dica="Em branco = sem limite."
          >
            <Entrada
              type="number"
              min="0"
              step="0.01"
              value={campos.limite_custo_mes}
              onChange={(e) => alterar("limite_custo_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Notas" className="sm:col-span-2">
            <Entrada
              value={campos.notas}
              onChange={(e) => alterar("notas", e.target.value)}
            />
          </Campo>
        </div>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGerar}>
            {aGerar ? "A gerar…" : "Gerar licença"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormularioAlteracao({
  licenca,
  aoFechar,
  aoGravar,
}: {
  licenca: LicencaPlataforma;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [campos, setCampos] = useState({
    plano: licenca.plano,
    estado: licenca.estado,
    validade: licenca.validade ?? "",
    limite_utilizadores: licenca.limite_utilizadores?.toString() ?? "",
    limite_tokens_mes: licenca.limite_tokens_mes?.toString() ?? "",
    limite_custo_mes: licenca.limite_custo_mes ?? "",
    notas: licenca.notas ?? "",
  });
  const [modulos, setModulos] = useState<string[]>(
    licenca.modulos_incluidos ?? [],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const { data: planos } = usePlanos();
  const planoEscolhido = planos?.find((p) => p.codigo === campos.plano);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  /** Mudar de plano num contrato JÁ ACTIVO não repõe os limites em silêncio.
   *
   *  No formulário de criação repõe, porque ali não há nada a perder. Aqui há:
   *  a empresa pode ter um limite ajustado de propósito, e trocá-lo sem aviso
   *  seria alterar um contrato pelo lado. Muda-se o nome do plano e os módulos
   *  que lhe correspondem; os limites ficam à mão de quem está a decidir. */
  function escolherPlano(codigo: string, p: PlanoCatalogo) {
    alterar("plano", codigo);
    setModulos([...p.modulos]);
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    try {
      await api.patch(`/api/licencas/${licenca.id}`, {
        plano: campos.plano,
        modulos_incluidos: modulos,
        estado: campos.estado,
        validade: campos.validade || null,
        limite_utilizadores: campos.limite_utilizadores
          ? Number(campos.limite_utilizadores)
          : null,
        limite_tokens_mes: campos.limite_tokens_mes
          ? Number(campos.limite_tokens_mes)
          : null,
        limite_custo_mes: campos.limite_custo_mes || null,
        notas: campos.notas.trim() || null,
      });
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
    <Modal titulo={`Contrato de ${licenca.nome_previsto}`} aoFechar={aoFechar}>
      <form onSubmit={submeter} className="flex flex-col gap-3 p-5">
        <Alerta tipo="info">
          A chave não se altera. Para emitir uma chave nova, gera-se outra
          licença — trocar a chave de uma licença já activada não faria sentido,
          porque a empresa existe e já entra pelo login.
        </Alerta>

        <EscolherPlano
          valor={campos.plano}
          aoMudar={escolherPlano}
          planos={planos}
        />

        <EscolherModulos
          valor={modulos}
          aoMudar={setModulos}
          planoEscolhido={planoEscolhido}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            rotulo="Estado"
            valor={campos.estado}
            aoMudar={(v) => alterar("estado", v)}
            opcoes={[
              { valor: "activa", rotulo: "Activa" },
              { valor: "suspensa", rotulo: "Suspensa" },
              { valor: "cancelada", rotulo: "Cancelada" },
              { valor: "expirada", rotulo: "Expirada" },
            ]}
            larguraMinima="100%"
          />
          <Campo rotulo="Validade" dica="Em branco = perpétua.">
            <Entrada
              type="date"
              value={campos.validade}
              onChange={(e) => alterar("validade", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Limite de utilizadores">
            <Entrada
              type="number"
              min="1"
              value={campos.limite_utilizadores}
              onChange={(e) => alterar("limite_utilizadores", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Tokens de IA por mês">
            <Entrada
              type="number"
              min="0"
              step="100000"
              value={campos.limite_tokens_mes}
              onChange={(e) => alterar("limite_tokens_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Custo de IA por mês (USD)">
            <Entrada
              type="number"
              min="0"
              step="0.01"
              value={campos.limite_custo_mes}
              onChange={(e) => alterar("limite_custo_mes", e.target.value)}
              className="text-right tabular"
            />
          </Campo>
          <Campo rotulo="Notas" className="sm:col-span-2">
            <Entrada
              value={campos.notas}
              onChange={(e) => alterar("notas", e.target.value)}
            />
          </Campo>
        </div>

        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        <div className="mt-1 flex justify-end gap-2">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={aGravar}>
            {aGravar ? "A gravar…" : "Gravar contrato"}
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  titulo,
  aoFechar,
  largura = "700px",
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  largura?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(a) => !a && aoFechar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-borda bg-superficie shadow-forte"
          style={{ width: `min(${largura}, 94vw)` }}
        >
          <div className="flex items-center justify-between border-b border-borda px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-bold">
              {titulo}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-borda hover:border-perigo hover:text-perigo"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-w-0 flex-1 overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
