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

-- Comptes (connexion par lien magique) + synchronisation de la bibliothèque
-- "vu / envie de voir" entre appareils. --------------------------------

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

-- Jetons à usage unique envoyés par email, consommés par /api/auth/verify.
CREATE TABLE IF NOT EXISTS magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- Sessions longue durée (cookie httpOnly côté client).
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Un titre "vu" ou "envie de voir" ne peut pas être les deux à la fois (même
-- règle que côté client), donc une seule ligne par (utilisateur, titre).
-- `data` porte le reste de l'item (titre, affiche, note, durée...) en JSON :
-- pas besoin d'une colonne par champ, le client est la seule source de
-- vérité sur la forme de ces données.
CREATE TABLE IF NOT EXISTS library_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watched', 'watchlist')),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id)
);
