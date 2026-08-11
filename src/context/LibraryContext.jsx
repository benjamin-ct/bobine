import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "bobine.library.v1";
// Mémorise, par email, si on a déjà fait la fusion initiale local ↔ serveur
// sur CET appareil (voir l'effet de synchronisation plus bas).
const SYNCED_FOR_KEY = "bobine.library.syncedFor";
const SYNC_DEBOUNCE_MS = 1200;

const LibraryContext = createContext(null);

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { watched: {}, watchlist: {} };
    const parsed = JSON.parse(raw);
    return {
      watched: parsed.watched || {},
      watchlist: parsed.watchlist || {},
    };
  } catch (err) {
    // Le contenu stocké n'est pas du JSON valide (écriture interrompue,
    // corruption...). On repart sur une bibliothèque vide MAIS on se garde
    // bien d'écraser tout de suite localStorage avec cet état vide (voir
    // l'effet ci-dessous) : si les vraies données sont encore là sous une
    // forme récupérable, mieux vaut ne pas les perdre définitivement.
    console.warn("Bobine : lecture de la bibliothèque locale impossible, on repart à vide.", err);
    return { watched: {}, watchlist: {} };
  }
}

function makeKey(mediaType, id) {
  return `${mediaType}:${id}`;
}

// Fusionne deux bibliothèques (locale + serveur) : pour chaque titre présent
// des deux côtés, on garde la version la plus récente (updatedAt) ; sinon on
// garde celle qui existe. Utilisé uniquement lors de la toute première
// synchronisation sur un appareil (voir l'effet ci-dessous) — au-delà, le
// serveur fait autorité pour éviter de faire réapparaître des titres
// supprimés ailleurs.
function mergeLists(local, remote) {
  const merged = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const a = local[key];
    const b = remote[key];
    if (a && b) merged[key] = (a.updatedAt || a.addedAt || 0) >= (b.updatedAt || b.addedAt || 0) ? a : b;
    else merged[key] = a || b;
  }
  return merged;
}

export function LibraryProvider({ children }) {
  const { status: authStatus, email } = useAuth();
  const [state, setState] = useState(loadInitialState);
  // Évite d'écraser le localStorage dès le premier rendu : on ne persiste
  // qu'à partir du moment où l'état change réellement suite à une action de
  // l'utilisateur (toggle, import...). Sans ça, un simple souci de lecture
  // au chargement (JSON corrompu, quota, etc.) écraserait silencieusement
  // et immédiatement les vraies données par une bibliothèque vide.
  const isFirstRender = useRef(true);
  // Le pull de synchronisation modifie `state` via setState : on met cette
  // ref à true pendant l'opération pour que l'effet de push (plus bas) ne
  // renvoie pas aussitôt au serveur les données qu'on vient de recevoir.
  const syncingRef = useRef(false);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder la bibliothèque locale.", err);
    }
  }, [state]);

  // Synchronisation avec le compte : au moment où l'utilisateur devient
  // authentifié (connexion, ou session déjà active au chargement de la
  // page), on récupère la bibliothèque du serveur.
  //  - Première fois sur cet appareil pour ce compte : on fusionne avec les
  //    données locales existantes (rien n'est perdu) puis on renvoie le
  //    résultat fusionné au serveur.
  //  - Les fois suivantes : le serveur fait autorité (il reflète le dernier
  //    appareil ayant synchronisé), on remplace l'état local.
  useEffect(() => {
    if (authStatus !== "authenticated" || !email) return;
    let cancelled = false;
    syncingRef.current = true;

    fetch("/api/library")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("sync failed"))))
      .then((remote) => {
        if (cancelled) return;
        const alreadySyncedFor = localStorage.getItem(SYNCED_FOR_KEY);
        if (alreadySyncedFor === email) {
          setState({ watched: remote.watched || {}, watchlist: remote.watchlist || {} });
          return null;
        }
        // Première synchro sur cet appareil pour ce compte : fusion.
        const merged = {
          watched: mergeLists(state.watched, remote.watched || {}),
          watchlist: mergeLists(state.watchlist, remote.watchlist || {}),
        };
        setState(merged);
        localStorage.setItem(SYNCED_FOR_KEY, email);
        return fetch("/api/library", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(merged),
        });
      })
      .catch((err) => console.warn("Bobine : synchronisation de la bibliothèque impossible.", err))
      .finally(() => {
        if (!cancelled) syncingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
    // On ne veut relancer la synchro que quand le statut d'auth ou le
    // compte change, pas à chaque changement de `state` (sinon boucle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, email]);

  // Renvoie l'état complet au serveur à chaque changement, une fois connecté
  // (avec un léger anti-rebond pour ne pas spammer l'API à chaque clic).
  useEffect(() => {
    if (authStatus !== "authenticated" || syncingRef.current) return;
    const timeoutId = setTimeout(() => {
      fetch("/api/library", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      }).catch((err) => console.warn("Bobine : envoi de la bibliothèque au serveur impossible.", err));
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state, authStatus]);

  const toggleWatched = useCallback((item) => {
    const key = makeKey(item.mediaType, item.id);
    setState((prev) => {
      const next = { ...prev, watched: { ...prev.watched } };
      if (next.watched[key]) {
        delete next.watched[key];
      } else {
        next.watched[key] = { ...item, addedAt: Date.now(), updatedAt: Date.now() };
        // Un film vu n'a plus besoin d'être dans la liste à voir.
        if (next.watchlist[key]) {
          next.watchlist = { ...next.watchlist };
          delete next.watchlist[key];
        }
      }
      return next;
    });
  }, []);

  const toggleWatchlist = useCallback((item) => {
    const key = makeKey(item.mediaType, item.id);
    setState((prev) => {
      const next = { ...prev, watchlist: { ...prev.watchlist } };
      if (next.watchlist[key]) {
        delete next.watchlist[key];
      } else {
        next.watchlist[key] = { ...item, addedAt: Date.now(), updatedAt: Date.now() };
      }
      return next;
    });
  }, []);

  const isWatched = useCallback((mediaType, id) => Boolean(state.watched[makeKey(mediaType, id)]), [state.watched]);
  const isInWatchlist = useCallback((mediaType, id) => Boolean(state.watchlist[makeKey(mediaType, id)]), [state.watchlist]);
  const getRating = useCallback((mediaType, id) => state.watched[makeKey(mediaType, id)]?.rating ?? null, [state.watched]);

  // Note sur 10, uniquement pour un titre déjà marqué comme vu.
  const rateWatched = useCallback((mediaType, id, rating) => {
    const key = makeKey(mediaType, id);
    setState((prev) => {
      if (!prev.watched[key]) return prev;
      return {
        ...prev,
        watched: {
          ...prev.watched,
          [key]: { ...prev.watched[key], rating, updatedAt: Date.now() },
        },
      };
    });
  }, []);

  // Complète après coup la durée d'un titre déjà marqué vu (cf. Stats.jsx),
  // pour les cas où elle n'était pas connue au moment du toggle.
  const setRuntime = useCallback((mediaType, id, runtimeMinutes) => {
    const key = makeKey(mediaType, id);
    setState((prev) => {
      if (!prev.watched[key] || prev.watched[key].runtimeMinutes != null) return prev;
      return {
        ...prev,
        watched: {
          ...prev.watched,
          [key]: { ...prev.watched[key], runtimeMinutes, updatedAt: Date.now() },
        },
      };
    });
  }, []);

  // Sérialise toute la bibliothèque (vu + envies) pour la sauvegarder ou la partager.
  const exportData = useCallback(
    () => JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2),
    [state]
  );

  // Fusionne des données importées avec la bibliothèque actuelle (ne remplace jamais silencieusement).
  const importData = useCallback((jsonString) => {
    const parsed = JSON.parse(jsonString);
    const incomingWatched = parsed.watched || {};
    const incomingWatchlist = parsed.watchlist || {};
    setState((prev) => ({
      watched: { ...prev.watched, ...incomingWatched },
      watchlist: { ...prev.watchlist, ...incomingWatchlist },
    }));
    return {
      watchedCount: Object.keys(incomingWatched).length,
      watchlistCount: Object.keys(incomingWatchlist).length,
    };
  }, []);

  const value = useMemo(
    () => ({
      watched: Object.values(state.watched).sort((a, b) => b.addedAt - a.addedAt),
      watchlist: Object.values(state.watchlist).sort((a, b) => b.addedAt - a.addedAt),
      watchedIds: new Set(Object.keys(state.watched)),
      toggleWatched,
      toggleWatchlist,
      isWatched,
      isInWatchlist,
      getRating,
      rateWatched,
      setRuntime,
      exportData,
      importData,
    }),
    [state, toggleWatched, toggleWatchlist, isWatched, isInWatchlist, getRating, rateWatched, setRuntime, exportData, importData]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary doit être utilisé dans un LibraryProvider");
  return ctx;
}

export { makeKey };
