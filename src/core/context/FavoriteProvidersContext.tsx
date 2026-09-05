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
import { useAuth } from "./AuthContext.tsx";
import { logError, logWarn } from "../logger.ts";

// Plateformes de streaming que la personne a réellement (Netflix, Disney+...),
// cochées une fois pour filtrer Découvrir/Nouveautés/Aléatoire en un clic
// plutôt que de chercher dans les ~100 entrées du menu déroulant à chaque
// visite. Stockage local par défaut (compte anonyme) ; synchronisé par
// compte pour un utilisateur connecté (voir l'effet de synchronisation plus
// bas), ce stockage local servant alors de cache/repli hors connexion —
// même principe que LibraryContext.
const STORAGE_KEY = "bobine.favoriteProviders.v1";
const SYNC_DEBOUNCE_MS = 1200;
// Mémorise, par email, si on a déjà fait la fusion initiale local ↔ serveur
// sur CET appareil (voir l'effet de synchronisation plus bas).
const SYNCED_FOR_KEY = "bobine.favoriteProviders.syncedFor";

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
  const { status: authStatus, email } = useAuth();
  const [favoriteProviderIds, setFavoriteProviderIds] = useState<number[]>(loadInitialIds);
  const isFirstRender = useRef(true);
  // Le pull de synchronisation modifie l'état via setFavoriteProviderIds :
  // on met cette ref à true pendant l'opération pour que l'effet de push
  // (plus bas) ne renvoie pas aussitôt au serveur les données qu'on vient
  // de recevoir.
  const syncingRef = useRef(false);

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

  // Synchronisation avec le compte : au moment où l'utilisateur devient
  // authentifié (connexion, ou session déjà active au chargement de la
  // page), on récupère les plateformes favorites du serveur.
  //  - Première fois sur cet appareil pour ce compte : fusion (union) avec
  //    les plateformes locales existantes (rien n'est perdu), puis renvoi
  //    du résultat fusionné au serveur.
  //  - Les fois suivantes : le serveur fait autorité (il reflète le
  //    dernier appareil ayant synchronisé), on remplace l'état local.
  useEffect(() => {
    if (authStatus !== "authenticated" || !email) {
      return;
    }
    let cancelled = false;
    syncingRef.current = true;

    fetch("/api/favorite-providers")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("sync failed"))))
      .then((remote: { providerIds?: number[] }) => {
        if (cancelled) {
          return;
        }
        const remoteIds = remote.providerIds || [];
        const alreadySyncedFor = localStorage.getItem(SYNCED_FOR_KEY);
        if (alreadySyncedFor === email) {
          setFavoriteProviderIds(remoteIds);
          return null;
        }
        const merged = [...new Set([...favoriteProviderIds, ...remoteIds])];
        setFavoriteProviderIds(merged);
        localStorage.setItem(SYNCED_FOR_KEY, email);
        return fetch("/api/favorite-providers", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerIds: merged }),
        });
      })
      .catch((err) =>
        logWarn("Bobine : synchronisation des plateformes favorites impossible.", err)
      )
      .finally(() => {
        if (!cancelled) {
          syncingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
    // On ne veut relancer la synchro que quand le statut d'auth ou le
    // compte change, pas à chaque changement de `favoriteProviderIds`
    // (sinon boucle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, email]);

  // Envoie l'état complet au serveur à chaque changement, avec anti-rebond
  // (même principe que LibraryContext) — pas de synchronisation
  // incrémentale ici, ce réglage ne comporte jamais assez d'entrées pour
  // qu'un diff apporte quoi que ce soit.
  useEffect(() => {
    if (authStatus !== "authenticated" || syncingRef.current) {
      return;
    }
    const timeoutId = setTimeout(() => {
      fetch("/api/favorite-providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerIds: favoriteProviderIds }),
      }).catch((err) =>
        logWarn(
          "Bobine : synchronisation des plateformes favorites impossible, nouvelle tentative au prochain changement.",
          err
        )
      );
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [favoriteProviderIds, authStatus]);

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
