// Orchestration du moteur de recommandation "Pour toi" (D1 + TMDB) : lit les
// signaux de l'utilisateur, construit son profil de goûts (voir
// recommendationEngine.ts, logique pure), va chercher des candidats TMDB et
// les classe. Distinct de recommendationEngine.ts : ce fichier dépend de D1
// et de `fetch` (TMDB), donc pas testable sous Node nu — voir
// scripts/verify-recommendations.ts pour la partie pure.
import {
  buildTasteProfile,
  isColdStart,
  isGenreExcluded,
  ratingToSignal,
  scoreCandidateGenresAndDecade,
  popularityBonus,
  diversify,
  weightedPick,
  SIGNAL_WATCHED_NO_RATING,
  SIGNAL_WATCHLIST,
  type SignalItem,
  type TasteProfile,
} from "./recommendationEngine.ts";
import {
  discoverGeneric,
  getTmdbRecommendationsFor,
  trendingPage,
  type TmdbListItem,
} from "./tmdb.ts";
import {
  getLibraryForUser,
  getExcludedGenresForUser,
  getFavoriteProvidersForUser,
  getNotInterestedForUser,
} from "./db.ts";
import type { Env } from "./types.ts";
import type { LibraryItem } from "../src/core/types/library.ts";

export type RecommendationMediaFilter = "movie" | "tv" | "all";

// Champs délibérément nommés comme la réponse TMDB (title/poster_path/...) :
// le client passe directement chaque item à <MediaCard>, qui attend cette
// forme (voir MediaSummary dans src/core/types/tmdb.ts) — pas de mapping
// intermédiaire à maintenir des deux côtés.
export interface RecommendationItem {
  id: number;
  mediaType: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids: number[];
  reason:
    | { type: "genre"; genreId: number }
    | { type: "decade"; decade: number }
    | { type: "similar_to"; sourceTitle: string }
    | { type: "trending" }
    | null;
}

export interface RecommendationResult {
  coldStart: boolean;
  items: RecommendationItem[];
  // Au moins une source TMDB a encore des pages : le client peut demander
  // la page suivante (scroll infini de "Suggestions pour vous").
  hasMore: boolean;
}

const MAX_TOP_GENRES = 5;
const MAX_TOP_DECADES = 3;
const MAX_SOURCE_TITLES = 3;
const MIN_SOURCE_RATING = 7;
const MAX_DIVERSITY_STREAK = 2;
// Plafond de pagination : au-delà, les candidats TMDB deviennent trop peu
// pertinents et chaque page coûte plusieurs appels TMDB.
export const MAX_RECOMMENDATION_PAGE = 10;

function parseYear(date: string | undefined): number | null {
  if (!date) {
    return null;
  }
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function itemKey(mediaType: string, id: number): string {
  return `${mediaType}:${id}`;
}

interface UserSignalContext {
  signalItems: SignalItem[];
  excludedGenreIds: number[];
  favoriteProviderIds: number[];
  seenKeys: Set<string>;
  // Titres les mieux notés, source des "Parce que tu as aimé X" — un par
  // (mediaType, tmdbId), triés par note desc.
  topRatedSources: Array<{ mediaType: "movie" | "tv"; id: number; title: string }>;
}

async function loadUserSignalContext(env: Env, userId: number): Promise<UserSignalContext> {
  const [library, excludedGenreIds, favoriteProviderIds, notInterested] = await Promise.all([
    getLibraryForUser(env.DB, userId),
    getExcludedGenresForUser(env.DB, userId),
    getFavoriteProvidersForUser(env.DB, userId),
    getNotInterestedForUser(env.DB, userId),
  ]);

  const signalItems: SignalItem[] = [];
  const seenKeys = new Set<string>();
  const topRatedSources: Array<{
    mediaType: "movie" | "tv";
    id: number;
    title: string;
    rating: number;
  }> = [];

  function addLibraryEntries(entries: Record<string, LibraryItem>, isWatched: boolean) {
    for (const [key, item] of Object.entries(entries)) {
      seenKeys.add(key);
      const year = parseYear(item.date);
      const genreIds = item.genreIds || [];
      const signal = isWatched
        ? item.rating != null
          ? ratingToSignal(item.rating)
          : SIGNAL_WATCHED_NO_RATING
        : SIGNAL_WATCHLIST;
      signalItems.push({ genreIds, year, signal });
      if (isWatched && item.rating != null && item.rating >= MIN_SOURCE_RATING) {
        const [mediaType] = key.split(":");
        topRatedSources.push({
          mediaType: mediaType as "movie" | "tv",
          id: item.id,
          title: item.title,
          rating: item.rating,
        });
      }
    }
  }

  addLibraryEntries(library.watched, true);
  addLibraryEntries(library.watchlist, false);

  for (const row of notInterested) {
    seenKeys.add(itemKey(row.media_type, row.tmdb_id));
    let genreIds: number[] = [];
    try {
      genreIds = JSON.parse(row.genre_ids);
    } catch {
      genreIds = [];
    }
    signalItems.push({ genreIds, year: row.year, signal: -1 });
  }

  topRatedSources.sort((a, b) => b.rating - a.rating);

  return {
    signalItems,
    excludedGenreIds,
    favoriteProviderIds,
    seenKeys,
    topRatedSources: topRatedSources
      .slice(0, MAX_SOURCE_TITLES * 2)
      .map((s) => ({ mediaType: s.mediaType, id: s.id, title: s.title })),
  };
}

function topKeysByScore(
  scores: Map<number, { score: number }>,
  excluded: (key: number) => boolean,
  max: number
): number[] {
  return [...scores.entries()]
    .filter(([key, affinity]) => affinity.score > 0 && !excluded(key))
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, max)
    .map(([key]) => key);
}

interface PagedItems {
  items: RecommendationItem[];
  hasMore: boolean;
}

// Plateformes de streaming : PAS résolues ici. <MediaCard showProviderBadge>
// le fait déjà, à la demande, quand la carte entre dans le viewport (voir
// MediaCard.tsx) — dupliquer l'appel /watch/providers côté Worker pour
// chaque candidat n'apporterait rien de plus, seulement ~24 appels TMDB
// systématiques à chaque calcul au lieu d'un appel paresseux par carte
// réellement vue.
function toRecommendationItem(
  raw: TmdbListItem,
  mediaType: "movie" | "tv",
  reason: RecommendationItem["reason"]
): RecommendationItem {
  return {
    id: raw.id,
    mediaType,
    title: raw.title,
    name: raw.name,
    poster_path: raw.poster_path ?? null,
    overview: raw.overview || "",
    release_date: raw.release_date,
    first_air_date: raw.first_air_date,
    vote_average: raw.vote_average,
    genre_ids: raw.genre_ids || [],
    reason,
  };
}

function mediaTypesFor(filter: RecommendationMediaFilter): Array<"movie" | "tv"> {
  return filter === "all" ? ["movie", "tv"] : [filter];
}

async function buildColdStartRecommendations(
  env: Env,
  ctx: UserSignalContext,
  filter: RecommendationMediaFilter,
  page: number
): Promise<PagedItems> {
  const excludedSet = new Set(ctx.excludedGenreIds);
  const items: RecommendationItem[] = [];
  let hasMore = false;
  await Promise.all(
    mediaTypesFor(filter).map(async (mediaType) => {
      const trending = await trendingPage(env, mediaType, page);
      if (page < trending.totalPages) {
        hasMore = true;
      }
      for (const raw of trending.results) {
        if (ctx.seenKeys.has(itemKey(mediaType, raw.id))) {
          continue;
        }
        if ((raw.genre_ids || []).some((g) => excludedSet.has(g))) {
          continue;
        }
        items.push(toRecommendationItem(raw, mediaType, { type: "trending" }));
      }
    })
  );
  return { items, hasMore };
}

async function buildWarmCandidates(
  env: Env,
  ctx: UserSignalContext,
  profile: TasteProfile,
  filter: RecommendationMediaFilter,
  page: number
): Promise<PagedItems> {
  const isExcluded = (genreId: number) => isGenreExcluded(profile, ctx.excludedGenreIds, genreId);
  const topGenres = topKeysByScore(profile.genreScores, isExcluded, MAX_TOP_GENRES);
  const topDecades = topKeysByScore(profile.decadeScores, () => false, MAX_TOP_DECADES);
  const excludeGenreIds = [
    ...new Set([...ctx.excludedGenreIds, ...profile.learnedExcludedGenreIds]),
  ];

  const yearMin = topDecades.length ? Math.min(...topDecades) : undefined;
  const yearMax = topDecades.length ? Math.max(...topDecades) + 9 : undefined;

  const candidatesByKey = new Map<
    string,
    { raw: TmdbListItem; mediaType: "movie" | "tv"; sourceTitle?: string }
  >();

  const mediaTypes = mediaTypesFor(filter);
  let hasMore = false;

  await Promise.all(
    mediaTypes.map(async (mediaType) => {
      if (topGenres.length === 0) {
        return;
      }
      try {
        const { results, totalPages } = await discoverGeneric(env, mediaType, {
          genreIds: topGenres,
          excludeGenreIds,
          providerIds: ctx.favoriteProviderIds,
          yearMin,
          yearMax,
          page,
        });
        if (page < totalPages) {
          hasMore = true;
        }
        for (const raw of results) {
          candidatesByKey.set(itemKey(mediaType, raw.id), { raw, mediaType });
        }
      } catch {
        // TMDB indisponible pour cette découverte : on continue avec les
        // autres sources plutôt que de faire échouer toute la page.
      }
    })
  );

  const sourcesForFilter = ctx.topRatedSources.filter((s) => mediaTypes.includes(s.mediaType));
  await Promise.all(
    sourcesForFilter.slice(0, MAX_SOURCE_TITLES).map(async (source) => {
      try {
        const { results, totalPages } = await getTmdbRecommendationsFor(
          env,
          source.mediaType,
          source.id,
          page
        );
        if (page < totalPages) {
          hasMore = true;
        }
        for (const raw of results) {
          const mediaType = (raw.media_type === "tv" ? "tv" : source.mediaType) as "movie" | "tv";
          const key = itemKey(mediaType, raw.id);
          if (!candidatesByKey.has(key)) {
            candidatesByKey.set(key, { raw, mediaType, sourceTitle: source.title });
          }
        }
      } catch {
        // idem : une source indisponible ne doit pas casser le reste.
      }
    })
  );

  const excludedSet = new Set(excludeGenreIds);
  const scored: Array<{
    item: RecommendationItem;
    score: number;
    primaryGenreId: number | null;
  }> = [];

  for (const [key, { raw, mediaType, sourceTitle }] of candidatesByKey) {
    if (ctx.seenKeys.has(key)) {
      continue;
    }
    const genreIds = raw.genre_ids || [];
    if (genreIds.some((g) => excludedSet.has(g))) {
      continue;
    }
    const year = parseYear(raw.release_date || raw.first_air_date);
    const { affinityScore, reason: engineReason } = scoreCandidateGenresAndDecade(
      genreIds,
      year,
      profile
    );
    const score = affinityScore + popularityBonus(raw.vote_average || 0, raw.vote_count || 0);
    const reason: RecommendationItem["reason"] = sourceTitle
      ? { type: "similar_to", sourceTitle }
      : engineReason
        ? engineReason.type === "genre"
          ? { type: "genre", genreId: engineReason.genreId! }
          : { type: "decade", decade: engineReason.decade! }
        : { type: "trending" };
    scored.push({
      item: toRecommendationItem(raw, mediaType, reason),
      score,
      primaryGenreId: genreIds[0] ?? null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const diversified = diversify(
    scored.map((s) => ({ item: s.item, primaryGenreId: s.primaryGenreId })),
    MAX_DIVERSITY_STREAK
  );
  return { items: diversified, hasMore };
}

export async function getRecommendations(
  env: Env,
  userId: number,
  filter: RecommendationMediaFilter = "all",
  page = 1
): Promise<RecommendationResult> {
  const ctx = await loadUserSignalContext(env, userId);
  const profile = buildTasteProfile(ctx.signalItems, ctx.excludedGenreIds);
  const coldStart = isColdStart(profile);

  const { items, hasMore } = coldStart
    ? await buildColdStartRecommendations(env, ctx, filter, page)
    : await buildWarmCandidates(env, ctx, profile, filter, page);

  return { coldStart, items, hasMore: hasMore && page < MAX_RECOMMENDATION_PAGE };
}

// Tirage au hasard pondéré (voir /api/random, RandomPage.tsx) : même profil
// que /api/recommendations, mais respecte les filtres explicites choisis
// par l'utilisateur (genre, plateforme, année) — un genre choisi
// manuellement n'est jamais écarté par l'apprentissage. Cold start ou
// visiteur anonyme (userId null) : comportement inchangé, tirage uniforme.
export interface RandomDrawParams {
  mediaType: "movie" | "tv";
  genreIds?: number[];
  excludeGenreIds?: number[];
  providerIds?: number[];
  yearMin?: number;
  yearMax?: number;
  excludeKeys: Set<string>;
}

const MAX_RANDOM_ATTEMPTS = 6;

export async function drawWeightedRandom(
  env: Env,
  userId: number | null,
  params: RandomDrawParams
): Promise<TmdbListItem | null> {
  let profile: TasteProfile | null = null;
  // La personnalisation ne s'applique que si l'utilisateur n'a pas déjà
  // choisi un genre à la main (voir ticket : "Respecter les filtres déjà en
  // place") et dispose d'assez de données (sinon comportement inchangé).
  if (userId != null && !(params.genreIds && params.genreIds.length > 0)) {
    const ctx = await loadUserSignalContext(env, userId);
    const built = buildTasteProfile(ctx.signalItems, ctx.excludedGenreIds);
    if (!isColdStart(built)) {
      profile = built;
    }
  }

  const first = await discoverGeneric(env, params.mediaType, {
    genreIds: params.genreIds,
    excludeGenreIds: params.excludeGenreIds,
    providerIds: params.providerIds,
    yearMin: params.yearMin,
    yearMax: params.yearMax,
    page: 1,
  });
  if (!first.results.length) {
    return null;
  }

  let pool: TmdbListItem[] = [];
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS && pool.length === 0; attempt++) {
    const page =
      attempt === 0
        ? 1
        : Math.max(1, Math.floor(Math.random() * Math.min(first.totalPages, 100)) + 1);
    const data =
      page === 1 && attempt === 0
        ? first
        : await discoverGeneric(env, params.mediaType, {
            genreIds: params.genreIds,
            excludeGenreIds: params.excludeGenreIds,
            providerIds: params.providerIds,
            yearMin: params.yearMin,
            yearMax: params.yearMax,
            page,
          });
    pool = data.results.filter(
      (item) => !params.excludeKeys.has(itemKey(params.mediaType, item.id))
    );
  }

  if (pool.length === 0) {
    pool = first.results;
  }

  if (!profile) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const activeProfile = profile;
  return weightedPick(
    pool,
    (item) => {
      const year = parseYear(item.release_date || item.first_air_date);
      const { affinityScore } = scoreCandidateGenresAndDecade(
        item.genre_ids || [],
        year,
        activeProfile
      );
      // Décalé pour rester positif (poids négatifs interdits, voir
      // weightedPick) : un titre mal noté par le profil reste tirable, juste
      // moins souvent.
      return affinityScore + 1;
    },
    Math.random
  );
}
