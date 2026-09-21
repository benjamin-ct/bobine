// Tests unitaires de la détection de bot côté client (src/core/botDetection.ts)
// — voir le ticket Trello "Milliers de calls workers". Complémentaire à
// verify-bot-detection.ts (worker/bots.ts) : ici on couvre le signal
// `navigator.webdriver`, indisponible côté Worker.
//
// Pas de framework de test dans ce repo (aucun Jest/Vitest) : script
// autonome, exécutable avec `node scripts/verify-bot-detection-client.ts`,
// sur le même modèle que les autres scripts verify:*.

import { isLikelyAutomatedClient } from "../src/core/botDetection.ts";

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

check(
  "navigator.webdriver=true -> détecté",
  isLikelyAutomatedClient({ webdriver: true, userAgent: "Mozilla/5.0 Chrome/128.0.0.0" }),
  true
);
check(
  "user-agent ShapBot (cas du ticket) -> détecté",
  isLikelyAutomatedClient({
    webdriver: false,
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (compatible; ShapBot/0.1.0)",
  }),
  true
);
check(
  "user-agent GPTBot -> détecté",
  isLikelyAutomatedClient({ webdriver: false, userAgent: "Mozilla/5.0 (compatible; GPTBot/1.0)" }),
  true
);
check(
  "navigateur humain (Chrome desktop) -> non détecté",
  isLikelyAutomatedClient({
    webdriver: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
  }),
  false
);
check(
  "webdriver undefined (navigateur ne supportant pas la propriété) -> non détecté",
  isLikelyAutomatedClient({ userAgent: "Mozilla/5.0 Chrome/128.0.0.0" }),
  false
);

console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
process.exit(failed > 0 ? 1 : 0);
