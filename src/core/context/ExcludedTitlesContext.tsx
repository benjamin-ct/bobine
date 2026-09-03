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
import { logError } from "../logger.ts";

// NOUVEAU (repris de la maquette HTML, absent du Projet A avant migration) :
// bouton "Exclure ce titre" sur la fiche détail — un titre précis, jamais
// suggéré ailleurs dans l'app (Découvrir/Nouveautés/Prochainement/Aléatoire/
// recommandations). Même principe de stockage que ExcludedGenresContext
// (local uniquement, pas de table serveur pour un simple réglage) : les
// clés sont au format "mediaType:id", identique à LibraryContext.
const STORAGE_KEY = "bobine.excludedTitles.v1";
// Libellé lisible ("Titre (année)") capturé au moment de l'exclusion, pour
// l'affichage dans Profil sans dépendre de la bibliothèque locale (déjà vu /
// envie de voir) ni d'un appel réseau dédié — clé stockée séparément plutôt
// que fusionnée dans STORAGE_KEY pour ne pas casser le format déjà persisté
// chez les utilisateurs existants.
const LABELS_STORAGE_KEY = "bobine.excludedTitles.labels.v1";

function makeKey(mediaType: MediaType, id: number | string): string {
  return `${mediaType}:${id}`;
}

interface ExcludedTitlesContextValue {
  excludedTitleKeys: string[];
  /** Libellé lisible par clé ("mediaType:id" → "Titre (année)"), pour les
   * titres exclus depuis l'introduction de cette fonctionnalité — absent
   * pour les exclusions antérieures. */
  excludedTitleLabels: Record<string, string>;
  toggleExcludedTitle: (mediaType: MediaType, id: number | string, label?: string) => void;
  /** Complète le libellé d'un titre déjà exclu quand il vient d'être résolu
   * par appel réseau (voir ExcludedTitlesSettings) — pour ne plus avoir à
   * refaire cet appel au prochain chargement du panneau sur cet appareil. */
  cacheExcludedTitleLabel: (mediaType: MediaType, id: number | string, label: string) => void;
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

function loadInitialLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LABELS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function ExcludedTitlesProvider({ children }: { children: ReactNode }) {
  const [excludedTitleKeys, setExcludedTitleKeys] = useState<string[]>(loadInitialKeys);
  const [excludedTitleLabels, setExcludedTitleLabels] =
    useState<Record<string, string>>(loadInitialLabels);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedTitleKeys));
    } catch (err) {
      logError("Bobine : impossible de sauvegarder les titres exclus.", err);
    }
  }, [excludedTitleKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(excludedTitleLabels));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder les libellés des titres exclus.", err);
    }
  }, [excludedTitleLabels]);

  const toggleExcludedTitle = useCallback(
    (mediaType: MediaType, id: number | string, label?: string) => {
      const key = makeKey(mediaType, id);
      const willExclude = !excludedTitleKeys.includes(key);
      setExcludedTitleKeys((prev) =>
        willExclude ? [...prev, key] : prev.filter((k) => k !== key)
      );
      setExcludedTitleLabels((prev) => {
        if (!willExclude) {
          const { [key]: _removed, ...rest } = prev;
          return rest;
        }
        return label ? { ...prev, [key]: label } : prev;
      });
    },
    [excludedTitleKeys]
  );

  const cacheExcludedTitleLabel = useCallback(
    (mediaType: MediaType, id: number | string, label: string) => {
      const key = makeKey(mediaType, id);
      setExcludedTitleLabels((prev) => (prev[key] === label ? prev : { ...prev, [key]: label }));
    },
    []
  );

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
    () => ({
      excludedTitleKeys,
      excludedTitleLabels,
      toggleExcludedTitle,
      cacheExcludedTitleLabel,
      isExcludedTitle,
      filterExcluded,
    }),
    [
      excludedTitleKeys,
      excludedTitleLabels,
      toggleExcludedTitle,
      cacheExcludedTitleLabel,
      isExcludedTitle,
      filterExcluded,
    ]
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
