"use client";

import { Save } from "lucide-react";
import { Tabs } from "radix-ui";
import { type FormEvent, useState } from "react";
import useSWR from "swr";
import {
  ACarregar,
  Alerta,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Entrada,
  Selector,
  Selo,
  TituloCartao,
  Vazio,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { api, buscador, ErroApi } from "@/lib/api";
import { plural } from "@/lib/texto";
import type { ConfigEmpresa, Empresa, Licenca, MetadadosAcesso } from "@/types";
import { IntegracaoAgt } from "./IntegracaoAgt";
import { Parametrizacoes } from "./Parametrizacoes";
import { Permissoes } from "./Permissoes";

const SEPARADOR =
  "rounded-lg px-3 py-1.5 text-sm font-semibold text-texto-suave data-[state=active]:bg-superficie data-[state=active]:text-texto data-[state=active]:shadow-suave";

const REGIMES = [
  { valor: "exclusao", rotulo: "Não Sujeição (Exclusão)" },
  { valor: "simplificado", rotulo: "Regime Simplificado" },
  { valor: "geral", rotulo: "Regime Geral" },
];

export default function Configuracoes() {
  const { empresa: empresaSessao } = useAuth();

  const {
    data: empresa,
    error: erroEmpresa,
    mutate,
  } = useSWR<Empresa>("/api/empresa", buscador, { shouldRetryOnError: false });
  const { data: licenca } = useSWR<Licenca>("/api/empresa/licenca", buscador, {
    // Sem licença activa o backend devolve 404 — não vale a pena repetir.
    shouldRetryOnError: false,
  });
  const { data: config, mutate: mutateConfig } = useSWR<ConfigEmpresa>(
    "/api/empresa/config",
    buscador,
  );
  const { data: meta } = useSWR<MetadadosAcesso>(
    "/api/users/metadados",
    buscador,
    { revalidateOnFocus: false },
  );

  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Dados da empresa, parametrizações, integração e módulos."
        accoes={
          licenca && (
            <Selo cor={licenca.estado === "activa" ? "#1a9c5f" : "#c62828"}>
              {licenca.plano}
            </Selo>
          )
        }
      />

      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Sem isto, quem não é administrador ficava com «A carregar…» para
          sempre: a ficha da empresa é do administrador, o pedido devolve 403 e
          o ecrã nunca saía do estado de espera. Uma roda que nunca pára é
          pior do que uma frase que explica. */}
      {erroEmpresa ? (
        <Alerta tipo="erro">
          As configurações da empresa são do administrador. A sua conta não tem
          acesso a este ecrã.
        </Alerta>
      ) : !empresa ? (
        <Cartao>
          <ACarregar />
        </Cartao>
      ) : (
        <Tabs.Root defaultValue="empresa">
          <Tabs.List className="mb-4 inline-flex gap-1 rounded-xl bg-fundo p-1">
            <Tabs.Trigger value="empresa" className={SEPARADOR}>
              Empresa
            </Tabs.Trigger>
            <Tabs.Trigger value="modulos" className={SEPARADOR}>
              Módulos
            </Tabs.Trigger>
            <Tabs.Trigger value="parametrizacoes" className={SEPARADOR}>
              Parametrizações
            </Tabs.Trigger>
            <Tabs.Trigger value="agt" className={SEPARADOR}>
              Integração AGT
            </Tabs.Trigger>
            <Tabs.Trigger value="permissoes" className={SEPARADOR}>
              Permissões
            </Tabs.Trigger>
            <Tabs.Trigger value="licenca" className={SEPARADOR}>
              Licença
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="empresa">
            <FormularioEmpresa
              empresa={empresa}
              aoGravar={(msg) => {
                setAviso(msg);
                setErro(null);
                mutate();
              }}
              aoFalhar={setErro}
            />
          </Tabs.Content>

          <Tabs.Content value="modulos">
            <Modulos
              config={config}
              meta={meta}
              licenca={licenca}
              aoGravar={(msg) => {
                setAviso(msg);
                setErro(null);
                mutateConfig();
              }}
              aoFalhar={setErro}
            />
          </Tabs.Content>

          <Tabs.Content value="parametrizacoes">
            <Parametrizacoes
              aoGravar={(msg) => {
                setAviso(msg);
                setErro(null);
              }}
              aoFalhar={setErro}
            />
          </Tabs.Content>

          <Tabs.Content value="agt">
            <IntegracaoAgt
              agt={config?.agt}
              aoGravar={(msg) => {
                setAviso(msg);
                setErro(null);
                mutateConfig();
              }}
              aoFalhar={setErro}
            />
          </Tabs.Content>

          <Tabs.Content value="permissoes">
            <Permissoes />
          </Tabs.Content>

          <Tabs.Content value="licenca">
            <PainelLicenca licenca={licenca} empresa={empresaSessao?.nome} />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </>
  );
}

function FormularioEmpresa({
  empresa,
  aoGravar,
  aoFalhar,
}: {
  empresa: Empresa;
  aoGravar: (mensagem: string) => void;
  aoFalhar: (erro: string) => void;
}) {
  const [campos, setCampos] = useState({
    nome: empresa.nome,
    morada: empresa.morada ?? "",
    localizacao: empresa.localizacao ?? "",
    telefone: empresa.telefone ?? "",
    email: empresa.email ?? "",
    moeda: empresa.moeda,
    logo: empresa.logo ?? "",
    regime: empresa.regime,
    forma_juridica: empresa.forma_juridica ?? "lda",
  });
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  const mudouRegime = campos.regime !== empresa.regime;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setAGravar(true);
    try {
      await api.patch("/api/empresa", {
        ...campos,
        morada: campos.morada.trim() || null,
        localizacao: campos.localizacao.trim() || null,
        telefone: campos.telefone.trim() || null,
        email: campos.email.trim() || null,
        logo: campos.logo || null,
      });
      aoGravar("Dados da empresa gravados.");
    } catch (e2) {
      aoFalhar(
        e2 instanceof ErroApi
          ? e2.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Cartao>
      <form onSubmit={submeter} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Designação" className="sm:col-span-2">
            <Entrada
              value={campos.nome}
              onChange={(e) => alterar("nome", e.target.value)}
              required
            />
          </Campo>
          <Campo
            rotulo="NIF"
            dica="Identifica a empresa perante a AGT e está em documentos já emitidos — só o superadministrador o altera."
          >
            <Entrada value={empresa.nif} disabled className="tabular" />
          </Campo>
          <Campo rotulo="Telefone">
            <Entrada
              value={campos.telefone}
              onChange={(e) => alterar("telefone", e.target.value)}
              className="tabular"
            />
          </Campo>
          <Campo rotulo="Morada" className="sm:col-span-2">
            <Entrada
              value={campos.morada}
              onChange={(e) => alterar("morada", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Localidade">
            <Entrada
              value={campos.localizacao}
              onChange={(e) => alterar("localizacao", e.target.value)}
            />
          </Campo>
          <Campo rotulo="E-mail">
            <Entrada
              type="email"
              value={campos.email}
              onChange={(e) => alterar("email", e.target.value)}
            />
          </Campo>
          <Campo rotulo="Moeda">
            <Entrada
              value={campos.moeda}
              onChange={(e) => alterar("moeda", e.target.value)}
              maxLength={8}
            />
          </Campo>
          <CampoLogotipo
            valor={campos.logo}
            aoMudar={(v) => alterar("logo", v)}
            aoFalhar={aoFalhar}
          />
          <Selector
            rotulo="Regime de IVA"
            valor={campos.regime}
            aoMudar={(v) => alterar("regime", v)}
            opcoes={REGIMES}
            larguraMinima="100%"
          />
        </div>

        {mudouRegime && (
          <Alerta tipo="aviso">
            Mudar o regime de IVA fica registado no <b>histórico da empresa</b>.
            O apuramento de períodos passados continua a usar o regime que
            vigorava nessa altura — sem isso, reapurar um mês antigo daria um
            valor diferente do que foi declarado.
          </Alerta>
        )}

        <div className="mt-1 flex justify-end">
          <Botao type="submit" variante="primario" disabled={aGravar}>
            <Save size={16} />
            {aGravar ? "A gravar…" : "Gravar alterações"}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

function Modulos({
  config,
  meta,
  licenca,
  aoGravar,
  aoFalhar,
}: {
  config?: ConfigEmpresa;
  meta?: MetadadosAcesso;
  licenca?: Licenca;
  aoGravar: (mensagem: string) => void;
  aoFalhar: (erro: string) => void;
}) {
  const [activos, setActivos] = useState<Record<string, boolean> | null>(null);
  const [aGravar, setAGravar] = useState(false);

  if (!config || !meta) {
    return (
      <Cartao>
        <ACarregar />
      </Cartao>
    );
  }

  const estado = activos ?? config.modulos ?? {};
  // A licença é o tecto: desligar um módulo aqui é uma decisão da empresa, mas
  // ligá-lo não chega se o plano não o incluir — a API recusa na mesma.
  //
  // Lista VAZIA significa «todos os módulos», não «nenhum» — é assim que o
  // `modulo_ativo` do backend a lê. Tratá-la como uma lista normal punha todos
  // os módulos de um plano Enterprise a dizer «não incluído no plano».
  const incluidos = licenca?.modulos_incluidos?.length
    ? licenca.modulos_incluidos
    : null;

  async function gravar() {
    setAGravar(true);
    try {
      await api.patch("/api/empresa/config", { modulos: estado });
      aoGravar("Módulos actualizados.");
    } catch (e) {
      aoFalhar(
        e instanceof ErroApi
          ? e.mensagemUtilizador
          : "Não foi possível gravar.",
      );
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Cartao>
      <TituloCartao
        extra={
          incluidos
            ? `${plural(incluidos.length, "módulo")} no plano`
            : "Todos os módulos incluídos no plano"
        }
      >
        Módulos activos
      </TituloCartao>

      <Alerta tipo="info" className="mb-3">
        Desligar um módulo esconde-o de toda a empresa, independentemente do
        perfil de cada pessoa. É o primeiro dos três níveis de acesso: primeiro
        a <b>licença</b> tem de incluir o módulo, depois a <b>empresa</b> tem de
        o ter ligado, e só então o <b>perfil</b> de cada utilizador decide o que
        pode fazer lá dentro.
      </Alerta>

      <div className="flex flex-col divide-y divide-borda">
        {meta.modulos.map((m) => {
          const noPlano = incluidos === null || incluidos.includes(m.id);
          const ligado = estado[m.id] !== false && noPlano;
          return (
            <label
              key={m.id}
              className="flex cursor-pointer items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0">
                <span className="font-semibold">{m.nome}</span>
                {!noPlano && (
                  <span className="ml-2 text-xs text-texto-suave">
                    não incluído no plano
                  </span>
                )}
              </span>
              <input
                type="checkbox"
                checked={ligado}
                disabled={!noPlano}
                onChange={(e) =>
                  setActivos({ ...estado, [m.id]: e.target.checked })
                }
                className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-borda transition-colors checked:bg-marca disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Botao
          variante="primario"
          disabled={aGravar || activos === null}
          motivoBloqueio={
            aGravar
              ? "A gravar — aguarde."
              : "Ainda a carregar os módulos da licença."
          }
          onClick={gravar}
        >
          <Save size={16} />
          {aGravar ? "A gravar…" : "Gravar módulos"}
        </Botao>
      </div>
    </Cartao>
  );
}

function PainelLicenca({
  licenca,
  empresa,
}: {
  licenca?: Licenca;
  empresa?: string;
}) {
  if (!licenca) {
    return (
      <Cartao>
        <Vazio>
          Esta empresa não tem licença activa. Sem licença, os módulos de dados
          ficam inacessíveis — contacte o administrador da plataforma.
        </Vazio>
      </Cartao>
    );
  }

  const validade = licenca.validade ? new Date(licenca.validade) : null;
  const dias = validade
    ? Math.ceil((validade.getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <TituloCartao
          extra={
            <Selo cor={licenca.estado === "activa" ? "#1a9c5f" : "#c62828"}>
              {licenca.estado}
            </Selo>
          }
        >
          Licença de {empresa ?? licenca.titular}
        </TituloCartao>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Facto rotulo="Plano" valor={licenca.plano} />
          <Facto
            rotulo="Validade"
            valor={
              validade ? validade.toLocaleDateString("pt-PT") : "Sem termo"
            }
            nota={
              dias === null
                ? undefined
                : dias < 0
                  ? `expirou há ${plural(-dias, "dia")}`
                  : `faltam ${plural(dias, "dia")}`
            }
          />
          <Facto
            rotulo="Utilizadores"
            valor={
              licenca.limite_utilizadores
                ? String(licenca.limite_utilizadores)
                : "Sem limite"
            }
            nota="contas activas"
          />
          <Facto
            rotulo="Módulos"
            valor={
              licenca.modulos_incluidos.length
                ? String(licenca.modulos_incluidos.length)
                : "Todos"
            }
            nota="incluídos no plano"
          />
        </dl>

        {dias !== null && dias >= 0 && dias <= 30 && (
          <Alerta tipo="aviso" className="mt-3">
            A licença expira em {plural(dias, "dia")}. Uma licença expirada
            bloqueia o acesso aos módulos de dados — trate da renovação com
            antecedência.
          </Alerta>
        )}
      </Cartao>

      <Cartao>
        <TituloCartao extra="Só de leitura">Módulos do plano</TituloCartao>
        <p className="mb-3 text-sm text-texto-suave">
          O plano e os seus limites são geridos pelo administrador da
          plataforma. Aqui apenas se consultam.
        </p>
        {!licenca.modulos_incluidos.length ? (
          <p className="text-sm">
            O plano não restringe módulos — <b>todos estão incluídos</b>. O que
            cada pessoa vê depende então apenas do separador Módulos e do seu
            perfil.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {licenca.modulos_incluidos.map((m) => (
              <Selo key={m} cor="#3d7fe0">
                {m}
              </Selo>
            ))}
          </div>
        )}
      </Cartao>

      {licenca.notas && (
        <Cartao>
          <TituloCartao>Notas</TituloCartao>
          <p className="whitespace-pre-wrap text-sm">{licenca.notas}</p>
        </Cartao>
      )}
    </div>
  );
}

function Facto({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-borda bg-fundo p-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.5px] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="mt-1 text-xl font-bold">{valor}</dd>
      {nota && <p className="mt-0.5 text-xs text-texto-suave">{nota}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   O logótipo da empresa.

   VAI NO TOPO DE CADA FACTURA E DE CADA MAPA IMPRESSO, e é por isso que a
   ficha não se grava sem ele. Antes o campo existia na base de dados e não
   havia ecrã nenhum onde o pôr: o documento saía com um quadrado de duas
   letras no lugar da marca.

   AS MEDIDAS DIZEM-SE ANTES, e não depois de o servidor recusar. Quem escolhe
   uma fotografia de dois megabytes não está a desobedecer — está a adivinhar,
   porque ninguém lhe disse. O limite de peso não é capricho: o logótipo é
   guardado dentro da ficha da empresa e viaja em cada resposta que a traga.
--------------------------------------------------------------------------- */

const LOGO_TIPOS = ["image/png", "image/svg+xml", "image/jpeg"];
const LOGO_MAX_KB = 200;
const LOGO_LARGURA_MINIMA = 600;
const LOGO_ALTURA_MINIMA = 200;

function CampoLogotipo({
  valor,
  aoMudar,
  aoFalhar,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  aoFalhar: (erro: string) => void;
}) {
  const [nota, setNota] = useState<string | null>(null);

  function escolher(ficheiro: File) {
    if (!LOGO_TIPOS.includes(ficheiro.type)) {
      aoFalhar(
        "O logótipo tem de ser uma imagem PNG, SVG ou JPEG. Guarde o ficheiro num destes formatos e volte a escolhê-lo.",
      );
      return;
    }
    if (ficheiro.size > LOGO_MAX_KB * 1024) {
      aoFalhar(
        `O logótipo não pode passar de ${LOGO_MAX_KB} KB e este tem ${Math.round(ficheiro.size / 1024)} KB. Guarde a imagem num tamanho menor e volte a escolhê-la.`,
      );
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => {
      const dados = String(leitor.result);
      aoMudar(dados);
      // Pequena demais AVISA mas não impede: um SVG não tem pixéis, e uma
      // marca antiga em 400 px continua a ser a marca da empresa.
      if (ficheiro.type !== "image/svg+xml") {
        const img = new Image();
        img.onload = () =>
          setNota(
            img.width < LOGO_LARGURA_MINIMA || img.height < LOGO_ALTURA_MINIMA
              ? `Esta imagem tem ${img.width} por ${img.height} pontos e pode sair serrilhada no papel. Se tiver uma maior, use-a.`
              : null,
          );
        img.src = dados;
      } else {
        setNota(null);
      }
    };
    leitor.onerror = () =>
      aoFalhar(
        "Não foi possível ler o ficheiro. Volte a escolhê-lo e tente outra vez.",
      );
    leitor.readAsDataURL(ficheiro);
  }

  return (
    <Campo
      rotulo="Logótipo"
      dica={`PNG, SVG ou JPEG · a partir de ${LOGO_LARGURA_MINIMA}×${LOGO_ALTURA_MINIMA} pontos · até ${LOGO_MAX_KB} KB`}
      className="sm:col-span-2"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-[52px] w-[140px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-borda bg-superficie-2">
          {valor ? (
            // biome-ignore lint/performance/noImgElement: pré-visualização em `data:` de um ficheiro ainda por gravar — não há endereço que o `next/image` possa optimizar.
            <img
              src={valor}
              alt="Logótipo da empresa"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-[11px] text-texto-suave">Sem logótipo</span>
          )}
        </div>
        <input
          type="file"
          accept={LOGO_TIPOS.join(",")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) escolher(f);
            // Limpa para que escolher o MESMO ficheiro outra vez volte a
            // disparar — sem isto, corrigir e voltar a tentar não fazia nada.
            e.target.value = "";
          }}
          className="text-[13px] file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-borda file:bg-superficie-2 file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-texto"
        />
      </div>
      {!valor && (
        <Alerta tipo="aviso" className="mt-2">
          A ficha só se grava com o logótipo carregado, porque ele aparece no
          topo das facturas e dos mapas impressos.
        </Alerta>
      )}
      {nota && (
        <Alerta tipo="aviso" className="mt-2">
          {nota}
        </Alerta>
      )}
    </Campo>
  );
}
