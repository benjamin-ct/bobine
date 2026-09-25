// Point d'entrée unique des notifications (option A "hybride" du ticket
// "Notifications via le hub temps réel") : notifyUser choisit le canal.
//
// - Destinataire rattaché à un compte (abonnement push activé sur un appareil
//   connecté, voir migration 0008) : notification in-app via le hub temps
//   réel du compte (worker/sync.ts) si au moins un appareil y est connecté,
//   sinon Web Push sur chacun de ses abonnements.
// - Visiteur anonyme : Web Push uniquement, comme avant.
//
// La notification in-app voyage sous forme structurée (`kind` + titre du
// média) et est mise en forme côté client dans la langue active de l'app
// (voir src/shared/components/InAppNotifications) ; le Web Push, lui, est
// rédigé ici dans la langue enregistrée sur chaque abonnement.
import { deleteSubscriptionById } from "./db.ts";
import { sendPush, ExpiredSubscriptionError } from "./push.ts";
import { deliverToUser } from "./sync.ts";
import { logError } from "./logger.ts";
import type { Env, SubscriptionRow } from "./types.ts";

// Doit rester aligné avec NotificationKind (src/core/sync/liveSync.ts).
// "test" : envoyée à la demande depuis les réglages (POST /api/notifications/test).
export type NotificationKind =
  "watchlistAvailable" | "favoriteGenreRelease" | "trendingRelease" | "test";

export interface AppNotification {
  kind: NotificationKind;
  mediaTitle: string;
  url: string;
}

// Un compte (tous ses abonnements rattachés) ou un abonnement anonyme seul.
export interface NotificationRecipient {
  userId: number | null;
  subscriptions: SubscriptionRow[];
}

export type NotificationChannel = "in-app" | "push";

type PushLocale = "fr" | "en";

function pushLocaleOf(subscription: SubscriptionRow): PushLocale {
  return subscription.locale === "en" ? "en" : "fr";
}

const PUSH_CONTENT: Record<
  PushLocale,
  Record<NotificationKind, (title: string) => { title: string; body: string }>
> = {
  fr: {
    watchlistAvailable: (title) => ({
      title: "Bobine : nouvelle dispo 🎬",
      body: `« ${title} » est maintenant disponible en streaming.`,
    }),
    favoriteGenreRelease: (title) => ({
      title: "Bobine : nouveauté dans tes genres préférés 🍿",
      body: `« ${title} » vient de sortir.`,
    }),
    trendingRelease: (title) => ({
      title: "Bobine : ça sort en ce moment 🔥",
      body: `« ${title} » fait parler de lui.`,
    }),
    test: () => ({
      title: "Bobine : notification de test 🔔",
      body: "Reçue en Web Push : aucun appareil de ton compte n'avait l'app ouverte.",
    }),
  },
  en: {
    watchlistAvailable: (title) => ({
      title: "Bobine: new availability 🎬",
      body: `"${title}" is now available to stream.`,
    }),
    favoriteGenreRelease: (title) => ({
      title: "Bobine: new in your favorite genres 🍿",
      body: `"${title}" was just released.`,
    }),
    trendingRelease: (title) => ({
      title: "Bobine: trending right now 🔥",
      body: `"${title}" is getting a lot of buzz.`,
    }),
    test: () => ({
      title: "Bobine: test notification 🔔",
      body: "Received via Web Push: no device on your account had the app open.",
    }),
  },
};

async function deliverInApp(
  userId: number,
  subscriptions: SubscriptionRow[],
  notification: AppNotification
): Promise<boolean> {
  // Un hub par (hôte, compte) : on vise chaque hôte depuis lequel un
  // appareil du compte s'est abonné (en pratique, un seul).
  const hosts = new Set(
    subscriptions.map((s) => s.sync_host).filter((host): host is string => Boolean(host))
  );
  let delivered = 0;
  for (const host of hosts) {
    delivered += await deliverToUser(host, userId, {
      type: "notification",
      payload: notification,
    });
  }
  return delivered > 0;
}

async function deliverPush(
  env: Env,
  subscription: SubscriptionRow,
  notification: AppNotification
): Promise<void> {
  try {
    await sendPush(
      subscription,
      {
        ...PUSH_CONTENT[pushLocaleOf(subscription)][notification.kind](notification.mediaTitle),
        url: notification.url,
      },
      env
    );
  } catch (err) {
    if (err instanceof ExpiredSubscriptionError) {
      await deleteSubscriptionById(env.DB, subscription.id);
    } else {
      logError(`Push échoué pour l'abonnement ${subscription.id} :`, err);
    }
  }
}

export async function notifyUser(
  env: Env,
  recipient: NotificationRecipient,
  notification: AppNotification
): Promise<NotificationChannel> {
  if (
    recipient.userId !== null &&
    (await deliverInApp(recipient.userId, recipient.subscriptions, notification))
  ) {
    return "in-app";
  }
  for (const subscription of recipient.subscriptions) {
    await deliverPush(env, subscription, notification);
  }
  return "push";
}
