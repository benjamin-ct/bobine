-- Signal négatif explicite "Pas intéressé" (voir carte Trello
-- "Recommandations personnalisées « Pour toi »") : distinct d'un simple
-- titre jamais vu, ce signal alimente l'affinité genre/décennie calculée par
-- worker/recommendations.ts au même titre qu'une note basse sur un titre vu.
-- genre_ids/year sont dupliqués depuis le candidat (déjà connus du Worker au
-- moment du clic, voir la réponse de /api/recommendations) plutôt que
-- relus via un appel TMDB supplémentaire à l'écriture ou à chaque calcul de
-- profil.
CREATE TABLE IF NOT EXISTS not_interested_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  genre_ids TEXT NOT NULL,
  year INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id)
);
