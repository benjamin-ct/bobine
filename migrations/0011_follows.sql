-- Suivre un profil (ticket « Suivre/follow un profil ») : abonnement
-- immédiat, sans validation par la personne suivie. Un compte ne peut suivre
-- qu'un profil partagé (users.share_slug non NULL, voir 0009) : le Worker
-- résout toujours la cible par son slug. Si la personne suivie rend ensuite
-- son profil privé, la ligne est conservée mais masquée (listes, compteurs
-- d'abonnements, fil d'activité) jusqu'à ce qu'elle le repartage.
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS follows_followed_id ON follows(followed_id);
