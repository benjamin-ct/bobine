-- Partage du profil en lecture seule (ticket « Possibilité de voir/partager
-- son profil ») : opt-in explicite depuis Profil → Compte. NULL = profil
-- privé (défaut pour tous les comptes existants, pas de backfill). Le slug
-- est aléatoire et non devinable (pas l'id ni le nom affiché) : seules les
-- personnes ayant reçu le lien peuvent voir le profil. Désactiver le
-- partage remet la colonne à NULL, ce qui invalide définitivement l'ancien
-- lien ; le réactiver en génère un nouveau.
ALTER TABLE users ADD COLUMN share_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_share_slug ON users(share_slug);
