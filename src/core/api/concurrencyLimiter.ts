// Limiteur de concurrence générique, isolé à dessein : aucune dépendance à
// `import.meta.env` ni au réseau, donc importable tel quel par Node natif
// (script de vérification, voir scripts/verify-tmdb-concurrency-cap.ts) ET
// par le client Vite.
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
export interface ConcurrencyLimiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Lecture seule, pour l'observabilité (tests, debug) : jamais utilisé
   * pour piloter la logique côté application. */
  readonly activeCount: number;
  readonly maxConcurrent: number;
}

export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  let activeCount = 0;
  const pendingQueue: Array<() => void> = [];

  function runNextQueued(): void {
    if (activeCount >= maxConcurrent || pendingQueue.length === 0) {
      return;
    }
    const next = pendingQueue.shift();
    if (!next) {
      return;
    }
    activeCount++;
    next();
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
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
    get activeCount() {
      return activeCount;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
  };
}
