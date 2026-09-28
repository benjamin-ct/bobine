// Délai avant de réessayer une requête refusée en 429, isolé à dessein (pas
// d'`import.meta.env`, pas de réseau) pour rester testable sous Node nu, voir
// scripts/verify-tmdb-retry-after.ts.
//
// Le proxy TMDB (worker/index.ts) envoie `retry-after` en secondes : la fin
// de sa fenêtre d'une minute. Sans en-tête exploitable (429 renvoyé par TMDB
// lui-même, relayé tel quel), repli sur un backoff exponentiel court.
// Toujours plafonné : au-delà, mieux vaut afficher l'erreur que laisser un
// chargement tourner indéfiniment.
export const MAX_RETRY_DELAY_MS = 60_000;

export function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const seconds = Number(retryAfterHeader);
  const delay =
    retryAfterHeader !== null &&
    retryAfterHeader.trim() !== "" &&
    Number.isFinite(seconds) &&
    seconds >= 0
      ? seconds * 1000
      : 2000 * 2 ** attempt;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}
