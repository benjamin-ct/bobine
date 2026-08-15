// Validation côté serveur de la bibliothèque envoyée par le client
// (PUT /api/library) — le frontend ne doit jamais être la seule ligne de
// défense sur ce que la base accepte d'écrire. Toute clé non listée ici est
// silencieusement supprimée (whitelist), tout item structurellement invalide
// est écarté plutôt que de faire échouer toute la requête.

const MAX_STRING_LENGTH = 300;
const MAX_ITEMS_PER_LIST = 5000; // large marge au-dessus d'un usage réel, évite un abus qui gonflerait la base indéfiniment
const VALID_MEDIA_TYPES = new Set(["movie", "tv"]);

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Échappe les caractères HTML plutôt que de tenter de repérer/retirer des
// balises (une liste noire de motifs se contourne facilement). Même si rien
// dans l'UI actuelle ne réinjecte ce texte tel quel (les titres viennent de
// TMDB par id, jamais de ce champ), ce champ est écrit par le client sans
// contrôle — mieux vaut que la valeur stockée soit sûre à afficher telle
// quelle dans n'importe quel contexte futur (notifications, export...).
function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return null;
  const trimmed = value.slice(0, maxLength).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
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
