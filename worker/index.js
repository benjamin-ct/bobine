import {
  upsertSubscription,
  deleteSubscription,
  deleteSubscriptionById,
  replaceWatchlist,
  replaceGenrePreferences,
  getAllSubscriptions,
  getLibraryForUser,
  replaceLibraryForUser,
} from "./db.js";
import { runDailyCheck } from "./scheduled.js";
import { sendPush, ExpiredSubscriptionError } from "./push.js";
import {
  isValidEmail,
  createMagicLink,
  consumeMagicLink,
  consumeMagicLinkByCode,
  findOrCreateUser,
  createSession,
  deleteSession,
  getUserFromRequest,
  sessionCookieHeader,
  sendMagicLinkEmail,
} from "./auth.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Sans ça, iOS (en particulier en PWA installée sur l'écran d'accueil)
      // peut mettre en cache une réponse d'erreur (ex: 503 avant que les
      // secrets soient déployés) et continuer à la resservir après coup.
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

async function handleSubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }

  const { endpoint, keys, watchlist, favoriteGenres } = body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return json({ error: "Abonnement push incomplet (endpoint/keys manquants)." }, 400);
  }

  const subscriptionId = await upsertSubscription(env.DB, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  await replaceWatchlist(
    env.DB,
    subscriptionId,
    (Array.isArray(watchlist) ? watchlist : []).map((item) => ({
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      posterPath: item.posterPath,
    }))
  );

  await replaceGenrePreferences(
    env.DB,
    subscriptionId,
    (Array.isArray(favoriteGenres) ? favoriteGenres : []).map((g) => ({
      mediaType: g.mediaType,
      genreId: g.genreId,
    }))
  );

  return json({ ok: true, subscriptionId });
}

async function handleUnsubscribe(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  if (!body?.endpoint) return json({ error: "endpoint manquant." }, 400);
  await deleteSubscription(env.DB, body.endpoint);
  return json({ ok: true });
}

// Déclenchement manuel de la vérification quotidienne, pour diagnostiquer
// sans attendre le prochain passage du cron. Protégé par une clé partagée
// pour éviter qu'un tiers ne déclenche des requêtes TMDB / push à volonté ;
// désactivé par défaut si la clé n'est pas configurée.
async function handleManualRun(request, env) {
  const expected = env.DEBUG_TRIGGER_KEY;
  if (!expected || request.headers.get("x-debug-key") !== expected) {
    return json({ error: "Non autorisé." }, 401);
  }
  await runDailyCheck(env);
  return json({ ok: true });
}

// Envoie une notification de test à tous les abonnements, pour vérifier que
// toute la chaîne fonctionne (VAPID, service worker, permission navigateur)
// sans dépendre de la logique métier — au premier passage, celle-ci ne
// notifie jamais rien (elle se contente de prendre une référence).
// Même protection que /api/run-check.
async function handleTestNotification(request, env) {
  const expected = env.DEBUG_TRIGGER_KEY;
  if (!expected || request.headers.get("x-debug-key") !== expected) {
    return json({ error: "Non autorisé." }, 401);
  }

  const subscriptions = await getAllSubscriptions(env.DB);
  if (subscriptions.length === 0) {
    return json({ error: "Aucun abonnement enregistré. Active d'abord les notifications dans l'app." }, 404);
  }

  const results = [];
  for (const subscription of subscriptions) {
    try {
      await sendPush(
        subscription,
        { title: "Bobine 🎬", body: "Ceci est une notification de test — si tu la vois, tout fonctionne !", url: "/ma-liste" },
        env
      );
      results.push({ id: subscription.id, ok: true });
    } catch (err) {
      if (err instanceof ExpiredSubscriptionError) {
        await deleteSubscriptionById(env.DB, subscription.id);
      }
      results.push({ id: subscription.id, ok: false, error: err.message });
    }
  }

  return json({ results });
}

// Compte (lien magique) ---------------------------------------------------

async function handleRequestLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const email = (body?.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return json({ error: "Adresse email invalide." }, 400);

  const { token, code } = await createMagicLink(env.DB, email);
  const link = `${new URL(request.url).origin}/auth/verify?token=${token}`;

  try {
    const { skipped } = await sendMagicLinkEmail(env, email, link, code);
    // Uniquement quand RESEND_API_KEY n'est pas configurée (dev local) : pas
    // de vraie boîte mail à disposition, donc on renvoie le lien et le code
    // directement pour pouvoir tester le flux. Ne se produit jamais en
    // production.
    return json({ ok: true, devLink: skipped ? link : undefined, devCode: skipped ? code : undefined });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

async function handleVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const token = body?.token;
  const code = body?.code;
  if (!token && !code) return json({ error: "Jeton ou code manquant." }, 400);

  const email = token ? await consumeMagicLink(env.DB, token) : await consumeMagicLinkByCode(env.DB, code);
  if (!email) {
    return json(
      { error: code ? "Ce code est invalide, expiré, ou déjà utilisé." : "Ce lien de connexion est invalide, expiré, ou déjà utilisé." },
      400
    );
  }

  const user = await findOrCreateUser(env.DB, email);
  const sessionToken = await createSession(env.DB, user.id);

  return json({ ok: true, email: user.email }, 200, {
    "set-cookie": sessionCookieHeader(request, sessionToken),
  });
}

async function handleMe(request, env) {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "Non connecté." }, 401);
  return json({ email: user.email });
}

async function handleLogout(request, env) {
  const user = await getUserFromRequest(env.DB, request);
  if (user) await deleteSession(env.DB, user.sessionToken);
  return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(request, null, { clear: true }) });
}

// Bibliothèque synchronisée ------------------------------------------------

async function handleGetLibrary(request, env) {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "Non connecté." }, 401);
  const library = await getLibraryForUser(env.DB, user.id);
  return json(library);
}

async function handlePutLibrary(request, env) {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) return json({ error: "Non connecté." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  await replaceLibraryForUser(env.DB, user.id, {
    watched: body?.watched || {},
    watchlist: body?.watchlist || {},
  });
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/vapid-public-key" && request.method === "GET") {
      if (!env.VAPID_PUBLIC_KEY) return json({ error: "VAPID_PUBLIC_KEY non configurée." }, 503);
      return json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === "/api/subscribe" && request.method === "POST") {
      return handleSubscribe(request, env);
    }

    if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
      return handleUnsubscribe(request, env);
    }

    if (url.pathname === "/api/run-check" && request.method === "POST") {
      return handleManualRun(request, env);
    }

    if (url.pathname === "/api/test-notification" && request.method === "POST") {
      return handleTestNotification(request, env);
    }

    if (url.pathname === "/api/auth/request-link" && request.method === "POST") {
      return handleRequestLink(request, env);
    }

    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      return handleVerify(request, env);
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleMe(request, env);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    if (url.pathname === "/api/library" && request.method === "GET") {
      return handleGetLibrary(request, env);
    }

    if (url.pathname === "/api/library" && request.method === "PUT") {
      return handlePutLibrary(request, env);
    }

    // `run_worker_first` (wrangler.jsonc) ne route ici que /api/*, mais on
    // garde un filet : toute autre requête retombe sur les assets statiques.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyCheck(env));
  },
};
