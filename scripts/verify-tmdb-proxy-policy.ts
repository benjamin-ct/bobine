// Tests de la liste blanche du proxy TMDB (worker/tmdb-proxy-policy.ts,
// audit H3) : chemins autorisés, paramètres filtrés/validés, clé normalisée.
// Script autonome (pas de framework de test dans ce repo), comme les autres
// scripts verify:*.

import { parseTmdbProxyRequest } from "../worker/tmdb-proxy-policy.ts";
import { checkRateLimitInMemory } from "../worker/rate-limit-memory.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) {
    console.log(`     attendu: ${JSON.stringify(expected)}`);
    console.log(`     obtenu : ${JSON.stringify(actual)}`);
  }
  ok ? passed++ : failed++;
}

function parse(path: string): string {
  const url = new URL(path, "https://example.test");
  const result = parseTmdbProxyRequest(url.pathname, url.searchParams);
  return result.ok ? `${result.tmdbPath}?${result.params}` : String(result.status);
}

// Chemins appelés par src/core/api/tmdb.ts
for (const path of [
  "/api/tmdb/discover/movie",
  "/api/tmdb/discover/tv",
  "/api/tmdb/search/multi",
  "/api/tmdb/search/person",
  "/api/tmdb/genre/tv/list",
  "/api/tmdb/configuration/countries",
  "/api/tmdb/configuration/languages",
  "/api/tmdb/trending/all/week",
  "/api/tmdb/watch/providers/movie",
  "/api/tmdb/movie/550",
  "/api/tmdb/tv/1399/watch/providers",
  "/api/tmdb/movie/550/release_dates",
  "/api/tmdb/movie/now_playing",
  "/api/tmdb/tv/1399/season/3",
  "/api/tmdb/person/287",
  "/api/tmdb/person/287/combined_credits",
  "/api/tmdb/collection/10",
]) {
  check(`chemin autorisé ${path}`, parse(path).startsWith(path.replace("/api/tmdb", "")), true);
}

for (const path of [
  "/api/tmdb/account/1",
  "/api/tmdb/movie/550/images",
  "/api/tmdb/tv/abc",
  "/api/tmdb/discover/person",
  "/api/tmdb/../3/movie/550",
]) {
  check(`chemin refusé ${path}`, parse(path), "404");
}

check(
  "paramètres triés, inconnus et api_key ignorés",
  parse(
    "/api/tmdb/discover/movie?page=2&cachebust=123&language=fr-FR&api_key=x&sort_by=popularity.desc"
  ),
  "/discover/movie?language=fr-FR&page=2&sort_by=popularity.desc"
);
check(
  "même clé quel que soit l'ordre",
  parse("/api/tmdb/discover/movie?sort_by=popularity.desc&page=2&language=fr-FR"),
  "/discover/movie?language=fr-FR&page=2&sort_by=popularity.desc"
);
check(
  "requête Découvrir complète acceptée",
  parse(
    "/api/tmdb/discover/movie?language=en-US&page=1&with_genres=28|12&without_genres=27,53&with_watch_providers=8|337&watch_region=FR&sort_by=vote_average.desc&vote_count.gte=300&vote_average.gte=6.5&with_runtime.lte=120&with_origin_country=US&with_original_language=en&primary_release_date.gte=2020-01-01&primary_release_date.lte=2026-09-29&include_adult=false&include_watch_providers_badge=1&watch_providers_badge_region=FR&include_region_release_date=1&region_release_date_region=FR"
  ).startsWith("/discover/movie?include_adult=false&include_region_release_date=1"),
  true
);
check(
  "append_to_response de la fiche série accepté",
  parse(
    "/api/tmdb/tv/1399?language=fr-FR&append_to_response=credits,aggregate_credits,videos,recommendations,release_dates,watch/providers"
  ).startsWith("/tv/1399?append_to_response="),
  true
);
check(
  "append_to_response inconnu refusé",
  parse("/api/tmdb/movie/550?append_to_response=images"),
  "400"
);
check("région invalide refusée", parse("/api/tmdb/watch/providers/movie?watch_region=fr"), "400");
check(
  "région d'enrichissement invalide refusée",
  parse("/api/tmdb/discover/movie?watch_providers_badge_region=XYZ"),
  "400"
);
check("page hors bornes refusée", parse("/api/tmdb/discover/movie?page=501"), "400");
check("recherche vide acceptée", parse("/api/tmdb/search/multi?query="), "/search/multi?query=");
check(
  "recherche trop longue refusée",
  parse(`/api/tmdb/search/multi?query=${"a".repeat(201)}`),
  "400"
);

{
  const key = `test:cost:${Math.random()}`;
  const limit = { limit: 10, windowMs: 60_000 };
  checkRateLimitInMemory(key, { ...limit, cost: 8 }, 0);
  check(
    "coût 0 = lecture, sous la limite",
    checkRateLimitInMemory(key, { ...limit, cost: 0 }, 0),
    true
  );
  checkRateLimitInMemory(key, { ...limit, cost: 5 }, 0);
  check(
    "coût imputé : limite dépassée",
    checkRateLimitInMemory(key, { ...limit, cost: 0 }, 0),
    false
  );
}

console.log(`\n${passed} OK, ${failed} échec(s)`);
if (failed > 0) {
  process.exit(1);
}
