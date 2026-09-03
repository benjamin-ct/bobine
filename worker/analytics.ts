// Événements d'usage custom (Analytics Engine, voir wrangler.jsonc) —
// consultables depuis Grafana Cloud (datasource Cloudflare Analytics) à côté
// de Cloudflare Web Analytics (pages vues) et Sentry (erreurs). Pas de
// donnée personnelle identifiante : uniquement un nom d'événement et, le cas
// échéant, quelques dimensions techniques (ex. type de média recherché).
import type { Env } from "./types.ts";

export function trackEvent(env: Env, event: string, dimensions: string[] = []): void {
  env.ANALYTICS?.writeDataPoint({
    blobs: [event, ...dimensions],
    indexes: [event],
  });
}
