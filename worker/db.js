// Petites fonctions d'accès à D1. Pas d'ORM : le schéma est simple (voir
// scripts/schema.sql) et les requêtes préparées suffisent largement.

export async function upsertSubscription(db, { endpoint, p256dh, auth }) {
  const existing = await db
    .prepare("SELECT id FROM subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .first();
  if (existing) return existing.id;

  const result = await db
    .prepare("INSERT INTO subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)")
    .bind(endpoint, p256dh, auth, Date.now())
    .run();
  return result.meta.last_row_id;
}

export async function deleteSubscription(db, endpoint) {
  await db.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

export async function deleteSubscriptionById(db, id) {
  await db.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
}

// Remplace entièrement la liste "envie de voir" connue du serveur pour cet
// abonnement (le client est la source de vérité ; on synchronise à chaque
// changement plutôt que de tenter un diff incrémental côté serveur).
export async function replaceWatchlist(db, subscriptionId, items) {
  await db.prepare("DELETE FROM watchlist_items WHERE subscription_id = ?").bind(subscriptionId).run();
  if (!items.length) return;
  const stmt = db.prepare(
    "INSERT INTO watchlist_items (subscription_id, media_type, tmdb_id, title, poster_path, known_providers) VALUES (?, ?, ?, ?, ?, ?)"
  );
  await db.batch(
    items.map((item) =>
      stmt.bind(subscriptionId, item.mediaType, item.tmdbId, item.title, item.posterPath || null, null)
    )
  );
}

export async function replaceGenrePreferences(db, subscriptionId, genres) {
  await db.prepare("DELETE FROM genre_preferences WHERE subscription_id = ?").bind(subscriptionId).run();
  if (!genres.length) return;
  const stmt = db.prepare(
    "INSERT INTO genre_preferences (subscription_id, media_type, genre_id) VALUES (?, ?, ?)"
  );
  await db.batch(genres.map((g) => stmt.bind(subscriptionId, g.mediaType, g.genreId)));
}

export async function getAllSubscriptions(db) {
  const { results } = await db.prepare("SELECT * FROM subscriptions").all();
  return results;
}

export async function getWatchlistForSubscription(db, subscriptionId) {
  const { results } = await db
    .prepare("SELECT * FROM watchlist_items WHERE subscription_id = ?")
    .bind(subscriptionId)
    .all();
  return results;
}

export async function getGenrePreferencesForSubscription(db, subscriptionId) {
  const { results } = await db
    .prepare("SELECT * FROM genre_preferences WHERE subscription_id = ?")
    .bind(subscriptionId)
    .all();
  return results;
}

export async function updateKnownProviders(db, subscriptionId, mediaType, tmdbId, providerIds) {
  await db
    .prepare(
      "UPDATE watchlist_items SET known_providers = ? WHERE subscription_id = ? AND media_type = ? AND tmdb_id = ?"
    )
    .bind(JSON.stringify(providerIds), subscriptionId, mediaType, tmdbId)
    .run();
}

export async function wasAlreadyNotified(db, subscriptionId, mediaType, tmdbId, reason) {
  const row = await db
    .prepare(
      "SELECT 1 FROM notified_releases WHERE subscription_id = ? AND media_type = ? AND tmdb_id = ? AND reason = ?"
    )
    .bind(subscriptionId, mediaType, tmdbId, reason)
    .first();
  return Boolean(row);
}

export async function markNotified(db, subscriptionId, mediaType, tmdbId, reason) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO notified_releases (subscription_id, media_type, tmdb_id, reason, notified_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(subscriptionId, mediaType, tmdbId, reason, Date.now())
    .run();
}
