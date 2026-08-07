"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Tema = "light" | "dark";

const CHAVE = "aycontab_tema";

interface TemaContexto {
  tema: Tema;
  alternar: () => void;
  definir: (t: Tema) => void;
}

const Ctx = createContext<TemaContexto | null>(null);

/**
 * Script que corre ANTES da hidratação, para não haver flash de tema claro
 * antes de o React montar. Vai inline no <head>.
 */
export const SCRIPT_TEMA = `
(function(){try{
  var t=localStorage.getItem("${CHAVE}");
  if(!t) t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  document.documentElement.setAttribute("data-theme",t);
}catch(e){}})();
`;

export function TemaProvider({ children }: { children: ReactNode }) {
  // Arranca em "light" apenas como valor de partida do React; o atributo real
  // já foi posto no <html> pelo script acima e é ele que manda até o
  // utilizador escolher.
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    if (atual === "dark" || atual === "light") setTema(atual);
  }, []);

  const definir = useCallback((t: Tema) => {
    setTema(t);
    document.documentElement.setAttribute("data-theme", t);
    // Só se grava quando o utilizador ESCOLHE. Gravar no arranque fixaria o
    // tema detectado e desligaria para sempre o seguimento da preferência do
    // sistema — o utilizador nunca escolheu nada e ficava preso ao primeiro
    // valor que calhou (ver docs/LESSONS.md).
    try {
      localStorage.setItem(CHAVE, t);
    } catch {
      /* modo privado ou armazenamento cheio — o tema fica só nesta sessão */
    }
  }, []);

  const alternar = useCallback(() => {
    definir(tema === "dark" ? "light" : "dark");
  }, [tema, definir]);

  return (
    <Ctx.Provider value={{ tema, alternar, definir }}>{children}</Ctx.Provider>
  );
}

export function useTema() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTema tem de estar dentro de <TemaProvider>.");
  return ctx;
}
