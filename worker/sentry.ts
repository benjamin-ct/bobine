// Câblage Sentry pour le Worker (erreurs non interceptées + captures
// explicites via logger.ts). `withSentry` no-op proprement tant que
// env.SENTRY_DSN n'est pas configuré (dev local, ou avant que le secret ne
// soit posé côté dashboard Cloudflare) — même logique défensive que
// RECAPTCHA_SITE_KEY/CLOUDFLARE_ANALYTICS_TOKEN.
import * as Sentry from "@sentry/cloudflare";
import type { Env } from "./types.ts";

export function withSentry<Handler extends ExportedHandler<Env>>(handler: Handler): Handler {
  return Sentry.withSentry(
    (env: Env) => ({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: 0,
    }),
    handler
  ) as Handler;
}
