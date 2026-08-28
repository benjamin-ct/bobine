/// <reference lib="webworker" />
// Service worker custom (stratégie injectManifest de vite-plugin-pwa) :
// on garde le précaching Workbox généré automatiquement (pour le mode hors
// ligne / installation PWA), et on y ajoute la gestion des notifications
// push, impossible avec la stratégie generateSW par défaut.
import { precacheAndRoute, cleanupOutdatedCaches, type PrecacheEntry } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  // Injecté au build par vite-plugin-pwa (stratégie injectManifest).
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

interface PushNotificationPayload {
  title?: string;
  body?: string;
  url?: string;
}

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());

// Affiches TMDB : rarement modifiées, on privilégie le cache.
registerRoute(
  ({ url }) => url.origin === "https://image.tmdb.org",
  new CacheFirst({
    cacheName: "tmdb-images",
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

// Catalogue TMDB : réseau d'abord (données changeantes), cache en secours.
registerRoute(
  ({ url }) => url.origin === "https://api.themoviedb.org",
  new NetworkFirst({
    cacheName: "tmdb-api",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })],
  })
);

self.addEventListener("push", (event: PushEvent) => {
  let data: PushNotificationPayload = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bobine", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Bobine";
  const options: NotificationOptions = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl: string = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
