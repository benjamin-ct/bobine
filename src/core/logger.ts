// Wrapper de log unique pour le client React : uniformise les
// `console.error`/`console.warn` dispersés précédemment et les fait remonter
// dans Sentry. `ensureSentryInit` récupère le DSN depuis le worker (voir
// /api/sentry-dsn, worker/index.ts) plutôt que de le coder en dur au build —
// même logique que la clé "site" reCAPTCHA (RegionContext). Tant qu'aucun
// DSN n'est renvoyé (dev local, ou avant que le secret Cloudflare ne soit
// posé), Sentry reste non initialisé et capture*() est un no-op silencieux.
import * as Sentry from "@sentry/react";

let sentryInitPromise: Promise<void> | null = null;

export function ensureSentryInit(): Promise<void> {
  if (!sentryInitPromise) {
    sentryInitPromise = fetch("/api/sentry-dsn")
      .then((res) => res.json())
      .then(({ dsn }: { dsn?: string | null }) => {
        if (dsn) {
          Sentry.init({ dsn, tracesSampleRate: 0 });
        }
      })
      .catch(() => {
        // Pas de réseau / API indisponible : on continue sans Sentry, les
        // console.error/warn restent le seul filet dans ce cas.
      });
  }
  return sentryInitPromise;
}

export function logError(message: string, err: unknown): void {
  console.error(message, err);
  Sentry.captureException(err instanceof Error ? err : new Error(`${message}: ${String(err)}`));
}

export function logWarn(message: string, err?: unknown): void {
  console.warn(message, err);
  Sentry.captureMessage(err ? `${message} ${String(err)}` : message, "warning");
}
