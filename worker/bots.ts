// Détection des crawlers connus (moteurs de recherche et bots IA), pour leur
// servir des réponses allégées sur ce qui n'est pas nécessaire au rendu SEO
// — voir le ticket Trello "Milliers de calls workers". Basée en priorité sur
// `request.cf.botManagement.verifiedBot` (fiable, mais nécessite Bot Fight
// Mode/Bot Management activé côté zone Cloudflare — pas garanti sur ce
// compte), avec un repli sur le user-agent qui couvre directement le cas
// observé dans le ticket (`ShapBot/0.1.0`, classé par Cloudflare comme
// `verifiedBotCategory: "AI Search"`) sans dépendre d'un réglage externe.
// Un user-agent est falsifiable, mais l'usage ici (alléger des appels
// secondaires, jamais bloquer un accès) ne pose pas de risque si un visiteur
// humain se faisait passer pour un bot par erreur.
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

// Structurellement compatible avec le vrai `Request` du Worker (typé avec
// `cf` via @cloudflare/workers-types) ET avec le `Request` global de Node —
// ce module est importé aussi bien depuis worker/index.ts que depuis
// scripts/verify-bot-detection.ts (projet tsconfig "node", sans les types
// Cloudflare), d'où ce découplage plutôt qu'un import direct du type global.
interface CrawlerCheckRequest {
  headers: { get(name: string): string | null };
  // `unknown` plutôt que le type Cloudflare précis : ce dernier varie selon
  // le contexte (requête entrante vs `RequestInit.cf` sortant) et n'est
  // structurellement pas compatible avec un objet littéral simple, ce qui
  // casserait la compatibilité visée avec le `Request` de Node ci-dessus.
  cf?: unknown;
}

// Identifiant stable de la famille de bot détectée (utilisé comme clé de
// rate limiting dédiée, indépendante de l'IP — voir handleTmdbProxy dans
// index.ts), ou `null` si la requête ne correspond à aucun bot connu.
export function detectKnownCrawler(request: CrawlerCheckRequest): string | null {
  const cf = request.cf as { botManagement?: { verifiedBot?: boolean } } | undefined;
  if (cf?.botManagement?.verifiedBot) {
    return "verified-bot";
  }
  const ua = request.headers.get("user-agent")?.toLowerCase() ?? "";
  return KNOWN_CRAWLER_UA_PATTERNS.find((pattern) => ua.includes(pattern)) ?? null;
}
