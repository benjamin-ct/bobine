import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  } catch {
    return { watched: {}, watchlist: {} };
  }
}

function makeKey(mediaType, id) {
  return `${mediaType}:${id}`;
}

export function LibraryProvider({ children }) {
  const [state, setState] = useState(loadInitialState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      exportData,
      importData,
    }),
    [state, toggleWatched, toggleWatchlist, isWatched, isInWatchlist, exportData, importData]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary doit être utilisé dans un LibraryProvider");
  return ctx;
}

export { makeKey };
