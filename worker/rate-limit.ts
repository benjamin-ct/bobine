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

export function getClientIp(request: Request): string {
  // En-tête posé par Cloudflare lui-même sur toute requête passant par son
  // réseau — pas falsifiable par le client (contrairement à X-Forwarded-For).
  return request.headers.get("cf-connecting-ip") || "unknown";
}
