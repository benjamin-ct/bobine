-- Langue à utiliser pour les notifications push envoyées par le scheduler
-- (worker/scheduled.ts) — voir sous-ticket i18n b). Contrairement à l'email
-- "lien de connexion" (résolu via la locale envoyée avec la requête, le
-- destinataire étant alors le demandeur), un push planifié n'a pas de
-- requête associée au moment de l'envoi : la langue doit donc être
-- persistée au niveau de l'abonnement (les abonnements push restent
-- anonymes/par appareil, indépendants des comptes users — voir
-- upsertSubscription). Par défaut 'fr' : aucun abonnement existant n'a
-- connu d'autre langue jusqu'ici.
ALTER TABLE subscriptions ADD COLUMN locale TEXT NOT NULL DEFAULT 'fr';
