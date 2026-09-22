// Limitation de débit à fenêtre fixe, sur D1 (pas de dépendance à une
// fonctionnalité Workers séparée type "Rate Limiting binding" — un simple
// compteur en base suffit très largement pour le volume d'une app perso).
//
// `checkRateLimit` incrémente atomiquement le compteur de la fenêtre en
// cours pour `key` et renvoie `true` tant que le total reste sous `limit`.
// Un même appelant peut être soumis à plusieurs fenêtres/clés en parallèle
// (ex. par email ET par IP) — voir les usages dans index.ts.
export async function checkRateLimit(
  db: D1Database,
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

// Variante sans écriture D1, pour les routes à très fort volume (voir
// ticket Trello "Milliers de calls workers") : `checkRateLimit` ci-dessus
// écrit en base à *chaque* requête, ce qui a fini par épuiser le quota
// d'écritures D1 une fois le proxy TMDB soumis au trafic d'un crawler
// distribué (le correctif anti-bot lui-même en écrivait deux fois plus, via
// le plafond dédié par famille de bot en plus du plafond par IP).
//
// Le compteur vit en mémoire, au niveau du module — donc partagé entre
// toutes les requêtes traitées par la même instance de Worker tant qu'elle
// reste chaude, mais remis à zéro à chaque cold start et jamais partagé
// entre isolats/colos différents. C'est approximatif (un crawler distribué
// sur plusieurs PoP peut dépasser légèrement `limit` en agrégé), mais
// suffisant ici : l'objectif est de plafonner un volume agrégé, pas de
// produire un compteur exact façon quota de facturation — voir
// `checkRateLimit` (D1, exact) pour les routes sensibles/basse fréquence
// (auth, magic links...) où l'exactitude importe davantage que le coût.
const inMemoryCounters = new Map<string, { windowStart: number; count: number }>();

// Purge opportuniste des fenêtres expirées pour éviter une fuite mémoire sur
// la durée de vie de l'isolat (clés à forte cardinalité : une par IP/famille
// de bot). Déclenchée au-delà d'une taille de map arbitraire plutôt qu'à
// chaque appel, pour ne pas payer ce coût sur le chemin chaud.
function pruneExpiredCounters(now: number): void {
  if (inMemoryCounters.size < 10_000) return;
  for (const [key, entry] of inMemoryCounters) {
    if (entry.windowStart + 5 * 60_000 < now) {
      inMemoryCounters.delete(key);
    }
  }
}

export function checkRateLimitInMemory(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now()
): boolean {
  pruneExpiredCounters(now);
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const existing = inMemoryCounters.get(key);
  const count = existing && existing.windowStart === windowStart ? existing.count + 1 : 1;
  inMemoryCounters.set(key, { windowStart, count });
  return count <= limit;
}

export function getClientIp(request: Request): string {
  // En-tête posé par Cloudflare lui-même sur toute requête passant par son
  // réseau — pas falsifiable par le client (contrairement à X-Forwarded-For).
  return request.headers.get("cf-connecting-ip") || "unknown";
}
