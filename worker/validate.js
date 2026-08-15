// Validation côté serveur de la bibliothèque envoyée par le client
// (PUT /api/library) — le frontend ne doit jamais être la seule ligne de
// défense sur ce que la base accepte d'écrire. Toute clé non listée ici est
// silencieusement supprimée (whitelist), tout item structurellement invalide
// est écarté plutôt que de faire échouer toute la requête.

const MAX_STRING_LENGTH = 300;
const MAX_ITEMS_PER_LIST = 5000; // large marge au-dessus d'un usage réel, évite un abus qui gonflerait la base indéfiniment
const VALID_MEDIA_TYPES = new Set(["movie", "tv"]);

const HTML_ENTITY_DECODES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const HTML_ENTITY_PATTERN = /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g;
const MAX_DECODE_PASSES = 50;

// Décode les entités HTML jusqu'à stabilité. Ce champ était auparavant
// HTML-échappé à l'écriture (voir git blame) — mais comme le client renvoie
// systématiquement la bibliothèque entière à chaque toggle, y compris les
// titres déjà échappés reçus du serveur au tour précédent, chaque sync
// réappliquait l'échappement sur du texte déjà échappé et faisait grossir
// indéfiniment les entités (ex. "L'Aube" → "L&#39;Aube" → "L&amp;#39;Aube"
// → ... → "L&amp;amp;amp;...#39;Aube" après des dizaines de syncs). On ne
// stocke plus que du texte brut : React échappe déjà tout ce qui est
// affiché en JSX (aucun composant n'utilise dangerouslySetInnerHTML avec
// ces champs), donc l'échappement ici n'apportait aucune protection réelle
// tout en corrompant les données. Ce décodage répété sert aussi à réparer
// les titres déjà corrompus par l'ancien comportement, dès la prochaine
// écriture.
export function decodeHtmlEntities(value) {
  let out = value;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = out.replace(HTML_ENTITY_PATTERN, (m) => HTML_ENTITY_DECODES[m]);
    if (next === out) break;
    out = next;
  }
  return out;
}

function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return null;
  const trimmed = decodeHtmlEntities(value.slice(0, maxLength));
  return trimmed || null;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Renvoie l'item nettoyé (sous-ensemble whitelisté, types coercés/validés),
// ou null si l'item n'est pas exploitable (id/mediaType manquants ou
// invalides — le reste a des valeurs de repli raisonnables).
function sanitizeItem(mediaType, tmdbId, raw) {
  if (!VALID_MEDIA_TYPES.has(mediaType)) return null;
  const id = cleanNumber(tmdbId);
  if (id === null || id <= 0) return null;
  if (!raw || typeof raw !== "object") return null;

  const title = cleanString(raw.title) || "Titre inconnu";
  const posterPath = typeof raw.posterPath === "string" && raw.posterPath.startsWith("/")
    ? raw.posterPath.slice(0, 200)
    : null;
  const date = cleanString(raw.date, 20);
  const genreIds = Array.isArray(raw.genreIds)
    ? raw.genreIds.map(cleanNumber).filter((n) => n !== null).slice(0, 20)
    : [];
  const addedAt = cleanNumber(raw.addedAt) ?? Date.now();
  const updatedAt = cleanNumber(raw.updatedAt) ?? addedAt;
  const rating = raw.rating == null ? undefined : Math.min(10, Math.max(0, cleanNumber(raw.rating) ?? 0));
  const runtimeMinutes = raw.runtimeMinutes == null ? undefined : Math.max(0, cleanNumber(raw.runtimeMinutes) ?? 0);

  return { id, mediaType, title, posterPath, date, genreIds, addedAt, updatedAt, rating, runtimeMinutes };
}

// `watched`/`watchlist` : { "movie:123": {...}, "tv:456": {...} }. Renvoie
// la même forme, nettoyée, avec au plus MAX_ITEMS_PER_LIST entrées par liste
// (les entrées en trop sont simplement ignorées plutôt que de rejeter tout
// le payload — un client legit ne devrait jamais approcher cette limite).
function sanitizeList(rawList) {
  const out = {};
  if (!rawList || typeof rawList !== "object") return out;
  let count = 0;
  for (const [key, raw] of Object.entries(rawList)) {
    if (count >= MAX_ITEMS_PER_LIST) break;
    const [mediaType, tmdbId] = String(key).split(":");
    const item = sanitizeItem(mediaType, tmdbId, raw);
    if (!item) continue;
    out[`${mediaType}:${item.id}`] = item;
    count += 1;
  }
  return out;
}

export function sanitizeLibraryPayload(body) {
  return {
    watched: sanitizeList(body?.watched),
    watchlist: sanitizeList(body?.watchlist),
  };
}
