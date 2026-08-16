// Vérifie l'algorithme du plafond de concurrence ajouté à tmdbFetch()
// (src/api/tmdb.js) : jamais plus de MAX_CONCURRENT_REQUESTS requêtes
// réellement en vol en même temps, aucune requête perdue, aucun blocage
// permanent même si certaines échouent.
//
// Pas de framework de test dans ce repo — script autonome, comme
// scripts/verify-upcoming-badge.mjs. Algorithme copié verbatim depuis
// tmdb.js (import direct impossible sous Node nu : tmdb.js lit
// `import.meta.env.*` au chargement du module, une transformation propre
// à Vite qui n'existe pas en Node natif).

const MAX_CONCURRENT_REQUESTS = 6;
let activeRequests = 0;
const pendingQueue = [];

function runNextQueued() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || pendingQueue.length === 0) return;
  const next = pendingQueue.shift();
  activeRequests++;
  next();
}

function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeRequests--;
          runNextQueued();
        });
    };
    pendingQueue.push(run);
    runNextQueued();
  });
}

let passed = 0;
let failed = 0;
function report(name, ok, detail) {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  ok ? passed++ : failed++;
}

async function testBurstNeverExceedsCap() {
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
  report("Compteur revenu à 0 après la rafale", activeRequests === 0);
}

async function testFailureReleasesSlot() {
  const before = activeRequests;
  const tasks = [1, 2, 3, 4, 5].map((i) =>
    withConcurrencyLimit(
      () => new Promise((res, rej) => setTimeout(() => (i === 3 ? rej(new Error(`boom ${i}`)) : res(i)), 10))
    )
  );
  const outcomes = await Promise.allSettled(tasks);
  const rejectedCount = outcomes.filter((o) => o.status === "rejected").length;
  report("Une requête en échec ne bloque pas les autres", rejectedCount === 1);
  report("Le compteur revient à son niveau initial après un échec", activeRequests === before);
}

async function main() {
  await testBurstNeverExceedsCap();
  await testFailureReleasesSlot();
  console.log(`\n${passed} test(s) passé(s), ${failed} échoué(s).`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
