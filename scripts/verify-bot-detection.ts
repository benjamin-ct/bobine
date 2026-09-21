// Tests unitaires de la détection des crawlers connus (worker/bots.ts) : le
// user-agent `ShapBot/0.1.0` observé dans le ticket Trello "Milliers de
// calls workers" doit être détecté, tout comme les autres bots IA/moteurs de
// recherche listés, sans faux positif sur un navigateur humain classique.
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : script
// autonome, exécutable avec `node scripts/verify-bot-detection.ts`, sur le
// même modèle que les autres scripts verify:*.

import { detectKnownCrawler } from "../worker/bots.ts";

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

function requestWithUa(ua: string | null): Request {
  return new Request("https://example.com/api/tmdb/discover/movie", {
    headers: ua ? { "user-agent": ua } : {},
  });
}

check(
  "ShapBot (cas du ticket) -> détecté",
  detectKnownCrawler(requestWithUa("Mozilla/5.0 AppleWebKit/537.36 (compatible; ShapBot/0.1.0)")),
  "shapbot"
);
check(
  "GPTBot -> détecté",
  detectKnownCrawler(requestWithUa("Mozilla/5.0 (compatible; GPTBot/1.0)")),
  "gptbot"
);
check(
  "Googlebot -> détecté",
  detectKnownCrawler(requestWithUa("Mozilla/5.0 (compatible; Googlebot/2.1)")),
  "googlebot"
);
check(
  "Navigateur humain (Chrome desktop) -> non détecté",
  detectKnownCrawler(
    requestWithUa(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36"
    )
  ),
  null
);
check("User-agent absent -> non détecté", detectKnownCrawler(requestWithUa(null)), null);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
