import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "bobine.library.v1";

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

export function LibraryProvider({ children }) {
  const [state, setState] = useState(loadInitialState);
  // Évite d'écraser le localStorage dès le premier rendu : on ne persiste
  // qu'à partir du moment où l'état change réellement suite à une action de
  // l'utilisateur (toggle, import...). Sans ça, un simple souci de lecture
  // au chargement (JSON corrompu, quota, etc.) écraserait silencieusement
  // et immédiatement les vraies données par une bibliothèque vide.
  const isFirstRender = useRef(true);

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

  const toggleWatched = useCallback((item) => {
    const key = makeKey(item.mediaType, item.id);
    setState((prev) => {
      const next = { ...prev, watched: { ...prev.watched } };
      if (next.watched[key]) {
        delete next.watched[key];
      } else {
        next.watched[key] = { ...item, addedAt: Date.now() };
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
        next.watchlist[key] = { ...item, addedAt: Date.now() };
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
          [key]: { ...prev.watched[key], rating },
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
          [key]: { ...prev.watched[key], runtimeMinutes },
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
