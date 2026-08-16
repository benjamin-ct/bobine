// Client léger pour l'API TMDB (The Movie Database).
// Doc : https://developer.themoviedb.org/reference/intro/getting-started
//
// En production, les requêtes passent par /api/tmdb/... (proxy côté
// Worker, voir worker/index.js) : la clé API TMDB n'est injectée que
// côté serveur, jamais visible depuis le navigateur d'un visiteur. En
// dev local (`npm run dev`, Vite seul, pas de Worker qui tourne), on
// continue d'appeler TMDB directement avec la clé locale — elle ne
// quitte jamais la machine du développeur, donc pas d'enjeu de sécurité
// à la garder simple pour l'itération rapide.
const IS_DEV = import.meta.env.DEV;
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = IS_DEV ? "https://api.themoviedb.org/3" : "/api/tmdb";
// Repli si la région réelle du visiteur (voir RegionContext, /api/region)
// n'est pas encore connue ou n'a pas pu être déterminée.
export const DEFAULT_REGION = "FR";
const LANGUAGE = "fr-FR";

export const IMG_BASE = "https://image.tmdb.org/t/p/";
export const posterUrl = (path, size = "w342") =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const backdropUrl = (path, size = "w780") =>
  path ? `${IMG_BASE}${size}${path}` : null;
export const logoUrl = (path, size = "w92") =>
  path ? `${IMG_BASE}${size}${path}` : null;

export class TmdbConfigError extends Error {}

// Plafond de requêtes TMDB réellement simultanées, tous appels confondus,
// pour CET onglet. Sans ça, chaque nouvelle fonctionnalité qui ajoute un
// appel "par carte" (badge plateforme, badge prochaine sortie/diffusion...)
// peut faire repartir en parallèle autant de requêtes que de cartes
// visibles d'un coup dès qu'elles entrent dans le viewport — même avec un
// chargement paresseux par carte (IntersectionObserver), rien n'empêchait
// jusqu'ici 10-20 cartes d'entrer dans le viewport quasi simultanément au
// premier rendu d'une grille. Le cache d'edge et les TTL plus longs (voir
// worker/index.js) protègent contre la RÉPÉTITION dans le temps, pas
// contre un pic instantané — ce plafond agit sur le pic lui-même, quelle
// que soit la fonctionnalité qui l'a déclenché aujourd'hui ou demain. Les
// requêtes en trop patientent dans une file plutôt que d'échouer.
const MAX_CONCURRENT_REQUESTS = 6;
let activeRequests = 0;
const pendingQueue = [];

function runNextQueued() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || pendingQueue.length === 0) return;
  const next = pendingQueue.shift();
  activeRequests++;
  next();
}

function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeRequests--;
          runNextQueued();
        });
    };
    pendingQueue.push(run);
    runNextQueued();
  });
}

async function tmdbFetch(path, params = {}) {
  if (IS_DEV && (!API_KEY || API_KEY === "REMPLACE_MOI_AVEC_TA_CLE_TMDB")) {
    throw new TmdbConfigError(
      "Clé API TMDB manquante. Ajoute VITE_TMDB_API_KEY dans .env.local puis redémarre le serveur."
    );
  }
  // Base explicite : nécessaire pour que `new URL()` accepte un chemin
  // relatif (/api/tmdb/...) en plus de l'URL absolue utilisée en dev.
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (IS_DEV) url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return withConcurrencyLimit(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.status_message || `Erreur TMDB (${res.status})`);
    }
    return res.json();
  });
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
  // Genres à ne jamais suggérer (réglage "Genres à exclure", ExcludedGenresContext).
  // Paramètre TMDB natif without_genres, virgule = exclusion si le titre a
  // l'un de ces genres.
  excludeGenreIds,
  providerIds,
  // Région utilisée pour filtrer par plateforme (watch_region — n'a de
  // sens que combinée à providerIds, TMDB l'ignore sinon). Voir
  // RegionContext pour la région réelle du visiteur.
  region = DEFAULT_REGION,
  sortField = "popularity",
  sortDirection = "desc",
  year,
  yearMin,
  yearMax,
  // Bornes précises au jour (YYYY-MM-DD), pour "derniers sortis" par ex.
  // Prennent le pas sur yearMin/yearMax si les deux sont fournis (même
  // paramètre TMDB sous-jacent).
  dateFrom,
  dateTo,
  // Exclut les titres pas encore sortis, quels que soient les autres
  // filtres de date (Découvrir doit toujours l'utiliser : par défaut TMDB
  // renvoie aussi des sorties déjà programmées dans le futur).
  excludeUpcoming,
  voteAverageMin,
  voteAverageMax,
  voteCountMin,
  originCountry,
  originalLanguage,
  runtimeMin,
  runtimeMax,
} = {}) {
  const resolvedField = sortField === "year" ? (mediaType === "movie" ? "primary_release_date" : "first_air_date") : sortField;
  const dateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
  const todayIso = new Date().toISOString().slice(0, 10);
  let dateLte = dateTo || (yearMax ? `${yearMax}-12-31` : undefined);
  if (excludeUpcoming && (!dateLte || dateLte > todayIso)) dateLte = todayIso;
  return tmdbFetch(`/discover/${mediaType}`, {
    page,
    with_genres: genreId || undefined,
    without_genres: excludeGenreIds?.length ? excludeGenreIds.join(",") : undefined,
    with_watch_providers: providerIds?.length ? providerIds.join("|") : undefined,
    watch_region: providerIds?.length ? region : undefined,
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
    with_original_language: originalLanguage || undefined,
    [`${dateField}.gte`]: dateFrom || (yearMin ? `${yearMin}-01-01` : undefined),
    [`${dateField}.lte`]: dateLte,
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

// Liste des langues (code ISO 639-1 + nom natif), pour le filtre "langue
// originale". `name` est le nom natif renvoyé par TMDB (ex. "Español",
// "日本語") — plus reconnaissable qu'une traduction, et TMDB ne fournit de
// toute façon pas de traduction par langue pour cette liste précise.
// Résultat quasi-statique, mis en cache comme getCountries().
let languagesCache = null;
export async function getLanguages() {
  if (languagesCache) return languagesCache;
  const list = await tmdbFetch("/configuration/languages");
  languagesCache = list
    .filter((l) => l.iso_639_1 && (l.name || l.english_name))
    .slice()
    .sort((a, b) => (a.english_name || a.name).localeCompare(b.english_name || b.name));
  return languagesCache;
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

// Cache mémoire (durée de vie de la session, comme countriesCache/
// languagesCache ci-dessus) : les métadonnées d'un titre sont statiques à
// l'échelle d'une session, donc revoir plusieurs fois la même fiche détail
// (retour arrière, recommandation pointant vers un titre déjà consulté...)
// ne doit pas refaire l'appel réseau. On met en cache la promesse elle-même
// (pas seulement le résultat résolu) : un second appel concurrent pour le
// même titre pendant que le premier est encore en vol (navigation rapide
// entre deux fiches) réutilise la requête en cours plutôt que d'en émettre
// une seconde. En cas d'échec, l'entrée est retirée pour permettre un
// nouvel essai au prochain appel.
const detailsCache = new Map();
export function getDetails(mediaType, id) {
  const key = `${mediaType}:${id}`;
  if (detailsCache.has(key)) return detailsCache.get(key);
  const promise = tmdbFetch(`/${mediaType}/${id}`, {
    // release_dates : sorties par pays (dont FR), pour le statut "au
    // cinéma" — inclus ici pour ne pas faire un second appel sur la fiche
    // détail.
    append_to_response: "credits,videos,recommendations,release_dates",
  }).catch((err) => {
    detailsCache.delete(key);
    throw err;
  });
  detailsCache.set(key, promise);
  return promise;
}

// Statut "au cinéma" (France) --------------------------------------------
// TMDB ne donne pas de date de fin d'exploitation en salle : on considère
// un film "encore au cinéma" s'il est sorti il y a moins de 6 semaines.
const THEATRICAL_WINDOW_DAYS = 42;

// Type de sortie TMDB : 3 = sortie nationale en salles, 2 = sortie limitée
// en salles. On préfère la sortie nationale ; à défaut, la limitée.
function extractFrenchTheatricalDate(releaseDatesResponse) {
  const fr = releaseDatesResponse?.results?.find((r) => r.iso_3166_1 === "FR");
  if (!fr) return null;
  const theatrical = fr.release_dates
    .filter((rd) => rd.type === 3)
    .concat(fr.release_dates.filter((rd) => rd.type === 2))
    .sort((a, b) => a.release_date.localeCompare(b.release_date))[0];
  return theatrical ? theatrical.release_date.slice(0, 10) : null;
}

// Pour la fiche détail : `details` vient de getDetails() ci-dessus, qui
// inclut déjà release_dates (pas d'appel réseau supplémentaire).
export function getFrenchTheatricalDateFromDetails(details) {
  return extractFrenchTheatricalDate(details?.release_dates);
}

// Date complète lisible (ex. "12 septembre 2026"), films et séries — plus
// précis que l'année seule affichée jusqu'ici sur les cartes/lignes de
// liste. `null` si la date est absente ou invalide (repli sur l'année seule
// côté appelant).
export function formatFullDate(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// "upcoming" (pas encore sorti), "in_theaters" (sorti il y a moins de
// THEATRICAL_WINDOW_DAYS), "past" (sorti plus tôt), ou null si aucune date
// de sortie cinéma FR n'est connue pour ce titre (VOD/streaming direct,
// film jamais distribué en salle en France...). Utilisé sur la fiche détail
// (une seule date, déjà connue précisément via extractFrenchTheatricalDate).
export function theatricalStatusFromDate(dateString) {
  if (!dateString) return null;
  const diffDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "upcoming";
  if (diffDays <= THEATRICAL_WINDOW_DAYS) return "in_theaters";
  return "past";
}

// Statut "au cinéma" pour les vignettes (grilles) --------------------------
//
// Contrairement à la fiche détail (une fiche = un appel /release_dates déjà
// inclus via append_to_response, donc gratuit), une grille affiche des
// dizaines de titres à la fois : faire un appel /release_dates par vignette
// enverrait autant de requêtes que de cartes affichées. TMDB expose deux
// listes dédiées, région-conscientes et déjà filtrées aux sorties en
// salle — /movie/now_playing et /movie/upcoming — qu'on récupère
// entièrement une fois par région (mise en cache mémoire, comme
// countriesCache ci-dessus) pour en faire un index consultable en O(1),
// sans aucun appel réseau par carte.
const MAX_THEATRICAL_PAGES = 10; // now_playing + upcoming restent largement sous ce plafond en pratique (~10 pages à eux deux)

async function fetchAllPages(path, region, maxPages) {
  const first = await tmdbFetch(path, { region, page: 1 });
  const totalPages = Math.min(first.total_pages || 1, maxPages);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => tmdbFetch(path, { region, page: i + 2 }))
  );
  return [first, ...rest].flatMap((page) => page.results || []);
}

let theatricalIndexCache = null; // { region, promise }
export function getTheatricalStatusIndex(region = DEFAULT_REGION) {
  if (theatricalIndexCache?.region === region) return theatricalIndexCache.promise;
  const promise = (async () => {
    const [nowPlaying, upcoming] = await Promise.all([
      fetchAllPages("/movie/now_playing", region, MAX_THEATRICAL_PAGES),
      fetchAllPages("/movie/upcoming", region, MAX_THEATRICAL_PAGES),
    ]);
    const index = new Map();
    for (const movie of upcoming) index.set(movie.id, "upcoming");
    // now_playing en dernier : si un titre apparaît dans les deux listes
    // (bascule en cours), "en salles" prime sur "bientôt".
    for (const movie of nowPlaying) index.set(movie.id, "in_theaters");
    return index;
  })().catch((err) => {
    theatricalIndexCache = null;
    throw err;
  });
  theatricalIndexCache = { region, promise };
  return promise;
}

// Détail d'une saison (liste des épisodes) — appel séparé de getDetails()
// car TMDB ne renvoie pas les épisodes dans la fiche série elle-même
// (seulement le résumé `seasons[]` : nombre d'épisodes, pas leur liste).
// Chargé à la demande (saison dépliée) plutôt que tout d'un coup pour une
// série avec beaucoup de saisons.
export function getSeasonDetails(tvId, seasonNumber) {
  return tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
}

// Cache mémoire (durée de vie de la session, même pattern que detailsCache
// ci-dessus) : évite un second appel réseau si le même titre est demandé
// deux fois dans la session — la fiche détail, le tirage aléatoire, et
// désormais les vignettes de Nouveautés/Prochainement (voir MediaCard,
// showProviderBadge) peuvent chacun redemander le même titre.
const watchProvidersCache = new Map();
export function getWatchProviders(mediaType, id, region = DEFAULT_REGION) {
  const key = `${mediaType}:${id}:${region}`;
  if (watchProvidersCache.has(key)) return watchProvidersCache.get(key);
  const promise = tmdbFetch(`/${mediaType}/${id}/watch/providers`)
    .then((data) => data.results?.[region] || null)
    .catch((err) => {
      watchProvidersCache.delete(key);
      throw err;
    });
  watchProvidersCache.set(key, promise);
  return promise;
}

// Badge dynamique "Prochainement" (prochaine sortie/diffusion) -----------
//
// Sur Prochainement, tout est par définition pas encore sorti : le badge
// doit dire OÙ/COMMENT une sortie à venir est prévue (Cinéma, Netflix,
// Prime Video, ABC, "Série à venir"...), pas réutiliser /watch/providers
// qui ne reflète que ce qui est DÉJÀ disponible (souvent vide pour un
// titre pas encore sorti — normal, pas une anomalie). Volontairement
// distinct de getWatchProviders ci-dessus, qui reste inchangé pour
// Nouveautés (contenus déjà sortis).

// Cache mémoire par film (même pattern que watchProvidersCache) : la
// réponse /release_dates change rarement, jamais mise à jour à la
// milliseconde près, donc pas grave si un exemplaire un peu daté traîne
// en mémoire pour la session.
const movieReleaseDatesCache = new Map();
export function getMovieReleaseDates(movieId) {
  if (movieReleaseDatesCache.has(movieId)) return movieReleaseDatesCache.get(movieId);
  const promise = tmdbFetch(`/movie/${movieId}/release_dates`).catch((err) => {
    movieReleaseDatesCache.delete(movieId);
    throw err;
  });
  movieReleaseDatesCache.set(movieId, promise);
  return promise;
}

// Type de sortie TMDB → libellé de repli quand `note` est vide. 2 et 3
// sont respectivement une sortie limitée et une sortie nationale en
// salles — les deux valent "Cinéma" pour l'utilisateur, la distinction
// n'a pas de sens côté badge.
const RELEASE_TYPE_LABELS = {
  2: "Cinéma",
  3: "Cinéma",
  4: "VOD numérique",
  5: "DVD / Blu-ray",
  6: "Télévision",
};

// Comparaison de dates calendaires en chaîne (YYYY-MM-DD), pas d'objet
// Date : évite tout décalage de fuseau horaire au moment de la
// comparaison (un `new Date("2026-08-17")` UTC minuit comparé à un `Date`
// local peut basculer d'un jour selon l'heure et le fuseau du visiteur).
function isStrictlyFutureDate(dateString, todayIso) {
  if (!dateString) return false;
  return dateString.slice(0, 10) > todayIso;
}

// Film : prochaine sortie strictement future dans la région donnée, avec
// son libellé. `note` TMDB (ex. "Prime Video") est prioritaire sur le
// type de sortie, même si le type est renseigné par ailleurs — un service
// explicitement nommé est toujours plus fiable qu'une catégorie générique.
// `releaseDatesResponse` : résultat brut de getMovieReleaseDates() ci-dessus.
// Renvoie `null` si aucune sortie future exploitable n'est trouvée pour
// cette région (à charge de l'appelant de retomber sur un repli, voir
// MediaCard.jsx).
export function getUpcomingMovieRelease(releaseDatesResponse, region = DEFAULT_REGION) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const entry = releaseDatesResponse?.results?.find((r) => r.iso_3166_1 === region);
  const future = (entry?.release_dates || [])
    .filter((rd) => isStrictlyFutureDate(rd.release_date, todayIso))
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const next = future[0];
  if (!next) return null;
  const label = next.note?.trim() || RELEASE_TYPE_LABELS[next.type] || null;
  if (!label) return null;
  return { label, date: next.release_date.slice(0, 10) };
}

// Série : le diffuseur de première diffusion (networks[].name — peut être
// une plateforme de streaming comme Netflix/Disney+ ou une chaîne
// classique comme ABC/BBC, TMDB ne distingue pas les deux dans ce champ,
// et il n'y a pas lieu de le faire ici non plus : le badge représente le
// canal de diffusion connu, quelle que soit sa nature). Jamais déduit de
// /watch/providers, qui reflète la disponibilité actuelle, pas la
// diffusion à venir. "Série à venir" si aucun network connu — jamais
// d'invention de plateforme. `details` : résultat de getDetails("tv", id).
export function getUpcomingSeriesRelease(details) {
  const label = details?.networks?.find((n) => n?.name)?.name || "Série à venir";
  const date = details?.first_air_date || null;
  return { label, date };
}

// Fournisseurs de streaming "principaux" ----------------------------------
// Le catalogue TMDB complet (~90-100 entrées pour la France) mélange les
// vraies plateformes avec des chaînes additionnelles greffées sur un compte
// existant ("X Amazon Channel"), des paliers avec pub ("Netflix Standard
// with Ads", "Amazon Prime Video with Ads") et des doublons de palier
// ("Paramount Plus" / "Paramount Plus Premium") — inutilisable comme filtre
// pratique. TMDB n'expose aucun signal fiable "principal vs additionnel"
// (pas de champ dédié dans /watch/providers/<type>), d'où une liste choisie
// à la main plutôt qu'une règle heuristique sur le nom. Revue le 16/08/2026
// contre les vraies données TMDB (France) — à ajuster si un service majeur
// manque ou change d'id.
const MAIN_PROVIDER_IDS = new Set([
  8, // Netflix
  119, // Amazon Prime Video
  337, // Disney Plus
  350, // Apple TV (Apple TV+)
  381, // Canal+
  1899, // HBO Max
  531, // Paramount Plus
  283, // Crunchyroll
  11, // MUBI
  234, // Arte
  147, // M6+
  2, // Apple TV Store (achat/location)
  3, // Google Play Movies (achat/location)
  35, // Rakuten TV (achat/location)
  192, // YouTube (achat/location)
  10, // Amazon Video (achat/location)
]);

// Renvoie les plateformes de streaming "principales" disponibles dans la
// région donnée (abonnement, location, achat confondus), triées par
// pertinence locale — filtré à MAIN_PROVIDER_IDS ci-dessus plutôt que le
// catalogue TMDB complet.
export async function getWatchProvidersList(mediaType, region = DEFAULT_REGION) {
  const data = await tmdbFetch(`/watch/providers/${mediaType}`, { watch_region: region });
  const results = data.results || [];
  return results
    .filter((p) => MAIN_PROVIDER_IDS.has(p.provider_id))
    .sort((a, b) => (a.display_priorities?.[region] ?? 999) - (b.display_priorities?.[region] ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name }));
}
