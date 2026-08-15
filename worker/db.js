// Petites fonctions d'accès à D1. Pas d'ORM : le schéma est simple (voir
// scripts/schema.sql) et les requêtes préparées suffisent largement.

import { decodeHtmlEntities } from "./validate.js";

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

// Bibliothèque "vu / envie de voir" synchronisée par compte. -------------

// Renvoie la bibliothèque au même format que l'état client (LibraryContext) :
// { watched: { "movie:123": {...} }, watchlist: { "tv:456": {...} } }.
export async function getLibraryForUser(db, userId) {
  const { results } = await db
    .prepare("SELECT media_type, tmdb_id, status, data, updated_at FROM library_items WHERE user_id = ?")
    .bind(userId)
    .all();
  const watched = {};
  const watchlist = {};
  for (const row of results) {
    const key = `${row.media_type}:${row.tmdb_id}`;
    const item = { ...JSON.parse(row.data), updatedAt: row.updated_at };
    // Répare à la volée les titres encore corrompus par l'ancien bug de
    // double-échappement (voir decodeHtmlEntities dans validate.js) sans
    // attendre une prochaine écriture — la version propre est réécrite en
    // base dès le prochain PUT (toggle) puisque le client renvoie l'état
    // reçu ici tel quel.
    if (typeof item.title === "string") item.title = decodeHtmlEntities(item.title);
    if (row.status === "watched") watched[key] = item;
    else watchlist[key] = item;
  }
  return { watched, watchlist };
}

// Remplace entièrement la bibliothèque du compte par l'état envoyé par le
// client (le client fusionne avec le serveur avant d'appeler ceci — voir
// LibraryContext — donc un simple remplacement complet est correct et
// évite d'avoir à gérer des suppressions "orphelines" côté serveur).
export async function replaceLibraryForUser(db, userId, { watched, watchlist }) {
  await db.prepare("DELETE FROM library_items WHERE user_id = ?").bind(userId).run();

  const rows = [];
  for (const [key, item] of Object.entries(watched || {})) {
    const [mediaType, tmdbId] = key.split(":");
    rows.push({ mediaType, tmdbId, status: "watched", item });
  }
  for (const [key, item] of Object.entries(watchlist || {})) {
    const [mediaType, tmdbId] = key.split(":");
    rows.push({ mediaType, tmdbId, status: "watchlist", item });
  }
  if (rows.length === 0) return;

  const stmt = db.prepare(
    "INSERT INTO library_items (user_id, media_type, tmdb_id, status, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  await db.batch(
    rows.map(({ mediaType, tmdbId, status, item }) => {
      const { updatedAt, ...rest } = item;
      return stmt.bind(userId, mediaType, Number(tmdbId), status, JSON.stringify(rest), updatedAt || Date.now());
    })
  );
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
