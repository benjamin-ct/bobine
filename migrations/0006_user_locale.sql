-- Langue d'interface synchronisée par compte, au même titre que les
-- plateformes favorites (migration 0004) : NULL tant que l'utilisateur n'a
-- jamais explicitement choisi/synchronisé de langue depuis un appareil (on
-- laisse alors la détection navigateur faire foi côté client).
ALTER TABLE users ADD COLUMN locale TEXT;
