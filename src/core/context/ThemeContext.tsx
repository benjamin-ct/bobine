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

// Couleurs de fond (voir --bg dans variables.css) dupliquées ici en dur :
// on ne peut pas lire une custom property CSS pour alimenter un <meta>, et
// ce sont les mêmes valeurs que le loader statique d'index.html.
const THEME_COLOR: Record<Theme, string> = {
  dark: "#130e0a",
  light: "#fbf9f5",
};

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
    // iOS Safari ignore souvent un setAttribute("content", ...) sur la meta
    // existante (couleur de barre de statut jamais rafraîchie sans recharger
    // la page) : on supprime l'ancien noeud et on en insère un nouveau, ce
    // qui force le navigateur à relire la valeur.
    document.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", THEME_COLOR[theme]);
    document.head.appendChild(meta);

    // PWA installée sur iOS (barre de statut black-translucent, voir
    // index.html) : la zone sous la barre affiche un instantané mis en cache
    // par WebKit, qui n'est repeint qu'au scroll — jamais spontanément à un
    // changement de CSS, d'où le besoin d'"une petite interaction" remonté
    // sur la carte Trello. On simule ce scroll par un micro-décalage
    // synthétique (1px puis retour), réparti sur deux frames pour que WebKit
    // le traite comme deux évènements de scroll distincts plutôt qu'un
    // déplacement net nul ignoré.
    const isStandalonePwa =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true);
    if (isStandalonePwa) {
      const y = window.scrollY;
      requestAnimationFrame(() => {
        window.scrollTo(0, y + 1);
        requestAnimationFrame(() => window.scrollTo(0, y));
      });
    }
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
