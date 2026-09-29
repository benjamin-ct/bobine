// Liste blanche du proxy /api/tmdb/* (audit H3). Sans elle, le proxy
// relayait n'importe quel chemin et n'importe quel paramètre : un paramètre
// aléatoire suffisait à rater le cache d'edge à chaque requête, et donc à
// épuiser le quota TMDB partagé par tous les visiteurs.
//
// Chemins et paramètres : ceux qu'appelle src/core/api/tmdb.ts, rien de plus.
// Un nouvel appel TMDB côté client doit être ajouté ici, sinon le proxy
// répond 404 (chemin) ou ignore le paramètre.
//
// Fichier sans type Cloudflare (même modèle que bots.ts), pour être testé
// par scripts/verify-tmdb-proxy-policy.ts.

const ALLOWED_PATHS: RegExp[] = [
  /^\/discover\/(movie|tv)$/,
  /^\/search\/(multi|person)$/,
  /^\/genre\/(movie|tv)\/list$/,
  /^\/configuration\/(countries|languages)$/,
  /^\/trending\/(all|movie|tv)\/(day|week)$/,
  /^\/watch\/providers\/(movie|tv)$/,
  /^\/(movie|tv)\/\d{1,9}$/,
  /^\/(movie|tv)\/\d{1,9}\/watch\/providers$/,
  /^\/movie\/\d{1,9}\/release_dates$/,
  /^\/movie\/(now_playing|upcoming)$/,
  /^\/tv\/\d{1,9}\/season\/\d{1,4}$/,
  /^\/person\/\d{1,9}(\/combined_credits)?$/,
  /^\/collection\/\d{1,9}$/,
];

// Paramètres propres au Worker, jamais transmis à TMDB (voir handleTmdbProxy).
export const WORKER_ONLY_PARAMS = [
  "include_watch_providers_badge",
  "watch_providers_badge_region",
  "include_region_release_date",
  "region_release_date_region",
];

const REGION = /^[A-Z]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;
const NUMBER = /^\d{1,5}(\.\d{1,2})?$/;
// Listes d'ids séparés par « | » (ou) ou « , » (et), ex. with_genres.
const ID_LIST = /^\d{1,9}([|,]\d{1,9}){0,49}$/;
const FLAG = /^(0|1|true|false)$/;

const APPEND_TO_RESPONSE_ITEMS = new Set([
  "credits",
  "aggregate_credits",
  "videos",
  "recommendations",
  "release_dates",
  "watch/providers",
]);

type Validator = RegExp | ((value: string) => boolean);

const ALLOWED_PARAMS: Record<string, Validator> = {
  language: /^[a-z]{2}(-[A-Z]{2})?$/,
  page: (value) => /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 500,
  query: (value) => value.length <= 200,
  include_adult: FLAG,
  region: REGION,
  watch_region: REGION,
  sort_by: /^[a-z_]{1,30}\.(asc|desc)$/,
  with_genres: ID_LIST,
  without_genres: ID_LIST,
  with_watch_providers: ID_LIST,
  "vote_count.gte": NUMBER,
  "vote_average.gte": NUMBER,
  "vote_average.lte": NUMBER,
  "with_runtime.gte": NUMBER,
  "with_runtime.lte": NUMBER,
  with_origin_country: REGION,
  with_original_language: /^[a-z]{2}$/,
  "primary_release_date.gte": DATE,
  "primary_release_date.lte": DATE,
  "first_air_date.gte": DATE,
  "first_air_date.lte": DATE,
  primary_release_year: YEAR,
  first_air_date_year: YEAR,
  append_to_response: (value) =>
    value.split(",").every((item) => APPEND_TO_RESPONSE_ITEMS.has(item)),
  include_watch_providers_badge: FLAG,
  watch_providers_badge_region: REGION,
  include_region_release_date: FLAG,
  region_release_date_region: REGION,
};

export type TmdbProxyRequest =
  | { ok: true; tmdbPath: string; params: URLSearchParams }
  | { ok: false; status: 400 | 404; error: string };

// Chemin TMDB autorisé + paramètres filtrés, validés et triés : deux
// requêtes équivalentes (ordre différent, paramètre inconnu en plus)
// donnent la même clé de cache. Un paramètre inconnu est ignoré (sans
// effet sur TMDB ni sur le cache) ; un paramètre connu mais invalide est
// refusé en 400, pour ne pas relayer n'importe quelle valeur.
export function parseTmdbProxyRequest(
  pathname: string,
  searchParams: URLSearchParams
): TmdbProxyRequest {
  const tmdbPath = pathname.replace(/^\/api\/tmdb/, "");
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(tmdbPath))) {
    return { ok: false, status: 404, error: "Chemin TMDB non autorisé." };
  }
  const entries: [string, string][] = [];
  for (const key of new Set(searchParams.keys())) {
    const validator = ALLOWED_PARAMS[key];
    if (!validator) {
      continue;
    }
    // Dernière valeur, comme le faisait searchParams.set côté proxy.
    const values = searchParams.getAll(key);
    const value = values[values.length - 1];
    const valid = typeof validator === "function" ? validator(value) : validator.test(value);
    if (!valid) {
      return { ok: false, status: 400, error: `Paramètre « ${key} » invalide.` };
    }
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { ok: true, tmdbPath, params: new URLSearchParams(entries) };
}

export function isValidRegion(value: string): boolean {
  return REGION.test(value);
}
