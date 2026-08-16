import {
  getAllSubscriptions,
  getWatchlistForSubscription,
  getGenrePreferencesForSubscription,
  updateKnownProviders,
  wasAlreadyNotified,
  markNotified,
  deleteSubscriptionById,
} from "./db.js";
import { getFlatrateProviderIds, discoverRecentByGenre, trendingToday } from "./tmdb.js";
import { sendPush, ExpiredSubscriptionError } from "./push.js";

const GENRE_WINDOW_DAYS = 2; // marge de sécurité au-delà de l'intervalle du cron (1x/jour)
const TRENDING_WINDOW_DAYS = 2;
const TRENDING_MIN_POPULARITY = 40; // filtre les tendances "confidentielles"
const TRENDING_MAX_PER_RUN = 3; // évite une avalanche de notifs le même jour

async function notify(env, db, subscription, payload) {
  try {
    await sendPush(subscription, payload, env);
  } catch (err) {
    if (err instanceof ExpiredSubscriptionError) {
      await deleteSubscriptionById(db, subscription.id);
    } else {
      console.error(`Push échoué pour l'abonnement ${subscription.id} :`, err);
    }
  }
}

// 1. Titres de la watchlist qui viennent d'apparaître en streaming.
async function checkWatchlistAvailability(env, db, subscription) {
  const items = await getWatchlistForSubscription(db, subscription.id);
  for (const item of items) {
    let currentProviders;
    try {
      currentProviders = await getFlatrateProviderIds(env, item.media_type, item.tmdb_id);
    } catch (err) {
      console.error(`Providers TMDB indisponibles pour ${item.media_type}/${item.tmdb_id} :`, err);
      continue;
    }

    const knownProviders = item.known_providers ? JSON.parse(item.known_providers) : null;
    const newlyAvailable =
      knownProviders !== null && currentProviders.some((id) => !knownProviders.includes(id));

    if (newlyAvailable) {
      await notify(env, db, subscription, {
        title: "Bobine : nouvelle dispo 🎬",
        body: `« ${item.title} » est maintenant disponible en streaming.`,
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

// 2. Nouvelles sorties dans les genres favoris de l'utilisateur.
async function checkFavoriteGenreReleases(env, db, subscription) {
  const genres = await getGenrePreferencesForSubscription(db, subscription.id);
  const seen = new Set();

  for (const { media_type, genre_id } of genres) {
    const key = `${media_type}:${genre_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    let results;
    try {
      results = await discoverRecentByGenre(env, media_type, genre_id, GENRE_WINDOW_DAYS);
    } catch (err) {
      console.error(`Discover TMDB échoué pour genre ${genre_id} (${media_type}) :`, err);
      continue;
    }

    for (const item of results.slice(0, 5)) {
      if (await wasAlreadyNotified(db, subscription.id, media_type, item.id, "genre")) {
        continue;
      }
      await notify(env, db, subscription, {
        title: "Bobine : nouveauté dans tes genres préférés 🍿",
        body: `« ${item.title || item.name} » vient de sortir.`,
        url: `/media/${media_type}/${item.id}`,
      });
      await markNotified(db, subscription.id, media_type, item.id, "genre");
    }
  }
}

// 3. Grosses sorties généralistes (tendances du jour), en filet de sécurité.
async function checkTrendingReleases(env, db, subscription, trending) {
  let sentThisRun = 0;
  for (const item of trending) {
    if (sentThisRun >= TRENDING_MAX_PER_RUN) {
      break;
    }
    const mediaType = item.media_type;
    if (await wasAlreadyNotified(db, subscription.id, mediaType, item.id, "trending")) {
      continue;
    }

    await notify(env, db, subscription, {
      title: "Bobine : ça sort en ce moment 🔥",
      body: `« ${item.title || item.name} » fait parler de lui.`,
      url: `/media/${mediaType}/${item.id}`,
    });
    await markNotified(db, subscription.id, mediaType, item.id, "trending");
    sentThisRun += 1;
  }
}

function isRecentRelease(item) {
  const date = item.release_date || item.first_air_date;
  if (!date) {
    return false;
  }
  const ageDays = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= TRENDING_WINDOW_DAYS;
}

export async function runDailyCheck(env) {
  const db = env.DB;
  const subscriptions = await getAllSubscriptions(db);
  if (subscriptions.length === 0) {
    return;
  }

  let trending = [];
  try {
    trending = (await trendingToday(env)).filter(
      (item) => isRecentRelease(item) && (item.popularity || 0) >= TRENDING_MIN_POPULARITY
    );
  } catch (err) {
    console.error("Tendances TMDB indisponibles :", err);
  }

  for (const subscription of subscriptions) {
    await checkWatchlistAvailability(env, db, subscription);
    await checkFavoriteGenreReleases(env, db, subscription);
    await checkTrendingReleases(env, db, subscription, trending);
  }
}
