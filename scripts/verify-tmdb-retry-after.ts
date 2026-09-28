// Vérifie le calcul du délai de réessai de tmdbFetch() sur un 429
// (src/core/api/retryAfter.ts, ticket « Un peu trop souvent d'erreur ») :
// `retry-after` du proxy respecté, repli sur un backoff court sans en-tête
// exploitable, et jamais plus que MAX_RETRY_DELAY_MS.
//
// Pas de framework de test dans ce repo — script autonome, comme
// scripts/verify-tmdb-concurrency-cap.ts.

import { MAX_RETRY_DELAY_MS, retryDelayMs } from "../src/core/api/retryAfter.ts";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) {
    console.log(`     attendu: ${JSON.stringify(expected)}`);
    console.log(`     obtenu : ${JSON.stringify(actual)}`);
  }
  ok ? passed++ : failed++;
}

check("retry-after en secondes respecté", retryDelayMs("12", 0), 12_000);
check("retry-after à 0 : réessai immédiat", retryDelayMs("0", 1), 0);
check("sans en-tête : backoff 2 s au premier réessai", retryDelayMs(null, 0), 2000);
check("sans en-tête : backoff 4 s au second réessai", retryDelayMs(null, 1), 4000);
check("en-tête vide : backoff", retryDelayMs("", 0), 2000);
check(
  "en-tête date HTTP (non numérique) : backoff",
  retryDelayMs("Wed, 21 Oct 2026 07:28:00 GMT", 0),
  2000
);
check("en-tête négatif : backoff", retryDelayMs("-5", 0), 2000);
check("plafonné", retryDelayMs("3600", 0), MAX_RETRY_DELAY_MS);
check("backoff plafonné aussi", retryDelayMs(null, 10), MAX_RETRY_DELAY_MS);

console.log(`\n${passed} OK, ${failed} FAIL`);
if (failed > 0) {
  process.exit(1);
}
