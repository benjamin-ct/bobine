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

// Genres que la personne ne veut jamais voir suggérés (Horreur,
// Documentaire...), cochés une fois pour filtrer Découvrir/Nouveautés/
// Prochainement/Aléatoire et les recommandations d'une fiche. Stockage
// local par défaut (compte anonyme) ; synchronisé par compte pour un
// utilisateur connecté (voir l'effet de synchronisation plus bas), ce
// stockage local servant alors de cache/repli hors connexion — même
// principe que LibraryContext.
const STORAGE_KEY = "bobine.excludedGenres.v1";
const SYNC_DEBOUNCE_MS = 1200;
// Mémorise, par email, si on a déjà fait la fusion initiale local ↔ serveur
// sur CET appareil (voir l'effet de synchronisation plus bas).
const SYNCED_FOR_KEY = "bobine.excludedGenres.syncedFor";

interface ExcludedGenresContextValue {
  excludedGenreIds: number[];
  toggleExcludedGenre: (id: number) => void;
  isExcludedGenre: (id: number) => boolean;
}

const ExcludedGenresContext = createContext<ExcludedGenresContextValue | null>(null);

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

export function ExcludedGenresProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, email } = useAuth();
  const [excludedGenreIds, setExcludedGenreIds] = useState<number[]>(loadInitialIds);
  const isFirstRender = useRef(true);
  // Le pull de synchronisation modifie l'état via setExcludedGenreIds : on
  // met cette ref à true pendant l'opération pour que l'effet de push
  // (plus bas) ne renvoie pas aussitôt au serveur les données qu'on vient
  // de recevoir.
  const syncingRef = useRef(false);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedGenreIds));
    } catch (err) {
      logError("Bobine : impossible de sauvegarder les genres exclus.", err);
    }
  }, [excludedGenreIds]);

  // Synchronisation avec le compte : au moment où l'utilisateur devient
  // authentifié (connexion, ou session déjà active au chargement de la
  // page), on récupère les genres exclus du serveur.
  //  - Première fois sur cet appareil pour ce compte : fusion (union) avec
  //    les genres locaux existants (rien n'est perdu), puis renvoi du
  //    résultat fusionné au serveur.
  //  - Les fois suivantes : le serveur fait autorité (il reflète le
  //    dernier appareil ayant synchronisé), on remplace l'état local.
  useEffect(() => {
    if (authStatus !== "authenticated" || !email) {
      return;
    }
    let cancelled = false;
    syncingRef.current = true;

    fetch("/api/excluded-genres")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("sync failed"))))
      .then((remote: { genreIds?: number[] }) => {
        if (cancelled) {
          return;
        }
        const remoteIds = remote.genreIds || [];
        const alreadySyncedFor = localStorage.getItem(SYNCED_FOR_KEY);
        if (alreadySyncedFor === email) {
          setExcludedGenreIds(remoteIds);
          return null;
        }
        const merged = [...new Set([...excludedGenreIds, ...remoteIds])];
        setExcludedGenreIds(merged);
        localStorage.setItem(SYNCED_FOR_KEY, email);
        return fetch("/api/excluded-genres", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ genreIds: merged }),
        });
      })
      .catch((err) => logWarn("Bobine : synchronisation des genres exclus impossible.", err))
      .finally(() => {
        if (!cancelled) {
          syncingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
    // On ne veut relancer la synchro que quand le statut d'auth ou le
    // compte change, pas à chaque changement de `excludedGenreIds` (sinon
    // boucle).
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
      fetch("/api/excluded-genres", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ genreIds: excludedGenreIds }),
      }).catch((err) =>
        logWarn(
          "Bobine : synchronisation des genres exclus impossible, nouvelle tentative au prochain changement.",
          err
        )
      );
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [excludedGenreIds, authStatus]);

  const toggleExcludedGenre = useCallback((id: number) => {
    setExcludedGenreIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const isExcludedGenre = useCallback(
    (id: number) => excludedGenreIds.includes(id),
    [excludedGenreIds]
  );

  const value = useMemo(
    () => ({ excludedGenreIds, toggleExcludedGenre, isExcludedGenre }),
    [excludedGenreIds, toggleExcludedGenre, isExcludedGenre]
  );

  return <ExcludedGenresContext.Provider value={value}>{children}</ExcludedGenresContext.Provider>;
}

export function useExcludedGenres(): ExcludedGenresContextValue {
  const ctx = useContext(ExcludedGenresContext);
  if (!ctx) {
    throw new Error("useExcludedGenres doit être utilisé dans un ExcludedGenresProvider");
  }
  return ctx;
}
