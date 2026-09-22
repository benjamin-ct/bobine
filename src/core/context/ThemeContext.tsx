import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// NOUVEAU (repris de la maquette HTML, le Projet A n'avait qu'un thème
// sombre fixe avant migration) : choix clair/sombre/auto, persisté et
// appliqué via `data-theme` sur <html> (voir src/styles/variables.css,
// qui définit les deux jeux de tokens). En mode "auto", le thème appliqué
// suit en direct la préférence système (`prefers-color-scheme`), y compris
// si elle change pendant que l'app est ouverte (review sur la carte Trello).
export type Theme = "dark" | "light";
export type ThemePreference = Theme | "auto";

const STORAGE_KEY = "bobine.theme";

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPreference(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function loadInitialPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
      return stored;
    }
  } catch {
    // localStorage indisponible (mode privé strict...) : repli silencieux.
  }
  return "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(loadInitialPreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(systemPreference);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => setSystemTheme(query.matches ? "light" : "dark");
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const theme: Theme = preference === "auto" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Repli silencieux : la préférence reste appliquée pour cette session,
      // simplement pas mémorisée pour la prochaine visite.
    }
  }, [preference]);

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme doit être utilisé dans un ThemeProvider");
  }
  return ctx;
}
