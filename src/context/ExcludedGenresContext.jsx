import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Genres que la personne ne veut jamais voir suggérés (Horreur,
// Documentaire...), cochés une fois pour filtrer Découvrir/Nouveautés/
// Prochainement/Aléatoire et les recommandations d'une fiche. Même
// principe que FavoriteProvidersContext : stockage local uniquement (pas
// de compte, pas de nouvelle table côté serveur pour un simple réglage —
// décision volontaire), chaque appareil garde son propre choix.
const STORAGE_KEY = "bobine.excludedGenres.v1";

const ExcludedGenresContext = createContext(null);

function loadInitialIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isFinite(id)) : [];
  } catch {
    return [];
  }
}

export function ExcludedGenresProvider({ children }) {
  const [excludedGenreIds, setExcludedGenreIds] = useState(loadInitialIds);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedGenreIds));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder les genres exclus.", err);
    }
  }, [excludedGenreIds]);

  const toggleExcludedGenre = useCallback((id) => {
    setExcludedGenreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const isExcludedGenre = useCallback((id) => excludedGenreIds.includes(id), [excludedGenreIds]);

  const value = useMemo(
    () => ({ excludedGenreIds, toggleExcludedGenre, isExcludedGenre }),
    [excludedGenreIds, toggleExcludedGenre, isExcludedGenre]
  );

  return <ExcludedGenresContext.Provider value={value}>{children}</ExcludedGenresContext.Provider>;
}

export function useExcludedGenres() {
  const ctx = useContext(ExcludedGenresContext);
  if (!ctx) throw new Error("useExcludedGenres doit être utilisé dans un ExcludedGenresProvider");
  return ctx;
}
