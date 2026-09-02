// Injection du beacon Cloudflare Web Analytics (mesure d'audience anonyme,
// sans cookies) — voir /api/web-analytics-token, worker/index.ts. Tant que
// CLOUDFLARE_ANALYTICS_TOKEN n'est pas configuré côté Cloudflare, le token
// renvoyé est `null` et cette fonction ne fait rien.
export function injectWebAnalytics(): void {
  fetch("/api/web-analytics-token")
    .then((res) => res.json())
    .then(({ token }: { token?: string | null }) => {
      if (!token) {
        return;
      }
      const script = document.createElement("script");
      script.defer = true;
      script.src = "https://static.cloudflareinsights.com/beacon.min.js";
      script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
      document.head.appendChild(script);
    })
    .catch(() => {
      // Pas de réseau / API indisponible : pas grave, juste pas de mesure
      // d'audience pour cette session.
    });
}
