-- Partage des listes perso en lecture seule (ticket « Possibilité de share
-- des lists (read only) ») : une ligne par liste partagée, créée à la
-- demande (bouton « Partager » de la liste) et supprimée quand le
-- propriétaire arrête le partage. Le slug est aléatoire et non devinable :
-- l'id de liste (list-<timestamp>-<aléa court>) n'est ni unique globalement
-- ni assez imprévisible pour servir d'URL publique.
--
-- Pas de clé étrangère vers custom_lists : replaceCustomListsForUser
-- supprime puis réinsère toutes les listes d'un compte à chaque synchro, ce
-- qui effacerait les partages en cascade. Une ligne dont la liste a été
-- supprimée devient simplement introuvable (404) côté page publique.
CREATE TABLE IF NOT EXISTS list_shares (
  slug TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, list_id)
);
