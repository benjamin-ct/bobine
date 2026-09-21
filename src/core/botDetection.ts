// Détection best-effort d'un client automatisé (bot/crawler) côté
// navigateur — voir le ticket Trello "Milliers de calls workers".
// Complémentaire à la détection côté Worker (worker/bots.ts, basée sur les
// en-têtes de chaque requête proxifiée) : ici on gate des effets de bord
// purement client (init Sentry, beacon Cloudflare Web Analytics, voir
// main.tsx) qui ne passent jamais par le Worker et sont donc invisibles à
// `detectKnownCrawler()` — un crawler qui exécute notre JS charge ce script
// tiers et initialise un client d'erreurs, sans que ni l'un ni l'autre
// n'ait de raison métier de s'exécuter pour un bot.
//
// Liste de user-agents dupliquée volontairement plutôt qu'importée de
// worker/bots.ts : tsconfig.app.json n'inclut que `src/`, front et Worker
// sont deux projets tsc/bundles distincts.
//
// `navigator.webdriver` est un signal standard (spec WebDriver) positionné
// à `true` par les navigateurs pilotés par automatisation (Selenium,
// Puppeteer, Playwright...), une base fréquente pour les crawlers IA.
// Comme tout signal déclaratif côté client, il reste falsifiable par un
// bot qui choisirait de le masquer : ceci ne "bloque" donc rien au sens
// strict (impossible à garantir côté front face à un client qui exécute
// notre code), c'est une réduction de bruit best-effort sur des appels non
// nécessaires au contenu/SEO — le rendu de la page reste inchangé.
const KNOWN_CRAWLER_UA_PATTERNS = [
  "shapbot",
  "gptbot",
  "oai-searchbot",
  "claudebot",
  "anthropic-ai",
  "ccbot",
  "google-extended",
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "bytespider",
  "perplexitybot",
  "amazonbot",
  "applebot",
  "facebookexternalhit",
  "meta-externalagent",
];

// Structurellement compatible avec le vrai `Navigator` du navigateur ET
// avec un objet littéral simple — ce module est importé aussi bien depuis
// le code client (avec le `navigator` global du DOM) que depuis
// scripts/verify-bot-detection-client.ts (projet tsconfig "node", sans les
// types DOM), d'où ce découplage plutôt qu'un import direct du type global,
// sur le même principe que `CrawlerCheckRequest` dans worker/bots.ts.
interface NavigatorLike {
  webdriver?: boolean;
  userAgent: string;
}

export function isLikelyAutomatedClient(nav: NavigatorLike): boolean {
  if (nav.webdriver) {
    return true;
  }
  const ua = nav.userAgent.toLowerCase();
  return KNOWN_CRAWLER_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}
