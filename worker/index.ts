import {
  upsertSubscription,
  deleteSubscription,
  deleteSubscriptionById,
  replaceWatchlist,
  replaceGenrePreferences,
  applyWatchlistChanges,
  applyGenrePreferenceChanges,
  getSubscriptionIdByEndpoint,
  getAllSubscriptions,
  getLibraryForUser,
  replaceLibraryForUser,
  applyLibraryChanges,
  getCustomListsForUser,
  replaceCustomListsForUser,
  updateDisplayName,
} from "./db.ts";
import { runDailyCheck } from "./scheduled.ts";
import { sendPush, ExpiredSubscriptionError } from "./push.ts";
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
} from "./auth.ts";
import { checkRateLimit, getClientIp } from "./rate-limit.ts";
import {
  sanitizeLibraryPayload,
  sanitizeLibrarySyncPayload,
  sanitizeWatchlistItems,
  sanitizeGenrePrefs,
  sanitizeKeyList,
  sanitizeCustomListsPayload,
  sanitizeDisplayName,
} from "./validate.ts";
import { verifyRecaptcha } from "./recaptcha.ts";
import { getTheatricalIndex } from "./tmdb.ts";
import type { Env } from "./types.ts";

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
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
// largement utilisés dans l'app. `connect-src` inclut aussi
// https://image.tmdb.org : le service worker (src/sw.ts) met les affiches
// en cache via un fetch() interne (Workbox CacheFirst), classifié sous
// connect-src (pas img-src, qui ne couvre que les <img> natifs) — sans ça,
// les affiches se chargent au premier accès mais disparaissent partout dès
// qu'on recharge la page (SW actif, requêtes interceptées et bloquées).
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' https://www.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://image.tmdb.org https://i.ytimg.com data:",
    "connect-src 'self' https://www.google.com https://image.tmdb.org",
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

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const RATE_LIMIT_RESPONSE = (): Response =>
  json({ error: "Trop de requêtes. Réessaie dans quelques minutes." }, 429);

// Ces deux endpoints restent volontairement accessibles sans compte (les
// notifications push fonctionnent pour n'importe quel visiteur, connecté ou
// non — c'est le fonctionnement voulu depuis leur conception, avant même
// l'existence des comptes). En échange : limitation de débit par IP contre
// le spam/abus, et bornage strict de la taille des payloads pour empêcher
// de gonfler la base indéfiniment.
const MAX_WATCHLIST_ITEMS = 500;
const MAX_GENRE_PREFS = 50;

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `subscribe:ip:${ip}`, { limit: 10, windowMs: 60 * 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }

  const { endpoint, keys, watchlist, favoriteGenres } = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    watchlist?: unknown;
    favoriteGenres?: unknown;
  };
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    !keys?.p256dh ||
    !keys?.auth
  ) {
    return json({ error: "Abonnement push incomplet ou invalide (endpoint/keys manquants)." }, 400);
  }

  const subscriptionId = await upsertSubscription(env.DB, {
    endpoint,
    p256dh: String(keys.p256dh),
    auth: String(keys.auth),
  });

  // Remplacement complet : correct et volontaire ici, cet appel n'a lieu
  // qu'à l'activation des notifications (une fois par appareil), jamais à
  // chaque changement — voir handleSubscribeSync ci-dessous pour la
  // resynchronisation incrémentale qui, elle, se déclenche à chaque toggle.
  await replaceWatchlist(
    env.DB,
    subscriptionId,
    sanitizeWatchlistItems(watchlist, MAX_WATCHLIST_ITEMS)
  );
  await replaceGenrePreferences(
    env.DB,
    subscriptionId,
    sanitizeGenrePrefs(favoriteGenres, MAX_GENRE_PREFS)
  );

  return json({ ok: true, subscriptionId });
}

// Resynchronisation incrémentale du mirroir des notifications push : appelée
// à chaque changement de la watchlist/des genres favoris tant que les
// notifications sont actives (voir NotificationSettings), avec uniquement
// le delta depuis le dernier envoi calculé côté client — aucune lecture de
// l'état actuel n'est nécessaire ici, contrairement à handleSubscribe
// (remplacement complet, mais rare : une fois par activation).
async function handleSubscribeSync(request: Request, env: Env): Promise<Response> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `subscribe-sync:ip:${ip}`, { limit: 30, windowMs: 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }

  const { endpoint, watchlistToAdd, watchlistToRemove, genresToAdd, genresToRemove } = body as {
    endpoint?: unknown;
    watchlistToAdd?: unknown;
    watchlistToRemove?: unknown;
    genresToAdd?: unknown;
    genresToRemove?: unknown;
  };
  if (typeof endpoint !== "string") {
    return json({ error: "endpoint manquant." }, 400);
  }

  const subscriptionId = await getSubscriptionIdByEndpoint(env.DB, endpoint);
  if (!subscriptionId) {
    return json({ error: "Abonnement introuvable." }, 404);
  }

  await applyWatchlistChanges(env.DB, subscriptionId, {
    add: sanitizeWatchlistItems(watchlistToAdd, MAX_WATCHLIST_ITEMS),
    remove: sanitizeKeyList(watchlistToRemove, MAX_WATCHLIST_ITEMS),
  });
  await applyGenrePreferenceChanges(env.DB, subscriptionId, {
    add: sanitizeGenrePrefs(genresToAdd, MAX_GENRE_PREFS),
    remove: sanitizeKeyList(genresToRemove, MAX_GENRE_PREFS),
  });

  return json({ ok: true });
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const ip = getClientIp(request);
  if (
    !(await checkRateLimit(env.DB, `unsubscribe:ip:${ip}`, { limit: 10, windowMs: 60 * 60_000 }))
  ) {
    return RATE_LIMIT_RESPONSE();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  if (typeof body.endpoint !== "string") {
    return json({ error: "endpoint manquant." }, 400);
  }
  await deleteSubscription(env.DB, body.endpoint);
  return json({ ok: true });
}

// Déclenchement manuel de la vérification quotidienne, pour diagnostiquer
// sans attendre le prochain passage du cron. Protégé par une clé partagée
// pour éviter qu'un tiers ne déclenche des requêtes TMDB / push à volonté ;
// désactivé par défaut si la clé n'est pas configurée.
async function handleManualRun(request: Request, env: Env): Promise<Response> {
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
// notifie jamais rien (elle se contente de prendre une référence). Même
// protection que /api/run-check.
async function handleTestNotification(request: Request, env: Env): Promise<Response> {
  const expected = env.DEBUG_TRIGGER_KEY;
  if (!expected || request.headers.get("x-debug-key") !== expected) {
    return json({ error: "Non autorisé." }, 401);
  }

  const subscriptions = await getAllSubscriptions(env.DB);
  if (subscriptions.length === 0) {
    return json(
      { error: "Aucun abonnement enregistré. Active d'abord les notifications dans l'app." },
      404
    );
  }

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const subscription of subscriptions) {
    try {
      await sendPush(
        subscription,
        {
          title: "Bobine 🎬",
          body: "Ceci est une notification de test — si tu la vois, tout fonctionne !",
          url: "/ma-liste",
        },
        env
      );
      results.push({ id: subscription.id, ok: true });
    } catch (err) {
      if (err instanceof ExpiredSubscriptionError) {
        await deleteSubscriptionById(env.DB, subscription.id);
      }
      results.push({
        id: subscription.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return json({ results });
}

// Compte (lien magique) ---------------------------------------------------

async function handleRequestLink(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  if (!isValidEmail(email)) {
    return json({ error: "Adresse email invalide." }, 400);
  }

  const recaptcha = await verifyRecaptcha(
    env,
    body?.recaptchaToken as string | undefined,
    "request_link"
  );
  if (!recaptcha.ok) {
    return json({ error: "Vérification anti-robot échouée. Réessaie." }, 403);
  }

  // Par email (empêche de spammer la boîte mail d'un tiers) ET par IP
  // (empêche un seul client de solliciter l'endpoint en boucle avec des
  // emails différents).
  const ip = getClientIp(request);
  const withinLimits = await Promise.all([
    checkRateLimit(env.DB, `link:email:${email}:m`, { limit: 1, windowMs: 60_000 }),
    checkRateLimit(env.DB, `link:email:${email}:h`, { limit: 5, windowMs: 60 * 60_000 }),
    checkRateLimit(env.DB, `link:ip:${ip}:h`, { limit: 20, windowMs: 60 * 60_000 }),
  ]);
  if (withinLimits.some((ok) => !ok)) {
    return RATE_LIMIT_RESPONSE();
  }

  const { token, code } = await createMagicLink(env.DB, email);
  const link = `${new URL(request.url).origin}/auth/verify?token=${token}`;

  try {
    const { skipped } = await sendMagicLinkEmail(env, email, link, code);
    // Uniquement quand RESEND_API_KEY n'est pas configurée (dev local) : pas
    // de vraie boîte mail à disposition, donc on renvoie le lien et le code
    // directement pour pouvoir tester le flux. Ne se produit jamais en
    // production.
    return json({
      ok: true,
      devLink: skipped ? link : undefined,
      devCode: skipped ? code : undefined,
    });
  } catch (err) {
    // L'erreur brute d'un service tiers (Resend) ne doit jamais atteindre le
    // client : elle peut révéler des détails de config (mode test, domaine
    // vérifié...) voire, selon le cas, l'email associé au compte. On la
    // journalise côté serveur et on renvoie un message générique.
    console.error(
      "Échec de l'envoi du lien de connexion :",
      err instanceof Error ? err.message : err
    );
    return json(
      { error: "Impossible d'envoyer le lien de connexion pour le moment. Réessaie plus tard." },
      502
    );
  }
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  // Limite par IP les tentatives de vérification (jeton ou code) : c'est la
  // seule protection efficace contre un bruteforce du code court à 6
  // caractères (32^6 ≈ 1 milliard de combinaisons — déjà solide seule, mais
  // sans limite de débit un bruteforce distribué reste théoriquement
  // possible pendant la fenêtre de validité de 15 min).
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `verify:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const token = body?.token as string | undefined;
  const code = body?.code as string | undefined;
  if (!token && !code) {
    return json({ error: "Jeton ou code manquant." }, 400);
  }

  const recaptcha = await verifyRecaptcha(
    env,
    body?.recaptchaToken as string | undefined,
    "verify"
  );
  if (!recaptcha.ok) {
    return json({ error: "Vérification anti-robot échouée. Réessaie." }, 403);
  }

  const email = token
    ? await consumeMagicLink(env.DB, token)
    : await consumeMagicLinkByCode(env.DB, code);
  if (!email) {
    return json(
      {
        error: code
          ? "Ce code est invalide, expiré, ou déjà utilisé."
          : "Ce lien de connexion est invalide, expiré, ou déjà utilisé.",
      },
      400
    );
  }

  const user = await findOrCreateUser(env.DB, email);
  const sessionToken = await createSession(env.DB, user.id);

  return json({ ok: true, email: user.email }, 200, {
    "set-cookie": sessionCookieHeader(request, sessionToken),
  });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  return json({ email: user.email, displayName: user.displayName });
}

// Nom affiché (ticket #45) : mis à jour uniquement sur un save manuel côté
// client (bouton "Enregistrer" d'AccountCard), jamais en synchro automatique.
// Même garde IDOR que les autres endpoints authentifiés ci-dessous :
// user.id vient uniquement du cookie de session.
async function handleUpdateDisplayName(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const displayName = sanitizeDisplayName(body?.displayName);
  if (displayName === null) {
    return json({ error: "Nom affiché invalide." }, 400);
  }
  await updateDisplayName(env.DB, user.id, displayName);
  return json({ ok: true, displayName });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (user) {
    await deleteSession(env.DB, user.sessionToken);
  }
  return json({ ok: true }, 200, {
    "set-cookie": sessionCookieHeader(request, null, { clear: true }),
  });
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
async function handleGetLibrary(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  const library = await getLibraryForUser(env.DB, user.id);
  return json(library);
}

async function handlePutLibrary(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  // Le client est la source de vérité fonctionnelle (voir replaceLibraryForUser),
  // mais jamais la seule ligne de défense sur ce qui est écrit en base :
  // types coercés/validés, clés non prévues supprimées, tailles bornées.
  // Remplacement complet volontaire ici : cet endpoint ne sert plus qu'à la
  // fusion initiale lors d'une première connexion sur un nouvel appareil
  // (voir LibraryContext, SYNCED_FOR_KEY) — un vrai remplacement complet y
  // est correct et rare. Chaque toggle/notation/case cochée régulier passe
  // désormais par handleLibrarySync ci-dessous (delta uniquement).
  await replaceLibraryForUser(env.DB, user.id, sanitizeLibraryPayload(body));
  return json({ ok: true });
}

// Synchronisation incrémentale : le client envoie uniquement ce qui a
// changé depuis le dernier envoi (voir LibraryContext, pendingOpsRef) —
// aucune lecture de l'état actuel n'est nécessaire, contrairement à une
// diffusion de l'état complet qui devrait d'abord lire l'existant pour
// savoir quoi écrire. Même garde IDOR que handleGetLibrary/handlePutLibrary
// ci-dessus : user.id vient uniquement du cookie de session.
async function handleLibrarySync(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  const { upserts, deletes } = sanitizeLibrarySyncPayload(body);
  if (upserts.length === 0 && deletes.length === 0) {
    return json({ ok: true });
  }
  await applyLibraryChanges(env.DB, user.id, { upserts, deletes });
  return json({ ok: true });
}

// Listes personnalisées synchronisées ------------------------------------
//
// Même garde IDOR que handleGetLibrary/handlePutLibrary : user.id vient
// uniquement du cookie de session, jamais du corps de la requête.
async function handleGetCustomLists(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  const customLists = await getCustomListsForUser(env.DB, user.id);
  return json(customLists);
}

// Remplacement complet à chaque appel (voir LibraryContext : anti-rebond côté
// client, un PUT par salve de changements) — pas de synchronisation
// incrémentale ici, contrairement à /api/library/sync : une liste perso
// change par opérations multi-lignes (création, renommage, glisser-déposer)
// qu'un diff incrémental compliquerait pour un gain nul à cette échelle.
async function handlePutCustomLists(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env.DB, request);
  if (!user) {
    return json({ error: "Non connecté." }, 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, 400);
  }
  await replaceCustomListsForUser(env.DB, user.id, sanitizeCustomListsPayload(body));
  return json({ ok: true });
}

// Index "au cinéma"/"bientôt" (voir getTheatricalIndex, worker/tmdb.ts) pour
// une région : mis en cache à l'edge, si bien qu'un seul visiteur par région
// et par heure paie le parcours complet de now_playing/upcoming — les
// suivants reçoivent la réponse déjà calculée. Remplace en production le
// parcours équivalent que src/core/api/tmdb.ts ferait sinon depuis CHAQUE
// navigateur à CHAQUE session (voir getTheatricalStatusIndex, dont le cache
// mémoire ne survit pas à un rechargement).
async function handleTheatricalIndex(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") || "FR";
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/theatrical-index?region=${region}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }
  const index = await getTheatricalIndex(env, region);
  const response = json(index, 200, { "cache-control": "public, max-age=3600" });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// Paramètres reconnus par ce Worker mais absents de l'API TMDB : jamais
// transmis à TMDB (voir handleTmdbProxy), seulement lus pour piloter
// l'enrichissement des grilles ci-dessous.
const WORKER_ONLY_PARAMS = ["include_watch_providers_badge", "watch_providers_badge_region"];

// Résout les plateformes de streaming d'un titre en réutilisant EXACTEMENT
// la même entrée de cache d'edge que l'appel direct /api/tmdb/<type>/<id>/
// watch/providers (même URL, même TTL 1h) : un titre déjà consulté (fiche
// détail, ou déjà croisé dans une autre grille) répond sans retaper TMDB.
async function fetchWatchProvidersCached(
  origin: string,
  mediaType: "movie" | "tv",
  id: number,
  env: Env,
  ctx: ExecutionContext
): Promise<Record<string, { flatrate?: unknown; rent?: unknown; buy?: unknown }> | null> {
  const cache = caches.default;
  const cacheKey = new Request(
    `${origin}/api/tmdb/${mediaType}/${id}/watch/providers?language=fr-FR`
  );
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.ok ? cached.json() : null;
  }
  const tmdbUrl = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers`);
  tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY!);
  const res = await fetch(tmdbUrl.toString());
  const body = await res.text();
  if (!res.ok) {
    return null;
  }
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(body, {
        status: res.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=3600",
        },
      })
    )
  );
  return JSON.parse(body).results || {};
}

// Grilles (Nouveautés...) : plutôt que de laisser chaque carte affichée
// déclencher son propre appel /watch/providers depuis le navigateur une
// fois visible (voir MediaCard.tsx), le badge plateforme est résolu ici en
// un aller-retour serveur→TMDB par titre, en parallèle, fusionné dans la
// réponse /discover renvoyée au client. Sans ça, une grille de ~20 cartes
// gonfle son propre chargement de ~20 requêtes réseau côté client — un coût
// payé pour rien puisque TMDB est de toute façon interrogé une fois par
// titre, avec ou sans ce détour.
async function enrichDiscoverResultsWithProviders(
  data: { results?: Array<{ id: number }> },
  mediaType: "movie" | "tv",
  region: string,
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  await Promise.all(
    (data.results || []).map(async (item) => {
      const results = await fetchWatchProvidersCached(origin, mediaType, item.id, env, ctx);
      (item as { watch_providers?: unknown }).watch_providers = results?.[region] ?? null;
    })
  );
}

// Proxy TMDB : la clé API TMDB n'est plus exposée côté client (elle
// n'apparaît dans aucune requête réseau visible depuis le navigateur). Le
// front (src/core/api/tmdbClient.ts) appelle /api/tmdb/<chemin TMDB> ; ce
// handler relaie vers l'API TMDB en y injectant la clé côté serveur, en
// ignorant toute valeur `api_key` que le client aurait pu fournir.
async function handleTmdbProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const ip = getClientIp(request);
  if (!(await checkRateLimit(env.DB, `tmdb:ip:${ip}`, { limit: 120, windowMs: 60_000 }))) {
    return RATE_LIMIT_RESPONSE();
  }
  if (!env.TMDB_API_KEY) {
    return json({ error: "TMDB_API_KEY non configurée côté serveur." }, 503);
  }

  const url = new URL(request.url);

  // Cache d'edge Cloudflare : l'en-tête cache-control posé plus bas ne
  // suffit PAS à lui seul à faire mettre une réponse de Worker en cache —
  // sans un appel explicite à caches.default, chaque requête (même
  // identique, même émise à quelques secondes d'écart par deux visiteurs
  // différents) repart taper l'API TMDB. Sous charge, ça épuise le quota de
  // la clé API partagée côté serveur (429 TMDB observé en prod). La clé de
  // cache se base sur l'URL entrante (sans api_key, jamais transmise par le
  // client de toute façon) pour rester stable quel que soit le visiteur.
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const tmdbPath = url.pathname.replace(/^\/api\/tmdb/, "");
  const tmdbUrl = new URL(`https://api.themoviedb.org/3${tmdbPath}`);
  for (const [key, value] of url.searchParams) {
    if (key === "api_key" || WORKER_ONLY_PARAMS.includes(key)) {
      continue;
    } // ignorés : jamais transmis à TMDB (clé serveur / paramètres internes)
    tmdbUrl.searchParams.set(key, value);
  }
  tmdbUrl.searchParams.set("api_key", env.TMDB_API_KEY);

  const discoverMediaType = tmdbPath.match(/^\/discover\/(movie|tv)$/)?.[1] as
    "movie" | "tv" | undefined;
  const shouldEnrichProviders =
    discoverMediaType && url.searchParams.get("include_watch_providers_badge") === "1";

  // Ces routes sont appelées une fois PAR CARTE (badge plateforme sur
  // Nouveautés, badge prochaine sortie/diffusion sur Prochainement) :
  // contrairement au reste du catalogue, chaque titre a un ID distinct,
  // donc la plupart des requêtes ratent le cache d'edge au premier
  // visiteur qui les déclenche. Le contenu de ces routes change rarement
  // d'une heure à l'autre : un TTL nettement plus long ici absorbe
  // beaucoup plus de trafic sur le même cache.
  const isPerTitleRoute = /\/(movie|tv)\/\d+(\/watch\/providers|\/release_dates)?$/.test(tmdbPath);
  const maxAge = isPerTitleRoute ? 3600 : 300;

  const res = await fetch(tmdbUrl.toString());
  let body = await res.text();
  if (res.ok && shouldEnrichProviders) {
    const region = url.searchParams.get("watch_providers_badge_region") || "FR";
    const data = JSON.parse(body);
    await enrichDiscoverResultsWithProviders(data, discoverMediaType, region, url.origin, env, ctx);
    body = JSON.stringify(data);
  }
  const response = new Response(body, {
    status: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
  if (res.ok) {
    // waitUntil : n'ajoute pas la latence de l'écriture cache à la réponse.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } else if (res.status === 429) {
    // Sans ceci, un vrai dépassement de quota TMDB fait que CHAQUE requête
    // suivante (tous visiteurs, toutes pages confondues) repart taper TMDB
    // et se reprend un 429 individuellement. Un cache négatif très court
    // (10s, très inférieur aux 5 min du cache normal) absorbe cette rafale.
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          status: 429,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=10",
          },
        })
      )
    );
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // `run_worker_first` (wrangler.jsonc) ne route que /api/* ici : les
    // assets statiques (dont le service worker /sw.js) sont servis
    // nativement par Cloudflare sans passer par ce Worker — reconstruire
    // leur Response ici (même pour juste ajouter des en-têtes) casse
    // l'enregistrement du service worker. Leurs en-têtes de sécurité sont
    // donc posés nativement via public/_headers plutôt qu'ici.
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    const response = await routeRequest(request, env, url, ctx);
    return withSecurityHeaders(response);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyCheck(env));
  },
};

async function routeRequest(
  request: Request,
  env: Env,
  url: URL,
  ctx: ExecutionContext
): Promise<Response> {
  if (url.pathname === "/api/vapid-public-key" && request.method === "GET") {
    if (!env.VAPID_PUBLIC_KEY) {
      return json({ error: "VAPID_PUBLIC_KEY non configurée." }, 503);
    }
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  // Clé "site" reCAPTCHA v3 : faite pour être publique (elle apparaît de
  // toute façon en clair dans le HTML/JS de n'importe quel site qui
  // l'utilise) — servie ici plutôt que codée en dur côté client pour ne pas
  // dépendre d'une variable d'environnement Vite à configurer séparément.
  // `null` si pas encore configurée : le client saute alors la vérification
  // anti-robot (le serveur, lui, saute aussi la vérification côté
  // verifyRecaptcha tant que RECAPTCHA_SECRET_KEY n'est pas configurée).
  if (url.pathname === "/api/recaptcha-site-key" && request.method === "GET") {
    return json({ siteKey: env.RECAPTCHA_SITE_KEY || null });
  }

  if (url.pathname === "/api/subscribe" && request.method === "POST") {
    return handleSubscribe(request, env);
  }

  if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
    return handleUnsubscribe(request, env);
  }

  if (url.pathname === "/api/subscribe/sync" && request.method === "POST") {
    return handleSubscribeSync(request, env);
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

  if (url.pathname === "/api/account/display-name" && request.method === "PATCH") {
    return handleUpdateDisplayName(request, env);
  }

  if (url.pathname === "/api/library" && request.method === "GET") {
    return handleGetLibrary(request, env);
  }

  if (url.pathname === "/api/library" && request.method === "PUT") {
    return handlePutLibrary(request, env);
  }

  if (url.pathname === "/api/library/sync" && request.method === "POST") {
    return handleLibrarySync(request, env);
  }

  if (url.pathname === "/api/custom-lists" && request.method === "GET") {
    return handleGetCustomLists(request, env);
  }

  if (url.pathname === "/api/custom-lists" && request.method === "PUT") {
    return handlePutCustomLists(request, env);
  }

  if (url.pathname.startsWith("/api/tmdb/") && request.method === "GET") {
    return handleTmdbProxy(request, env, ctx);
  }

  if (url.pathname === "/api/theatrical-index" && request.method === "GET") {
    return handleTheatricalIndex(request, env, ctx);
  }

  // Pays du visiteur, déduit par Cloudflare au niveau du edge (aucun appel
  // à un service tiers, aucune permission navigateur à demander) — sert à
  // adapter "Où regarder" et le filtre plateformes à sa région réelle
  // plutôt qu'à supposer la France pour tout le monde. `request.cf` n'est
  // disponible que sur le vrai réseau Cloudflare ; repli sur FR sinon.
  if (url.pathname === "/api/region" && request.method === "GET") {
    return json({ country: request.cf?.country || "FR" });
  }

  // `run_worker_first` (wrangler.jsonc) ne route ici que /api/*, mais on
  // garde un filet : toute autre requête retombe sur les assets statiques.
  return env.ASSETS.fetch(request);
}
