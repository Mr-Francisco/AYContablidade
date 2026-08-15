"use client";

import { useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { type GrupoNav, type ItemNav, NAV } from "@/lib/navegacao";
import type { Modulo } from "@/types";

/**
 * O que ESTE utilizador pode ver na navegação.
 *
 * Vivia dentro do `Cabecalho`, e ficou lá bem enquanto foi a única coisa a
 * desenhar menus. Deixou de ser: o acesso rápido do assistente mostra os
 * mesmos módulos, e uma segunda cópia destas regras é uma promessa de que um
 * dia divergem — a barra a esconder um módulo e o atalho a oferecê-lo.
 *
 * O código é o mesmo, palavra por palavra; só mudou de sítio.
 */
export function useNavegacaoVisivel() {
  const { utilizador, pode, moduloAtivo } = useAuth();

  const itemVisivel = useMemo(
    () => (item: ItemNav) => {
      if (item.perfis?.length) {
        const p = utilizador?.perfil;
        return (
          !!p &&
          (item.perfis.includes(p) ||
            (p === "superadmin" && item.perfis.includes("admin")))
        );
      }
      return item.cap ? pode(item.cap) : true;
    },
    [utilizador, pode],
  );

  const grupoVisivel = useMemo(
    () => (g: GrupoNav) => {
      // Uma conta de administração da plataforma não pertence a empresa
      // nenhuma. Oferecer-lhe Contabilidade ou RH era oferecer portas que dão
      // para uma parede: essas rotas consultam dados de uma empresa e
      // respondem 400 a quem não tem nenhuma.
      if (utilizador && !utilizador.empresa_id) return Boolean(g.daPlataforma);
      if (g.modulo && !moduloAtivo(g.modulo as Modulo)) return false;
      if (g.filhos) return g.filhos.some(itemVisivel);
      if (g.perfis?.length) {
        const p = utilizador?.perfil;
        return (
          !!p &&
          (g.perfis.includes(p) ||
            (p === "superadmin" && g.perfis.includes("admin")))
        );
      }
      return true;
    },
    [moduloAtivo, itemVisivel, utilizador],
  );

  const grupos = useMemo(() => NAV.filter(grupoVisivel), [grupoVisivel]);

  return { grupos, itemVisivel, grupoVisivel };
}
