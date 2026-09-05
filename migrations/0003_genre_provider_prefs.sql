-- Genres exclus et plateformes favorites synchronisés par compte, au même
-- titre que la bibliothèque (migration 0002) — jusque-là volontairement
-- locaux à l'appareil (voir ExcludedGenresContext / FavoriteProvidersContext).
CREATE TABLE IF NOT EXISTS excluded_genre_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, genre_id)
);

CREATE TABLE IF NOT EXISTS favorite_provider_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider_id)
);
