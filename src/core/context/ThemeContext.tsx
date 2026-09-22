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
    //
    // Sur une page dont le contenu tient déjà dans le viewport (ex. Profil,
    // onglet Préférences), le document n'a rien à scroller : scrollTo(0, 1)
    // ne produit alors aucun déplacement réel, donc aucun évènement de
    // scroll, donc aucun repaint (symptôme "ça marche partout sauf sur le
    // profil" remonté sur la carte). On force temporairement 1px de hauteur
    // scrollable en plus pour garantir que le micro-scroll a toujours un
    // effet, quelle que soit la longueur du contenu de la page.
    const isStandalonePwa =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true);
    if (isStandalonePwa) {
      const html = document.documentElement;
      const y = window.scrollY;
      const previousMinHeight = html.style.minHeight;
      // `scroll-behavior: smooth` (global.css) s'applique à window.scrollTo() :
      // sans forcer un déplacement instantané, le micro-scroll est animé au
      // lieu d'être immédiat. Sur une page longue le déplacement partiel
      // avant l'annulation (rAF suivant, ~16ms plus tard) reste assez visible
      // pour déclencher le repaint iOS, mais sur une page courte comme
      // Profil ce court instant ne laisse quasiment aucun déplacement réel
      // se produire avant l'annulation — d'où le symptôme "fonctionne
      // partout sauf sur le profil" qui persistait malgré le forçage de
      // hauteur scrollable. Même pattern que useScrollRestoration.ts pour
      // les étapes intermédiaires d'un scroll multi-étapes.
      //
      // `min-height: calc(100% + 1px)` (round 8) n'a en réalité aucun effet
      // fiable ici : sur l'élément racine <html>, un pourcentage de hauteur
      // se résout par rapport au containing block initial (le viewport) pour
      // la propriété `height`, mais ce cas particulier ne s'étend pas de la
      // façon garantie aux pourcentages de `min-height` — WebKit peut le
      // traiter comme non résolu et l'ignorer purement et simplement. C'est
      // cohérent avec le fait que le round 8 n'ait rien changé sur le
      // profil : la hauteur scrollable forcée n'a en réalité jamais été
      // appliquée, alors que les autres pages fonctionnaient déjà avant ça
      // simplement parce que leur contenu dépasse naturellement le viewport.
      // Remplacé par une valeur en pixels (basée sur innerHeight), qui ne
      // dépend d'aucune résolution de pourcentage et garantit un espace
      // réellement scrollable.
      html.style.minHeight = `${window.innerHeight + 1}px`;
      requestAnimationFrame(() => {
        window.scrollTo({ top: y + 1, behavior: "instant" });
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" });
          html.style.minHeight = previousMinHeight;
        });
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
