// Client TMDB bas niveau : configuration, fetch central, gestion d'erreur,
// plafond de concurrence. Toute la logique métier (discover, fiches,
// personnes...) vit dans tmdb.ts, qui consomme `tmdbFetch` d'ici — un seul
// endroit centralise la base URL, les headers/paramètres et le timeout
// (voir README, "Convention de fetch API").
import { createConcurrencyLimiter } from "./concurrencyLimiter.ts";

// En production, les requêtes passent par /api/tmdb/... (proxy côté
// Worker, voir worker/index.ts) : la clé API TMDB n'est injectée que
// côté serveur, jamais visible depuis le navigateur d'un visiteur. En
// dev local (`npm run dev`, Vite seul, pas de Worker qui tourne), on
// continue d'appeler TMDB directement avec la clé locale — elle ne
// quitte jamais la machine du développeur, donc pas d'enjeu de sécurité
// à la garder simple pour l'itération rapide.
const IS_DEV = import.meta.env.DEV;
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = IS_DEV ? "https://api.themoviedb.org/3" : "/api/tmdb";
const LANGUAGE = "fr-FR";

export const IMG_BASE = "https://image.tmdb.org/t/p/";
export const posterUrl = (path: string | null | undefined, size = "w342"): string | null =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const backdropUrl = (path: string | null | undefined, size = "w780"): string | null =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const logoUrl = (path: string | null | undefined, size = "w92"): string | null =>
  path ? `${IMG_BASE}${size}${path}` : null;

export class TmdbConfigError extends Error {}

export type TmdbParams = Record<string, string | number | boolean | undefined | null>;

// Plafond de requêtes TMDB réellement simultanées, tous appels confondus,
// pour CET onglet. Sans ça, chaque nouvelle fonctionnalité qui ajoute un
// appel "par carte" (badge plateforme, badge prochaine sortie/diffusion...)
// peut faire repartir en parallèle autant de requêtes que de cartes
// visibles d'un coup dès qu'elles entrent dans le viewport. Le cache
// d'edge et les TTL plus longs (voir worker/index.ts) protègent contre la
// RÉPÉTITION dans le temps, pas contre un pic instantané — ce plafond agit
// sur le pic lui-même. Les requêtes en trop patientent dans une file
// plutôt que d'échouer.
const tmdbRequestLimiter = createConcurrencyLimiter(6);

export async function tmdbFetch<T>(path: string, params: TmdbParams = {}): Promise<T> {
  if (IS_DEV && (!API_KEY || API_KEY === "REMPLACE_MOI_AVEC_TA_CLE_TMDB")) {
    throw new TmdbConfigError(
      "Clé API TMDB manquante. Ajoute VITE_TMDB_API_KEY dans .env.local puis redémarre le serveur."
    );
  }
  // Base explicite : nécessaire pour que `new URL()` accepte un chemin
  // relatif (/api/tmdb/...) en plus de l'URL absolue utilisée en dev.
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (IS_DEV && API_KEY) {
    url.searchParams.set("api_key", API_KEY);
  }
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return tmdbRequestLimiter.run(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { status_message?: string });
      throw new Error(body.status_message || `Erreur TMDB (${res.status})`);
    }
    return res.json() as Promise<T>;
  });
}
