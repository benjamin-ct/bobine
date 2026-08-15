import { useEffect, useRef, useState } from "react";
import { useLibrary } from "../context/LibraryContext";

const ENDPOINT_STORAGE_KEY = "bobine.push.endpoint";
const TOP_GENRES_FOR_NOTIFICATIONS = 8;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Reprend la même logique que Stats.jsx (genres dominants de l'historique),
// mais gardée séparément : ici on a besoin des paires {mediaType, genreId}
// individuelles, pas d'un simple libellé affichable.
function computeFavoriteGenres(watched) {
  const counts = new Map();
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
      return { mediaType, genreId: Number(genreId) };
    });
}

function toWatchlistPayload(item) {
  return { mediaType: item.mediaType, tmdbId: item.id, title: item.title, posterPath: item.posterPath };
}

// Remplacement complet : correct et volontaire, réservé à l'activation
// (une fois par appareil) — voir syncSubscriptionDelta plus bas pour la
// resynchronisation à chaque changement, qui n'envoie que le delta.
async function fullSyncSubscription(endpoint, keys, watchlist, watched) {
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
  if (!res.ok) throw new Error(`Synchronisation échouée (${res.status})`);
}

function keysOf(watchlist, watched) {
  return {
    watchlistKeys: new Set(watchlist.map((item) => `${item.mediaType}:${item.id}`)),
    genreKeys: new Set(computeFavoriteGenres(watched).map((g) => `${g.mediaType}:${g.genreId}`)),
  };
}

// Resynchronisation appelée à chaque changement de la watchlist/des genres
// favoris tant que les notifications sont actives : calcule le delta par
// rapport au dernier envoi (lastSyncedRef) et n'envoie que ça — pas toute la
// watchlist à chaque toggle. `favoriteGenres` est un agrégat recalculé
// entièrement à chaque appel (top genres sur tout l'historique vu), donc le
// diff se fait ici, côté client, plutôt que d'espérer un delta "naturel".
async function syncSubscriptionDelta(endpoint, watchlist, watched, lastSyncedRef) {
  const desiredWatchlist = watchlist.map(toWatchlistPayload);
  const desiredGenres = computeFavoriteGenres(watched);
  const { watchlistKeys: desiredWatchlistKeys, genreKeys: desiredGenreKeys } = keysOf(watchlist, watched);

  const watchlistToAdd = desiredWatchlist.filter(
    (item) => !lastSyncedRef.current.watchlistKeys.has(`${item.mediaType}:${item.tmdbId}`)
  );
  const watchlistToRemove = [...lastSyncedRef.current.watchlistKeys].filter((key) => !desiredWatchlistKeys.has(key));
  const genresToAdd = desiredGenres.filter(
    (g) => !lastSyncedRef.current.genreKeys.has(`${g.mediaType}:${g.genreId}`)
  );
  const genresToRemove = [...lastSyncedRef.current.genreKeys].filter((key) => !desiredGenreKeys.has(key));

  if (!watchlistToAdd.length && !watchlistToRemove.length && !genresToAdd.length && !genresToRemove.length) {
    return; // rien n'a changé depuis le dernier envoi
  }

  const res = await fetch("/api/subscribe/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint, watchlistToAdd, watchlistToRemove, genresToAdd, genresToRemove }),
  });
  if (!res.ok) throw new Error(`Synchronisation échouée (${res.status})`);

  lastSyncedRef.current = { watchlistKeys: desiredWatchlistKeys, genreKeys: desiredGenreKeys };
}

export default function NotificationSettings() {
  const { watchlist, watched } = useLibrary();
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(ENDPOINT_STORAGE_KEY));
  const [status, setStatus] = useState("idle"); // idle | working | error
  const [error, setError] = useState(null);
  const isFirstSync = useRef(true);
  // Dernier état effectivement envoyé au serveur — voir syncSubscriptionDelta.
  const lastSyncedRef = useRef({ watchlistKeys: new Set(), genreKeys: new Set() });

  // Re-synchronise la watchlist / les genres favoris côté serveur à chaque
  // changement, tant que les notifications sont actives — sans quoi le cron
  // travaillerait sur une liste figée au moment de l'activation. N'envoie
  // que le delta (voir syncSubscriptionDelta), pas la watchlist entière.
  useEffect(() => {
    if (!endpoint) return;
    if (isFirstSync.current) {
      isFirstSync.current = false;
      return;
    }
    navigator.serviceWorker?.ready.then((registration) =>
      registration.pushManager.getSubscription().then((sub) => {
        if (!sub) return;
        syncSubscriptionDelta(endpoint, watchlist, watched, lastSyncedRef).catch((err) =>
          console.error("Bobine : resync notifications échouée.", err)
        );
      })
    );
  }, [endpoint, watchlist, watched]);

  if (!isSupported()) {
    return (
      <p className="page-subtitle">
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
        throw new Error("Permission refusée. Autorise les notifications dans les réglages du navigateur pour ce site.");
      }

      const registration = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/vapid-public-key");
      if (!keyRes.ok) throw new Error("Impossible de récupérer la clé du serveur.");
      const { publicKey } = await keyRes.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const { endpoint: subEndpoint, keys } = subscription.toJSON();
      await fullSyncSubscription(subEndpoint, keys, watchlist, watched);
      // La synchro complète ci-dessus couvre déjà l'état actuel : on amorce
      // lastSyncedRef pour que la prochaine resync (voir l'effet plus haut)
      // n'envoie pas à nouveau tout ce qui vient d'être écrit.
      lastSyncedRef.current = keysOf(watchlist, watched);

      localStorage.setItem(ENDPOINT_STORAGE_KEY, subEndpoint);
      setEndpoint(subEndpoint);
      setStatus("idle");
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
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
      setError(err.message || "Une erreur est survenue.");
      setStatus("error");
    }
  }

  return (
    <div className="notification-settings">
      {endpoint ? (
        <>
          <button className="btn btn--green" onClick={disable} disabled={status === "working"}>
            🔔 Notifications activées — désactiver
          </button>
          <p className="page-subtitle notification-settings__hint">
            Tu seras prévenu·e quand un titre de ta liste "Envie de voir" arrive en streaming, pour les
            nouveautés dans tes genres préférés, et pour les grosses sorties du moment.
          </p>
        </>
      ) : (
        <>
          <button className="btn" onClick={enable} disabled={status === "working"}>
            {status === "working" ? "Activation…" : "🔕 Activer les notifications"}
          </button>
          <p className="page-subtitle notification-settings__hint">
            Sois prévenu·e des nouveautés même sans avoir l'app ouverte.
          </p>
        </>
      )}
      {error && <p className="notification-settings__error">{error}</p>}
    </div>
  );
}
