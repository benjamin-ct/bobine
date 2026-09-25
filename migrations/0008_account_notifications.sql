-- Notifications via le hub temps réel (option A "hybride") : un abonnement
-- push peut désormais être rattaché au compte connecté sur l'appareil, pour
-- que le scheduler (worker/scheduled.ts, notifyUser) puisse livrer une
-- notification in-app à n'importe quel appareil connecté du compte, et ne
-- retomber sur le Web Push que si aucun n'est connecté. Les abonnements des
-- visiteurs non connectés restent anonymes (user_id NULL) et continuent de
-- recevoir du Web Push uniquement, comme avant.
--
-- `sync_host` : hôte de l'app au moment du rattachement. Le hub d'un compte
-- est identifié par (hôte, compte) — voir hubFor dans worker/sync.ts — et le
-- cron n'a pas de requête d'où tirer cet hôte.
ALTER TABLE subscriptions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN sync_host TEXT;
CREATE INDEX IF NOT EXISTS subscriptions_user_id ON subscriptions(user_id);

-- Historique des sorties déjà notifiées, au niveau du compte : sans lui, un
-- compte avec plusieurs appareils abonnés recevrait la même notification
-- in-app une fois par appareil. notified_releases reste utilisé pour les
-- abonnements anonymes.
CREATE TABLE IF NOT EXISTS user_notified_releases (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  notified_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, media_type, tmdb_id, reason)
);
