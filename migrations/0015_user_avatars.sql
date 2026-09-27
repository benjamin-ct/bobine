-- Photo de profil personnelle (ticket « Ajouter son propre avatar ») : quand
-- elle existe, elle passe avant la photo Gravatar, elle-même prioritaire sur
-- les initiales. Une seule photo par compte, déjà recadrée et compressée par
-- le navigateur (JPEG carré de 256 px, quelques dizaines de Ko), d'où un
-- simple BLOB en D1 plutôt qu'un bucket R2. `updated_at` sert de version
-- dans l'URL de l'image (cache navigateur).
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
