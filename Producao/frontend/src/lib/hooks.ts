"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { buscador } from "@/lib/api";
import type {
  CentroCusto,
  Conta,
  Diario,
  DocumentoContabilistico,
  Exercicio,
} from "@/types";

/**
 * Exercícios da empresa, com o activo já escolhido.
 *
 * Vários podem estar activos em simultâneo na transição de ano — o escolhido
 * por omissão é o activo mais recente, como no Piloto.
 */
export function useExercicios() {
  const { data, isLoading, error } = useSWR<Exercicio[]>(
    "/api/contabilidade/exercicios",
    buscador,
  );
  const activo = useMemo(() => data?.find((e) => e.ativo) ?? data?.[0], [data]);
  return { exercicios: data ?? [], activo, isLoading, error };
}

/**
 * Plano de contas.
 *
 * São 1619 contas: pede-se uma vez e reutiliza-se em todo o lado. O SWR
 * dedupe evita que cinco componentes na mesma página façam cinco pedidos.
 */
export function useContas(opcoes?: { soMovimento?: boolean }) {
  const chave = opcoes?.soMovimento
    ? "/api/contabilidade/contas?limite=5000&so_movimento=true"
    : "/api/contabilidade/contas?limite=5000";
  const { data, isLoading } = useSWR<Conta[]>(chave, buscador, {
    revalidateOnFocus: false,
  });

  const porCodigo = useMemo(() => {
    const m = new Map<string, Conta>();
    for (const c of data ?? []) m.set(c.codigo, c);
    return m;
  }, [data]);

  return { contas: data ?? [], porCodigo, isLoading };
}

export function useDiarios() {
  const { data, isLoading } = useSWR<Diario[]>(
    "/api/contabilidade/diarios",
    buscador,
    { revalidateOnFocus: false },
  );
  return { diarios: data ?? [], isLoading };
}

export function useDocumentos(diario?: string) {
  const { data, isLoading } = useSWR<DocumentoContabilistico[]>(
    diario
      ? `/api/contabilidade/documentos?diario=${diario}`
      : "/api/contabilidade/documentos",
    buscador,
    { revalidateOnFocus: false },
  );
  return { documentos: data ?? [], isLoading };
}

export function useCentros() {
  const { data } = useSWR<CentroCusto[]>(
    "/api/contabilidade/centros",
    buscador,
    {
      revalidateOnFocus: false,
    },
  );
  return { centros: data ?? [] };
}

export function usePeriodos() {
  const { data } = useSWR<{ codigo: string; nome: string }[]>(
    "/api/contabilidade/periodos",
    buscador,
    { revalidateOnFocus: false },
  );
  return { periodos: data ?? [] };
}
