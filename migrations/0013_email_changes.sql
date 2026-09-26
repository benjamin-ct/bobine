-- Changement d'adresse email depuis Profil → Compte (ticket « modifier
-- l'adresse mail »). Table distincte de magic_links : un code consommé ici
-- ne doit jamais ouvrir de session (ni créer de compte), il prouve
-- seulement que l'utilisateur déjà connecté (user_id) contrôle la nouvelle
-- adresse. Une seule demande en attente par compte (les précédentes sont
-- supprimées à chaque nouvelle demande), valable 15 minutes.
CREATE TABLE IF NOT EXISTS email_changes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
