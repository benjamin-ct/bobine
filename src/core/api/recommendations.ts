// Client des endpoints "Pour toi" (voir worker/recommendations.ts) — plain
// `fetch` vers le même Worker (cookie de session envoyé automatiquement,
// même origine), pas via tmdbClient.ts/tmdbFetch : ce ne sont pas des appels
// TMDB relayés mais des endpoints applicatifs propres à Bobine.
import type { MediaSummary, MediaType } from "../types/tmdb.ts";

export type RecommendationReason =
  | { type: "genre"; genreId: number }
  | { type: "decade"; decade: number }
  | { type: "similar_to"; sourceTitle: string }
  | { type: "trending" }
  | null;

export interface RecommendationItem extends MediaSummary {
  mediaType: MediaType;
  reason: RecommendationReason;
}

export interface RecommendationResult {
  coldStart: boolean;
  items: RecommendationItem[];
  hasMore: boolean;
}

export type RecommendationFilter = "movie" | "tv" | "all";

export async function getRecommendations(
  filter: RecommendationFilter = "all",
  page = 1
): Promise<RecommendationResult> {
  const res = await fetch(`/api/recommendations?type=${filter}&page=${page}`);
  if (res.status === 401) {
    throw new Error("not_authenticated");
  }
  if (!res.ok) {
    throw new Error("Impossible de charger les recommandations.");
  }
  return res.json();
}

export async function markNotInterested(item: {
  mediaType: MediaType;
  tmdbId: number;
  genreIds: number[];
  year: number | null;
}): Promise<void> {
  const res = await fetch("/api/not-interested", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      genreIds: item.genreIds,
      year: item.year,
    }),
  });
  if (!res.ok) {
    throw new Error("Impossible d'enregistrer ce signal.");
  }
}

export interface DrawRandomParams {
  mediaType: MediaType;
  genreIds?: (number | string)[];
  excludeGenreIds?: number[];
  providerIds?: (number | string)[];
  yearMin?: number;
  yearMax?: number;
  excludeKeys?: string[];
}

// Tirage au hasard pondéré (voir RandomPage.tsx) : le Worker fait le tirage
// (uniforme pour un visiteur anonyme/cold start, pondéré par le profil de
// goûts sinon) et renvoie le résultat brut TMDB — la fiche complète (détails,
// plateformes) reste récupérée ensuite côté client via getDetails(), comme
// avant.
export async function drawRandom(params: DrawRandomParams): Promise<MediaSummary | null> {
  const searchParams = new URLSearchParams();
  searchParams.set("type", params.mediaType);
  for (const id of params.genreIds || []) {
    searchParams.append("genreId", String(id));
  }
  for (const id of params.excludeGenreIds || []) {
    searchParams.append("excludeGenreId", String(id));
  }
  for (const id of params.providerIds || []) {
    searchParams.append("providerId", String(id));
  }
  if (params.yearMin) {
    searchParams.set("yearMin", String(params.yearMin));
  }
  if (params.yearMax) {
    searchParams.set("yearMax", String(params.yearMax));
  }
  for (const key of params.excludeKeys || []) {
    searchParams.append("excludeKey", key);
  }
  const res = await fetch(`/api/random?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error("Tirage au hasard indisponible.");
  }
  const data = (await res.json()) as { result: MediaSummary | null };
  return data.result;
}
