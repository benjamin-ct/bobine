// Câblage Sentry pour le Worker (erreurs non interceptées + captures
// explicites via logger.ts). `withSentry` no-op proprement tant que
// env.SENTRY_DSN n'est pas configuré (dev local, ou avant que le secret ne
// soit posé côté dashboard Cloudflare) — même logique défensive que
// RECAPTCHA_SITE_KEY/CLOUDFLARE_ANALYTICS_TOKEN.
import * as Sentry from "@sentry/cloudflare";
import type { Env } from "./types.ts";

// Seul domaine de prod : les previews PR répondent sur
// `<slug>-bobine.creusatbenjamin.workers.dev` (voir .github/workflows/ci.yml,
// job deploy-preview) — tout le reste (dev local compris) est traité comme
// non-prod.
const PRODUCTION_HOSTNAME = "bobine.creusatbenjamin.workers.dev";

// `wrangler versions upload --preview-alias` ne supprime jamais l'alias de
// preview à la fermeture d'une PR (aucun endpoint Cloudflare pour ça — voir
// carte Trello "Infra : nettoyer les Worker preview aliases"), alors que
// `cleanup-preview-d1` supprime bien la base D1 dédiée. Une preview morte
// reste donc joignable indéfiniment et toute requête qui l'atteint (bot,
// crawler, onglet resté ouvert...) plante sur ce binding D1 disparu — bruit
// Sentry récurrent et trompeur (l'issue remonte marquée "production" faute
// d'environnement explicite). On l'écarte hors du vrai domaine de prod, sans
// toucher aux autres erreurs D1 qui, elles, comptent aussi sur les previews.
const DEAD_PREVIEW_D1_ERROR = /D1_ERROR: D1 database [\w-]+ has been deleted/;

function isDeadPreviewD1Error(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.map((v) => v.value).join("\n") ?? event.message ?? "";
  return DEAD_PREVIEW_D1_ERROR.test(message);
}

export function withSentry<Handler extends ExportedHandler<Env>>(handler: Handler): Handler {
  return Sentry.withSentry<Env>(
    (env) => ({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: 0,
      beforeSend(event) {
        const hostname = event.request?.url ? new URL(event.request.url).hostname : null;
        if (hostname && hostname !== PRODUCTION_HOSTNAME && isDeadPreviewD1Error(event)) {
          return null;
        }
        return event;
      },
    }),
    handler
  ) as Handler;
}
