import {
  getAllSubscriptions,
  getWatchlistForSubscription,
  getGenrePreferencesForSubscription,
  updateKnownProviders,
  wasAlreadyNotified,
  markNotified,
  wasUserAlreadyNotified,
  markUserNotified,
} from "./db.ts";
import {
  getFlatrateProviderIdsCached,
  discoverRecentByGenreCached,
  trendingToday,
  createTmdbRunCache,
  type TmdbListItem,
  type TmdbRunCache,
} from "./tmdb.ts";
import { getAllReminders, updateReminderProviders, type ReminderRow } from "./reminders.ts";
import { notifyUser, type NotificationRecipient } from "./notify.ts";
import { logError } from "./logger.ts";
import type { Env, SubscriptionRow } from "./types.ts";

const GENRE_WINDOW_DAYS = 2; // marge de sécurité au-delà de l'intervalle du cron (1x/jour)
const TRENDING_WINDOW_DAYS = 2;
const TRENDING_MIN_POPULARITY = 40; // filtre les tendances "confidentielles"
const TRENDING_MAX_PER_RUN = 3; // évite une avalanche de notifs le même jour
// Un rappel dont la date de sortie est passée depuis plus longtemps (cron
// manqué, rappel posé après coup) ne prévient plus de la sortie.
const REMINDER_RELEASE_GRACE_DAYS = 3;

// Déduplication des sorties déjà notifiées : au niveau du compte pour un
// destinataire rattaché (un compte à plusieurs appareils abonnés ne doit pas
// recevoir N fois la même notification in-app), au niveau de l'abonnement
// sinon. L'historique par abonnement reste consulté pour un compte : un
// appareil tout juste rattaché ne renotifie pas ce qu'il a déjà reçu.
async function wasRecipientNotified(
  db: D1Database,
  recipient: NotificationRecipient,
  mediaType: string,
  tmdbId: number,
  reason: string
): Promise<boolean> {
  if (
    recipient.userId !== null &&
    (await wasUserAlreadyNotified(db, recipient.userId, mediaType, tmdbId, reason))
  ) {
    return true;
  }
  for (const subscription of recipient.subscriptions) {
    if (await wasAlreadyNotified(db, subscription.id, mediaType, tmdbId, reason)) {
      return true;
    }
  }
  return false;
}

async function markRecipientNotified(
  db: D1Database,
  recipient: NotificationRecipient,
  mediaType: string,
  tmdbId: number,
  reason: string
): Promise<void> {
  if (recipient.userId !== null) {
    await markUserNotified(db, recipient.userId, mediaType, tmdbId, reason);
    return;
  }
  for (const subscription of recipient.subscriptions) {
    await markNotified(db, subscription.id, mediaType, tmdbId, reason);
  }
}

// 1. Titres de la watchlist qui viennent d'apparaître en streaming. La
// watchlist et la référence des plateformes connues restent propres à chaque
// abonnement ; seule la notification est dédupliquée pour le destinataire
// (un même titre peut être dans la watchlist de plusieurs appareils).
async function checkWatchlistAvailability(
  env: Env,
  db: D1Database,
  recipient: NotificationRecipient,
  tmdbCache: TmdbRunCache
): Promise<void> {
  const notifiedThisRun = new Set<string>();
  for (const subscription of recipient.subscriptions) {
    const items = await getWatchlistForSubscription(db, subscription.id);
    for (const item of items) {
      let currentProviders: number[];
      try {
        currentProviders = await getFlatrateProviderIdsCached(
          tmdbCache,
          env,
          item.media_type,
          item.tmdb_id
        );
      } catch (err) {
        logError(`Providers TMDB indisponibles pour ${item.media_type}/${item.tmdb_id} :`, err);
        continue;
      }

      const knownProviders: number[] | null = item.known_providers
        ? JSON.parse(item.known_providers)
        : null;
      const newlyAvailable =
        knownProviders !== null && currentProviders.some((id) => !knownProviders.includes(id));
      const key = `${item.media_type}:${item.tmdb_id}`;

      if (newlyAvailable && !notifiedThisRun.has(key)) {
        notifiedThisRun.add(key);
        await notifyUser(env, recipient, {
          kind: "watchlistAvailable",
          mediaTitle: item.title,
          url: `/media/${item.media_type}/${item.tmdb_id}`,
        });
      }

      // Sert de référence pour la prochaine vérification. La première fois
      // (knownProviders === null), on se contente d'enregistrer sans notifier,
      // sinon tout ce qui était déjà là au moment de l'ajout déclencherait une
      // notification.
      await updateKnownProviders(
        db,
        subscription.id,
        item.media_type,
        item.tmdb_id,
        currentProviders
      );
    }
  }
}

// 2. Nouvelles sorties dans les genres favoris de l'utilisateur.
async function checkFavoriteGenreReleases(
  env: Env,
  db: D1Database,
  recipient: NotificationRecipient,
  tmdbCache: TmdbRunCache
): Promise<void> {
  const seen = new Set<string>();

  for (const subscription of recipient.subscriptions) {
    const genres = await getGenrePreferencesForSubscription(db, subscription.id);
    for (const { media_type, genre_id } of genres) {
      const key = `${media_type}:${genre_id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      let results: TmdbListItem[];
      try {
        results = await discoverRecentByGenreCached(
          tmdbCache,
          env,
          media_type,
          genre_id,
          GENRE_WINDOW_DAYS
        );
      } catch (err) {
        logError(`Discover TMDB échoué pour genre ${genre_id} (${media_type}) :`, err);
        continue;
      }

      for (const item of results.slice(0, 5)) {
        if (await wasRecipientNotified(db, recipient, media_type, item.id, "genre")) {
          continue;
        }
        await notifyUser(env, recipient, {
          kind: "favoriteGenreRelease",
          mediaTitle: item.title || item.name || "",
          url: `/media/${media_type}/${item.id}`,
        });
        await markRecipientNotified(db, recipient, media_type, item.id, "genre");
      }
    }
  }
}

// 3. Grosses sorties généralistes (tendances du jour), en filet de sécurité.
async function checkTrendingReleases(
  env: Env,
  db: D1Database,
  recipient: NotificationRecipient,
  trending: TmdbListItem[]
): Promise<void> {
  let sentThisRun = 0;
  for (const item of trending) {
    if (sentThisRun >= TRENDING_MAX_PER_RUN) {
      break;
    }
    const mediaType = item.media_type;
    if (!mediaType) {
      continue;
    }
    if (await wasRecipientNotified(db, recipient, mediaType, item.id, "trending")) {
      continue;
    }

    await notifyUser(env, recipient, {
      kind: "trendingRelease",
      mediaTitle: item.title || item.name || "",
      url: `/media/${mediaType}/${item.id}`,
    });
    await markRecipientNotified(db, recipient, mediaType, item.id, "trending");
    sentThisRun += 1;
  }
}

// 4. Rappels « Me prévenir » (migration 0014), indépendants de l'envie de
// voir : une notification le jour de la sortie, puis une à chaque arrivée
// sur une plateforme de streaming (même principe que la watchlist ci-dessus).
// Le jour de la sortie, une seule notification même si le titre sort
// directement sur une plateforme : la sortie prime, et les plateformes
// présentes ce jour-là servent de référence.
function isReleaseDue(releaseDate: string | null): boolean {
  if (!releaseDate) {
    return false;
  }
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= REMINDER_RELEASE_GRACE_DAYS;
}

async function checkReminder(
  env: Env,
  db: D1Database,
  recipient: NotificationRecipient,
  reminder: ReminderRow,
  tmdbCache: TmdbRunCache
): Promise<void> {
  const { media_type: mediaType, tmdb_id: tmdbId } = reminder;
  const url = `/media/${mediaType}/${tmdbId}`;

  let currentProviders: number[] | null = null;
  try {
    currentProviders = await getFlatrateProviderIdsCached(tmdbCache, env, mediaType, tmdbId);
  } catch (err) {
    logError(`Providers TMDB indisponibles pour le rappel ${mediaType}/${tmdbId} :`, err);
  }
  const knownProviders: number[] | null = reminder.known_providers
    ? JSON.parse(reminder.known_providers)
    : null;

  if (
    isReleaseDue(reminder.release_date) &&
    !(await wasRecipientNotified(db, recipient, mediaType, tmdbId, "reminder-release"))
  ) {
    await notifyUser(env, recipient, {
      kind: "reminderReleased",
      mediaTitle: reminder.title,
      url,
    });
    await markRecipientNotified(db, recipient, mediaType, tmdbId, "reminder-release");
  } else if (
    currentProviders !== null &&
    knownProviders !== null &&
    currentProviders.some((id) => !knownProviders.includes(id))
  ) {
    await notifyUser(env, recipient, {
      kind: "reminderAvailable",
      mediaTitle: reminder.title,
      url,
    });
  }

  if (currentProviders !== null) {
    await updateReminderProviders(db, reminder.user_id, mediaType, tmdbId, currentProviders);
  }
}

async function checkReminders(
  env: Env,
  db: D1Database,
  subscriptions: SubscriptionRow[],
  tmdbCache: TmdbRunCache
): Promise<void> {
  const byUser = new Map<number, ReminderRow[]>();
  for (const reminder of await getAllReminders(db)) {
    const rows = byUser.get(reminder.user_id) ?? [];
    rows.push(reminder);
    byUser.set(reminder.user_id, rows);
  }
  for (const [userId, reminders] of byUser) {
    // Hôte du dernier rappel posé : livraison in-app possible même sans
    // abonnement push sur aucun appareil du compte.
    const recipient: NotificationRecipient = {
      userId,
      subscriptions: subscriptions.filter((s) => s.user_id === userId),
      syncHost: reminders.find((r) => r.sync_host)?.sync_host ?? undefined,
    };
    for (const reminder of reminders) {
      try {
        await checkReminder(env, db, recipient, reminder, tmdbCache);
      } catch (err) {
        logError(`Rappel ${reminder.media_type}/${reminder.tmdb_id} en échec :`, err);
      }
    }
  }
}

function isRecentRelease(item: TmdbListItem): boolean {
  const date = item.release_date || item.first_air_date;
  if (!date) {
    return false;
  }
  const ageDays = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= TRENDING_WINDOW_DAYS;
}

// Regroupe les abonnements rattachés à un même compte en un seul
// destinataire ; chaque abonnement anonyme reste un destinataire à part.
export function groupRecipients(subscriptions: SubscriptionRow[]): NotificationRecipient[] {
  const byUser = new Map<number, NotificationRecipient>();
  const recipients: NotificationRecipient[] = [];
  for (const subscription of subscriptions) {
    if (subscription.user_id === null) {
      recipients.push({ userId: null, subscriptions: [subscription] });
      continue;
    }
    let recipient = byUser.get(subscription.user_id);
    if (!recipient) {
      recipient = { userId: subscription.user_id, subscriptions: [] };
      byUser.set(subscription.user_id, recipient);
      recipients.push(recipient);
    }
    recipient.subscriptions.push(subscription);
  }
  return recipients;
}

export async function runDailyCheck(env: Env): Promise<void> {
  const db = env.DB;
  const subscriptions = await getAllSubscriptions(db);
  const tmdbCache = createTmdbRunCache();
  await checkReminders(env, db, subscriptions, tmdbCache);
  if (subscriptions.length === 0) {
    return;
  }

  let trending: TmdbListItem[] = [];
  try {
    trending = (await trendingToday(env)).filter(
      (item) => isRecentRelease(item) && (item.popularity || 0) >= TRENDING_MIN_POPULARITY
    );
  } catch (err) {
    logError("Tendances TMDB indisponibles :", err);
  }

  for (const recipient of groupRecipients(subscriptions)) {
    await checkWatchlistAvailability(env, db, recipient, tmdbCache);
    await checkFavoriteGenreReleases(env, db, recipient, tmdbCache);
    await checkTrendingReleases(env, db, recipient, trending);
  }
}
