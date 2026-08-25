"use client";

import { Plus, Search } from "lucide-react";
import { type FormEvent, useDeferredValue, useMemo, useState } from "react";
import { CampoConta } from "@/components/contabilidade/CampoConta";
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
import { CampoEntidade } from "@/components/ui/CampoEntidade";
import {
  AccoesDaLinha,
  ConfirmarEliminar,
  DialogoMestre,
} from "@/components/ui/CrudMestre";
import { useAuth } from "@/contexts/AuthContext";
import { api, ErroApi } from "@/lib/api";
import { useDiarios, useDocumentos } from "@/lib/hooks";
import type { DocumentoContabilistico } from "@/types";

const ROTA = "/api/contabilidade/documentos";

export default function Documentos() {
  const { diarios } = useDiarios();
  const { documentos, isLoading, mutate } = useDocumentos();
  const { pode } = useAuth();
  const [diario, setDiario] = useState("todos");
  const [procura, setProcura] = useState("");
  const procuraAdiada = useDeferredValue(procura);
  const [emEdicao, setEmEdicao] = useState<DocumentoContabilistico | null>(
    null,
  );
  const [aCriar, setACriar] = useState(false);
  const [aApagar, setAApagar] = useState<DocumentoContabilistico | null>(null);
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

  const nomeDiario = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of diarios) m.set(d.codigo, d.nome);
    return m;
  }, [diarios]);

  const filtrados = useMemo(() => {
    const termo = procuraAdiada.trim().toLowerCase();
    return documentos.filter((d) => {
      if (diario !== "todos" && d.diario_codigo !== diario) return false;
      if (!termo) return true;
      return (
        d.codigo.toLowerCase().includes(termo) ||
        d.descricao.toLowerCase().includes(termo)
      );
    });
  }, [documentos, diario, procuraAdiada]);

  return (
    <>
      <CabecalhoPagina
        titulo="Documentos"
        descricao="Documentos afectos a cada diário, com as contas de débito e crédito por omissão."
        accoes={
          <div className="flex items-center gap-3">
            <Selo cor="#3d7fe0">{documentos.length} documentos</Selo>
            {podeGerir && (
              <Botao variante="primario" onClick={() => setACriar(true)}>
                <Plus size={16} />
                Novo documento
              </Botao>
            )}
          </div>
        }
      />

      <BarraFiltros className="mb-4">
        <Selector
          rotulo="Diário"
          valor={diario}
          aoMudar={setDiario}
          opcoes={[
            { valor: "todos", rotulo: "Todos os diários" },
            ...diarios.map((d) => ({
              valor: d.codigo,
              rotulo: `${d.codigo} — ${d.nome}`,
            })),
          ]}
          larguraMinima="16rem"
        />
        <Campo rotulo="Pesquisar" className="min-w-[220px] flex-1">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-suave"
              aria-hidden
            />
            <Entrada
              type="search"
              value={procura}
              onChange={(e) => setProcura(e.target.value)}
              placeholder="Código ou descrição…"
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
        ) : filtrados.length === 0 ? (
          <Vazio>Nenhum documento corresponde aos filtros.</Vazio>
        ) : (
          <EnvolveTabela className="rounded-none border-0">
            <Tabela>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Descrição</Th>
                  <Th>Diário</Th>
                  <Th>Conta débito</Th>
                  <Th>Conta crédito</Th>
                  <Th>Retenção</Th>
                  <Th>Estado</Th>
                  {podeGerir && <Th> </Th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-bold tabular">{d.codigo}</Td>
                    <Td className="max-w-[340px] truncate">
                      <span title={d.descricao}>{d.descricao}</span>
                    </Td>
                    <Td className="max-w-[200px] truncate text-texto-suave">
                      {d.diario_codigo}
                      {nomeDiario.get(d.diario_codigo)
                        ? ` — ${nomeDiario.get(d.diario_codigo)}`
                        : ""}
                    </Td>
                    <Td className="tabular">{d.conta_debito || "—"}</Td>
                    <Td className="tabular">{d.conta_credito || "—"}</Td>
                    <Td>
                      {d.retencao ? (
                        <Selo cor="#c98a10">Sujeito</Selo>
                      ) : (
                        <span className="text-texto-suave">—</span>
                      )}
                    </Td>
                    <Td>
                      <Selo cor={d.ativo ? "#1a9c5f" : "#8a8a8a"}>
                        {d.ativo ? "Activo" : "Inactivo"}
                      </Selo>
                    </Td>
                    {podeGerir && (
                      <Td>
                        <AccoesDaLinha
                          nome={`documento ${d.codigo}`}
                          aoEditar={() => setEmEdicao(d)}
                          aoApagar={() => setAApagar(d)}
                          desactivado={ocupado}
                        />
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          </EnvolveTabela>
        )}
      </Cartao>

      {(aCriar || emEdicao) && (
        <FormularioDocumento
          documento={emEdicao}
          diarios={diarios}
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
        titulo={`Eliminar o documento ${aApagar?.codigo ?? ""}?`}
        aoConfirmar={eliminar}
        ocupado={ocupado}
      >
        Um documento <b>com movimentos não pode ser eliminado</b> — nesse caso o
        servidor recusa e a alternativa é desactivá-lo, que o tira das escolhas
        sem tocar no histórico.
      </ConfirmarEliminar>
    </>
  );
}

// ---------------------------------------------------------------------------
function FormularioDocumento({
  documento,
  diarios,
  aoFechar,
  aoGravar,
}: {
  documento: DocumentoContabilistico | null;
  diarios: { codigo: string; nome: string }[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const novo = documento === null;
  const [campos, setCampos] = useState({
    codigo: documento?.codigo ?? "",
    descricao: documento?.descricao ?? "",
    diario_codigo: documento?.diario_codigo ?? diarios[0]?.codigo ?? "",
    conta_debito: documento?.conta_debito ?? "",
    conta_credito: documento?.conta_credito ?? "",
    retencao: documento?.retencao ?? false,
    ativo: documento?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  function alterar(campo: string, valor: string | boolean) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAGravar(true);
    const corpo = {
      descricao: campos.descricao,
      diario_codigo: campos.diario_codigo,
      conta_debito: campos.conta_debito || null,
      conta_credito: campos.conta_credito || null,
      retencao: campos.retencao,
      ativo: campos.ativo,
    };
    try {
      if (novo) {
        await api.post(ROTA, { ...corpo, codigo: campos.codigo });
      } else {
        await api.patch(`${ROTA}/${documento.id}`, corpo);
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
      titulo={novo ? "Novo documento" : `Alterar documento ${documento.codigo}`}
      aoFechar={aoFechar}
      aoSubmeter={submeter}
      aGravar={aGravar}
      erro={erro}
    >
      <Campo
        rotulo="Código"
        dica={
          novo
            ? "Entra no nº de operação de cada movimento."
            : "Não se altera: os movimentos guardam-no."
        }
      >
        <Entrada
          value={campos.codigo}
          onChange={(e) => alterar("codigo", e.target.value)}
          disabled={!novo}
          required
          maxLength={10}
          className="tabular"
        />
      </Campo>

      <Campo rotulo="Descrição">
        <Entrada
          value={campos.descricao}
          onChange={(e) => alterar("descricao", e.target.value)}
          required
          maxLength={120}
        />
      </Campo>

      <Campo
        rotulo="Diário"
        className="sm:col-span-2"
        dica="F4 para procurar por código ou nome."
      >
        <CampoEntidade
          valor={
            campos.diario_codigo
              ? {
                  id: campos.diario_codigo,
                  codigo: campos.diario_codigo,
                  nome:
                    diarios.find((d) => d.codigo === campos.diario_codigo)
                      ?.nome ?? "",
                }
              : null
          }
          aoEscolher={(r) => alterar("diario_codigo", r?.codigo ?? "")}
          fonte="/api/contabilidade/diarios/tabela"
          titulo="Diários"
          placeholder="Diário (F4)"
          colunas={["Código", "Nome", "Categoria"]}
        />
      </Campo>

      {/* F4 e duplo clique, como no `ct-documentos.html` do Piloto. */}
      <Campo
        rotulo="Conta de débito"
        dica="Opcional. Sugerida ao lançar com este documento. F4 procura."
      >
        <CampoConta
          valor={campos.conta_debito}
          aoMudar={(v) => alterar("conta_debito", v)}
          placeholder="(opcional) · F4"
        />
      </Campo>

      <Campo rotulo="Conta de crédito" dica="Opcional. F4 procura.">
        <CampoConta
          valor={campos.conta_credito}
          aoMudar={(v) => alterar("conta_credito", v)}
          placeholder="(opcional) · F4"
        />
      </Campo>

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={campos.retencao}
          onChange={(e) => alterar("retencao", e.target.checked)}
          className="size-4 accent-[var(--color-marca)]"
        />
        Sujeito a retenção na fonte
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={campos.ativo}
          onChange={(e) => alterar("ativo", e.target.checked)}
          className="size-4 accent-[var(--color-marca)]"
        />
        Activo — um documento inactivo deixa de ser oferecido em movimentos
        novos, e o histórico continua a ler-se.
      </label>
    </DialogoMestre>
  );
}
