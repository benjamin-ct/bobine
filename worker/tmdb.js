// Client TMDB minimal côté Worker, pour la tâche planifiée uniquement.
// Distinct de src/api/tmdb.js (qui tourne dans le navigateur et lit
// import.meta.env.VITE_TMDB_API_KEY) : ici on lit env.TMDB_API_KEY, un
// secret Worker configuré séparément dans le dashboard Cloudflare.

const BASE_URL = "https://api.themoviedb.org/3";
const REGION = "FR";
const LANGUAGE = "fr-FR";

async function tmdbFetch(env, path, params = {}) {
  if (!env.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY manquant dans les secrets du Worker.");
  }
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_key", env.TMDB_API_KEY);
  url.searchParams.set("language", LANGUAGE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Erreur TMDB (${res.status}) sur ${path}`);
  }
  return res.json();
}

// Renvoie les ids des plateformes en abonnement (flatrate) disponibles en
// France pour ce titre, ou [] si rien.
export async function getFlatrateProviderIds(env, mediaType, tmdbId) {
  const data = await tmdbFetch(env, `/${mediaType}/${tmdbId}/watch/providers`);
  const flatrate = data.results?.[REGION]?.flatrate || [];
  return flatrate.map((p) => p.provider_id);
}

// Nouveautés (sorties des `windowDays` derniers jours) dans un genre donné.
export async function discoverRecentByGenre(env, mediaType, genreId, windowDays) {
  const dateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";
  const today = new Date();
  const since = new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const data = await tmdbFetch(env, `/discover/${mediaType}`, {
    with_genres: genreId,
    sort_by: `${dateField}.desc`,
    [`${dateField}.gte`]: since.toISOString().slice(0, 10),
    [`${dateField}.lte`]: today.toISOString().slice(0, 10),
    "vote_count.gte": 5,
    include_adult: false,
  });
  return data.results || [];
}

// Grosses sorties généralistes (tendances du jour), tous genres confondus —
// sert de filet pour les nouveautés qu'on n'aurait pas via les genres favoris.
export async function trendingToday(env) {
  const data = await tmdbFetch(env, "/trending/all/day");
  return (data.results || []).filter(
    (item) => item.media_type === "movie" || item.media_type === "tv"
  );
}
