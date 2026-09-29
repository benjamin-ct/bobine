-- Index manquants relevés par l'audit (M1) : les sessions d'un compte sont
-- désormais supprimées en bloc (changement d'email, « se déconnecter de tous
-- les appareils »), et les liens magiques d'une adresse sont invalidés en
-- bloc au changement d'email (voir worker/auth.ts).
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
