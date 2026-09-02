import { useEffect, useRef, useState } from "react";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { logError } from "../../../core/logger.ts";
import type { LibraryItem } from "../../../core/types/library.ts";
import type { MediaType } from "../../../core/types/tmdb.ts";
import styles from "./NotificationSettings.module.css";

const ENDPOINT_STORAGE_KEY = "bobine.push.endpoint";
const TOP_GENRES_FOR_NOTIFICATIONS = 8;

interface FavoriteGenre {
  mediaType: MediaType;
  genreId: number;
}

interface WatchlistPayloadItem {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function computeFavoriteGenres(watched: LibraryItem[]): FavoriteGenre[] {
  const counts = new Map<string, number>();
  for (const item of watched) {
    for (const genreId of item.genreIds || []) {
      const key = `${item.mediaType}:${genreId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES_FOR_NOTIFICATIONS)
    .map(([key]) => {
      const [mediaType, genreId] = key.split(":");
      return { mediaType: mediaType as MediaType, genreId: Number(genreId) };
    });
}

function toWatchlistPayload(item: LibraryItem): WatchlistPayloadItem {
  return {
    mediaType: item.mediaType,
    tmdbId: item.id,
    title: item.title,
    posterPath: item.posterPath,
  };
}

async function fullSyncSubscription(
  endpoint: string,
  keys: PushSubscriptionJSON["keys"],
  watchlist: LibraryItem[],
  watched: LibraryItem[]
): Promise<void> {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint,
      keys,
      watchlist: watchlist.map(toWatchlistPayload),
      favoriteGenres: computeFavoriteGenres(watched),
    }),
  });
  if (!res.ok) {
    throw new Error(`Synchronisation échouée (${res.status})`);
  }
}

interface SyncedState {
  watchlistKeys: Set<string>;
  genreKeys: Set<string>;
}

function keysOf(watchlist: LibraryItem[], watched: LibraryItem[]): SyncedState {
  return {
    watchlistKeys: new Set(watchlist.map((item) => `${item.mediaType}:${item.id}`)),
    genreKeys: new Set(computeFavoriteGenres(watched).map((g) => `${g.mediaType}:${g.genreId}`)),
  };
}

async function syncSubscriptionDelta(
  endpoint: string,
  watchlist: LibraryItem[],
  watched: LibraryItem[],
  lastSyncedRef: { current: SyncedState }
): Promise<void> {
  const desiredWatchlist = watchlist.map(toWatchlistPayload);
  const desiredGenres = computeFavoriteGenres(watched);
  const { watchlistKeys: desiredWatchlistKeys, genreKeys: desiredGenreKeys } = keysOf(
    watchlist,
    watched
  );

  const watchlistToAdd = desiredWatchlist.filter(
    (item) => !lastSyncedRef.current.watchlistKeys.has(`${item.mediaType}:${item.tmdbId}`)
  );
  const watchlistToRemove = [...lastSyncedRef.current.watchlistKeys].filter(
    (key) => !desiredWatchlistKeys.has(key)
  );
  const genresToAdd = desiredGenres.filter(
    (g) => !lastSyncedRef.current.genreKeys.has(`${g.mediaType}:${g.genreId}`)
  );
  const genresToRemove = [...lastSyncedRef.current.genreKeys].filter(
    (key) => !desiredGenreKeys.has(key)
  );

  if (
    !watchlistToAdd.length &&
    !watchlistToRemove.length &&
    !genresToAdd.length &&
    !genresToRemove.length
  ) {
    return;
  }

  const res = await fetch("/api/subscribe/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint,
      watchlistToAdd,
      watchlistToRemove,
      genresToAdd,
      genresToRemove,
    }),
  });
  if (!res.ok) {
    throw new Error(`Synchronisation échouée (${res.status})`);
  }

  lastSyncedRef.current = { watchlistKeys: desiredWatchlistKeys, genreKeys: desiredGenreKeys };
}

export default function NotificationSettings() {
  const { watchlist, watched } = useLibrary();
  const [endpoint, setEndpoint] = useState<string | null>(() =>
    localStorage.getItem(ENDPOINT_STORAGE_KEY)
  );
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const isFirstSync = useRef(true);
  const lastSyncedRef = useRef<SyncedState>({ watchlistKeys: new Set(), genreKeys: new Set() });

  // Resynchronise la watchlist / les genres favoris côté serveur à chaque
  // changement, tant que les notifications sont actives.
  useEffect(() => {
    if (!endpoint) {
      return;
    }
    if (isFirstSync.current) {
      isFirstSync.current = false;
      return;
    }
    navigator.serviceWorker?.ready.then((registration) =>
      registration.pushManager.getSubscription().then((sub) => {
        if (!sub) {
          return;
        }
        syncSubscriptionDelta(endpoint, watchlist, watched, lastSyncedRef).catch((err) =>
          logError("Bobine : resync notifications échouée.", err)
        );
      })
    );
  }, [endpoint, watchlist, watched]);

  if (!isSupported()) {
    return (
      <p className={styles.hint}>
        Les notifications push ne sont pas supportées par ce navigateur.
      </p>
    );
  }

  async function enable() {
    setStatus("working");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          "Permission refusée. Autorise les notifications dans les réglages du navigateur pour ce site."
        );
      }

      const registration = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/vapid-public-key");
      if (!keyRes.ok) {
        throw new Error("Impossible de récupérer la clé du serveur.");
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast nécessaire : le typage DOM de `applicationServerKey` attend un
        // `Uint8Array<ArrayBuffer>` précisément, alors que `Uint8Array.from()`
        // infère `Uint8Array<ArrayBufferLike>` (générique élargi depuis
        // TypeScript 5.7) — la valeur réelle est bien un ArrayBuffer classique.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const { endpoint: subEndpoint, keys } = subscription.toJSON();
      if (!subEndpoint || !keys) {
        throw new Error("Abonnement push incomplet.");
      }
      await fullSyncSubscription(subEndpoint, keys, watchlist, watched);
      lastSyncedRef.current = keysOf(watchlist, watched);

      localStorage.setItem(ENDPOINT_STORAGE_KEY, subEndpoint);
      setEndpoint(subEndpoint);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus("error");
    }
  }

  async function disable() {
    setStatus("working");
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
      localStorage.removeItem(ENDPOINT_STORAGE_KEY);
      setEndpoint(null);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus("error");
    }
  }

  return (
    <div>
      {endpoint ? (
        <>
          <button
            type="button"
            className={styles.btnOn}
            onClick={disable}
            disabled={status === "working"}
          >
            🔔 Notifications activées — désactiver
          </button>
          <p className={styles.hint}>
            Tu seras prévenu·e quand un titre de ta liste "Envie de voir" arrive en streaming, pour
            les nouveautés dans tes genres préférés, et pour les grosses sorties du moment.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.btn}
            onClick={enable}
            disabled={status === "working"}
          >
            {status === "working" ? "Activation…" : "🔕 Activer les notifications"}
          </button>
          <p className={styles.hint}>
            Sois prévenu·e des nouveautés même sans avoir l'app ouverte.
          </p>
        </>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
