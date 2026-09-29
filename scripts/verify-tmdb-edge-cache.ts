// Tests des sous-requêtes TMDB mises en cache à l'edge
// (worker/tmdb-edge-cache.ts), ajoutés pour l'audit H1 : sur un cache chaud,
// fetchWatchProvidersCached renvoyait la réponse TMDB complète `{id, results}`
// au lieu de `results`, et le badge plateforme des grilles disparaissait.
//
// Script autonome (pas de framework de test), sur le modèle des autres
// scripts verify:* : `node scripts/verify-tmdb-edge-cache.ts`.

import {
  fetchReleaseDatesCached,
  fetchWatchProvidersCached,
  type EdgeCache,
} from "../worker/tmdb-edge-cache.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) {
    console.log(`     attendu : ${JSON.stringify(expected)}`);
    console.log(`     obtenu  : ${JSON.stringify(actual)}`);
    failed++;
  } else {
    passed++;
  }
}

const store = new Map<string, Response>();
const cache: EdgeCache = {
  async match(request) {
    return store.get(request.url)?.clone();
  },
  async put(request, response) {
    store.set(request.url, response);
  },
};
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };

const tmdbBodies: Record<string, unknown> = {
  "/3/movie/42/watch/providers": {
    id: 42,
    results: { FR: { flatrate: [{ provider_id: 8 }] } },
  },
  "/3/movie/42/release_dates": {
    id: 42,
    results: [{ iso_3166_1: "FR", release_dates: [{ type: 3, release_date: "2026-01-01" }] }],
  },
};
let tmdbCalls = 0;
globalThis.fetch = async (input: string | URL | Request) => {
  tmdbCalls++;
  const { pathname } = new URL(String(input));
  const body = tmdbBodies[pathname];
  return body
    ? new Response(JSON.stringify(body), { status: 200 })
    : new Response('{"status_message":"not found"}', { status: 404 });
};

const origin = "https://example.test";
const expectedProviders = { FR: { flatrate: [{ provider_id: 8 }] } };

const cold = await fetchWatchProvidersCached(origin, "movie", 42, "k", cache, ctx);
await Promise.all(pending);
check("plateformes, cache froid : champ results", cold, expectedProviders);
const warm = await fetchWatchProvidersCached(origin, "movie", 42, "k", cache, ctx);
check("plateformes, cache chaud : même champ results (H1)", warm, expectedProviders);
check("plateformes, cache chaud : aucun nouvel appel TMDB", tmdbCalls, 1);

const releaseCold = await fetchReleaseDatesCached(origin, 42, "k", cache, ctx);
await Promise.all(pending);
const releaseWarm = await fetchReleaseDatesCached(origin, 42, "k", cache, ctx);
check(
  "dates de sortie : réponse complète, cache froid",
  releaseCold,
  tmdbBodies["/3/movie/42/release_dates"]
);
check("dates de sortie : identique en cache chaud", releaseWarm, releaseCold);

const missing = await fetchWatchProvidersCached(origin, "tv", 7, "k", cache, ctx);
check("erreur TMDB : null, rien mis en cache", [missing, store.size], [null, 2]);

console.log(`\n${passed} OK, ${failed} en échec`);
if (failed > 0) {
  process.exit(1);
}
