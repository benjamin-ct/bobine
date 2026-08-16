// Validation côté serveur de la bibliothèque envoyée par le client
// (PUT /api/library) — le frontend ne doit jamais être la seule ligne de
// défense sur ce que la base accepte d'écrire. Toute clé non listée ici est
// silencieusement supprimée (whitelist), tout item structurellement invalide
// est écarté plutôt que de faire échouer toute la requête.

const MAX_STRING_LENGTH = 300;
const MAX_ITEMS_PER_LIST = 5000; // large marge au-dessus d'un usage réel, évite un abus qui gonflerait la base indéfiniment
const VALID_MEDIA_TYPES = new Set(["movie", "tv"]);
// "saison-épisode" (ex. "1-5") : suivi épisode par épisode pour les séries.
// Aucune série connue ne dépasse quelques centaines d'épisodes, 5000 laisse
// une large marge sans permettre un payload disproportionné.
const MAX_WATCHED_EPISODES = 5000;
const EPISODE_KEY_PATTERN = /^\d{1,4}-\d{1,4}$/;
// Réalisateur·rices/créateur·rices d'un titre (voir Stats.jsx, "réalisateurs
// récurrents") — un film a rarement plus de 2-3 co-réalisateurs, une série
// peut avoir plusieurs créateurs ; 10 laisse une large marge.
const MAX_DIRECTORS = 10;
const DIRECTOR_NAME_MAX_LENGTH = 150;

const HTML_ENTITY_DECODES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
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
    if (next === out) {
      break;
    }
    out = next;
  }
  return out;
}

function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = decodeHtmlEntities(value.slice(0, maxLength));
  return trimmed || null;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Un élément de `directors` : { id, name }. `id` sert à dédupliquer/compter
// les occurrences (voir Stats.jsx), `name` n'est affiché que via JSX (React
// échappe déjà tout ce qui est rendu — même raisonnement que cleanString
// pour title/date) donc pas besoin d'un traitement plus strict que le
// nettoyage/troncature déjà appliqué aux autres champs texte.
function cleanDirector(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = cleanNumber(raw.id);
  if (id === null || id <= 0) {
    return null;
  }
  const name = cleanString(raw.name, DIRECTOR_NAME_MAX_LENGTH);
  if (!name) {
    return null;
  }
  return { id, name };
}

// Renvoie l'item nettoyé (sous-ensemble whitelisté, types coercés/validés),
// ou null si l'item n'est pas exploitable (id/mediaType manquants ou
// invalides — le reste a des valeurs de repli raisonnables).
function sanitizeItem(mediaType, tmdbId, raw) {
  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    return null;
  }
  const id = cleanNumber(tmdbId);
  if (id === null || id <= 0) {
    return null;
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const title = cleanString(raw.title) || "Titre inconnu";
  const posterPath =
    typeof raw.posterPath === "string" && raw.posterPath.startsWith("/")
      ? raw.posterPath.slice(0, 200)
      : null;
  const date = cleanString(raw.date, 20);
  const genreIds = Array.isArray(raw.genreIds)
    ? raw.genreIds
        .map(cleanNumber)
        .filter((n) => n !== null)
        .slice(0, 20)
    : [];
  const addedAt = cleanNumber(raw.addedAt) ?? Date.now();
  const updatedAt = cleanNumber(raw.updatedAt) ?? addedAt;
  const rating =
    raw.rating == null ? undefined : Math.min(10, Math.max(0, cleanNumber(raw.rating) ?? 0));
  const runtimeMinutes =
    raw.runtimeMinutes == null ? undefined : Math.max(0, cleanNumber(raw.runtimeMinutes) ?? 0);
  // Uniquement pertinent pour les séries, mais on ne restreint pas à
  // mediaType === "tv" ici : un champ absent/vide pour un film ne coûte rien
  // et évite un cas particulier de plus à maintenir.
  const watchedEpisodes = Array.isArray(raw.watchedEpisodes)
    ? [
        ...new Set(
          raw.watchedEpisodes.filter((e) => typeof e === "string" && EPISODE_KEY_PATTERN.test(e))
        ),
      ].slice(0, MAX_WATCHED_EPISODES)
    : [];
  // Rempli progressivement par le backfill de Stats.jsx (voir setDirectors
  // dans LibraryContext) — absent tant que l'item n'a pas encore été
  // "revu" par ce backfill.
  const directors = Array.isArray(raw.directors)
    ? raw.directors.map(cleanDirector).filter(Boolean).slice(0, MAX_DIRECTORS)
    : [];

  return {
    id,
    mediaType,
    title,
    posterPath,
    date,
    genreIds,
    addedAt,
    updatedAt,
    rating,
    runtimeMinutes,
    watchedEpisodes,
    directors,
  };
}

// `watched`/`watchlist` : { "movie:123": {...}, "tv:456": {...} }. Renvoie
// la même forme, nettoyée, avec au plus MAX_ITEMS_PER_LIST entrées par liste
// (les entrées en trop sont simplement ignorées plutôt que de rejeter tout
// le payload — un client legit ne devrait jamais approcher cette limite).
function sanitizeList(rawList) {
  const out = {};
  if (!rawList || typeof rawList !== "object") {
    return out;
  }
  let count = 0;
  for (const [key, raw] of Object.entries(rawList)) {
    if (count >= MAX_ITEMS_PER_LIST) {
      break;
    }
    const [mediaType, tmdbId] = String(key).split(":");
    const item = sanitizeItem(mediaType, tmdbId, raw);
    if (!item) {
      continue;
    }
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

// Lot incrémental (voir POST /api/library/sync) : contrairement à
// sanitizeLibraryPayload ci-dessus (état complet, clés = "mediaType:id"),
// chaque entrée porte déjà mediaType/id séparément — le client envoie
// exactement ce qui a changé, pas tout l'état. Plafonné bas : une salve
// débattue côté client ne dépasse jamais qu'une poignée d'items en usage
// normal (ex. "tout marquer vu" sur une saison), ceci n'est qu'un
// garde-fou anti-abus.
const MAX_SYNC_BATCH = 500;

function sanitizeSyncUpsert(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!VALID_MEDIA_TYPES.has(raw.mediaType)) {
    return null;
  }
  if (raw.status !== "watched" && raw.status !== "watchlist") {
    return null;
  }
  const item = sanitizeItem(raw.mediaType, raw.id, raw.item);
  if (!item) {
    return null;
  }
  return { mediaType: raw.mediaType, tmdbId: item.id, status: raw.status, item };
}

function sanitizeSyncDelete(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!VALID_MEDIA_TYPES.has(raw.mediaType)) {
    return null;
  }
  const id = cleanNumber(raw.id);
  if (id === null || id <= 0) {
    return null;
  }
  return { mediaType: raw.mediaType, tmdbId: id };
}

export function sanitizeLibrarySyncPayload(body) {
  return {
    upserts: Array.isArray(body?.upserts)
      ? body.upserts.slice(0, MAX_SYNC_BATCH).map(sanitizeSyncUpsert).filter(Boolean)
      : [],
    deletes: Array.isArray(body?.deletes)
      ? body.deletes.slice(0, MAX_SYNC_BATCH).map(sanitizeSyncDelete).filter(Boolean)
      : [],
  };
}

// Items "envie de voir" pour le mirroir des notifications push (voir
// POST /api/subscribe et /api/subscribe/sync) — `maxItems` est passé par
// l'appelant (MAX_WATCHLIST_ITEMS dans worker/index.js) plutôt que dupliqué
// ici.
export function sanitizeWatchlistItems(rawItems, maxItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .slice(0, maxItems)
    .map((item) => {
      if (!VALID_MEDIA_TYPES.has(item?.mediaType)) {
        return null;
      }
      const tmdbId = cleanNumber(item?.tmdbId);
      if (tmdbId === null || tmdbId <= 0) {
        return null;
      }
      const title = cleanString(item?.title) || "Titre inconnu";
      const posterPath =
        typeof item?.posterPath === "string" && item.posterPath.startsWith("/")
          ? item.posterPath.slice(0, 200)
          : null;
      return { mediaType: item.mediaType, tmdbId, title, posterPath };
    })
    .filter(Boolean);
}

export function sanitizeGenrePrefs(rawGenres, maxItems) {
  return (Array.isArray(rawGenres) ? rawGenres : [])
    .slice(0, maxItems)
    .map((g) => {
      if (!VALID_MEDIA_TYPES.has(g?.mediaType)) {
        return null;
      }
      const genreId = cleanNumber(g?.genreId);
      if (genreId === null || genreId <= 0) {
        return null;
      }
      return { mediaType: g.mediaType, genreId };
    })
    .filter(Boolean);
}

// Listes de retrait : juste des clés "mediaType:id" (tmdbId ou genreId
// selon l'appelant), pas de payload au-delà du format.
export function sanitizeKeyList(rawKeys, maxItems) {
  return (Array.isArray(rawKeys) ? rawKeys : [])
    .slice(0, maxItems)
    .map((key) => {
      const [mediaType, idStr] = String(key).split(":");
      if (!VALID_MEDIA_TYPES.has(mediaType)) {
        return null;
      }
      const id = cleanNumber(idStr);
      if (id === null || id <= 0) {
        return null;
      }
      return { mediaType, id };
    })
    .filter(Boolean);
}
