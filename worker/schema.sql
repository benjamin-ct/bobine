-- Schéma de la base D1 "bobine-notifications" (notifications push).
-- Appliqué en prod via le MCP Cloudflare. Pour le développement local :
--   npx wrangler d1 execute bobine-notifications --local --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  known_providers TEXT,
  PRIMARY KEY (subscription_id, media_type, tmdb_id)
);

CREATE TABLE IF NOT EXISTS genre_preferences (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (subscription_id, media_type, genre_id)
);

CREATE TABLE IF NOT EXISTS notified_releases (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  notified_at INTEGER NOT NULL,
  PRIMARY KEY (subscription_id, media_type, tmdb_id, reason)
);
