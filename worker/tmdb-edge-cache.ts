// Sous-requêtes TMDB par titre utilisées pour enrichir les grilles
// (/discover, recherche) : elles réutilisent EXACTEMENT la même entrée de
// cache d'edge que l'appel direct /api/tmdb/<type>/<id>/… (même URL, même
// TTL 1h), si bien qu'un titre déjà consulté (fiche détail, ou déjà croisé
// dans une autre grille) répond sans retaper TMDB.
//
// Module sans dépendance au runtime Workers (cache et waitUntil injectés) :
// testé sous node par scripts/verify-tmdb-edge-cache.ts.

import type { ReleaseDatesResponse } from "../src/core/types/tmdb.ts";

export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export type WatchProvidersByRegion = Record<
  string,
  { flatrate?: unknown; rent?: unknown; buy?: unknown }
>;

// Lit l'entrée de cache, sinon appelle TMDB et met la réponse brute en cache
// (c'est aussi ce que stocke le proxy /api/tmdb pour la même URL). Renvoie le
// corps JSON brut de TMDB, ou null si TMDB a répondu en erreur.
async function fetchTmdbJsonCached(
  cacheUrl: string,
  tmdbPath: string,
  apiKey: string,
  cache: EdgeCache,
  ctx: WaitUntil
): Promise<unknown> {
  const cacheKey = new Request(cacheUrl);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.ok ? cached.json() : null;
  }
  const tmdbUrl = new URL(`https://api.themoviedb.org/3${tmdbPath}`);
  tmdbUrl.searchParams.set("api_key", apiKey);
  const res = await fetch(tmdbUrl.toString());
  const body = await res.text();
  if (!res.ok) {
    return null;
  }
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(body, {
        status: res.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      })
    )
  );
  return JSON.parse(body);
}

// Plateformes de streaming d'un titre, indexées par région (le champ
// `results` de TMDB). Le cache contient la réponse TMDB complète
// `{ id, results }` : le chemin « cache chaud » doit lui aussi en extraire
// `results`, sans quoi le badge plateforme des grilles disparaissait
// justement quand le titre était déjà en cache (audit H1).
export async function fetchWatchProvidersCached(
  origin: string,
  mediaType: "movie" | "tv",
  id: number,
  apiKey: string,
  cache: EdgeCache,
  ctx: WaitUntil
): Promise<WatchProvidersByRegion | null> {
  const data = (await fetchTmdbJsonCached(
    `${origin}/api/tmdb/${mediaType}/${id}/watch/providers?language=fr-FR`,
    `/${mediaType}/${id}/watch/providers`,
    apiKey,
    cache,
    ctx
  )) as { results?: WatchProvidersByRegion } | null;
  return data ? (data.results ?? {}) : null;
}

// Dates de sortie d'un film (réponse /release_dates complète, attendue
// telle quelle par getTheatricalDateFromDetails).
export async function fetchReleaseDatesCached(
  origin: string,
  id: number,
  apiKey: string,
  cache: EdgeCache,
  ctx: WaitUntil
): Promise<ReleaseDatesResponse | null> {
  return (await fetchTmdbJsonCached(
    `${origin}/api/tmdb/movie/${id}/release_dates?language=fr-FR`,
    `/movie/${id}/release_dates`,
    apiKey,
    cache,
    ctx
  )) as ReleaseDatesResponse | null;
}
