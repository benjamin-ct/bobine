// Client TMDB bas niveau : configuration, fetch central, gestion d'erreur,
// plafond de concurrence. Toute la logique métier (discover, fiches,
// personnes...) vit dans tmdb.ts, qui consomme `tmdbFetch` d'ici — un seul
// endroit centralise la base URL, les headers/paramètres et le timeout
// (voir README, "Convention de fetch API").
import { createConcurrencyLimiter } from "./concurrencyLimiter.ts";
import { isNetworkError, recoverFromAccessExpiry } from "./accessSession.ts";
import { retryDelayMs } from "./retryAfter.ts";
import i18n from "../i18n/i18n.ts";

// En production, les requêtes passent par /api/tmdb/... (proxy côté
// Worker, voir worker/index.ts) : la clé API TMDB n'est injectée que
// côté serveur, jamais visible depuis le navigateur d'un visiteur. En
// dev local (`npm run dev`, Vite seul, pas de Worker qui tourne), on
// continue d'appeler TMDB directement avec la clé locale — elle ne
// quitte jamais la machine du développeur, donc pas d'enjeu de sécurité
// à la garder simple pour l'itération rapide.
export const IS_DEV = import.meta.env.DEV;
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = IS_DEV ? "https://api.themoviedb.org/3" : "/api/tmdb";

// TMDB veut un tag langue-région (BCP 47), pas juste "fr"/"en" (voir Locale
// dans core/i18n/i18n.ts). Lu depuis le singleton i18next (synchronisé avec
// LocaleContext via i18n.changeLanguage) plutôt que reçu en paramètre : ce
// module bas niveau est utilisé par des dizaines d'appelants dans tmdb.ts,
// leur faire tous prendre/propager la locale serait un remaniement bien plus
// large que ce que corrige ce ticket (titres/genres/synopsis figés en
// français quelle que soit la langue active).
const TMDB_LANGUAGE_BY_LOCALE: Record<string, string> = { fr: "fr-FR", en: "en-US" };
const DEFAULT_TMDB_LANGUAGE = "fr-FR";

export function currentTmdbLanguage(): string {
  return TMDB_LANGUAGE_BY_LOCALE[i18n.language] || DEFAULT_TMDB_LANGUAGE;
}

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

// 429 (plafond du proxy TMDB, voir worker/index.ts, ou quota TMDB relayé) :
// réessai automatique après le délai annoncé plutôt qu'une « Erreur TMDB
// (429) » affichée à la place d'une grille (ticket « Un peu trop souvent
// d'erreur »). La pause est partagée par tout l'onglet : les autres requêtes
// attendent aussi au lieu de consommer le quota et se prendre à leur tour un
// 429. Après MAX_RATE_LIMIT_RETRIES réessais, message lisible.
const MAX_RATE_LIMIT_RETRIES = 2;
let rateLimitedUntil = 0;
const RATE_LIMITED = Symbol("rate-limited");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  url.searchParams.set("language", currentTmdbLanguage());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  for (let attempt = 0; ; attempt++) {
    const pause = rateLimitedUntil - Date.now();
    if (pause > 0) {
      await sleep(pause);
    }
    const result = await fetchOnce<T>(url);
    if (result.status !== RATE_LIMITED) {
      return result.data;
    }
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      throw new Error(i18n.t("common.errorRateLimited"));
    }
    rateLimitedUntil = Math.max(
      rateLimitedUntil,
      Date.now() + retryDelayMs(result.retryAfter, attempt)
    );
  }
}

type FetchOnceResult<T> =
  { status: "ok"; data: T } | { status: typeof RATE_LIMITED; retryAfter: string | null };

function fetchOnce<T>(url: URL): Promise<FetchOnceResult<T>> {
  return tmdbRequestLimiter.run(async () => {
    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (err) {
      if (!isNetworkError(err)) {
        throw err;
      }
      // Session Access expirée (voir accessSession.ts) : la page repart vers
      // la connexion. Sinon, vraie coupure : message lisible plutôt que le
      // « Failed to fetch » brut du navigateur.
      if (!IS_DEV) {
        await recoverFromAccessExpiry();
      }
      throw new Error(i18n.t("common.errorNetwork"), { cause: err });
    }
    if (res.status === 429) {
      return { status: RATE_LIMITED, retryAfter: res.headers.get("retry-after") };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { status_message?: string });
      throw new Error(body.status_message || `Erreur TMDB (${res.status})`);
    }
    return { status: "ok", data: (await res.json()) as T };
  });
}
