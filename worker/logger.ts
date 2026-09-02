// Wrapper de log unique pour le Worker : uniformise les `console.error`
// dispersés précédemment et les fait remonter dans Sentry (voir sentry.ts).
// `Sentry.captureException` no-op tant qu'aucun DSN n'est configuré, donc ce
// module reste sûr à utiliser inconditionnellement (dev local y compris).
import * as Sentry from "@sentry/cloudflare";

export function logError(message: string, err: unknown): void {
  console.error(message, err);
  Sentry.captureException(err instanceof Error ? err : new Error(`${message}: ${String(err)}`));
}
