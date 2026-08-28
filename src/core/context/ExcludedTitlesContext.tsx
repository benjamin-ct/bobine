import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MediaType } from "../types/tmdb.ts";

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// bouton "Exclure ce titre" sur la fiche détail — un titre précis, jamais
// suggéré ailleurs dans l'app (Découvrir/Nouveautés/Prochainement/Aléatoire/
// recommandations). Même principe de stockage que ExcludedGenresContext
// (local uniquement, pas de table serveur pour un simple réglage) : les
// clés sont au format "mediaType:id", identique à LibraryContext.
const STORAGE_KEY = "bobine.excludedTitles.v1";

function makeKey(mediaType: MediaType, id: number | string): string {
  return `${mediaType}:${id}`;
}

interface ExcludedTitlesContextValue {
  excludedTitleKeys: string[];
  toggleExcludedTitle: (mediaType: MediaType, id: number | string) => void;
  isExcludedTitle: (mediaType: MediaType, id: number | string) => boolean;
  /** Filtre un lot de résultats TMDB (id + mediaType déjà connu de
   * l'appelant) — TMDB n'a pas d'équivalent serveur à `without_genres` pour
   * exclure des ids précis, ce filtrage reste donc client. */
  filterExcluded: <T extends { id: number }>(items: T[], mediaType: MediaType) => T[];
}

const ExcludedTitlesContext = createContext<ExcludedTitlesContextValue | null>(null);

function loadInitialKeys(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function ExcludedTitlesProvider({ children }: { children: ReactNode }) {
  const [excludedTitleKeys, setExcludedTitleKeys] = useState<string[]>(loadInitialKeys);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedTitleKeys));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder les titres exclus.", err);
    }
  }, [excludedTitleKeys]);

  const toggleExcludedTitle = useCallback((mediaType: MediaType, id: number | string) => {
    const key = makeKey(mediaType, id);
    setExcludedTitleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const isExcludedTitle = useCallback(
    (mediaType: MediaType, id: number | string) =>
      excludedTitleKeys.includes(makeKey(mediaType, id)),
    [excludedTitleKeys]
  );

  const filterExcluded = useCallback(
    <T extends { id: number }>(items: T[], mediaType: MediaType): T[] => {
      if (excludedTitleKeys.length === 0) {
        return items;
      }
      const excludedSet = new Set(excludedTitleKeys);
      return items.filter((item) => !excludedSet.has(makeKey(mediaType, item.id)));
    },
    [excludedTitleKeys]
  );

  const value = useMemo(
    () => ({ excludedTitleKeys, toggleExcludedTitle, isExcludedTitle, filterExcluded }),
    [excludedTitleKeys, toggleExcludedTitle, isExcludedTitle, filterExcluded]
  );

  return <ExcludedTitlesContext.Provider value={value}>{children}</ExcludedTitlesContext.Provider>;
}

export function useExcludedTitles(): ExcludedTitlesContextValue {
  const ctx = useContext(ExcludedTitlesContext);
  if (!ctx) {
    throw new Error("useExcludedTitles doit être utilisé dans un ExcludedTitlesProvider");
  }
  return ctx;
}
