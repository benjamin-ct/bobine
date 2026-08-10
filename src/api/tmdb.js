// Client léger pour l'API TMDB (The Movie Database).
// Doc : https://developer.themoviedb.org/reference/intro/getting-started

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const REGION = "FR";
const LANGUAGE = "fr-FR";

export const IMG_BASE = "https://image.tmdb.org/t/p/";
export const posterUrl = (path, size = "w342") =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const backdropUrl = (path, size = "w780") =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const logoUrl = (path, size = "w92") =>
  path ? `${IMG_BASE}${size}${path}` : null;

export class TmdbConfigError extends Error {}

async function tmdbFetch(path, params = {}) {
  if (!API_KEY || API_KEY === "REMPLACE_MOI_AVEC_TA_CLE_TMDB") {
    throw new TmdbConfigError(
      "Clé API TMDB manquante. Ajoute VITE_TMDB_API_KEY dans .env.local puis redémarre le serveur."
    );
  }
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.status_message || `Erreur TMDB (${res.status})`);
  }
  return res.json();
}

// Genres --------------------------------------------------------------

export function getGenres(mediaType) {
  return tmdbFetch(`/genre/${mediaType}/list`);
}

// Découverte / recherche -----------------------------------------------

// Le tri "mieux noté" a besoin d'un plancher de votes, sinon un film noté
// 10/10 par 3 personnes remonte devant des classiques.
const MIN_VOTES_FOR_RATING_SORT = 100;

export function discover(mediaType, {
  page = 1,
  genreId,
  providerIds,
  sortField = "popularity",
  sortDirection = "desc",
  year,
  yearMin,
  yearMax,
  voteAverageMin,
  voteAverageMax,
  voteCountMin,
  originCountry,
  runtimeMin,
  runtimeMax,
} = {}) {
  const resolvedField = sortField === "year" ? (mediaType === "movie" ? "primary_release_date" : "first_air_date") : sortField;
  const dateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
  return tmdbFetch(`/discover/${mediaType}`, {
    page,
    with_genres: genreId || undefined,
    with_watch_providers: providerIds?.length ? providerIds.join("|") : undefined,
    watch_region: providerIds?.length ? REGION : undefined,
    sort_by: `${resolvedField}.${sortDirection}`,
    // Un plancher explicite (filtre avancé) prend le pas sur celui, implicite,
    // qu'on applique par défaut quand on trie par note (sinon un film noté
    // 10/10 par 3 personnes remonte devant des classiques).
    "vote_count.gte": voteCountMin || (sortField === "vote_average" ? MIN_VOTES_FOR_RATING_SORT : undefined),
    "vote_average.gte": voteAverageMin || undefined,
    "vote_average.lte": voteAverageMax || undefined,
    "with_runtime.gte": runtimeMin || undefined,
    "with_runtime.lte": runtimeMax || undefined,
    with_origin_country: originCountry || undefined,
    [`${dateField}.gte`]: yearMin ? `${yearMin}-01-01` : undefined,
    [`${dateField}.lte`]: yearMax ? `${yearMax}-12-31` : undefined,
    [mediaType === "movie" ? "primary_release_year" : "first_air_date_year"]: year || undefined,
    include_adult: false,
  });
}

export const SORT_FIELDS = [
  { value: "popularity", label: "Popularité" },
  { value: "vote_average", label: "Note" },
  { value: "year", label: "Année" },
];

// Liste des pays (code ISO 3166-1 + nom localisé), pour le filtre "pays de
// production". Résultat quasi-statique côté TMDB, sans dépendance à une
// région particulière.
let countriesCache = null;
export async function getCountries() {
  if (countriesCache) return countriesCache;
  const list = await tmdbFetch("/configuration/countries");
  countriesCache = list
    .slice()
    .sort((a, b) => a.english_name.localeCompare(b.english_name));
  return countriesCache;
}

export function searchMulti(query, page = 1) {
  return tmdbFetch("/search/multi", { query, page, include_adult: false });
}

// Personnes (acteurs, réalisateurs) --------------------------------------

export function searchPerson(query, page = 1) {
  return tmdbFetch("/search/person", { query, page, include_adult: false });
}

export function getPerson(id) {
  return tmdbFetch(`/person/${id}`);
}

// Filmographie complète (apparitions devant ET derrière la caméra).
export function getPersonCredits(id) {
  return tmdbFetch(`/person/${id}/combined_credits`);
}

export function trending(mediaType = "all", window = "week") {
  return tmdbFetch(`/trending/${mediaType}/${window}`);
}

// Estime la durée d'un titre à partir de sa fiche détail TMDB.
// Films : durée exacte (details.runtime). Séries : pas de suivi épisode par
// épisode dans Bobine, donc approximation = durée moyenne d'un épisode ×
// nombre total d'épisodes (compte toute la série comme "vue" d'un coup).
export function estimateRuntimeMinutes(details, mediaType) {
  if (mediaType === "movie") {
    return details?.runtime || null;
  }
  const perEpisode = details?.episode_run_time?.[0];
  const episodeCount = details?.number_of_episodes;
  if (!perEpisode || !episodeCount) return null;
  return perEpisode * episodeCount;
}

// Détails ---------------------------------------------------------------

export function getDetails(mediaType, id) {
  return tmdbFetch(`/${mediaType}/${id}`, {
    append_to_response: "credits,videos,recommendations",
  });
}

export async function getWatchProviders(mediaType, id) {
  const data = await tmdbFetch(`/${mediaType}/${id}/watch/providers`);
  return data.results?.[REGION] || null;
}

// Fournisseurs de streaming disponibles en France ------------------------
// Renvoie TOUTES les plateformes connues de TMDB pour la région FR
// (abonnement, location, achat confondus), triées par pertinence.

export async function getWatchProvidersList(mediaType) {
  const data = await tmdbFetch(`/watch/providers/${mediaType}`, { watch_region: REGION });
  const results = data.results || [];
  return results
    .slice()
    .sort((a, b) => (a.display_priorities?.[REGION] ?? 999) - (b.display_priorities?.[REGION] ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name }));
}
