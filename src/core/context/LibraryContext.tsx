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
import type {
  CustomList,
  CustomListMap,
  DirectorRef,
  LibraryItem,
  LibraryItemInput,
  LibraryItemMap,
  LibraryState,
} from "../types/library.ts";
import type { MediaType } from "../types/tmdb.ts";

const STORAGE_KEY = "bobine.library.v1";
// Mémorise, par email, si on a déjà fait la fusion initiale local ↔ serveur
// sur CET appareil (voir l'effet de synchronisation plus bas).
const SYNCED_FOR_KEY = "bobine.library.syncedFor";
const SYNC_DEBOUNCE_MS = 1200;
// Listes personnalisées ("Soirée avec X", "Halloween"...) — stockage local
// uniquement, comme les plateformes favorites : pas de sync compte pour
// l'instant (décision volontaire). Le pattern de sync incrémental déjà en
// place pour library_items pourrait être répliqué plus tard si besoin.
const CUSTOM_LISTS_STORAGE_KEY = "bobine.customLists.v1";
// NOUVEAU (repris de la maquette HTML) : ordre manuel de "Envie de voir"
// (glisser-déposer). Stockage local uniquement — un ordre d'affichage n'a
// pas vocation à être synchronisé entre appareils au même titre que le
// contenu de la liste elle-même.
const WATCHLIST_ORDER_STORAGE_KEY = "bobine.watchlistOrder.v1";

type PendingOp =
  | {
      action: "upsert";
      mediaType: MediaType;
      id: number;
      status: "watched" | "watchlist";
      item: LibraryItem;
    }
  | { action: "delete"; mediaType: MediaType; id: number };

interface LibraryContextValue {
  watched: LibraryItem[];
  watchlist: LibraryItem[];
  watchedIds: Set<string>;
  toggleWatched: (item: LibraryItemInput) => void;
  toggleWatchlist: (item: LibraryItemInput) => void;
  isWatched: (mediaType: MediaType, id: number | string) => boolean;
  isInWatchlist: (mediaType: MediaType, id: number | string) => boolean;
  getRating: (mediaType: MediaType, id: number | string) => number | null;
  rateWatched: (mediaType: MediaType, id: number | string, rating: number | null) => void;
  setRuntime: (mediaType: MediaType, id: number | string, runtimeMinutes: number) => void;
  setDirectors: (mediaType: MediaType, id: number | string, directors: DirectorRef[]) => void;
  getWatchedEpisodes: (mediaType: MediaType, id: number | string) => Set<string>;
  isEpisodeWatched: (
    mediaType: MediaType,
    id: number | string,
    season: number,
    episode: number
  ) => boolean;
  toggleEpisodeWatched: (item: LibraryItemInput, season: number, episode: number) => void;
  setSeasonEpisodesWatched: (
    item: LibraryItemInput,
    season: number,
    episodeNumbers: number[],
    watched: boolean
  ) => void;
  /** Glisser-déposer dans "Envie de voir" (tri manuel) — voir modules/my-list. */
  reorderWatchlist: (fromKey: string, toKey: string, insertAfter: boolean) => void;
  customLists: CustomList[];
  createList: (name: string) => string | null;
  renameList: (listId: string, name: string) => void;
  deleteList: (listId: string) => void;
  addToList: (listId: string, mediaType: MediaType, id: number | string) => void;
  removeFromList: (listId: string, mediaType: MediaType, id: number | string) => void;
  isInList: (listId: string, mediaType: MediaType, id: number | string) => boolean;
  getListItems: (listId: string) => LibraryItem[];
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

function loadInitialState(): LibraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { watched: {}, watchlist: {} };
    }
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

function makeKey(mediaType: MediaType, id: number | string): string {
  return `${mediaType}:${id}`;
}

function loadInitialCustomLists(): CustomListMap {
  try {
    const raw = localStorage.getItem(CUSTOM_LISTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("Bobine : lecture des listes personnalisées impossible, on repart à vide.", err);
    return {};
  }
}

function loadInitialWatchlistOrder(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function makeListId(): string {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeEpisodeKey(season: number, episode: number): string {
  return `${season}-${episode}`;
}

// Un titre a au plus une entrée (soit "watched", soit "watchlist" — voir
// toggleWatched/toggleWatchlist) : c'est là que vit `watchedEpisodes` s'il
// existe, quelle que soit la liste concernée.
function findShowEntry(
  state: LibraryState,
  mediaType: MediaType,
  id: number | string
): LibraryItem | null {
  const key = makeKey(mediaType, id);
  return state.watched[key] || state.watchlist[key] || null;
}

// Fusionne deux bibliothèques (locale + serveur) : pour chaque titre présent
// des deux côtés, on garde la version la plus récente (updatedAt) ; sinon on
// garde celle qui existe. Utilisé uniquement lors de la toute première
// synchronisation sur un appareil (voir l'effet ci-dessous) — au-delà, le
// serveur fait autorité pour éviter de faire réapparaître des titres
// supprimés ailleurs.
function mergeLists(local: LibraryItemMap, remote: LibraryItemMap): LibraryItemMap {
  const merged: LibraryItemMap = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const a = local[key];
    const b = remote[key];
    if (a && b) {
      merged[key] = (a.updatedAt || a.addedAt || 0) >= (b.updatedAt || b.addedAt || 0) ? a : b;
    } else {
      merged[key] = a || b;
    }
  }
  return merged;
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, email } = useAuth();
  const [state, setState] = useState<LibraryState>(loadInitialState);
  // Évite d'écraser le localStorage dès le premier rendu : on ne persiste
  // qu'à partir du moment où l'état change réellement suite à une action de
  // l'utilisateur (toggle, import...).
  const isFirstRender = useRef(true);
  // Le pull de synchronisation modifie `state` via setState : on met cette
  // ref à true pendant l'opération pour que l'effet de push (plus bas) ne
  // renvoie pas aussitôt au serveur les données qu'on vient de recevoir.
  const syncingRef = useRef(false);
  // File des changements pas encore envoyés au serveur : clé "mediaType:id"
  // -> opération finale à appliquer (upsert avec l'item complet, ou delete).
  const pendingOpsRef = useRef(new Map<string, PendingOp>());
  const [customLists, setCustomLists] = useState<CustomListMap>(loadInitialCustomLists);
  const isFirstCustomListsRender = useRef(true);
  const [watchlistOrder, setWatchlistOrder] = useState<string[]>(loadInitialWatchlistOrder);
  const isFirstWatchlistOrderRender = useRef(true);

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

  useEffect(() => {
    if (isFirstCustomListsRender.current) {
      isFirstCustomListsRender.current = false;
      return;
    }
    try {
      localStorage.setItem(CUSTOM_LISTS_STORAGE_KEY, JSON.stringify(customLists));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder les listes personnalisées.", err);
    }
  }, [customLists]);

  useEffect(() => {
    if (isFirstWatchlistOrderRender.current) {
      isFirstWatchlistOrderRender.current = false;
      return;
    }
    try {
      localStorage.setItem(WATCHLIST_ORDER_STORAGE_KEY, JSON.stringify(watchlistOrder));
    } catch (err) {
      console.error("Bobine : impossible de sauvegarder l'ordre de la liste d'envies.", err);
    }
  }, [watchlistOrder]);

  // Synchronisation avec le compte : au moment où l'utilisateur devient
  // authentifié (connexion, ou session déjà active au chargement de la
  // page), on récupère la bibliothèque du serveur.
  //  - Première fois sur cet appareil pour ce compte : on fusionne avec les
  //    données locales existantes (rien n'est perdu) puis on renvoie le
  //    résultat fusionné au serveur.
  //  - Les fois suivantes : le serveur fait autorité (il reflète le dernier
  //    appareil ayant synchronisé), on remplace l'état local.
  useEffect(() => {
    if (authStatus !== "authenticated" || !email) {
      return;
    }
    let cancelled = false;
    syncingRef.current = true;

    fetch("/api/library")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("sync failed"))))
      .then((remote: LibraryState) => {
        if (cancelled) {
          return;
        }
        const alreadySyncedFor = localStorage.getItem(SYNCED_FOR_KEY);
        if (alreadySyncedFor === email) {
          setState({ watched: remote.watched || {}, watchlist: remote.watchlist || {} });
          pendingOpsRef.current.clear();
          return null;
        }
        // Première synchro sur cet appareil pour ce compte : fusion.
        const merged: LibraryState = {
          watched: mergeLists(state.watched, remote.watched || {}),
          watchlist: mergeLists(state.watchlist, remote.watchlist || {}),
        };
        setState(merged);
        pendingOpsRef.current.clear(); // le PUT complet ci-dessous couvre déjà tout `merged`
        localStorage.setItem(SYNCED_FOR_KEY, email);
        return fetch("/api/library", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(merged),
        });
      })
      .catch((err) => console.warn("Bobine : synchronisation de la bibliothèque impossible.", err))
      .finally(() => {
        if (!cancelled) {
          syncingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
    };
    // On ne veut relancer la synchro que quand le statut d'auth ou le
    // compte change, pas à chaque changement de `state` (sinon boucle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, email]);

  // Envoie au serveur uniquement ce qui a changé depuis le dernier envoi
  // (voir pendingOpsRef), avec un léger anti-rebond pour regrouper les
  // actions rapprochées (ex. "tout marquer vu" sur une saison) en un seul
  // appel plutôt qu'un par item.
  useEffect(() => {
    if (authStatus !== "authenticated" || syncingRef.current) {
      return;
    }
    const timeoutId = setTimeout(() => {
      if (pendingOpsRef.current.size === 0) {
        return;
      }
      const opsSnapshot = new Map(pendingOpsRef.current);
      const upserts: Array<{
        mediaType: MediaType;
        id: number;
        status: string;
        item: LibraryItem;
      }> = [];
      const deletes: Array<{ mediaType: MediaType; id: number }> = [];
      for (const op of opsSnapshot.values()) {
        if (op.action === "upsert") {
          upserts.push({ mediaType: op.mediaType, id: op.id, status: op.status, item: op.item });
        } else {
          deletes.push({ mediaType: op.mediaType, id: op.id });
        }
      }
      fetch("/api/library/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upserts, deletes }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("sync failed");
          }
          // Ne retire que ce qui vient d'être envoyé ET n'a pas été modifié
          // entre-temps (comparaison par référence) : une nouvelle action
          // survenue pendant que la requête était en vol ne doit pas être
          // perdue, elle reste en file pour le prochain envoi.
          for (const [key, op] of opsSnapshot) {
            if (pendingOpsRef.current.get(key) === op) {
              pendingOpsRef.current.delete(key);
            }
          }
        })
        .catch((err) =>
          console.warn(
            "Bobine : synchronisation incrémentale impossible, nouvelle tentative au prochain changement.",
            err
          )
        );
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state, authStatus]);

  const toggleWatched = useCallback((item: LibraryItemInput) => {
    const key = makeKey(item.mediaType, item.id);
    setState((prev) => {
      const next = { ...prev, watched: { ...prev.watched } };
      if (next.watched[key]) {
        delete next.watched[key];
        pendingOpsRef.current.set(key, {
          action: "delete",
          mediaType: item.mediaType,
          id: item.id,
        });
      } else {
        // On repasse "vu" un titre déjà présent dans la liste à voir : on
        // conserve la note/réalisateurs/épisodes déjà connus plutôt que de
        // repartir d'un item vierge (cf. bug #14 : la note disparaissait
        // silencieusement lors d'un aller-retour Vu ↔ Envie de voir).
        const existing = next.watchlist[key];
        const newItem: LibraryItem = {
          ...existing,
          ...item,
          addedAt: existing?.addedAt ?? Date.now(),
          updatedAt: Date.now(),
        };
        next.watched[key] = newItem;
        // Un film vu n'a plus besoin d'être dans la liste à voir.
        if (next.watchlist[key]) {
          next.watchlist = { ...next.watchlist };
          delete next.watchlist[key];
        }
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType: item.mediaType,
          id: item.id,
          status: "watched",
          item: newItem,
        });
      }
      return next;
    });
    setWatchlistOrder((prev) => prev.filter((k) => k !== key));
  }, []);

  const toggleWatchlist = useCallback((item: LibraryItemInput) => {
    const key = makeKey(item.mediaType, item.id);
    let added = false;
    setState((prev) => {
      const next = { ...prev, watchlist: { ...prev.watchlist } };
      if (next.watchlist[key]) {
        delete next.watchlist[key];
        pendingOpsRef.current.set(key, {
          action: "delete",
          mediaType: item.mediaType,
          id: item.id,
        });
      } else {
        added = true;
        // Symétrique à toggleWatched : on conserve la note/réalisateurs déjà
        // connus si le titre était marqué "vu", et on le retire de "vu"
        // puisqu'un titre ne doit être que dans une seule des deux listes.
        const existing = next.watched[key];
        const newItem: LibraryItem = {
          ...existing,
          ...item,
          addedAt: existing?.addedAt ?? Date.now(),
          updatedAt: Date.now(),
        };
        next.watchlist[key] = newItem;
        // Un titre "envie de voir" ne doit pas rester marqué "vu" en
        // parallèle (les deux listes doivent rester mutuellement exclusives).
        if (next.watched[key]) {
          next.watched = { ...next.watched };
          delete next.watched[key];
        }
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType: item.mediaType,
          id: item.id,
          status: "watchlist",
          item: newItem,
        });
      }
      return next;
    });
    setWatchlistOrder((prev) =>
      added ? [key, ...prev.filter((k) => k !== key)] : prev.filter((k) => k !== key)
    );
  }, []);

  const isWatched = useCallback(
    (mediaType: MediaType, id: number | string) => Boolean(state.watched[makeKey(mediaType, id)]),
    [state.watched]
  );
  const isInWatchlist = useCallback(
    (mediaType: MediaType, id: number | string) => Boolean(state.watchlist[makeKey(mediaType, id)]),
    [state.watchlist]
  );
  const getRating = useCallback(
    (mediaType: MediaType, id: number | string) =>
      state.watched[makeKey(mediaType, id)]?.rating ?? null,
    [state.watched]
  );

  // Note sur 10, uniquement pour un titre déjà marqué comme vu.
  const rateWatched = useCallback(
    (mediaType: MediaType, id: number | string, rating: number | null) => {
      const key = makeKey(mediaType, id);
      setState((prev) => {
        if (!prev.watched[key]) {
          return prev;
        }
        const updated: LibraryItem = { ...prev.watched[key], rating, updatedAt: Date.now() };
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType,
          id: Number(id),
          status: "watched",
          item: updated,
        });
        return { ...prev, watched: { ...prev.watched, [key]: updated } };
      });
    },
    []
  );

  // Complète après coup la durée d'un titre déjà marqué vu (cf. Stats), pour
  // les cas où elle n'était pas connue au moment du toggle.
  const setRuntime = useCallback(
    (mediaType: MediaType, id: number | string, runtimeMinutes: number) => {
      const key = makeKey(mediaType, id);
      setState((prev) => {
        if (!prev.watched[key] || prev.watched[key].runtimeMinutes != null) {
          return prev;
        }
        const updated: LibraryItem = {
          ...prev.watched[key],
          runtimeMinutes,
          updatedAt: Date.now(),
        };
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType,
          id: Number(id),
          status: "watched",
          item: updated,
        });
        return { ...prev, watched: { ...prev.watched, [key]: updated } };
      });
    },
    []
  );

  // Complète après coup le·s réalisateur·rice·s/créateur·rice·s d'un titre
  // déjà marqué vu (cf. Stats, "réalisateurs récurrents"), pour les cas où
  // ce n'était pas connu au moment du toggle — remplissage progressif.
  const setDirectors = useCallback(
    (mediaType: MediaType, id: number | string, directors: DirectorRef[]) => {
      const key = makeKey(mediaType, id);
      setState((prev) => {
        if (!prev.watched[key] || prev.watched[key].directors?.length) {
          return prev;
        }
        const updated: LibraryItem = { ...prev.watched[key], directors, updatedAt: Date.now() };
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType,
          id: Number(id),
          status: "watched",
          item: updated,
        });
        return { ...prev, watched: { ...prev.watched, [key]: updated } };
      });
    },
    []
  );

  // Suivi épisode par épisode (séries uniquement). L'entrée du titre est
  // cherchée dans watched puis watchlist (voir findShowEntry) ; si aucune
  // des deux n'existe encore (rien coché sur la fiche), on en crée une dans
  // watchlist — cocher un épisode revient à dire "je suis en train de
  // regarder ça", ce qui est plus proche d'"envie de voir" que de "déjà vu"
  // pour la série entière.
  const getWatchedEpisodes = useCallback(
    (mediaType: MediaType, id: number | string) =>
      new Set(findShowEntry(state, mediaType, id)?.watchedEpisodes || []),
    [state]
  );

  const isEpisodeWatched = useCallback(
    (mediaType: MediaType, id: number | string, season: number, episode: number) =>
      Boolean(
        findShowEntry(state, mediaType, id)?.watchedEpisodes?.includes(
          makeEpisodeKey(season, episode)
        )
      ),
    [state]
  );

  const toggleEpisodeWatched = useCallback(
    (item: LibraryItemInput, season: number, episode: number) => {
      const key = makeKey(item.mediaType, item.id);
      const epKey = makeEpisodeKey(season, episode);
      setState((prev) => {
        const listName: "watched" | "watchlist" = prev.watched[key] ? "watched" : "watchlist";
        const existing: LibraryItem = prev[listName][key] || {
          ...item,
          addedAt: Date.now(),
          updatedAt: Date.now(),
        };
        const nextEpisodes = new Set(existing.watchedEpisodes || []);
        if (nextEpisodes.has(epKey)) {
          nextEpisodes.delete(epKey);
        } else {
          nextEpisodes.add(epKey);
        }
        const updated: LibraryItem = {
          ...existing,
          watchedEpisodes: Array.from(nextEpisodes),
          updatedAt: Date.now(),
        };
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType: item.mediaType,
          id: item.id,
          status: listName,
          item: updated,
        });
        return { ...prev, [listName]: { ...prev[listName], [key]: updated } };
      });
    },
    []
  );

  // Coche/décoche toute une saison d'un coup (bouton "Tout marquer comme vu").
  const setSeasonEpisodesWatched = useCallback(
    (item: LibraryItemInput, season: number, episodeNumbers: number[], watched: boolean) => {
      const key = makeKey(item.mediaType, item.id);
      setState((prev) => {
        const listName: "watched" | "watchlist" = prev.watched[key] ? "watched" : "watchlist";
        const existing: LibraryItem = prev[listName][key] || {
          ...item,
          addedAt: Date.now(),
          updatedAt: Date.now(),
        };
        const nextEpisodes = new Set(existing.watchedEpisodes || []);
        for (const episode of episodeNumbers) {
          const epKey = makeEpisodeKey(season, episode);
          if (watched) {
            nextEpisodes.add(epKey);
          } else {
            nextEpisodes.delete(epKey);
          }
        }
        const updated: LibraryItem = {
          ...existing,
          watchedEpisodes: Array.from(nextEpisodes),
          updatedAt: Date.now(),
        };
        pendingOpsRef.current.set(key, {
          action: "upsert",
          mediaType: item.mediaType,
          id: item.id,
          status: listName,
          item: updated,
        });
        return { ...prev, [listName]: { ...prev[listName], [key]: updated } };
      });
    },
    []
  );

  // Glisser-déposer dans "Envie de voir" : déplace `fromKey` juste avant ou
  // après `toKey` dans l'ordre manuel affiché.
  const reorderWatchlist = useCallback((fromKey: string, toKey: string, insertAfter: boolean) => {
    setWatchlistOrder((prev) => {
      const base = prev.includes(fromKey) ? prev : [fromKey, ...prev];
      const withoutFrom = base.filter((k) => k !== fromKey);
      let targetIndex = withoutFrom.indexOf(toKey);
      if (targetIndex < 0) {
        targetIndex = withoutFrom.length;
      }
      const insertAt = insertAfter ? targetIndex + 1 : targetIndex;
      const next = [...withoutFrom];
      next.splice(insertAt, 0, fromKey);
      return next;
    });
  }, []);

  // Listes personnalisées ------------------------------------------------

  const createList = useCallback((name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const id = makeListId();
    setCustomLists((prev) => ({
      ...prev,
      [id]: { id, name: trimmed, itemKeys: [], createdAt: Date.now() },
    }));
    return id;
  }, []);

  const renameList = useCallback((listId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setCustomLists((prev) =>
      prev[listId] ? { ...prev, [listId]: { ...prev[listId], name: trimmed } } : prev
    );
  }, []);

  const deleteList = useCallback((listId: string) => {
    setCustomLists((prev) => {
      if (!prev[listId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[listId];
      return next;
    });
  }, []);

  const addToList = useCallback((listId: string, mediaType: MediaType, id: number | string) => {
    const key = makeKey(mediaType, id);
    setCustomLists((prev) => {
      const list = prev[listId];
      if (!list || list.itemKeys.includes(key)) {
        return prev;
      }
      return { ...prev, [listId]: { ...list, itemKeys: [...list.itemKeys, key] } };
    });
  }, []);

  const removeFromList = useCallback(
    (listId: string, mediaType: MediaType, id: number | string) => {
      const key = makeKey(mediaType, id);
      setCustomLists((prev) => {
        const list = prev[listId];
        if (!list) {
          return prev;
        }
        return { ...prev, [listId]: { ...list, itemKeys: list.itemKeys.filter((k) => k !== key) } };
      });
    },
    []
  );

  const isInList = useCallback(
    (listId: string, mediaType: MediaType, id: number | string) =>
      Boolean(customLists[listId]?.itemKeys.includes(makeKey(mediaType, id))),
    [customLists]
  );

  // Résout itemKeys en objets complets depuis watched/watchlist — une clé
  // dont l'item a depuis été retiré des deux (ex: décoché "Envie de voir"
  // ET jamais marqué vu) est simplement omise plutôt que de laisser un état
  // incohérent à gérer explicitement ailleurs.
  const getListItems = useCallback(
    (listId: string): LibraryItem[] =>
      (customLists[listId]?.itemKeys || [])
        .map((key) => state.watched[key] || state.watchlist[key])
        .filter((item): item is LibraryItem => Boolean(item)),
    [customLists, state]
  );

  const customListsArray = useMemo(
    () => Object.values(customLists).sort((a, b) => a.createdAt - b.createdAt),
    [customLists]
  );

  const orderedWatchlist = useMemo(() => {
    const items = Object.values(state.watchlist);
    const orderIndex = new Map(watchlistOrder.map((key, i) => [key, i]));
    return items.slice().sort((a, b) => {
      const keyA = makeKey(a.mediaType, a.id);
      const keyB = makeKey(b.mediaType, b.id);
      const ia = orderIndex.has(keyA) ? orderIndex.get(keyA)! : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(keyB) ? orderIndex.get(keyB)! : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) {
        return ia - ib;
      }
      // Repli pour deux items jamais présents dans l'ordre manuel (ex.
      // fusion serveur) : les plus récemment ajoutés d'abord.
      return b.addedAt - a.addedAt;
    });
  }, [state.watchlist, watchlistOrder]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      watched: Object.values(state.watched).sort((a, b) => b.addedAt - a.addedAt),
      watchlist: orderedWatchlist,
      watchedIds: new Set(Object.keys(state.watched)),
      toggleWatched,
      toggleWatchlist,
      isWatched,
      isInWatchlist,
      getRating,
      rateWatched,
      setRuntime,
      setDirectors,
      getWatchedEpisodes,
      isEpisodeWatched,
      toggleEpisodeWatched,
      setSeasonEpisodesWatched,
      reorderWatchlist,
      customLists: customListsArray,
      createList,
      renameList,
      deleteList,
      addToList,
      removeFromList,
      isInList,
      getListItems,
    }),
    [
      state,
      orderedWatchlist,
      toggleWatched,
      toggleWatchlist,
      isWatched,
      isInWatchlist,
      getRating,
      rateWatched,
      setRuntime,
      setDirectors,
      getWatchedEpisodes,
      isEpisodeWatched,
      toggleEpisodeWatched,
      setSeasonEpisodesWatched,
      reorderWatchlist,
      customListsArray,
      createList,
      renameList,
      deleteList,
      addToList,
      removeFromList,
      isInList,
      getListItems,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary doit être utilisé dans un LibraryProvider");
  }
  return ctx;
}

export { makeKey };
