// Limiteur de concurrence générique, isolé de tmdb.js à dessein : aucune
// dépendance à `import.meta.env` ni au réseau, donc importable tel quel
// par Node natif (script de vérification, voir
// scripts/verify-tmdb-concurrency-cap.mjs) ET par le client Vite. Plus de
// copie verbatim de l'algorithme à garder synchronisée.
//
// Fabrique un limiteur INDÉPENDANT (état encapsulé, pas de singleton
// module) : chaque appel à createConcurrencyLimiter() a sa propre file et
// son propre compteur, ce qui permet aux tests d'instancier un limiteur
// jetable et d'inspecter son état sans toucher à celui de l'application.
//
// `run(fn)` renvoie une promesse qui se résout/rejette comme `fn()`, mais
// n'exécute jamais plus de `maxConcurrent` `fn` en parallèle : les appels
// en trop patientent dans une file plutôt que d'échouer, et un slot est
// libéré dès qu'une tâche se termine (succès OU échec — un échec ne bloque
// donc jamais la file).
export function createConcurrencyLimiter(maxConcurrent) {
  let activeCount = 0;
  const pendingQueue = [];

  function runNextQueued() {
    if (activeCount >= maxConcurrent || pendingQueue.length === 0) {
      return;
    }
    const next = pendingQueue.shift();
    activeCount++;
    next();
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            activeCount--;
            runNextQueued();
          });
      };
      pendingQueue.push(exec);
      runNextQueued();
    });
  }

  return {
    run,
    // Lecture seule, pour l'observabilité (tests, debug) : jamais utilisé
    // pour piloter la logique côté application.
    get activeCount() {
      return activeCount;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
  };
}
