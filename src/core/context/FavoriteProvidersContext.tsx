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
import { logError } from "../logger.ts";

// Plateformes de streaming que la personne a réellement (Netflix, Disney+...),
// cochées une fois pour filtrer Découvrir/Nouveautés/Aléatoire en un clic
// plutôt que de chercher dans les ~100 entrées du menu déroulant à chaque
// visite. Stockage local uniquement (pas de compte à créer pour ça, et ça
// évite une nouvelle table côté serveur pour un simple réglage — décision
// volontaire) : chaque appareil garde son propre choix, comme un réglage
// de navigateur.
const STORAGE_KEY = "bobine.favoriteProviders.v1";

interface FavoriteProvidersContextValue {
  favoriteProviderIds: number[];
  toggleFavoriteProvider: (id: number) => void;
  isFavoriteProvider: (id: number) => boolean;
}

const FavoriteProvidersContext = createContext<FavoriteProvidersContextValue | null>(null);

function loadInitialIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isFinite(id)) : [];
  } catch {
    return [];
  }
}

export function FavoriteProvidersProvider({ children }: { children: ReactNode }) {
  const [favoriteProviderIds, setFavoriteProviderIds] = useState<number[]>(loadInitialIds);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favoriteProviderIds));
    } catch (err) {
      logError("Bobine : impossible de sauvegarder les plateformes favorites.", err);
    }
  }, [favoriteProviderIds]);

  const toggleFavoriteProvider = useCallback((id: number) => {
    setFavoriteProviderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const isFavoriteProvider = useCallback(
    (id: number) => favoriteProviderIds.includes(id),
    [favoriteProviderIds]
  );

  const value = useMemo(
    () => ({ favoriteProviderIds, toggleFavoriteProvider, isFavoriteProvider }),
    [favoriteProviderIds, toggleFavoriteProvider, isFavoriteProvider]
  );

  return (
    <FavoriteProvidersContext.Provider value={value}>{children}</FavoriteProvidersContext.Provider>
  );
}

export function useFavoriteProviders(): FavoriteProvidersContextValue {
  const ctx = useContext(FavoriteProvidersContext);
  if (!ctx) {
    throw new Error("useFavoriteProviders doit être utilisé dans un FavoriteProvidersProvider");
  }
  return ctx;
}
