-- Région choisie manuellement par l'utilisateur, synchronisée par compte au
-- même titre que la langue (migration 0006) : NULL tant qu'aucun choix
-- manuel n'a été fait, auquel cas /api/region (géolocalisation Cloudflare)
-- continue de faire foi côté client.
ALTER TABLE users ADD COLUMN region TEXT;
