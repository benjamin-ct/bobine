// Vérifie l'algorithme du plafond de concurrence utilisé par tmdbFetch()
// (src/core/api/concurrencyLimiter.ts) : jamais plus de `maxConcurrent`
// requêtes réellement en vol en même temps, aucune requête perdue, aucun
// blocage permanent même si certaines échouent.
//
// Pas de framework de test dans ce repo — script autonome, comme
// scripts/verify-upcoming-badge.ts. Le limiteur est IMPORTÉ directement
// depuis concurrencyLimiter.ts (module pur, sans `import.meta.env` ni
// réseau, chargeable sous Node nu) : plus aucune copie de l'algorithme à
// garder synchronisée. On instancie ici un limiteur jetable dédié aux
// tests et on inspecte son `activeCount`.

import { createConcurrencyLimiter } from "../src/core/api/concurrencyLimiter.ts";

const MAX_CONCURRENT_REQUESTS = 6;
const limiter = createConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);
const withConcurrencyLimit = <T>(fn: () => Promise<T>): Promise<T> => limiter.run(fn);

let passed = 0;
let failed = 0;
function report(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  ok ? passed++ : failed++;
}

async function testBurstNeverExceedsCap(): Promise<void> {
  let maxObserved = 0;
  let current = 0;
  const N = 20;
  const tasks = Array.from({ length: N }, (_, i) =>
    withConcurrencyLimit(async () => {
      current++;
      maxObserved = Math.max(maxObserved, current);
      await new Promise((r) => setTimeout(r, 15 + (i % 5) * 5));
      current--;
      return i;
    })
  );
  const results = await Promise.all(tasks);
  report(
    `Rafale de ${N} requêtes : toutes résolues sans perte`,
    results.length === N && new Set(results).size === N
  );
  report(
    `Rafale de ${N} requêtes : plafond jamais dépassé`,
    maxObserved <= MAX_CONCURRENT_REQUESTS,
    `max observé = ${maxObserved}, plafond = ${MAX_CONCURRENT_REQUESTS}`
  );
  report("Compteur revenu à 0 après la rafale", limiter.activeCount === 0);
}

async function testFailureReleasesSlot(): Promise<void> {
  const before = limiter.activeCount;
  const tasks = [1, 2, 3, 4, 5].map((i) =>
    withConcurrencyLimit(
      () =>
        new Promise<number>((res, rej) =>
          setTimeout(() => (i === 3 ? rej(new Error(`boom ${i}`)) : res(i)), 10)
        )
    )
  );
  const outcomes = await Promise.allSettled(tasks);
  const rejectedCount = outcomes.filter((o) => o.status === "rejected").length;
  report("Une requête en échec ne bloque pas les autres", rejectedCount === 1);
  report("Le compteur revient à son niveau initial après un échec", limiter.activeCount === before);
}

async function main(): Promise<void> {
  await testBurstNeverExceedsCap();
  await testFailureReleasesSlot();
  console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
