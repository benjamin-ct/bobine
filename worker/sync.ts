// Synchronisation temps réel multi-appareils (ticket Trello "Synchronisation
// et actualisation automatique") : chaque appareil connecté à un compte ouvre
// une WebSocket vers GET /api/sync/socket, reliée à UNE instance de
// UserSyncHub par compte (Durable Object). Toute écriture authentifiée
// (bibliothèque, listes perso, réglages...) publie ensuite un événement
// ciblé sur le hub du compte, qui le rediffuse à tous ses appareils
// connectés — le client applique le delta reçu, ou ne recharge QUE la
// ressource concernée (voir src/core/sync/liveSync.ts), jamais un
// rechargement complet.
//
// WebSocket en mode "hibernation" (ctx.acceptWebSocket) plutôt que SSE : une
// connexion SSE garde le Durable Object en mémoire tant qu'elle est ouverte,
// facturé à la durée (13 000 GB-s/jour sur le plan gratuit, soit à peine
// ~1 appareil connecté en continu). Un hub en hibernation n'est réveillé que
// pour diffuser un événement ; le ping applicatif du client ("ping" →
// "pong") est lui aussi servi sans réveil, via setWebSocketAutoResponse.
//
// Ce flux est volontairement générique (`type` libre, voir SyncEvent) : il
// pourra porter plus tard des notifications in-app (demandes d'amis,
// sorties...) en appelant simplement publishToUser depuis le code concerné.
import { DurableObject, env, exports as workerExports, waitUntil } from "cloudflare:workers";
import { logError } from "./logger.ts";
import type { Env } from "./types.ts";

// En-tête posé par le client sur ses propres écritures (voir
// src/core/sync/liveSync.ts, syncClientHeaders) : l'appareil à l'origine
// d'un changement ne reçoit pas son propre événement en écho.
export const SYNC_CLIENT_HEADER = "x-bobine-client";

// Ressources synchronisées — chaque valeur correspond à un consommateur côté
// client (voir useLiveSyncEvent).
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
  // Delta optionnel appliqué tel quel par le client quand il est fourni
  // (bibliothèque : upserts/deletes) ; sinon le client recharge uniquement
  // la ressource `type`.
  payload?: unknown;
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
// Bornes défensives : un compte n'a normalement qu'une poignée d'appareils.
const MAX_SOCKETS_PER_USER = 20;

export class UserSyncHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const clientId = new URL(request.url).searchParams.get("client") ?? "";
    const sockets = this.ctx.getWebSockets();
    // Au-delà de la borne, on ferme les connexions les plus anciennes (onglets
    // oubliés, appareils perdus) plutôt que de refuser la nouvelle.
    for (const stale of sockets.slice(0, Math.max(0, sockets.length - MAX_SOCKETS_PER_USER + 1))) {
      stale.close(4000, "too many connections");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, CLIENT_ID_PATTERN.test(clientId) ? [clientId] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Appelé en RPC par publishToUser : diffuse à tous les appareils du compte
  // sauf celui à l'origine du changement.
  async publish(event: SyncEvent, sourceClientId: string | null): Promise<void> {
    const message = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (sourceClientId && this.ctx.getTags(ws).includes(sourceClientId)) {
        continue;
      }
      try {
        ws.send(message);
      } catch {
        // Socket déjà fermée côté client : le runtime la retire de lui-même.
      }
    }
  }

  async webSocketMessage(): Promise<void> {
    // Rien à traiter : le client n'envoie que des "ping", déjà servis par
    // l'auto-réponse (voir constructeur) sans réveiller le hub.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    // 1005/1006 (fermeture sans code / anormale) ne sont pas des codes
    // qu'on a le droit de renvoyer : on répond par une fermeture normale.
    ws.close(code === 1005 || code === 1006 ? 1000 : code, "closed");
  }
}

// Un hub par compte ET par hôte : défense en profondeur pour qu'un compte
// d'un environnement ne reçoive jamais les événements du compte de même id
// d'un autre environnement (chaque preview PR a sa propre base D1, donc ses
// propres ids utilisateurs).
//
// Namespace : en prod, la classe est déclarée via "exports" (wrangler.jsonc)
// et atteinte par `exports`. Les previews PR (Cloudflare Previews, `wrangler
// preview`) ne publient pas "exports" : scripts/preview-d1.ts y déclare la
// classe via "migrations" et la lie sous "previews.durable_objects"
// (USER_SYNC_HUB), ce qui donne à chaque preview ses propres instances,
// isolées de la prod et des autres previews.
function hubFor(hostname: string, userId: number) {
  const namespace = (env as Env).USER_SYNC_HUB ?? workerExports.UserSyncHub;
  return namespace.get(namespace.idFromName(`${hostname}:${userId}`));
}

// Ouverture de la WebSocket de synchro (GET /api/sync/socket). Renvoie la
// réponse 101 du hub telle quelle : elle ne doit surtout pas repasser par
// withSecurityHeaders (voir worker/index.ts), qui la reconstruirait via
// `new Response(...)` et perdrait la WebSocket.
export async function openSyncSocket(request: Request, userId: number): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket attendue.", { status: 426 });
  }
  // Garde anti-CSWSH : le cookie de session est déjà SameSite=Lax, mais on
  // refuse aussi explicitement toute poignée de main venant d'une autre
  // origine que l'app elle-même.
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== url.host) {
    return new Response("Origine refusée.", { status: 403 });
  }
  try {
    return await hubFor(url.hostname, userId).fetch(request);
  } catch (err) {
    // Hub indisponible (ex. classe pas encore provisionnée sur ce
    // déploiement) : le client retombera sur son repli (rechargement au
    // retour au premier plan) sans rien casser.
    logError("Synchro temps réel : ouverture de la WebSocket impossible.", err);
    return new Response("Synchro temps réel indisponible.", { status: 503 });
  }
}

// Diffuse un événement aux autres appareils du compte, sans retarder la
// réponse HTTP de l'écriture (waitUntil) ni jamais la faire échouer : la
// synchro temps réel est un plus, la donnée est déjà écrite en base.
export function publishToUser(request: Request, userId: number, event: SyncEvent): void {
  const sourceClientId = request.headers.get(SYNC_CLIENT_HEADER);
  const hostname = new URL(request.url).hostname;
  waitUntil(
    (async () => {
      try {
        await hubFor(hostname, userId).publish(
          event,
          sourceClientId && CLIENT_ID_PATTERN.test(sourceClientId) ? sourceClientId : null
        );
      } catch (err) {
        logError(`Synchro temps réel : diffusion "${event.type}" impossible.`, err);
      }
    })()
  );
}
