// Synchronisation temps réel multi-appareils, côté client (voir
// worker/sync.ts pour le serveur) : une WebSocket par onglet connecté,
// reliée au hub du compte. Chaque événement reçu est redistribué aux
// contextes concernés (LibraryContext, ExcludedGenresContext...), qui
// appliquent le delta ou rechargent UNIQUEMENT leur propre ressource.
//
// Bus de module plutôt que contexte React : AuthContext en est lui-même
// consommateur (nom affiché), alors que la connexion dépend de useAuth() —
// un provider créerait une dépendance circulaire entre les deux.
import { useEffect, useRef, useState } from "react";
import { logWarn } from "../logger.ts";

// Doit rester aligné avec SyncResource (worker/sync.ts).
export type SyncResource =
  | "library"
  | "custom-lists"
  | "excluded-genres"
  | "favorite-providers"
  | "locale"
  | "region"
  | "display-name";

export interface SyncEvent {
  type: SyncResource;
  payload?: unknown;
}

// Identifiant de cet onglet, envoyé sur chaque écriture (voir
// syncClientHeaders) et à l'ouverture de la WebSocket : le serveur ne
// renvoie pas à un onglet l'écho de ses propres changements.
const CLIENT_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** En-têtes à ajouter à toute écriture synchronisée (PUT/POST/PATCH). */
export function syncClientHeaders(): Record<string, string> {
  return { "x-bobine-client": CLIENT_ID };
}

type Listener = (event: SyncEvent | null) => void;
// `null` = "resynchronisation" : des événements ont pu être manqués pendant
// une coupure (veille, réseau...), chaque consommateur recharge sa ressource.
const listeners = new Set<Listener>();

function emit(event: SyncEvent | null): void {
  for (const listener of listeners) {
    listener(event);
  }
}

const PING_INTERVAL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Ouvre la WebSocket de synchro tant que `enabled` est vrai (utilisateur
 * connecté), avec reconnexion automatique (délai exponentiel) et reconnexion
 * immédiate au retour au premier plan. Monté une seule fois (AuthProvider).
 */
export function useLiveSyncConnection(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") {
      return;
    }
    let socket: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let hasConnectedOnce = false;
    let stopped = false;

    const scheduleReconnect = () => {
      // Au-delà de MAX_RECONNECT_ATTEMPTS échecs d'affilée (synchro
      // indisponible côté serveur, hors ligne prolongé...), on arrête de
      // retenter en tâche de fond : le prochain retour au premier plan
      // relance un cycle (voir onVisibilityChange).
      if (stopped || reconnectTimer !== undefined || attempts >= MAX_RECONNECT_ATTEMPTS) {
        return;
      }
      const delay = Math.min(1000 * 2 ** attempts, MAX_RECONNECT_DELAY_MS);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (stopped || document.visibilityState === "hidden") {
        // Onglet en arrière-plan : inutile de retenter en boucle, on
        // rattrape au retour au premier plan (voir onVisibilityChange).
        return;
      }
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${location.host}/api/sync/socket?client=${encodeURIComponent(CLIENT_ID)}`
      );
      socket = ws;
      ws.onopen = () => {
        attempts = 0;
        // Première connexion : les contextes viennent tout juste de charger
        // leurs données. Reconnexion : on a pu manquer des événements.
        if (hasConnectedOnce) {
          emit(null);
        }
        hasConnectedOnce = true;
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, PING_INTERVAL_MS);
      };
      ws.onmessage = (message) => {
        if (message.data === "pong") {
          return;
        }
        try {
          const event = JSON.parse(String(message.data)) as SyncEvent;
          if (event && typeof event.type === "string") {
            emit(event);
          }
        } catch (err) {
          logWarn("Bobine : événement de synchro illisible.", err);
        }
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (socket === ws) {
          socket = null;
        }
        scheduleReconnect();
      };
    };

    // Pas de fermeture volontaire en arrière-plan (un hub en hibernation ne
    // coûte rien) ; en revanche le système coupe souvent la connexion d'une
    // PWA mise en veille : on la rouvre dès le retour au premier plan, sans
    // attendre la fin du délai de reconnexion.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      if (!socket) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        attempts = 0;
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      socket?.close(1000, "logout");
    };
  }, [enabled]);
}

/**
 * Appelle `handler` à chaque événement `type` reçu d'un autre appareil
 * (avec son éventuel delta), et à chaque resynchronisation (`event` null).
 */
export function useLiveSyncEvent(
  type: SyncResource,
  handler: (event: SyncEvent | null) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const listener: Listener = (event) => {
      if (event === null || event.type === type) {
        handlerRef.current(event);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [type]);
}

/**
 * Compteur incrémenté à chaque changement distant de `type` : à ajouter aux
 * dépendances de l'effet qui charge la ressource depuis le serveur, pour le
 * rejouer (rechargement ciblé de cette seule ressource).
 */
export function useLiveSyncRevision(type: SyncResource): number {
  const [revision, setRevision] = useState(0);
  useLiveSyncEvent(type, () => setRevision((r) => r + 1));
  return revision;
}
