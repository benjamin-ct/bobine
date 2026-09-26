-- Pseudo public (ticket « Ajoute de pseudo ») : facultatif, unique, choisi
-- depuis Profil → Compte. Une fois renseigné, il remplace le slug aléatoire
-- dans le lien de partage du profil (/u/<pseudo>) — mais seulement tant que
-- le partage est actif (share_slug non NULL, voir 0009) : un profil privé
-- reste introuvable, pseudo ou pas. Stocké déjà normalisé en minuscules
-- (voir normalizeUsername côté Worker), donc l'index unique suffit à
-- garantir l'unicité insensible à la casse. NULL = pas de pseudo (défaut
-- pour tous les comptes existants).
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username);
