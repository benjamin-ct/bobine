-- Rappels « Me prévenir » (ticket « Nouvelle DA 4/10 », page Prochainement) :
-- indépendants de l'envie de voir, rattachés au compte. Le scheduler
-- (worker/scheduled.ts, checkReminders) prévient le jour de la sortie
-- (`release_date`, date affichée au moment de l'ajout) puis à chaque arrivée
-- sur une plateforme de streaming (`known_providers`, même principe que
-- watchlist_items : NULL tant que la première référence n'est pas prise).
-- `sync_host` : hôte depuis lequel le rappel a été posé, pour livrer in-app
-- même à un compte qui n'a jamais activé les notifications push.
CREATE TABLE IF NOT EXISTS reminders (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  release_date TEXT,
  known_providers TEXT,
  sync_host TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id)
);
