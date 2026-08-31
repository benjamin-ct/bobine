-- Listes personnalisées ("Marvel", "Halloween"...) synchronisées par compte,
-- au même titre que la bibliothèque (ticket #32 : elles étaient jusque-là
-- volontairement locales à l'appareil).
CREATE TABLE IF NOT EXISTS custom_lists (
  id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Un item de liste perso stocke sa donnée complète (comme library_items),
-- indépendamment de son statut vu/envie de voir. `position` porte le tri
-- manuel (glisser-déposer) : l'ordre d'insertion seul n'est pas garanti à la
-- lecture par SQLite sans ORDER BY explicite.
CREATE TABLE IF NOT EXISTS custom_list_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id, media_type, tmdb_id)
);
