// Envoi de notifications Web Push depuis un Cloudflare Worker.
//
// `web-push` fait tout le travail cryptographique (chiffrement du payload,
// signature du JWT VAPID) via node:crypto — disponible grâce au flag
// nodejs_compat. On n'utilise PAS `webpush.sendNotification()` : elle envoie
// la requête via le module `https` de Node, qui n'est pas garanti de bien
// fonctionner dans le runtime Workers. On récupère à la place les détails de
// requête déjà prêts (`generateRequestDetails`) et on les envoie nous-mêmes
// avec `fetch`, natif à Workers.

import webpush from "web-push";

export class ExpiredSubscriptionError extends Error {}

let vapidConfigured = false;

function ensureVapid(env) {
  if (vapidConfigured) {
    return;
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error(
      "Clés VAPID manquantes (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) — à configurer dans les secrets du Worker."
    );
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

// `subscription` : { endpoint, p256dh, auth } (forme stockée en base).
// `payload` : objet JS sérialisable, reçu par le service worker côté client.
export async function sendPush(subscription, payload, env) {
  ensureVapid(env);

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };

  const details = webpush.generateRequestDetails(pushSubscription, JSON.stringify(payload));

  const res = await fetch(details.endpoint, {
    method: details.method,
    headers: details.headers,
    body: details.body,
  });

  if (res.status === 404 || res.status === 410) {
    // Abonnement expiré ou révoqué côté navigateur : à supprimer de la base.
    throw new ExpiredSubscriptionError(`Abonnement invalide (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Échec de l'envoi push (${res.status}) : ${await res.text().catch(() => "")}`);
  }
}
