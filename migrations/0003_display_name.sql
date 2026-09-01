-- Migration number: 0003 	 2026-09-01T18:19:24.148Z

-- Nom affiché (ticket #45) : jusqu'ici une préférence purement locale
-- (localStorage côté navigateur, voir AccountCard.tsx), donc jamais
-- synchronisée entre appareils. Colonne nullable : aucun utilisateur
-- existant n'a encore de valeur, pas de backfill nécessaire (pas
-- d'utilisateurs en prod à ce stade). Mis à jour uniquement via
-- PATCH /api/account/display-name, sur un save manuel (pas de synchro
-- automatique/temps réel — décision produit explicite pour ce ticket).
ALTER TABLE users ADD COLUMN display_name TEXT;
