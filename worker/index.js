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
import { checkRateLimit, getClientIp } from "./rate-limit.js";
import { sanitizeLibraryPayload } from "./validate.js";
import { verifyRecaptcha } from "./recaptcha.js";

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

// En-têtes de durcissement HTTP, appliqués à TOUTE réponse (API et assets
// statiques) — voir la fin de fetch() ci-dessous. `frame-src` autorise les
// bandes-annonces YouTube embarquées (TrailerButton) et l'iframe invisible
// de reCAPTCHA v3 ; `script-src`/`connect-src` autorisent le script
// reCAPTCHA et ses appels réseau ; `style-src 'unsafe-inline'` est
// nécessaire pour les styles inline posés par React (style={{...}}),
// largement utilisés dans l'app.
const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://image.tmdb.org https://i.ytimg.com data:",
    "connect-src 'self' https://www.google.com",
    "frame-src https://www.youtube.com https://www.google.com",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const RATE_LIMIT_RESPONSE = () => json({ error: "Trop de requêtes. Réessaie dans quelques minutes." }, 429);

// Ces deux endpoints restent volontairement accessibles sans compte (les
// notifications push fonctionnent pour n'importe quel visiteur, connecté ou
// non — c'est le fonctionnement voulu depuis leur conception, avant même
// l'existence des comptes). En échange : limitation de débit par IP contre
// le spam/abus, et bornage strict de la taille des payloads pour empêcher
// de gonfler la base indéfiniment.
const MAX_WATCHLIST_ITEMS = 500;
const MAX_GENRE_PREFS = 50;

async function handleSubscribe(request, env) {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `subscribe:ip:${ip}`, { limit: 10, windowMs: 60 * 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }

  const { endpoint, keys, watchlist, favoriteGenres } = body || {};
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
    return json({ error: "Abonnement push incomplet ou invalide (endpoint/keys manquants)." }, 400);
  }

  const subscriptionId = await upsertSubscription(env.DB, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });

  await replaceWatchlist(
    env.DB,
    subscriptionId,
    (Array.isArray(watchlist) ? watchlist : [])
      .slice(0, MAX_WATCHLIST_ITEMS)
      .map((item) => ({
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        title: String(item.title || "").slice(0, 300),
        posterPath: item.posterPath,
      }))
  );

  await replaceGenrePreferences(
    env.DB,
    subscriptionId,
    (Array.isArray(favoriteGenres) ? favoriteGenres : []).slice(0, MAX_GENRE_PREFS).map((g) => ({
      mediaType: g.mediaType,
      genreId: g.genreId,
    }))
  );

  return json({ ok: true, subscriptionId });
}

async function handleUnsubscribe(request, env) {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `unsubscribe:ip:${ip}`, { limit: 10, windowMs: 60 * 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

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

  const recaptcha = await verifyRecaptcha(env, body?.recaptchaToken, "request_link");
  if (!recaptcha.ok) return json({ error: "Vérification anti-robot échouée. Réessaie." }, 403);

  // Par email (empêche de spammer la boîte mail d'un tiers) ET par IP
  // (empêche un seul client de solliciter l'endpoint en boucle avec des
  // emails différents).
  const ip = getClientIp(request);
  const withinLimits = await Promise.all([
    checkRateLimit(env.DB, `link:email:${email}:m`, { limit: 1, windowMs: 60_000 }),
    checkRateLimit(env.DB, `link:email:${email}:h`, { limit: 5, windowMs: 60 * 60_000 }),
    checkRateLimit(env.DB, `link:ip:${ip}:h`, { limit: 20, windowMs: 60 * 60_000 }),
  ]);
  if (withinLimits.some((ok) => !ok)) return RATE_LIMIT_RESPONSE();

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
    // L'erreur brute d'un service tiers (Resend) ne doit jamais atteindre le
    // client : elle peut révéler des détails de config (mode test, domaine
    // vérifié...) voire, selon le cas, l'email associé au compte. On la
    // journalise côté serveur et on renvoie un message générique.
    console.error("Échec de l'envoi du lien de connexion :", err.message);
    return json({ error: "Impossible d'envoyer le lien de connexion pour le moment. Réessaie plus tard." }, 502);
  }
}

async function handleVerify(request, env) {
  // Limite par IP les tentatives de vérification (jeton ou code) : c'est la
  // seule protection efficace contre un bruteforce du code court à 6
  // caractères (32^6 ≈ 1 milliard de combinaisons — déjà solide seule, mais
  // sans limite de débit un bruteforce distribué reste théoriquement
  // possible pendant la fenêtre de validité de 15 min).
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `verify:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const token = body?.token;
  const code = body?.code;
  if (!token && !code) return json({ error: "Jeton ou code manquant." }, 400);

  const recaptcha = await verifyRecaptcha(env, body?.recaptchaToken, "verify");
  if (!recaptcha.ok) return json({ error: "Vérification anti-robot échouée. Réessaie." }, 403);

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
//
// Isolation entre comptes (IDOR) : `user.id` vient UNIQUEMENT de
// getUserFromRequest (jointure sessions/users sur le cookie httpOnly), et
// c'est le seul identifiant jamais utilisé pour lire/écrire une bibliothèque
// — ni le corps de la requête, ni la query string, ni aucun header ne sont
// consultés pour ça. Un compte A ne peut donc pas cibler les données d'un
// compte B, quoi qu'il mette dans le payload (vérifié empiriquement : un
// PUT avec un `userId`/`user_id` arbitraire dans le corps est simplement
// ignoré, sanitizeLibraryPayload ne whiteliste que watched/watchlist).
// ⚠️ Si un jour un paramètre d'id explicite est ajouté ici (ex. pour une
// vue admin), il doit être validé contre `user.id` et jamais faire
// confiance à une valeur fournie par le client sans ce contrôle.
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
  // Le client est la source de vérité fonctionnelle (voir replaceLibraryForUser),
  // mais jamais la seule ligne de défense sur ce qui est écrit en base :
  // types coercés/validés, clés non prévues supprimées, tailles bornées.
  await replaceLibraryForUser(env.DB, user.id, sanitizeLibraryPayload(body));
  return json({ ok: true });
}

// Proxy TMDB : la clé API TMDB n'est plus exposée côté client (elle
// n'apparaît dans aucune requête réseau visible depuis le navigateur). Le
// front (src/api/tmdb.js) appelle /api/tmdb/<chemin TMDB> ; ce handler
// relaie vers l'API TMDB en y injectant la clé côté serveur, en ignorant
// toute valeur `api_key` que le client aurait pu fournir.
async function handleTmdbProxy(request, env) {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `tmdb:ip:${ip}`, { limit: 120, windowMs: 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }
  if (!env.TMDB_API_KEY) return json({ error: "TMDB_API_KEY non configurée côté serveur." }, 503);

  const url = new URL(request.url);
  const tmdbPath = url.pathname.replace(/^\/api\/tmdb/, "");
  const tmdbUrl = new URL(`https://api.themoviedb.org/3${tmdbPath}`);
  for (const [key, value] of url.searchParams) {
    if (key === "api_key") continue; // ignoré : seule la clé serveur est utilisée
    tmdbUrl.searchParams.set(key, value);
  }
  tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

  const res = await fetch(tmdbUrl.toString());
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Catalogue TMDB peu volatil minute par minute : un court cache
      // navigateur/edge limite la charge sur le quota de la clé serveur.
      "cache-control": "public, max-age=300",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // `run_worker_first` (wrangler.jsonc) ne route que /api/* ici : les
    // assets statiques (dont le service worker /sw.js) sont servis
    // nativement par Cloudflare sans passer par ce Worker — reconstruire
    // leur Response ici (même pour juste ajouter des en-têtes) casse
    // l'enregistrement du service worker (constaté en local : passer TOUT
    // par le Worker, ou juste re-wrapper la réponse d'assets, fait échouer
    // `navigator.serviceWorker.register()`). Leurs en-têtes de sécurité
    // sont donc posés nativement via public/_headers plutôt qu'ici.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const response = await routeRequest(request, env, url);
    return withSecurityHeaders(response);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyCheck(env));
  },
};

async function routeRequest(request, env, url) {
  if (url.pathname === "/api/vapid-public-key" && request.method === "GET") {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: "VAPID_PUBLIC_KEY non configurée." }, 503);
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  // Clé "site" reCAPTCHA v3 : faite pour être publique (elle apparaît de
  // toute façon en clair dans le HTML/JS de n'importe quel site qui
  // l'utilise) — servie ici plutôt que codée en dur côté client pour ne
  // pas dépendre d'une variable d'environnement Vite à configurer
  // séparément côté Cloudflare (même raisonnement que VAPID_PUBLIC_KEY,
  // voir wrangler.jsonc). `null` si pas encore configurée : le client
  // saute alors la vérification anti-robot (le serveur, lui, saute aussi
  // la vérification côté verifyRecaptcha tant que RECAPTCHA_SECRET_KEY
  // n'est pas configurée — ne bloque jamais avant que les deux clés
  // soient en place).
  if (url.pathname === "/api/recaptcha-site-key" && request.method === "GET") {
    return json({ siteKey: env.RECAPTCHA_SITE_KEY || null });
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

  if (url.pathname.startsWith("/api/tmdb/") && request.method === "GET") {
    return handleTmdbProxy(request, env);
  }

  // `run_worker_first` (wrangler.jsonc) ne route ici que /api/*, mais on
  // garde un filet : toute autre requête retombe sur les assets statiques.
  return env.ASSETS.fetch(request);
}
